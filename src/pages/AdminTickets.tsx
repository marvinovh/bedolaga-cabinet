import { useState, useRef, useEffect } from 'react';
import logger from '../utils/logger';
import { linkifyText } from '../utils/linkify';
import { MessageMediaGrid } from '../components/tickets/MessageMediaGrid';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { backTo } from '@/components/admin';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { adminApi, type AdminTicket, type AdminTicketDetail } from '../api/admin';
import { adminUsersApi } from '../api/adminUsers';
import { useCurrency } from '../hooks/useCurrency';
import { uiLocale } from '../utils/uiLocale';
import { cn } from '@/lib/utils';
import { ticketsApi } from '../api/tickets';
import { copyToClipboard as copyText } from '../utils/clipboard';
import { BackIcon, PaperclipIcon, SettingsIcon, TicketIcon, XIcon } from '@/components/icons';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';

interface MediaAttachment {
  id: string;
  file: File;
  preview: string;
  uploading: boolean;
  fileId?: string;
  mediaType: string;
  error?: string;
}

const ALLOWED_FILE_TYPES: Record<string, string> = {
  'image/jpeg': 'photo',
  'image/png': 'photo',
  'image/gif': 'photo',
  'image/webp': 'photo',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'text/plain': 'document',
  'application/zip': 'document',
  'application/x-rar-compressed': 'document',
};

const ACCEPT_STRING = Object.keys(ALLOWED_FILE_TYPES).join(',');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function AdminTickets() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { ticketId } = useParams<{ ticketId: string }>();
  const queryClient = useQueryClient();

  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);

  // Deep-link: /admin/tickets/:ticketId (or a startapp param routed here) opens
  // the given ticket directly — used by the admin-chat notification buttons.
  // Both routes render the same component instance (no remount), so we mirror the
  // URL param into the selection: navigating to the bare /admin/tickets list
  // clears any deep-linked selection, keeping URL and detail pane in sync. (This
  // only fires on mount or an actual param change, never on in-list clicks, since
  // ticketId stays undefined on the bare route.)
  useEffect(() => {
    if (!ticketId) {
      setSelectedTicketId(null);
      return;
    }
    const id = Number(ticketId);
    if (Number.isInteger(id) && id > 0) {
      setSelectedTicketId(id);
    }
  }, [ticketId]);
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const { formatAmount, currencySymbol } = useCurrency();
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [attachments, setAttachments] = useState<MediaAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadIdRef = useRef(0);

  // Track all created blob URLs for cleanup on unmount
  const blobUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const uploadRef = uploadIdRef;
    const urls = blobUrlsRef;
    return () => {
      uploadRef.current++;
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const { data: stats } = useQuery({
    queryKey: ['admin-ticket-stats'],
    queryFn: adminApi.getTicketStats,
  });

  const { data: ticketsData, isLoading: ticketsLoading } = useQuery({
    queryKey: ['admin-tickets', page, statusFilter],
    queryFn: () =>
      adminApi.getTickets({
        page,
        per_page: 20,
        status: statusFilter || undefined,
      }),
  });

  const { data: selectedTicket, isLoading: ticketLoading } = useQuery({
    queryKey: ['admin-ticket', selectedTicketId],
    queryFn: () => adminApi.getTicket(selectedTicketId!),
    enabled: !!selectedTicketId,
  });

  const statusMutation = useMutation({
    mutationFn: ({ ticketId, status }: { ticketId: number; status: string }) =>
      adminApi.updateTicketStatus(ticketId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ticket', selectedTicketId] });
      queryClient.invalidateQueries({ queryKey: ['admin-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['admin-ticket-stats'] });
    },
  });

  const clearAttachments = () => {
    uploadIdRef.current++;
    setAttachments((prev) => {
      prev.forEach((a) => {
        if (a.preview) {
          URL.revokeObjectURL(a.preview);
          blobUrlsRef.current.delete(a.preview);
        }
      });
      return [];
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => {
      const removed = prev[idx];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    const remaining = 10 - attachments.length;
    const toAdd = files.slice(0, remaining);

    for (const file of toAdd) {
      const mediaType = ALLOWED_FILE_TYPES[file.type];
      if (!mediaType) continue;
      if (file.size > MAX_FILE_SIZE) continue;

      const preview = mediaType === 'photo' ? URL.createObjectURL(file) : '';
      if (preview) blobUrlsRef.current.add(preview);
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `att_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const entry: MediaAttachment = { id, file, preview, uploading: true, mediaType };
      const uploadToken = uploadIdRef.current;

      setAttachments((prev) => [...prev, entry]);

      // Upload in background; ignore the result if user cleared/unmounted in the meantime.
      (async () => {
        try {
          const result = await ticketsApi.uploadMedia(file, mediaType);
          if (uploadIdRef.current !== uploadToken) return;
          setAttachments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, uploading: false, fileId: result.file_id } : a)),
          );
        } catch {
          if (uploadIdRef.current !== uploadToken) return;
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id ? { ...a, uploading: false, error: t('admin.tickets.uploadFailed') } : a,
            ),
          );
        }
      })();
    }
  };

  const handleReply = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!selectedTicketId) return;
    if (attachments.some((a) => a.uploading || a.error)) return;

    const readyAttachments = attachments.filter((a) => a.fileId) as Array<{
      fileId: string;
      mediaType: string;
    }>;

    const hasText = replyText.trim().length > 0;
    const hasMedia = readyAttachments.length > 0;
    if (!hasText && !hasMedia) return;

    const media = hasMedia
      ? {
          media_type: readyAttachments[0].mediaType,
          media_file_id: readyAttachments[0].fileId,
          media_items: readyAttachments.map((a) => ({
            type: a.mediaType as 'photo' | 'video' | 'document',
            file_id: a.fileId,
          })),
        }
      : undefined;

    setIsReplying(true);
    setReplyError(null);
    try {
      await adminApi.replyToTicket(selectedTicketId, replyText, media);
    } catch (err) {
      logger.error('Ticket reply failed:', err);
      const msg =
        err instanceof Error ? err.message : t('admin.tickets.replyFailed', 'Failed to send reply');
      setReplyError(msg);
      setIsReplying(false);
      return;
    }

    setReplyText('');
    clearAttachments();
    setIsReplying(false);
    queryClient.invalidateQueries({ queryKey: ['admin-ticket', selectedTicketId] });
    queryClient.invalidateQueries({ queryKey: ['admin-tickets'] });
    queryClient.invalidateQueries({ queryKey: ['admin-ticket-stats'] });
  };

  const formatUser = (ticket: AdminTicket | AdminTicketDetail) => {
    if (!ticket.user) return 'Unknown';
    const { first_name, last_name, username } = ticket.user;
    if (first_name || last_name) return `${first_name || ''} ${last_name || ''}`.trim();
    if (username) return `@${username}`;
    return 'User';
  };

  const copyToClipboard = (text: string) => {
    void copyText(text);
  };

  const ticketUserId = selectedTicket?.user?.id;
  const { data: ticketUser } = useQuery({
    queryKey: ['admin-user', ticketUserId],
    queryFn: () => adminUsersApi.getUser(ticketUserId!),
    enabled: !!ticketUserId,
  });
  const userSub = ticketUser?.subscription ?? ticketUser?.subscriptions?.[0] ?? null;
  const { data: userDevices } = useQuery({
    queryKey: ['admin-user-devices', ticketUserId, userSub?.id],
    queryFn: () => adminUsersApi.getUserDevices(ticketUserId!, userSub?.id),
    enabled: !!ticketUserId && !!userSub,
  });
  const [quickDone, setQuickDone] = useState<string | null>(null);
  const quick = useMutation({
    mutationFn: async (kind: 'gift' | 'reset') => {
      if (!ticketUserId) return;
      if (kind === 'gift')
        await adminUsersApi.updateSubscription(ticketUserId, {
          action: 'extend',
          days: 3,
          subscription_id: userSub?.id,
        });
      else await adminUsersApi.resetUserDevices(ticketUserId, userSub?.id);
      return kind;
    },
    onSuccess: (kind) => {
      setQuickDone(kind ?? null);
      queryClient.invalidateQueries({ queryKey: ['admin-user', ticketUserId] });
      queryClient.invalidateQueries({ queryKey: ['admin-user-devices', ticketUserId] });
    },
  });

  const ago = (iso: string) => {
    const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (min < 60) return t('rv.tk.min', { count: min });
    const h = Math.round(min / 60);
    if (h < 48) return t('rv.tk.hour', { count: h });
    return t('rv.tk.day', { count: Math.round(h / 24) });
  };
  const hhmm = (iso: string) =>
    new Date(iso).toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' });
  const waitingTag = (ticket: AdminTicket) => {
    const last = ticket.last_message;
    if (ticket.status === 'closed' || (last && last.is_from_admin)) return null;
    if (!last || ticket.messages_count <= 1)
      return { cls: 'rv-badge rv-badge-lime', text: t('rv.tk.new') };
    const min = (Date.now() - new Date(ticket.updated_at).getTime()) / 60000;
    return {
      cls: min >= 30 ? 'badge-error' : 'badge-warning',
      text: ago(ticket.updated_at),
      dot: true,
    };
  };

  const templates = [
    { key: 'qrTv', text: t('rv.tk.tpl.qrTvText', { url: `${window.location.origin}/connection` }) },
    { key: 'country', text: t('rv.tk.tpl.countryText') },
    { key: 'whitelist', text: t('rv.tk.tpl.whitelistText') },
    { key: 'refund', text: t('rv.tk.tpl.refundText') },
  ];
  const insert = (text: string) =>
    setReplyText((prev) => (prev.trim() ? `${prev}\n\n${text}` : text));

  const segments: { value: string; label: string; count?: number }[] = [
    { value: 'open', label: t('rv.tk.open'), count: stats?.open },
    ...(stats?.pending
      ? [{ value: 'pending', label: t('rv.tk.pending'), count: stats.pending }]
      : []),
    { value: 'answered', label: t('rv.tk.waiting') },
    { value: 'closed', label: t('rv.tk.closed') },
  ];

  const userName = (ticket: AdminTicket | AdminTicketDetail) => formatUser(ticket);

  return (
    <div className="flex flex-col gap-5">
      {/* Шапка */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-dark-400">{t('rv.tk.crumb')}</p>
          <h1 className="rv-d mt-1 text-[44px] text-dark-100 lg:text-[56px]">{t('rv.tk.title')}</h1>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto">
          <div className="rv-seg min-w-0 flex-1 lg:flex-none" role="tablist">
            {segments.map((seg) => (
              <button
                key={seg.value}
                type="button"
                role="tab"
                aria-selected={statusFilter === seg.value}
                className={cn('whitespace-nowrap', statusFilter === seg.value && 'on')}
                onClick={() => {
                  setStatusFilter(seg.value);
                  setPage(1);
                }}
              >
                {seg.label}
                {seg.count ? ` · ${seg.count}` : ''}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/tickets/settings')}
            className="btn btn-secondary !min-h-12 shrink-0"
            aria-label={t('admin.tickets.settings')}
          >
            <SettingsIcon className="h-5 w-5 lg:hidden" />
            <span className="hidden lg:inline">{t('admin.tickets.settings')}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_260px]">
        {/* Список */}
        <section
          className={cn(
            'bento-card flex flex-col !p-2.5 lg:min-h-[680px]',
            selectedTicketId && 'hidden lg:flex',
          )}
        >
          {ticketsLoading ? (
            <SkeletonGroup className="space-y-2 p-1">
              <Skeleton variant="card" count={4} className="h-16" />
            </SkeletonGroup>
          ) : ticketsData?.items.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-dark-400">
              {t('admin.tickets.noTickets')}
            </div>
          ) : (
            <div className="scrollbar-hide flex flex-col gap-1 overflow-y-auto">
              {ticketsData?.items.map((ticket) => {
                const tag = waitingTag(ticket);
                const sel = selectedTicketId === ticket.id;
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => {
                      setSelectedTicketId(ticket.id);
                      setReplyText('');
                      setQuickDone(null);
                      clearAttachments();
                    }}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-2xl border-2 px-3.5 py-3 text-left transition-colors',
                      sel
                        ? 'border-accent-500 bg-[var(--rv-acc-bg)]'
                        : 'border-transparent hover:bg-dark-800',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-base font-bold leading-snug text-dark-100">
                        {ticket.title}
                      </span>
                      <span className="mt-1 block truncate text-xs text-dark-400">
                        {userName(ticket)} · {ago(ticket.updated_at)}
                      </span>
                    </span>
                    {tag && (
                      <span className={cn(tag.cls, 'mt-1 shrink-0 !rotate-0')}>
                        {tag.dot && <i className="rv-tag-dot" />}
                        {tag.text}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {ticketsData && ticketsData.pages > 1 && (
            <div className="mt-auto flex items-center justify-center gap-3 border-t-2 border-dark-700 pt-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn btn-secondary !min-h-9 !px-3 !text-sm disabled:opacity-50"
              >
                {t('common.back')}
              </button>
              <span className="text-sm text-dark-400">
                {page} / {ticketsData.pages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(ticketsData.pages, p + 1))}
                disabled={page === ticketsData.pages}
                className="btn btn-secondary !min-h-9 !px-3 !text-sm disabled:opacity-50"
              >
                {t('common.next')}
              </button>
            </div>
          )}
        </section>

        {/* Переписка */}
        <section
          className={cn(
            'bento-card flex min-h-[560px] flex-col !p-5 lg:min-h-[680px]',
            !selectedTicketId && 'hidden lg:flex',
          )}
        >
          {!selectedTicketId ? (
            <div className="m-auto flex flex-col items-center gap-3 text-center">
              <span className="rv-ic">
                <TicketIcon className="h-6 w-6" />
              </span>
              <p className="text-sm text-dark-400">{t('admin.tickets.selectTicket')}</p>
            </div>
          ) : ticketLoading || !selectedTicket ? (
            <SkeletonGroup className="space-y-3">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton variant="card" count={2} className="h-20" />
            </SkeletonGroup>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/admin/tickets')}
                  className="rv-ibtn shrink-0 lg:hidden"
                  aria-label={t('common.back')}
                >
                  <BackIcon />
                </button>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold leading-tight text-dark-100 [overflow-wrap:anywhere]">
                    {selectedTicket.title}
                  </h2>
                  <p className="mt-1 text-xs text-dark-400">
                    № {selectedTicket.id} ·{' '}
                    {t('rv.tk.openedAt', { time: hhmm(selectedTicket.created_at) })}
                    {selectedTicket.priority === 'urgent' || selectedTicket.priority === 'high'
                      ? ` · ${t(`admin.tickets.priorities.${selectedTicket.priority}`, { defaultValue: selectedTicket.priority })}`
                      : ''}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2.5 border-b-2 border-dark-700 pb-4">
                {selectedTicket.status === 'closed' ? (
                  <button
                    type="button"
                    onClick={() =>
                      statusMutation.mutate({ ticketId: selectedTicket.id, status: 'open' })
                    }
                    disabled={statusMutation.isPending}
                    className="btn btn-secondary !min-h-9 !px-3.5 !text-sm"
                  >
                    {t('rv.tk.reopen')}
                  </button>
                ) : (
                  <>
                    {selectedTicket.status !== 'pending' && (
                      <button
                        type="button"
                        onClick={() =>
                          statusMutation.mutate({ ticketId: selectedTicket.id, status: 'pending' })
                        }
                        disabled={statusMutation.isPending}
                        className="btn btn-secondary !min-h-9 !px-3.5 !text-sm"
                      >
                        {t('rv.tk.take')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        statusMutation.mutate({ ticketId: selectedTicket.id, status: 'closed' })
                      }
                      disabled={statusMutation.isPending}
                      className="btn btn-primary !min-h-9 !px-3.5 !text-sm !shadow-none"
                    >
                      {t('rv.tk.resolve')}
                    </button>
                  </>
                )}
              </div>

              <div className="scrollbar-hide -mx-1 flex max-h-[52vh] flex-1 flex-col gap-3 overflow-y-auto px-1 py-4 lg:max-h-none">
                {selectedTicket.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'rv-msg !max-w-[78%]',
                      msg.is_from_admin ? 'rv-msg-me' : 'rv-msg-them',
                    )}
                  >
                    {msg.message_text && (
                      <p
                        className={cn(
                          'whitespace-pre-wrap break-words [&_a]:underline',
                          !msg.is_from_admin && 'text-dark-100',
                        )}
                        dangerouslySetInnerHTML={{ __html: linkifyText(msg.message_text) }}
                      />
                    )}
                    <MessageMediaGrid message={msg} translateError={t('support.imageLoadFailed')} />
                    <p
                      className={cn(
                        'mt-1.5 text-[11px] font-medium',
                        msg.is_from_admin ? 'text-[#111]/70' : 'text-dark-400',
                      )}
                    >
                      {msg.is_from_admin
                        ? t('admin.tickets.adminLabel')
                        : selectedTicket.user?.first_name || userName(selectedTicket)}{' '}
                      · {hhmm(msg.created_at)}
                    </p>
                  </div>
                ))}
              </div>

              {selectedTicket.status !== 'closed' && (
                <form onSubmit={handleReply} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] text-dark-400">{t('rv.tk.templates')}</span>
                    {templates.map((tpl) => (
                      <button
                        key={tpl.key}
                        type="button"
                        onClick={() => insert(tpl.text)}
                        className="rounded-full border-2 border-dashed border-dark-600 px-3 py-1.5 text-[13px] font-bold text-dark-200 hover:border-accent-500"
                      >
                        {t(`rv.tk.tpl.${tpl.key}`)}
                      </button>
                    ))}
                  </div>

                  {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {attachments.map((att, idx) => (
                        <div key={att.id} className="relative">
                          {att.mediaType === 'photo' && att.preview ? (
                            <img
                              src={att.preview}
                              alt={t('common.preview')}
                              loading="lazy"
                              className="h-16 w-16 rounded-lg object-cover"
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
                            onClick={() => removeAttachment(idx)}
                            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-dark-600 text-dark-300 hover:bg-error-500 hover:text-white"
                          >
                            <XIcon className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT_STRING}
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {replyError && (
                    <div className="rounded-xl bg-[var(--rv-bad-bg)] px-3 py-2 text-sm text-[var(--rv-bad)]">
                      {replyError}
                    </div>
                  )}

                  <div className="flex items-stretch gap-2.5">
                    <div className="relative min-w-0 flex-1">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder={t('rv.tk.replyPlaceholder')}
                        rows={3}
                        className="input h-full min-h-[76px] resize-none !pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={attachments.length >= 10 || attachments.some((a) => a.uploading)}
                        className="absolute bottom-2.5 right-2.5 grid h-8 w-8 place-items-center rounded-lg text-dark-400 hover:text-dark-100 disabled:opacity-50"
                        aria-label={t('admin.tickets.attachMedia')}
                      >
                        <PaperclipIcon className="h-4 w-4" />
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={
                        (!replyText.trim() && attachments.filter((a) => a.fileId).length === 0) ||
                        isReplying ||
                        attachments.some((a) => a.uploading || a.error)
                      }
                      className="btn btn-primary shrink-0 !px-4 !shadow-none lg:!px-[18px]"
                    >
                      {isReplying ? t('common.loading') : t('rv.tk.send')}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </section>

        {/* Клиент */}
        {selectedTicket?.user && (
          <aside
            className={cn(
              'bento-card flex flex-col gap-4 !p-5 lg:col-span-2 xl:col-span-1',
              !selectedTicketId && 'hidden',
            )}
          >
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-500 text-sm font-bold text-[#111]">
                {(selectedTicket.user.first_name || selectedTicket.user.username || '?')
                  .charAt(0)
                  .toUpperCase()}
              </span>
              <span className="min-w-0">
                <Link
                  to={`/admin/users/${selectedTicket.user.id}`}
                  {...backTo(location)}
                  className="link block truncate text-base"
                >
                  {userName(selectedTicket)}
                </Link>
                <button
                  type="button"
                  onClick={() => copyToClipboard(String(selectedTicket.user!.telegram_id))}
                  className="block truncate text-xs text-dark-400 hover:text-dark-200"
                  title={t('admin.tickets.copyTelegramId')}
                >
                  {selectedTicket.user.username
                    ? `@${selectedTicket.user.username}`
                    : `TG ${selectedTicket.user.telegram_id}`}
                </button>
              </span>
            </div>
            {userSub ? (
              <span
                className={cn('self-start', userSub.is_active ? 'badge-success' : 'badge-error')}
              >
                <i className="rv-tag-dot" />
                {userSub.tariff_name || (userSub.is_trial ? t('rv.tk.trial') : t('rv.tk.sub'))}
                {userSub.end_date &&
                  ` ${t('rv.tk.until', {
                    date: new Date(userSub.end_date).toLocaleDateString(uiLocale(), {
                      day: 'numeric',
                      month: 'short',
                    }),
                  })}`}
              </span>
            ) : (
              ticketUser && <span className="badge-neutral self-start">{t('rv.tk.noSub')}</span>
            )}
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm">
              {userSub && (
                <>
                  <dt className="text-dark-400">{t('rv.traffic')}</dt>
                  <dd className="text-right font-bold text-dark-100">
                    {Math.round(userSub.traffic_used_gb)} /{' '}
                    {userSub.traffic_limit_gb ? `${userSub.traffic_limit_gb} ${t('rv.gb')}` : '∞'}
                  </dd>
                  <dt className="text-dark-400">{t('rv.devices')}</dt>
                  <dd className="text-right font-bold text-dark-100">
                    {userDevices?.total ?? '—'} / {userSub.device_limit || '∞'}
                  </dd>
                </>
              )}
              {ticketUser && (
                <>
                  <dt className="text-dark-400">{t('nav.balance')}</dt>
                  <dd className="text-right font-bold text-dark-100">
                    {formatAmount(ticketUser.balance_rubles)} {currencySymbol}
                  </dd>
                </>
              )}
            </dl>

            <div className="mt-2 flex flex-col gap-2.5 xl:mt-auto">
              <p className="text-[13px] font-bold text-dark-200">{t('rv.tk.quick')}</p>
              {userSub && (
                <>
                  <button
                    type="button"
                    disabled={quick.isPending}
                    onClick={() => quick.mutate('gift')}
                    className="btn btn-secondary !min-h-10 !text-sm"
                  >
                    {quickDone === 'gift' ? `✓ ${t('rv.tk.giftDone')}` : t('rv.tk.gift')}
                  </button>
                  <button
                    type="button"
                    disabled={quick.isPending}
                    onClick={() => quick.mutate('reset')}
                    className="btn btn-secondary !min-h-10 !text-sm"
                  >
                    {quickDone === 'reset' ? `✓ ${t('rv.tk.resetDone')}` : t('rv.tk.reset')}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => insert(templates[0].text)}
                className="btn btn-secondary !min-h-10 !text-sm"
              >
                {t('rv.tk.qr')}
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
