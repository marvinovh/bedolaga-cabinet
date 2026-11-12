import { getLocalizedApiErrorMessage } from '../utils/api-error-display';
import { uiLocale } from '@/utils/uiLocale';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ticketsApi } from '../api/tickets';
import { MessageMediaGrid } from '../components/tickets/MessageMediaGrid';
import { infoApi } from '../api/info';
import { useAuthStore } from '../store/auth';
import { copyToClipboard } from '../utils/clipboard';
import { TgPlaneIcon } from '@/components/rv';
import { logger } from '../utils/logger';
import { checkRateLimit, getRateLimitResetTime, RATE_LIMIT_KEYS } from '../utils/rateLimit';

import { isOpenTicketConflict } from '../utils/ticketErrors';
import type { SupportConfig, TicketDetail } from '../types';
import { Button } from '@/components/primitives/Button';
import { BackIcon, CloseIcon, ImageIcon, SendIcon } from '@/components/icons';
import { formatContent } from '../utils/legalContent';
import { usePlatform } from '@/platform';
import { linkifyText } from '../utils/linkify';
import { resolveSupportContact } from '../utils/supportContact';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';

const log = logger.createLogger('Support');

const MEDIA_TYPES: Record<string, 'photo' | 'video'> = {
  'image/jpeg': 'photo',
  'image/png': 'photo',
  'image/gif': 'photo',
  'image/webp': 'photo',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
};

// Media attachment state
interface MediaAttachment {
  id: string;
  file: File;
  preview: string;
  mediaType: 'photo' | 'video';
  uploading: boolean;
  fileId?: string;
  error?: string;
}

export default function Support() {
  log.debug('Component loaded');

  const { t, i18n } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const { openTelegramLink, openLink } = usePlatform();

  const openSupportContact = useCallback(
    (config: SupportConfig) => {
      const target = resolveSupportContact(config);
      if (!target) return;
      if (target.kind === 'external') {
        openLink(target.url, { tryInstantView: false });
      } else {
        openTelegramLink(target.url);
      }
    },
    [openLink, openTelegramLink],
  );
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [replyMessage, setReplyMessage] = useState('');
  // Ошибка активной формы: и клиентский rate-limit, и отказ бэка (409 «уже есть
  // открытый тикет», 403 «поддержка выключена/пользователь заблокирован» и т.п.).
  // Формы create и reply взаимоисключающие, поэтому состояние одно на обе.
  const [formError, setFormError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [idCopied, setIdCopied] = useState(false);
  // Чат (макет 11) — без нижней панели: её место занимает строка ввода.
  const chatOpen = !!selectedTicket && !showCreateForm;
  useEffect(() => {
    if (!chatOpen) return;
    document.documentElement.dataset.rvHideNav = '1';
    return () => {
      delete document.documentElement.dataset.rvHideNav;
    };
  }, [chatOpen]);
  const { data: faqPages } = useQuery({
    queryKey: ['faq-pages', i18n.language],
    queryFn: () => infoApi.getFaqPages(i18n.language),
    staleTime: 5 * 60_000,
  });

  // Media attachment states (multi-upload, up to 10)
  const [createAttachments, setCreateAttachments] = useState<MediaAttachment[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<MediaAttachment[]>([]);
  const createFileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);

  const blobUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = blobUrlsRef;
    return () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const clearCreateAttachments = () => {
    createAttachments.forEach((a) => {
      if (a.preview) URL.revokeObjectURL(a.preview);
    });
    setCreateAttachments([]);
    if (createFileInputRef.current) createFileInputRef.current.value = '';
  };

  const clearReplyAttachments = () => {
    replyAttachments.forEach((a) => {
      if (a.preview) URL.revokeObjectURL(a.preview);
    });
    setReplyAttachments([]);
    if (replyFileInputRef.current) replyFileInputRef.current.value = '';
  };

  // Get support configuration
  const { data: supportConfig, isLoading: configLoading } = useQuery({
    queryKey: ['support-config'],
    queryFn: infoApi.getSupportConfig,
  });

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => ticketsApi.getTickets({ per_page: 20 }),
    enabled: supportConfig?.tickets_enabled === true,
  });

  const { data: ticketDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['ticket', selectedTicket?.id],
    queryFn: () => ticketsApi.getTicket(selectedTicket!.id),
    enabled: !!selectedTicket,
  });

  // Handle file selection (multi-upload)
  const handleFileSelect = async (
    file: File,
    setAttachments: React.Dispatch<React.SetStateAction<MediaAttachment[]>>,
  ) => {
    const mediaType = MEDIA_TYPES[file.type];
    if (!mediaType) return;
    if (file.size > 10 * 1024 * 1024) return;

    const preview = mediaType === 'photo' ? URL.createObjectURL(file) : '';
    if (preview) blobUrlsRef.current.add(preview);
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `att_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const entry: MediaAttachment = { id, file, preview, mediaType, uploading: true };
    setAttachments((prev) => (prev.length >= 10 ? prev : [...prev, entry]));

    try {
      const result = await ticketsApi.uploadMedia(file, mediaType);
      setAttachments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, uploading: false, fileId: result.file_id } : a)),
      );
    } catch {
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, uploading: false, error: t('support.uploadFailed') } : a,
        ),
      );
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const ready = createAttachments.filter(
        (a): a is MediaAttachment & { fileId: string } => !!a.fileId,
      );
      const media =
        ready.length > 0
          ? {
              media_type: ready[0].mediaType,
              media_file_id: ready[0].fileId,
              media_items: ready.map((a) => ({ type: a.mediaType, file_id: a.fileId })),
            }
          : undefined;
      return ticketsApi.createTicket(newTitle, newMessage, media);
    },
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setShowCreateForm(false);
      setFormError(null);
      setNewTitle('');
      setNewMessage('');
      clearCreateAttachments();
      setSelectedTicket(ticket);
    },
    onError: (error) => {
      // Без этого отказ бэка (чаще всего 409 «уже есть открытый тикет») уходил
      // в никуда: форма просто оставалась на месте, и пользователь жал «Отправить»
      // снова и снова, не понимая, почему обращение не создаётся.
      log.error('Ticket creation failed', error);
      if (isOpenTicketConflict(error)) {
        setFormError(t('support.errors.alreadyOpenTicket'));
        // Открытый тикет мог появиться в другой сессии (бот, второе устройство) —
        // подтягиваем список, чтобы пользователю было куда перейти.
        queryClient.invalidateQueries({ queryKey: ['tickets'] });
        return;
      }
      setFormError(getLocalizedApiErrorMessage(error, t('support.errors.createFailed'), t));
    },
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      const ready = replyAttachments.filter(
        (a): a is MediaAttachment & { fileId: string } => !!a.fileId,
      );
      const media =
        ready.length > 0
          ? {
              media_type: ready[0].mediaType,
              media_file_id: ready[0].fileId,
              media_items: ready.map((a) => ({ type: a.mediaType, file_id: a.fileId })),
            }
          : undefined;
      await ticketsApi.addMessage(selectedTicket!.id, replyMessage, media);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', selectedTicket?.id] });
      setFormError(null);
      setReplyMessage('');
      clearReplyAttachments();
    },
    onError: (error) => {
      // Ответ в тикет молчал ровно так же: 403 (блокировка в поддержке) и 400
      // (тикет уже закрыт) выглядели как «кнопка не работает».
      log.error('Ticket reply failed', error);
      setFormError(getLocalizedApiErrorMessage(error, t('support.errors.replyFailed'), t));
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return 'badge-info';
      case 'answered':
        return 'badge-success';
      case 'pending':
        return 'badge-warning';
      case 'closed':
        return 'badge-neutral';
      default:
        return 'badge-neutral';
    }
  };

  const getStatusLabel = (status: string) => {
    return t(`support.status.${status}`) || status;
  };

  // Show loading while checking configuration
  if (configLoading) {
    return (
      <SkeletonGroup className="space-y-3">
        <Skeleton variant="card" count={3} className="h-16" />
      </SkeletonGroup>
    );
  }

  // If tickets are disabled, show redirect message
  if (supportConfig && !supportConfig.tickets_enabled) {
    log.debug('Tickets disabled, config:', supportConfig);

    // Куда и чем открывать контакт — один резолв на весь блок. null → открывать
    // нечего (пустой/битый конфиг), и кнопку тогда не рендерим вовсе.
    const contact = resolveSupportContact(supportConfig);

    const userId = user?.telegram_id ?? user?.id;
    const isUrl = supportConfig.support_type === 'url' && !!supportConfig.support_url;
    return (
      <div className="mx-auto max-w-[760px] space-y-3 lg:space-y-5">
        <h1 className="rv-title !text-[52px] lg:!text-[64px]">
          {t('rv.help.title1')} <span className="rv-pill">{t('rv.help.title2')}</span>
        </h1>

        {/* Поддержка в Telegram (макет «10b · Помощь — поддержка в Telegram») */}
        <section className="bento-card rv-card-acc rv-topo !p-5 sm:!p-7">
          <span className="grid h-16 w-16 -rotate-3 place-items-center rounded-[18px] bg-[#111] text-[rgb(var(--color-accent-500))]">
            <TgPlaneIcon className="h-8 w-8" />
          </span>
          <h2 className="rv-d mt-5 text-[52px]">
            {isUrl ? t('rv.help.supportTitle') : t('rv.help.tgTitle1')}
            <br />
            <span className="rv-pill rv-pill-ink inline-block">
              {isUrl ? t('rv.help.supportTitle2') : t('rv.help.tgTitle2')}
            </span>
          </h2>
          <p className="mt-4 text-[17px] leading-snug">
            {isUrl ? t('support.useExternalLink') : t('rv.help.tgText')}
          </p>
          {contact && (
            <button
              type="button"
              onClick={() => openSupportContact(supportConfig)}
              className="btn rv-btn-lg rv-btn-ink mt-5 w-full"
            >
              {!isUrl && <TgPlaneIcon className="h-5 w-5" />}
              {t('rv.help.write')}
            </button>
          )}
          {!isUrl && supportConfig.support_username && (
            <p className="mt-3 text-center text-sm font-medium">{supportConfig.support_username}</p>
          )}
        </section>

        {userId && (
          <section className="bento-card !p-5">
            <h3 className="text-lg font-bold text-dark-100">{t('rv.help.faster')}</h3>
            <p className="mt-1.5 text-[15px] leading-snug text-dark-300">
              {t('rv.help.fasterText')}
            </p>
            <div className="mt-4 flex items-center gap-3 rounded-2xl border-2 border-dark-600 bg-dark-800 p-3 pl-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-dark-400">{t('rv.help.yourId')}</p>
                <p className="truncate text-lg font-bold tabular-nums text-dark-100">{userId}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void copyToClipboard(String(userId));
                  setIdCopied(true);
                  setTimeout(() => setIdCopied(false), 2000);
                }}
                className="btn btn-primary !min-h-10 !px-4 !py-2 !text-[17px] !shadow-none"
              >
                {idCopied ? t('rv.subp.copied') : t('rv.help.copy')}
              </button>
            </div>
          </section>
        )}
      </div>
    );
  }

  // Attachments preview component
  const AttachmentsPreview = ({
    items,
    onRemove,
  }: {
    items: MediaAttachment[];
    onRemove: (idx: number) => void;
  }) =>
    items.length === 0 ? null : (
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((att, idx) => (
          <div key={idx} className="relative">
            {att.preview ? (
              <img
                src={att.preview}
                alt={t('common.preview')}
                loading="lazy"
                className="h-16 w-16 rounded-lg border border-dark-700 object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-dark-700 text-xs text-dark-400">
                {att.file.name.slice(-6)}
              </div>
            )}
            {att.uploading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-dark-950/50">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
              </div>
            )}
            {att.error && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-error-500/30">
                <span className="text-xs text-error-300">!</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => onRemove(idx)}
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-dark-600 text-dark-300 hover:bg-error-500 hover:text-white"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    );

  const isChat = !!selectedTicket && !showCreateForm;
  const openCreate = () => {
    setShowCreateForm(true);
    setSelectedTicket(null);
    setFormError(null);
    clearCreateAttachments();
  };
  const ticketsList = (
    <section>
      <h2 className="rv-d mb-3 text-[40px] text-dark-100">{t('rv.help.myTickets')}</h2>
      <div className="bento-card !px-4 !py-1">
        {isLoading ? (
          <SkeletonGroup className="space-y-3 py-3">
            <Skeleton variant="card" count={2} className="h-14" />
          </SkeletonGroup>
        ) : tickets?.items && tickets.items.length > 0 ? (
          tickets.items.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => {
                setSelectedTicket(ticket as unknown as TicketDetail);
                setShowCreateForm(false);
                setFormError(null);
                clearReplyAttachments();
                window.scrollTo({ top: 0 });
              }}
              className="rv-row w-full text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-bold text-dark-100">{ticket.title}</div>
                <div className="mt-0.5 text-[13px] text-dark-400">
                  {new Date(ticket.updated_at).toLocaleDateString(uiLocale(), {
                    day: 'numeric',
                    month: 'long',
                  })}
                </div>
              </div>
              <span className={`${getStatusBadge(ticket.status)} shrink-0`}>
                {getStatusLabel(ticket.status)}
              </span>
            </button>
          ))
        ) : (
          <p className="py-6 text-center text-sm text-dark-400">{t('support.noTickets')}</p>
        )}
      </div>
    </section>
  );

  // ─── Чат с поддержкой (макет «11 · Чат с поддержкой») ───
  // В чате нижней панели нет — её место занимает строка ввода.
  if (isChat && selectedTicket) {
    const status = ticketDetail?.status || selectedTicket.status;
    return (
      <div className="mx-auto flex min-h-[calc(var(--tg-viewport-stable-height,100dvh)-120px)] max-w-[760px] flex-col">
        <div className="-mx-4 flex items-center gap-3 border-b-2 border-dark-700 px-4 pb-3 lg:mx-0 lg:px-0">
          <button
            type="button"
            onClick={() => setSelectedTicket(null)}
            className="rv-ibtn"
            aria-label={t('common.back')}
          >
            <BackIcon />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold leading-tight text-dark-100 [font-family:var(--rv-text)] [text-transform:none]">
              {ticketDetail?.title || selectedTicket.title}
            </h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-dark-400">
              <i className="rv-dot" />
              {t('rv.help.ticketNo', { id: selectedTicket.id })} · {getStatusLabel(status)}
            </p>
          </div>
        </div>

        {detailLoading ? (
          <SkeletonGroup className="space-y-3 py-4">
            <Skeleton variant="card" count={3} className="h-16" />
          </SkeletonGroup>
        ) : ticketDetail?.messages ? (
          <div className="flex flex-1 flex-col gap-3 py-4">
            <p className="text-center text-xs text-dark-400">
              {new Date(selectedTicket.created_at).toLocaleDateString(uiLocale(), {
                day: 'numeric',
                month: 'long',
              })}
            </p>
            {ticketDetail.messages.map((msg) => (
              <div
                key={msg.id}
                className={`rv-msg ${msg.is_from_admin ? 'rv-msg-them' : 'rv-msg-me'}`}
              >
                {msg.is_from_admin && (
                  <p className="mb-1 text-xs font-bold text-accent-400">
                    {t('support.supportTeam')}
                  </p>
                )}
                {msg.message_text && (
                  <div
                    className="whitespace-pre-wrap break-words [&_a]:font-bold [&_a]:underline"
                    dangerouslySetInnerHTML={{ __html: linkifyText(msg.message_text) }}
                  />
                )}
                <MessageMediaGrid message={msg} translateError={t('support.imageLoadFailed')} />
                <small className="mt-1 block text-[11px] opacity-70">
                  {new Date(msg.created_at).toLocaleTimeString(uiLocale(), {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </small>
              </div>
            ))}
          </div>
        ) : null}

        <div className="sticky bottom-0 -mx-4 border-t-2 border-dark-700 bg-dark-950 px-4 py-3 lg:mx-0 lg:rounded-2xl lg:border-2">
          {/* Reply Form */}
          {ticketDetail?.status !== 'closed' && !ticketDetail?.is_reply_blocked && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setFormError(null);
                // Rate limit: max 5 replies per 30 seconds
                if (!checkRateLimit(RATE_LIMIT_KEYS.TICKET_REPLY, 5, 30000)) {
                  const resetTime = getRateLimitResetTime(RATE_LIMIT_KEYS.TICKET_REPLY);
                  setFormError(t('support.tooManyRequests', { seconds: resetTime }));
                  return;
                }
                replyMutation.mutate();
              }}
              className=""
            >
              <div className="space-y-2">
                {/* Media attachments for reply */}
                <div>
                  <input
                    ref={replyFileInputRef}
                    type="file"
                    accept={Object.keys(MEDIA_TYPES).join(',')}
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      files.forEach((file) => handleFileSelect(file, setReplyAttachments));
                      e.target.value = '';
                    }}
                  />
                  <AttachmentsPreview
                    items={replyAttachments}
                    onRemove={(idx) =>
                      setReplyAttachments((prev) => {
                        const removed = prev[idx];
                        if (removed?.preview) URL.revokeObjectURL(removed.preview);
                        return prev.filter((_, i) => i !== idx);
                      })
                    }
                  />
                </div>
                <div className="flex items-end gap-2">
                  {replyAttachments.length < 10 && (
                    <button
                      type="button"
                      onClick={() => replyFileInputRef.current?.click()}
                      disabled={replyAttachments.some((a) => a.uploading)}
                      className="rv-ibtn disabled:opacity-50"
                      aria-label={t('support.attachMedia')}
                    >
                      <ImageIcon />
                    </button>
                  )}

                  <textarea
                    className="input max-h-40 min-h-[48px] min-w-0 flex-1 resize-none !rounded-2xl !py-3"
                    rows={1}
                    placeholder={t('support.replyPlaceholder')}
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    maxLength={4000}
                  />
                  <Button
                    type="submit"
                    className="!h-12 !min-h-12 !w-12 shrink-0 !rounded-xl !p-0"
                    disabled={
                      (!replyMessage.trim() &&
                        replyAttachments.filter((a) => a.fileId).length === 0) ||
                      replyAttachments.some((a) => a.uploading)
                    }
                    loading={replyMutation.isPending}
                  >
                    <SendIcon className="h-4 w-4" />
                  </Button>
                </div>
                {formError && (
                  <div className="mt-2 rounded-lg border border-error-500/30 bg-error-500/10 p-2 text-sm text-error-400">
                    {formError}
                  </div>
                )}
              </div>
            </form>
          )}

          {ticketDetail?.is_reply_blocked && (
            <p className="py-2 text-center text-sm text-dark-400">{t('support.repliesDisabled')}</p>
          )}
        </div>
      </div>
    );
  }

  // ─── Новое обращение ───
  if (showCreateForm) {
    return (
      <div className="mx-auto max-w-[760px] space-y-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowCreateForm(false)}
            className="rv-ibtn"
            aria-label={t('common.back')}
          >
            <BackIcon />
          </button>
          <h1 className="rv-title !text-[30px] lg:!text-[44px]">{t('support.newTicket')}</h1>
        </div>
        <div className="bento-card !p-5">
          <div>
            <h2 className="mb-6 text-lg font-semibold text-dark-100">
              {t('support.createTicket')}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setFormError(null);
                // Rate limit: max 3 tickets per 60 seconds
                if (!checkRateLimit(RATE_LIMIT_KEYS.TICKET_CREATE, 3, 60000)) {
                  const resetTime = getRateLimitResetTime(RATE_LIMIT_KEYS.TICKET_CREATE);
                  setFormError(t('support.tooManyRequests', { seconds: resetTime }));
                  return;
                }
                createMutation.mutate();
              }}
              className="space-y-4"
            >
              <div>
                <label htmlFor="support-subject" className="label">
                  {t('support.subject')}
                </label>
                <input
                  id="support-subject"
                  type="text"
                  className="input"
                  placeholder={t('support.subjectPlaceholder')}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  minLength={3}
                  maxLength={255}
                />
              </div>
              <div>
                <label htmlFor="support-message" className="label">
                  {t('support.message')}
                </label>
                <textarea
                  id="support-message"
                  className="input min-h-[150px]"
                  placeholder={t('support.messagePlaceholder')}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  required
                  minLength={10}
                  maxLength={4000}
                />
              </div>

              {/* Media attachments for create */}
              <div>
                <input
                  ref={createFileInputRef}
                  type="file"
                  accept={Object.keys(MEDIA_TYPES).join(',')}
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    files.forEach((file) => handleFileSelect(file, setCreateAttachments));
                    e.target.value = '';
                  }}
                />
                <AttachmentsPreview
                  items={createAttachments}
                  onRemove={(idx) =>
                    setCreateAttachments((prev) => {
                      const removed = prev[idx];
                      if (removed?.preview) URL.revokeObjectURL(removed.preview);
                      return prev.filter((_, i) => i !== idx);
                    })
                  }
                />
                {createAttachments.length < 10 && (
                  <button
                    type="button"
                    onClick={() => createFileInputRef.current?.click()}
                    disabled={createAttachments.some((a) => a.uploading)}
                    className="mt-2 flex items-center gap-2 text-sm text-dark-400 transition-colors hover:text-dark-200 disabled:opacity-50"
                  >
                    <ImageIcon />
                    {t('support.attachMedia')}{' '}
                    {createAttachments.length > 0 && `(${createAttachments.length}/10)`}
                  </button>
                )}
              </div>

              {formError && (
                <div className="rounded-xl border border-error-500/30 bg-error-500/10 p-3 text-sm text-error-400">
                  {formError}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="submit"
                  disabled={createAttachments.some((a) => a.uploading)}
                  loading={createMutation.isPending}
                >
                  <SendIcon className="h-4 w-4" />
                  <span className="ml-2">{t('support.send')}</span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowCreateForm(false);
                    setFormError(null);
                    clearCreateAttachments();
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ─── Помощь (макет «10 · Помощь») ───
  const faqItems = (faqPages ?? []).slice().sort((a, b) => a.order - b.order);
  return (
    <div className="space-y-3 lg:space-y-5">
      <h1 className="rv-title !text-[52px] lg:!text-[64px]">
        {t('rv.help.title1')} <span className="rv-pill">{t('rv.help.title2')}</span>
      </h1>

      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0">
        {faqItems.length > 0 && (
          <section className="bento-card !px-5 !py-1">
            {faqItems.map((faq) => {
              const open = openFaq === faq.id;
              return (
                <div key={faq.id} className="border-b-2 border-dark-700 last:border-0">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : faq.id)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-4 py-4 text-left"
                  >
                    <span className="text-base font-bold leading-snug text-dark-100">
                      {faq.title}
                    </span>
                    <span
                      className={`shrink-0 text-2xl font-bold leading-none text-accent-400 transition-transform ${open ? 'rotate-45' : ''}`}
                      aria-hidden="true"
                    >
                      +
                    </span>
                  </button>
                  {open && (
                    <div
                      className="pb-4 text-[15px] leading-relaxed text-dark-300 [&_a]:font-bold [&_a]:underline"
                      dangerouslySetInnerHTML={{ __html: formatContent(faq.content) }}
                    />
                  )}
                </div>
              );
            })}
          </section>
        )}

        <div className="space-y-3 lg:space-y-5">
          <section className="bento-card rv-card-acc rv-topo !p-5">
            <h2 className="rv-d text-[40px]">{t('rv.help.notFound')}</h2>
            <p className="mt-2 text-base leading-snug">{t('rv.help.notFoundText')}</p>
            {supportConfig?.tickets_enabled !== false && (
              <button
                type="button"
                onClick={openCreate}
                className="btn rv-btn-lg rv-btn-ink mt-4 w-full"
              >
                {t('rv.help.write')}
              </button>
            )}
            {supportConfig?.support_username && resolveSupportContact(supportConfig) && (
              <p className="mt-3 text-center">
                <button
                  type="button"
                  onClick={() => openSupportContact(supportConfig)}
                  className="text-sm font-bold underline decoration-2 underline-offset-2"
                >
                  {t('rv.help.orTelegram', { user: supportConfig.support_username })}
                </button>
              </p>
            )}
          </section>
          {ticketsList}
        </div>
      </div>
    </div>
  );
}
