import { useState, useRef, useMemo, useEffect } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  adminBroadcastsApi,
  type BroadcastAudience,
  type CombinedBroadcastCreateRequest,
  type CustomBroadcastButton,
} from '../api/adminBroadcasts';
import { getErrorMessage } from '../utils/subscriptionHelpers';
import { telegramCaptionLength } from '../utils/telegramCaptionLength';
import {
  BroadcastAudienceEditor,
  emptyAudience,
  isAudienceComplete,
} from '../components/broadcasts/BroadcastAudienceEditor';
import {
  TelegramBubble,
  TelegramPreview,
  EmailPreview,
} from '../components/broadcasts/BroadcastPreview';
import { useAuthStore } from '../store/auth';
import { cn } from '@/lib/utils';
import {
  DocumentIcon,
  EmailIcon,
  PhotoIcon,
  RefreshIcon,
  TelegramIcon,
  VideoIcon,
  XIcon,
} from '@/components/icons';

/** `?email_user=<id>` opens an Email broadcast for one user from their profile. */
function parseEmailUserParam(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null;
}

export default function AdminBroadcastCreate() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const presetEmailUserId = parseEmailUserParam(searchParams.get('email_user'));
  // Почту кладёт в state карточка пользователя; после перезагрузки остаётся только id.
  const presetEmailUserLabel =
    (location.state as { emailUserLabel?: string } | null)?.emailUserLabel ?? null;

  // Channel toggles (both can be enabled)
  const [telegramEnabled, setTelegramEnabled] = useState(presetEmailUserId === null);
  const [emailEnabled, setEmailEnabled] = useState(presetEmailUserId !== null);

  // Separate audiences per channel, as in the existing form.
  const [telegramAudience, setTelegramAudience] = useState(() => presetAudience('all', 'telegram'));
  const [emailAudience, setEmailAudience] = useState(() =>
    presetEmailUserId === null
      ? emptyAudience()
      : {
          conditions: [
            {
              field: 'email_user',
              operator: 'eq' as const,
              value: String(presetEmailUserId),
              label: presetEmailUserLabel ?? `#${presetEmailUserId}`,
              join: null,
            },
          ],
        },
  );

  // Broadcast category (system/news/promo)
  const [category, setCategory] = useState<'system' | 'news' | 'promo'>('system');

  // Telegram-specific state
  const [messageText, setMessageText] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [telegramSentId, setTelegramSentId] = useState<number | null>(null);
  const captionLength = useMemo(() => telegramCaptionLength(messageText), [messageText]);
  const [selectedButtons, setSelectedButtons] = useState<string[]>(['home']);
  const [customButtons, setCustomButtons] = useState<CustomBroadcastButton[]>([]);
  const [isAddingCustomButton, setIsAddingCustomButton] = useState(false);
  const [newButtonLabel, setNewButtonLabel] = useState('');
  const [newButtonActionType, setNewButtonActionType] = useState<'callback' | 'url'>('callback');
  const [newButtonActionValue, setNewButtonActionValue] = useState('');
  const [newButtonEmojiId, setNewButtonEmojiId] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<'photo' | 'video' | 'document'>('photo');
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [uploadedFileId, setUploadedFileId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const mediaPreviewRef = useRef<string | null>(null);

  // Revoke blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (mediaPreviewRef.current) URL.revokeObjectURL(mediaPreviewRef.current);
    };
  }, []);

  // Email-specific state
  const [emailSubject, setEmailSubject] = useState('');
  const [emailContent, setEmailContent] = useState('');

  // Submitting state for dual send
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Preview modals
  const [showTelegramPreview, setShowTelegramPreview] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);

  const previewMediaTypeForModal: 'photo' | 'video' | null =
    mediaType === 'photo' || mediaType === 'video' ? mediaType : null;

  // Fetch buttons
  const { data: buttonsData } = useQuery({
    queryKey: ['admin', 'broadcasts', 'buttons'],
    queryFn: adminBroadcastsApi.getButtons,
    enabled: telegramEnabled,
  });

  const previewButtonRows = useMemo(() => {
    const rows: { text: string; url?: string; callback_data?: string }[][] = [];
    if (selectedButtons.length > 0) {
      const presetLabels: Record<string, string> = {
        balance: t('admin.broadcasts.btnBalance', 'Пополнить баланс'),
        // Бот отдаёт ключ кнопки как 'referrals' (см. BROADCAST_BUTTONS в admin.py),
        // раньше тут был 'partners' — из-за рассинхрона кнопка показывалась сырым
        // ключом 'referrals' вместо «Партнёрка» (Telegram-баг #602989).
        referrals: t('admin.broadcasts.btnPartners', 'Партнёрка'),
        promocode: t('admin.broadcasts.btnPromocode', 'Промокод'),
        connect: t('admin.broadcasts.btnConnect', 'Подключиться'),
        subscription: t('admin.broadcasts.btnSubscription', 'Подписка'),
        support: t('admin.broadcasts.btnSupport', 'Техподдержка'),
        home: t('admin.broadcasts.btnHome', 'На главную'),
      };
      for (const id of selectedButtons) {
        rows.push([
          {
            text: buttonsData?.buttons.find((b) => b.key === id)?.label || presetLabels[id] || id,
            callback_data: id,
          },
        ]);
      }
    }
    for (const cb of customButtons) {
      rows.push([
        {
          text: cb.label,
          ...(cb.action_type === 'url'
            ? { url: cb.action_value }
            : { callback_data: cb.action_value }),
        },
      ]);
    }
    return rows;
  }, [selectedButtons, customButtons, t, buttonsData]);

  // Fetch Telegram filters
  const { data: filtersData, isLoading: filtersLoading } = useQuery({
    queryKey: ['admin', 'broadcasts', 'filters'],
    queryFn: adminBroadcastsApi.getFilters,
    enabled: telegramEnabled,
  });

  // Fetch Email filters
  const { data: emailFiltersData, isLoading: emailFiltersLoading } = useQuery({
    queryKey: ['admin', 'broadcasts', 'email-filters'],
    queryFn: adminBroadcastsApi.getEmailFilters,
    enabled: emailEnabled,
  });
  const { data: emailTariffsData, isLoading: emailTariffsLoading } = useQuery({
    queryKey: ['admin', 'broadcasts', 'tariffs'],
    queryFn: adminBroadcastsApi.getTariffs,
    enabled: emailEnabled,
  });

  // Create mutation (used for single-channel sends)
  const createMutation = useMutation({
    mutationFn: adminBroadcastsApi.createCombined,
    onMutate: () => setSubmitError(null),
    onError: (error) => setSubmitError(getErrorMessage(error)),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'broadcasts'] });
      navigate(`/admin/broadcasts/${data.id}`);
    },
  });

  // Handle toggling channels
  const handleToggleTelegram = () => {
    setTelegramEnabled((prev) => !prev);
    setTelegramAudience(presetAudience('all', 'telegram'));
  };

  const handleToggleEmail = () => {
    setEmailEnabled((prev) => !prev);
    setEmailAudience(emptyAudience());
  };

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Determine type locally to avoid stale state in async call
    let detectedType: 'photo' | 'video' | 'document';
    if (file.type.startsWith('image/')) {
      detectedType = 'photo';
    } else if (file.type.startsWith('video/')) {
      detectedType = 'video';
    } else {
      detectedType = 'document';
    }

    setSubmitError(null);
    setUploadedFileId(null);
    setMediaFile(file);
    setMediaType(detectedType);

    if (detectedType === 'photo') {
      if (mediaPreviewRef.current) URL.revokeObjectURL(mediaPreviewRef.current);
      const url = URL.createObjectURL(file);
      mediaPreviewRef.current = url;
      setMediaPreview(url);
    } else {
      setMediaPreview(null);
    }

    setIsUploading(true);
    try {
      const result = await adminBroadcastsApi.uploadMedia(file, detectedType);
      setUploadedFileId(result.file_id);
    } catch (error) {
      setSubmitError(getErrorMessage(error));
      setMediaFile(null);
      setMediaPreview(null);
    } finally {
      setIsUploading(false);
    }
  };

  // Remove media
  const handleRemoveMedia = () => {
    if (mediaPreviewRef.current) {
      URL.revokeObjectURL(mediaPreviewRef.current);
      mediaPreviewRef.current = null;
    }
    setMediaFile(null);
    setMediaPreview(null);
    setUploadedFileId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Toggle button
  const toggleButton = (key: string) => {
    setSelectedButtons((prev) =>
      prev.includes(key) ? prev.filter((b) => b !== key) : [...prev, key],
    );
  };

  // Custom button validation
  const isNewButtonValid = useMemo(() => {
    if (!newButtonLabel.trim() || !newButtonActionValue.trim()) return false;
    // custom_emoji_id — необязательное поле, но если задано — числовая строка (Bot API)
    if (newButtonEmojiId.trim() && !/^\d{1,64}$/.test(newButtonEmojiId.trim())) return false;
    if (newButtonActionType === 'url') {
      return /^https:\/\/|^tg:\/\//.test(newButtonActionValue.trim());
    }
    if (newButtonActionType === 'callback') {
      return new TextEncoder().encode(newButtonActionValue.trim()).length <= 64;
    }
    return true;
  }, [newButtonLabel, newButtonActionType, newButtonActionValue, newButtonEmojiId]);

  // Custom button handlers
  const addCustomButton = () => {
    if (!isNewButtonValid) return;
    const emojiId = newButtonEmojiId.trim();
    setCustomButtons((prev) => [
      ...prev,
      {
        label: newButtonLabel.trim(),
        action_type: newButtonActionType,
        action_value: newButtonActionValue.trim(),
        ...(emojiId ? { icon_custom_emoji_id: emojiId } : {}),
      },
    ]);
    setNewButtonLabel('');
    setNewButtonActionValue('');
    setNewButtonActionType('callback');
    setNewButtonEmojiId('');
    setIsAddingCustomButton(false);
  };

  const removeCustomButton = (index: number) => {
    setCustomButtons((prev) => prev.filter((_, i) => i !== index));
  };

  const captionTooLong = !!mediaFile && captionLength > 1024;

  // Validate form
  const isTelegramValid =
    telegramEnabled &&
    isAudienceComplete(telegramAudience) &&
    messageText.trim().length > 0 &&
    !captionTooLong;
  const isEmailValid =
    emailEnabled &&
    isAudienceComplete(emailAudience) &&
    emailSubject.trim().length > 0 &&
    emailContent.trim().length > 0;

  const isValid = useMemo(() => {
    if (!telegramEnabled && !emailEnabled) return false;
    if (telegramEnabled && !isTelegramValid) return false;
    if (emailEnabled && !isEmailValid) return false;
    return true;
  }, [telegramEnabled, emailEnabled, isTelegramValid, isEmailValid]);

  const bothChannels = telegramEnabled && emailEnabled;

  // Submit
  const handleSubmit = async () => {
    if (!isValid || telegramSentId !== null) return;
    setSubmitError(null);

    // Single channel — use existing createMutation with navigation to detail
    if (telegramEnabled && !emailEnabled) {
      const data: CombinedBroadcastCreateRequest = {
        channel: 'telegram',
        audience: telegramAudience,
        message_text: messageText,
        selected_buttons: selectedButtons,
        custom_buttons: customButtons.length > 0 ? customButtons : undefined,
        category,
      };
      if (uploadedFileId) {
        data.media = { type: mediaType, file_id: uploadedFileId };
      }
      createMutation.mutate(data);
      return;
    }

    if (emailEnabled && !telegramEnabled) {
      const data: CombinedBroadcastCreateRequest = {
        channel: 'email',
        audience: emailAudience,
        email_subject: emailSubject,
        email_html_content: emailContent,
        category,
      };
      createMutation.mutate(data);
      return;
    }

    // Both channels — two sequential requests, navigate to list
    setIsSubmitting(true);
    let sentTelegramId: number | null = null;
    try {
      const telegramData: CombinedBroadcastCreateRequest = {
        channel: 'telegram',
        audience: telegramAudience,
        message_text: messageText,
        selected_buttons: selectedButtons,
        custom_buttons: customButtons.length > 0 ? customButtons : undefined,
        category,
      };
      if (uploadedFileId) {
        telegramData.media = { type: mediaType, file_id: uploadedFileId };
      }

      const emailData: CombinedBroadcastCreateRequest = {
        channel: 'email',
        audience: emailAudience,
        email_subject: emailSubject,
        email_html_content: emailContent,
        category,
      };

      const telegramResult = await adminBroadcastsApi.createCombined(telegramData);
      sentTelegramId = telegramResult.id;
      setTelegramSentId(sentTelegramId);
      await adminBroadcastsApi.createCombined(emailData);

      queryClient.invalidateQueries({ queryKey: ['admin', 'broadcasts'] });
      navigate('/admin/broadcasts');
    } catch (error) {
      setSubmitError(
        sentTelegramId === null
          ? getErrorMessage(error)
          : t('admin.broadcasts.partialSend', {
              id: sentTelegramId,
              error: getErrorMessage(error),
            }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPending = createMutation.isPending || isSubmitting;

  // ── Макет A6: быстрые аудитории, живое превью, итог и тест себе ──
  const primaryChannel: 'telegram' | 'email' = telegramEnabled ? 'telegram' : 'email';
  const primaryAudience = telegramEnabled ? telegramAudience : emailAudience;
  const setPrimaryAudience = telegramEnabled ? setTelegramAudience : setEmailAudience;
  const presetKey = activePresetKey(primaryAudience);
  const [customAudience, setCustomAudience] = useState(false);
  const showEditor =
    customAudience || (!presetKey && presetEmailUserId === null) || presetEmailUserId !== null;

  const filterCount = (key: string) =>
    (telegramEnabled ? filtersData?.filters : emailFiltersData?.filters)?.find((f) => f.key === key)
      ?.count ?? null;

  const audienceReady = isAudienceComplete(primaryAudience);
  const { data: recipients } = useQuery({
    queryKey: ['admin', 'broadcasts', 'audience', primaryChannel, category, primaryAudience, 0],
    queryFn: () =>
      adminBroadcastsApi.previewAudience({
        channel: primaryChannel,
        category,
        audience: primaryAudience,
        offset: 0,
        limit: 50,
      }),
    enabled: audienceReady,
  });

  const me = useAuthStore((state) => state.user);
  const [testSent, setTestSent] = useState(false);
  const testMutation = useMutation({
    mutationFn: () => {
      const data: CombinedBroadcastCreateRequest = {
        channel: 'telegram',
        audience: {
          conditions: [
            {
              field: 'telegram_id',
              operator: 'eq',
              value: String(me?.telegram_id ?? ''),
              label: null,
              join: null,
            },
          ],
        },
        message_text: messageText,
        selected_buttons: selectedButtons,
        custom_buttons: customButtons.length > 0 ? customButtons : undefined,
        category: 'system',
      };
      if (uploadedFileId) data.media = { type: mediaType, file_id: uploadedFileId };
      return adminBroadcastsApi.createCombined(data);
    },
    onMutate: () => setSubmitError(null),
    onSuccess: () => setTestSent(true),
    onError: (error) => setSubmitError(getErrorMessage(error)),
  });

  const textRef = useRef<HTMLTextAreaElement>(null);
  const wrapSelection = (open: string, close: string, fallback = '') => {
    const el = textRef.current;
    const start = el?.selectionStart ?? messageText.length;
    const end = el?.selectionEnd ?? messageText.length;
    const picked = messageText.slice(start, end) || fallback;
    const next = messageText.slice(0, start) + open + picked + close + messageText.slice(end);
    setMessageText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + open.length, start + open.length + picked.length);
    });
  };

  let sectionNo = 0;
  const num = () => String(++sectionNo).padStart(2, '0');

  const toolBtn =
    'grid h-10 min-w-10 place-items-center rounded-[10px] border-2 border-dark-600 px-3 font-display text-[15px] uppercase text-dark-100 hover:border-dark-400';

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-[13px] text-dark-400">
          <Link to="/admin/broadcasts" className="underline underline-offset-2 hover:text-dark-200">
            {t('rv.bc.crumb')}
          </Link>{' '}
          / {t('rv.bc.new')}
        </p>
        <h1 className="rv-d mt-1 text-[44px] text-dark-100 lg:text-[56px]">{t('rv.bc.title')}</h1>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* 01 · Кому */}
          <RvSection n={num()} title={t('rv.bc.who')}>
            <div className="flex flex-wrap gap-2.5">
              {AUDIENCE_PRESETS.map((preset) => {
                const count = filterCount(preset.key);
                const on = presetKey === preset.key && !customAudience;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => {
                      setCustomAudience(false);
                      setPrimaryAudience(presetAudience(preset.key, primaryChannel));
                    }}
                    className={cn(
                      'inline-flex min-h-11 items-center gap-2 rounded-[14px] border-2 px-3.5 text-sm font-bold transition-colors',
                      on
                        ? 'border-accent-500 bg-accent-500 text-[#111]'
                        : 'border-dark-600 text-dark-100 hover:border-dark-400',
                    )}
                  >
                    {t(`rv.bc.preset.${preset.key}`)}
                    {count !== null && (
                      <span className={cn('font-medium', on ? 'text-[#111]/60' : 'text-dark-400')}>
                        {count.toLocaleString('ru-RU')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setCustomAudience((v) => !v)}
              className="link mt-4 self-start text-sm"
            >
              {customAudience ? t('rv.bc.hideCustom') : t('rv.bc.custom')}
            </button>
            {showEditor && (
              <div className="mt-4 rounded-2xl border-2 border-dark-700 p-4">
                <BroadcastAudienceEditor
                  channel={primaryChannel}
                  category={category}
                  audience={primaryAudience}
                  onChange={setPrimaryAudience}
                  filters={
                    telegramEnabled
                      ? filtersData
                        ? [
                            ...filtersData.filters,
                            ...filtersData.tariff_filters,
                            ...filtersData.custom_filters,
                          ]
                        : []
                      : [
                          ...(emailFiltersData?.filters || []),
                          ...(emailFiltersData?.promo_group_filters || []),
                          ...(emailTariffsData?.tariffs.map((tariff) => ({
                            key: tariff.filter_key,
                            label: tariff.name,
                            tariff_id: tariff.id,
                            count: tariff.active_users_count,
                          })) || []),
                        ]
                  }
                  isLoading={
                    telegramEnabled ? filtersLoading : emailFiltersLoading || emailTariffsLoading
                  }
                />
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t-2 border-dark-700 pt-4">
              <span className="mr-1 text-[13px] font-bold text-dark-300">
                {t('rv.bc.channels')}
              </span>
              {(
                [
                  {
                    on: telegramEnabled,
                    toggle: handleToggleTelegram,
                    icon: <TelegramIcon />,
                    label: 'Telegram',
                  },
                  {
                    on: emailEnabled,
                    toggle: handleToggleEmail,
                    icon: <EmailIcon />,
                    label: 'Email',
                  },
                ] as const
              ).map((ch) => (
                <button
                  key={ch.label}
                  type="button"
                  role="switch"
                  aria-checked={ch.on}
                  onClick={ch.toggle}
                  className={cn(
                    'inline-flex min-h-10 items-center gap-2 rounded-xl border-2 px-3 text-sm font-bold [&_svg]:h-4 [&_svg]:w-4',
                    ch.on
                      ? 'border-accent-500 bg-[var(--rv-acc-bg)] text-accent-400'
                      : 'border-dark-600 text-dark-300',
                  )}
                >
                  {ch.icon}
                  {ch.label}
                </button>
              ))}
              {!telegramEnabled && !emailEnabled && (
                <span className="text-sm text-[var(--rv-bad)]">
                  {t('admin.broadcasts.atLeastOneChannel')}
                </span>
              )}
            </div>
            {bothChannels && (
              <div className="mt-4 rounded-2xl border-2 border-dark-700 p-4">
                <p className="mb-3 text-[13px] font-bold text-dark-300">
                  {t('rv.bc.emailAudience')}
                </p>
                <BroadcastAudienceEditor
                  channel="email"
                  category={category}
                  audience={emailAudience}
                  onChange={setEmailAudience}
                  filters={[
                    ...(emailFiltersData?.filters || []),
                    ...(emailFiltersData?.promo_group_filters || []),
                    ...(emailTariffsData?.tariffs.map((tariff) => ({
                      key: tariff.filter_key,
                      label: tariff.name,
                      tariff_id: tariff.id,
                      count: tariff.active_users_count,
                    })) || []),
                  ]}
                  isLoading={emailFiltersLoading || emailTariffsLoading}
                />
              </div>
            )}
          </RvSection>

          {/* 02 · Сообщение (Telegram) */}
          {telegramEnabled && (
            <RvSection n={num()} title={t('rv.bc.message')}>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={toolBtn}
                  onClick={() => wrapSelection('<b>', '</b>')}
                  aria-label="Bold"
                >
                  Ж
                </button>
                <button
                  type="button"
                  className={cn(toolBtn, 'italic')}
                  onClick={() => wrapSelection('<i>', '</i>')}
                  aria-label="Italic"
                >
                  К
                </button>
                <button
                  type="button"
                  className={toolBtn}
                  onClick={() => wrapSelection('<a href="https://">', '</a>', t('rv.bc.linkText'))}
                >
                  {t('rv.bc.link')}
                </button>
                <button
                  type="button"
                  className={toolBtn}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {mediaFile ? t('rv.bc.changeMedia') : t('rv.bc.media')}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,application/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              <textarea
                ref={textRef}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder={t('admin.broadcasts.messageTextPlaceholder')}
                aria-invalid={captionTooLong}
                aria-describedby={mediaFile ? 'broadcast-caption-help' : undefined}
                rows={6}
                maxLength={4000}
                className="input mt-3 min-h-[150px] resize-y"
              />
              <div className="mt-1 flex justify-between gap-3 text-xs text-dark-400">
                <span
                  id="broadcast-caption-help"
                  role={captionTooLong ? 'alert' : undefined}
                  className={captionTooLong ? 'text-[var(--rv-bad)]' : undefined}
                >
                  {mediaFile &&
                    t(
                      captionTooLong
                        ? 'admin.broadcasts.captionTooLong'
                        : 'admin.broadcasts.captionLimit',
                    )}
                </span>
                <span className="shrink-0">
                  {mediaFile ? `${captionLength}/1024` : `${messageText.length}/4000`}
                </span>
              </div>

              {mediaFile && (
                <div className="mt-3 flex items-center gap-3 rounded-2xl border-2 border-dark-700 p-3">
                  {mediaPreview ? (
                    <img src={mediaPreview} alt="" className="h-14 w-14 rounded-lg object-cover" />
                  ) : (
                    <span className="rv-ic">
                      {mediaType === 'video' ? (
                        <VideoIcon />
                      ) : mediaType === 'photo' ? (
                        <PhotoIcon />
                      ) : (
                        <DocumentIcon />
                      )}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-dark-100">
                      {mediaFile.name}
                    </span>
                    <span className="block text-xs text-dark-400">
                      {isUploading
                        ? t('admin.broadcasts.uploading')
                        : `${(mediaFile.size / 1024 / 1024).toFixed(2)} MB`}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={handleRemoveMedia}
                    disabled={isUploading}
                    className="rv-ibtn"
                    aria-label={t('common.delete')}
                  >
                    <XIcon className="h-5 w-5" />
                  </button>
                </div>
              )}

              <p className="mb-2.5 mt-5 text-[13px] font-bold text-dark-300">
                {t('rv.bc.buttons')}
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {buttonsData?.buttons.map((button) => {
                  const on = selectedButtons.includes(button.key);
                  return (
                    <button
                      key={button.key}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggleButton(button.key)}
                      className={cn(
                        'flex min-h-[52px] items-center justify-between gap-2 rounded-[14px] border-2 px-4 text-left text-[15px] transition-colors',
                        on
                          ? 'border-accent-500 bg-[var(--rv-acc-bg)] font-bold text-dark-100'
                          : 'border-dark-700 bg-dark-800 text-dark-300 hover:border-dark-600',
                      )}
                    >
                      {button.label}
                      {on && <span className="text-accent-400">✓</span>}
                    </button>
                  );
                })}
                {customButtons.map((btn, index) => (
                  <div
                    key={index}
                    className="flex min-h-[52px] items-center gap-2 rounded-[14px] border-2 border-accent-500 bg-[var(--rv-acc-bg)] px-4"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold text-dark-100">
                        {btn.label}
                      </span>
                      <span className="block truncate text-xs text-dark-400">
                        {btn.action_value}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCustomButton(index)}
                      className="shrink-0 text-dark-400 hover:text-[var(--rv-bad)]"
                      aria-label={t('common.delete')}
                    >
                      <XIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              {isAddingCustomButton ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addCustomButton();
                  }}
                  className="mt-3 space-y-3 rounded-2xl border-2 border-dark-700 p-4"
                >
                  <input
                    type="text"
                    value={newButtonLabel}
                    onChange={(e) => setNewButtonLabel(e.target.value)}
                    placeholder={t('admin.broadcasts.customButtonLabelPlaceholder')}
                    maxLength={64}
                    className="input"
                    autoFocus
                  />
                  <div className="rv-seg">
                    {(['callback', 'url'] as const).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        className={newButtonActionType === kind ? 'on' : undefined}
                        onClick={() => setNewButtonActionType(kind)}
                      >
                        {kind === 'url'
                          ? t('admin.broadcasts.customButtonTypeUrl')
                          : t('admin.broadcasts.customButtonTypeCallback')}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={newButtonActionValue}
                    onChange={(e) => setNewButtonActionValue(e.target.value)}
                    placeholder={
                      newButtonActionType === 'url'
                        ? t('admin.broadcasts.customButtonUrlPlaceholder')
                        : t('admin.broadcasts.customButtonCallbackPlaceholder')
                    }
                    maxLength={newButtonActionType === 'callback' ? 64 : 256}
                    className="input"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newButtonEmojiId}
                    onChange={(e) => setNewButtonEmojiId(e.target.value)}
                    placeholder={t('admin.broadcasts.customButtonEmojiIdPlaceholder')}
                    maxLength={64}
                    className="input"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingCustomButton(false);
                        setNewButtonLabel('');
                        setNewButtonActionValue('');
                        setNewButtonEmojiId('');
                      }}
                      className="btn btn-secondary flex-1"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={!isNewButtonValid}
                      className="btn btn-primary flex-1 !shadow-none"
                    >
                      {t('common.add')}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingCustomButton(true)}
                  disabled={customButtons.length >= 10}
                  className="link mt-3 self-start text-sm"
                >
                  + {t('admin.broadcasts.addCustomButton')}
                </button>
              )}
            </RvSection>
          )}

          {/* Письмо (Email) */}
          {emailEnabled && (
            <RvSection
              n={num()}
              title={t('rv.bc.email')}
              action={
                <button
                  type="button"
                  onClick={() => setShowEmailPreview(true)}
                  disabled={emailContent.trim().length === 0}
                  className="btn btn-secondary !min-h-9 !px-3 !text-sm"
                >
                  {t('admin.broadcasts.preview', 'Предпросмотр')}
                </button>
              }
            >
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder={t('admin.broadcasts.emailSubjectPlaceholder')}
                className="input"
                maxLength={200}
                aria-label={t('admin.broadcasts.emailSubject')}
              />
              <p className="mb-2 mt-4 text-xs text-dark-400">
                {t('admin.broadcasts.emailContentHint')}
              </p>
              <textarea
                value={emailContent}
                onChange={(e) => setEmailContent(e.target.value)}
                placeholder={t('admin.broadcasts.emailContentPlaceholder')}
                rows={10}
                className="input min-h-[200px] resize-y font-mono text-sm"
                aria-label={t('admin.broadcasts.emailContent')}
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-dark-400">
                  {t('admin.broadcasts.emailVariables')}
                </span>
                {['{{user_name}}', '{{email}}', '{{user_id}}'].map((variable) => (
                  <button
                    key={variable}
                    type="button"
                    onClick={() => setEmailContent((v) => v + variable)}
                    className="rounded-lg bg-dark-800 px-2 py-1 font-mono text-xs text-accent-400"
                  >
                    {variable}
                  </button>
                ))}
              </div>
            </RvSection>
          )}

          {/* Тип рассылки */}
          <RvSection n={num()} title={t('rv.bc.kind')}>
            <div className="rv-seg max-w-[520px]" role="tablist">
              {(['system', 'news', 'promo'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={category === cat}
                  className={category === cat ? 'on' : undefined}
                  onClick={() => setCategory(cat)}
                >
                  {t(`rv.bc.cat.${cat}`)}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[13px] leading-snug text-dark-400">{t('rv.bc.catHint')}</p>
          </RvSection>
        </div>

        {/* Превью + итог */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
          {telegramEnabled && (
            <div>
              <p className="mb-2.5 text-[13px] font-bold text-dark-300">{t('rv.bc.previewTg')}</p>
              <div className="rounded-[22px] bg-[#0e1621] p-3.5">
                <TelegramBubble
                  className="flex flex-col"
                  text={messageText}
                  mediaUrl={mediaPreview}
                  mediaType={previewMediaTypeForModal}
                  buttons={previewButtonRows}
                />
              </div>
            </div>
          )}

          <section className="rounded-[22px] border-2 border-dark-600 bg-[#0B0B0B] p-5">
            <p className="rv-kicker rv-kicker-acc">{t('rv.bc.total')}</p>
            <p className="rv-num mt-3 text-[56px] text-[#F2F0E8]">
              {audienceReady && recipients ? recipients.count.toLocaleString('ru-RU') : '—'}
            </p>
            <p className="mt-1 text-sm text-[#B9B8B0]">
              {t('rv.bc.recipients', { count: recipients?.count ?? 0 })} · {t('rv.bc.sendNow')}
              {bothChannels ? ` · ${t('rv.bc.plusEmail')}` : ''}
            </p>
            {submitError && (
              <p role="alert" className="mt-3 break-words text-sm text-[var(--rv-bad)]">
                {submitError}
              </p>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!isValid || isPending || isUploading || telegramSentId !== null}
              className="btn btn-primary mt-4 w-full !shadow-none"
            >
              {isPending ? <RefreshIcon /> : null}
              {t('rv.bc.send')}
            </button>
            {telegramEnabled && me?.telegram_id ? (
              <button
                type="button"
                onClick={() => testMutation.mutate()}
                disabled={
                  !messageText.trim() || testMutation.isPending || isUploading || captionTooLong
                }
                className="btn mt-2.5 w-full !min-h-10 border-2 border-[#F2F0E8]/80 bg-transparent !text-sm text-[#F2F0E8]"
              >
                {testSent ? `✓ ${t('rv.bc.testSent')}` : t('rv.bc.test')}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => navigate('/admin/broadcasts')}
              className="mt-3 w-full text-center text-sm text-[#B9B8B0] underline-offset-2 hover:underline"
            >
              {t('common.cancel')}
            </button>
          </section>
        </aside>
      </div>

      <TelegramPreview
        open={showTelegramPreview}
        onClose={() => setShowTelegramPreview(false)}
        text={messageText}
        mediaUrl={mediaPreview}
        mediaType={previewMediaTypeForModal}
        buttons={previewButtonRows}
      />
      <EmailPreview
        open={showEmailPreview}
        onClose={() => setShowEmailPreview(false)}
        subject={emailSubject}
        htmlContent={emailContent}
      />
    </div>
  );
}

/** Пронумерованный блок формы: «01 Кому». */
function RvSection({
  n,
  title,
  action,
  children,
}: {
  n: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bento-card flex flex-col !overflow-visible !p-5 lg:!p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-3">
          <span className="font-display text-[44px] leading-[0.8] text-transparent [-webkit-text-stroke:1.6px_rgb(var(--color-accent-500))]">
            {n}
          </span>
          <span className="rv-d text-[30px] text-dark-100">{title}</span>
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const AUDIENCE_PRESETS = [
  { key: 'all', field: 'basic', value: 'all' },
  { key: 'active', field: 'subscription_status', value: 'active' },
  { key: 'expired', field: 'subscription_status', value: 'expired' },
  { key: 'trial', field: 'subscription_type', value: 'trial' },
  { key: 'expiring', field: 'subscription_end_preset', value: 'expiring' },
] as const;

function presetAudience(key: string, channel: 'telegram' | 'email'): BroadcastAudience {
  const preset = AUDIENCE_PRESETS.find((p) => p.key === key) ?? AUDIENCE_PRESETS[0];
  const value = preset.key === 'all' && channel === 'email' ? 'all_email' : preset.value;
  return {
    conditions: [
      { client_id: `preset-${preset.key}`, field: preset.field, operator: 'eq', value, join: null },
    ],
  };
}

function activePresetKey(audience: BroadcastAudience): string | null {
  if (audience.conditions.length !== 1) return null;
  const [c] = audience.conditions;
  const hit = AUDIENCE_PRESETS.find(
    (p) =>
      p.field === c.field &&
      (p.value === c.value || (p.key === 'all' && c.value === 'all_email')) &&
      c.operator === 'eq',
  );
  return hit?.key ?? null;
}
