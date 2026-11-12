import { deviceDisplayName } from './DevicesCard';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { AdminTicket } from '@/api/admin';
import type {
  AdminUserGiftsResponse,
  UpdateRestrictionsRequest,
  UserActivityItem,
  UserDetailResponse,
  UserPanelInfo,
} from '@/api/adminUsers';
import type { PromoGroup } from '@/api/promocodes';
import { backTo } from '@/components/admin/AdminBackButton';
import { dayTimeLabel, relativeLabel } from '@/components/admin/users';
import { cn } from '@/lib/utils';
import { formatShortDate } from '@/utils/format';
import { formatGb } from '@/utils/formatNumber';
import { isConnectedNow, relativeTimeParts } from '@/utils/relativeTime';
import { ActivityRows } from './ActivityRows';
import { type DeviceRow, deviceLongName } from './DevicesCard';
import { PromoGroupEditor, RestrictionsEditor } from './OverviewEditors';
import { KeyValues, LinkAction, Section } from './sectionParts';

export type DetailTab = 'overview' | 'subscription' | 'balance' | 'referrals' | 'activity';

export interface OverviewTabProps {
  user: UserDetailResponse;
  panelInfo: UserPanelInfo | null;
  devices: DeviceRow[] | null;
  promoGroups: PromoGroup[];
  tickets: AdminTicket[] | null;
  gifts: AdminUserGiftsResponse | null;
  recentActivity: UserActivityItem[] | null;
  can: { promoGroup: boolean; restrictions: boolean };
  busy: boolean;
  onChangePromoGroup: (groupId: number | null) => Promise<boolean>;
  onUpdateRestrictions: (request: UpdateRestrictionsRequest) => Promise<boolean>;
  onGoTo: (tab: DetailTab, view?: string) => void;
}

const BYTES_IN_GB = 1024 ** 3;
type Editor = 'promo' | 'restrictions';

/**
 * «Обзор» — первый экран карточки: подключение, откуда человек пришёл, ограничения с
 * обращениями и последние события. Всё, что поддержке нужно в первые десять секунд,
 * без прокрутки на десктопе.
 */
export function OverviewTab(props: OverviewTabProps) {
  const { t } = useTranslation();
  const { panelInfo, devices, onGoTo } = props;
  const [editor, setEditor] = useState<Editor | null>(null);
  const ns = 'admin.users.detail.overview';

  // Слева — факты о человеке, справа — лента последних событий. Подписки отдельной
  // карточкой здесь нет: срок, трафик и устройства в плитках над вкладками, а кнопки
  // управления — во вкладке «Подписка» и «Продлить» в шапке. Повторять их тут незачем.
  const { user } = props;
  const sub = user.subscription;
  const money = (kopeks: number) =>
    `${(kopeks / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}\u00A0₽`;
  const usedDevices = devices?.length ?? 0;

  // Макет «A3 · Карточка пользователя»: слева подписка, баланс, устройства и лента;
  // справа факты о человеке, подключение и ограничения.
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        {sub && (
          <section className="bento-card !p-5 lg:!p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="rv-kicker">{t('rv.ud.subNo', { id: sub.id })}</p>
                <h2 className="rv-d mt-2 text-[44px] text-dark-100">
                  {sub.tariff_name || t('subscription.defaultName', 'Подписка')}
                </h2>
              </div>
              <div className="text-right">
                <p className="text-sm text-dark-400">{t('rv.ud.validUntil')}</p>
                <p className="mt-1 text-lg font-bold text-dark-100">
                  {sub.end_date
                    ? new Date(sub.end_date).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : '—'}
                </p>
                <p className="mt-0.5 text-xs text-dark-400">
                  {t('rv.ud.daysLeft', { count: sub.days_remaining })}
                  {sub.autopay_enabled ? ` · ${t('rv.ud.autopayOn')}` : ''}
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 flex justify-between text-sm">
                  <b className="text-dark-100">{t('rv.traffic')}</b>
                  <span className="text-dark-400">
                    {Math.round(sub.traffic_used_gb)} / {sub.traffic_limit_gb || '∞'} {t('rv.gb')}
                  </span>
                </p>
                <div className="rv-meter !h-2">
                  <i
                    style={{
                      width: `${sub.traffic_limit_gb ? Math.min(100, (sub.traffic_used_gb / sub.traffic_limit_gb) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <p className="mb-2 flex justify-between text-sm">
                  <b className="text-dark-100">{t('rv.devices')}</b>
                  <span className="text-dark-400">
                    {usedDevices} / {sub.device_limit || '∞'}
                  </span>
                </p>
                {sub.device_limit > 0 && sub.device_limit <= 12 ? (
                  <div className="rv-slots">
                    {Array.from({ length: sub.device_limit }, (_, i) => (
                      <i key={i} className={cn('!h-2', i < usedDevices && 'on')} />
                    ))}
                  </div>
                ) : (
                  <div className="rv-meter !h-2" />
                )}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {['extend', 'traffic', 'devices', 'tariff', 'squads'].map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onGoTo('subscription')}
                  className="btn btn-secondary !min-h-10 !px-3.5 !py-2 !text-[16px]"
                >
                  {t(`rv.ud.quick.${key}`)}
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          <section className="bento-card !p-5">
            <p className="rv-kicker">{t('rv.ud.balance')}</p>
            <p className="rv-num mt-3 text-[56px] text-dark-100">{money(user.balance_kopeks)}</p>
            <button
              type="button"
              onClick={() => onGoTo('balance')}
              className="btn btn-primary mt-4 w-full !shadow-none"
            >
              {t('rv.ud.credit')}
            </button>
          </section>
          <section className="bento-card !p-5">
            <p className="rv-kicker">{t('rv.ud.devices')}</p>
            <div className="mt-2">
              {(devices ?? []).length === 0 && (
                <p className="py-3 text-sm text-dark-400">{t('rv.ud.noDevices')}</p>
              )}
              {(devices ?? []).slice(0, 4).map((d) => (
                <div key={d.hwid} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-dark-100">
                      {deviceDisplayName(d)}
                    </p>
                    <p className="truncate text-xs text-dark-400">{d.platform}</p>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onGoTo('subscription')}
              className="link mt-2 text-sm"
            >
              {t('rv.ud.manageDevices')}
            </button>
          </section>
        </div>

        <section className="bento-card !p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="rv-d text-[32px] text-dark-100">{t('rv.ud.whatHappened')}</h2>
            <button type="button" onClick={() => onGoTo('activity')} className="link text-sm">
              {t('rv.ud.allHistory')}
            </button>
          </div>
          <div className="mt-3">
            {props.recentActivity && props.recentActivity.length > 0 ? (
              <ActivityRows items={props.recentActivity} compact />
            ) : (
              <p className="text-sm text-dark-500">{t(`${ns}.noActivity`)}</p>
            )}
          </div>
        </section>
      </div>

      <div className="min-w-0 space-y-5">
        <Section title={t(`${ns}.origin`)}>
          <OriginFacts {...props} editor={editor} onEditor={setEditor} />
        </Section>
        <Section title={t(`${ns}.connection`)}>
          {panelInfo?.found ? (
            <ConnectionFacts panelInfo={panelInfo} devices={devices} />
          ) : (
            <p className="text-sm text-dark-500">{t(`${ns}.noPanelData`)}</p>
          )}
        </Section>
        <Section title={t(`${ns}.restrictionsAndSupport`)}>
          <SupportFacts {...props} editor={editor} onEditor={setEditor} />
        </Section>
        <p className="hidden">{money(user.total_spent_kopeks)}</p>
      </div>
    </div>
  );
}

function ConnectionFacts({
  panelInfo,
  devices,
}: {
  panelInfo: UserPanelInfo;
  devices: DeviceRow[] | null;
}) {
  const { t } = useTranslation();
  const ns = 'admin.users.detail.overview';
  // «Сейчас» — как точка в панели: подключён, если отметка не старше минуты; иначе — когда был.
  const online = isConnectedNow(panelInfo.online_at);
  const lastSeen = relativeTimeParts(panelInfo.online_at);

  return (
    <KeyValues
      rows={[
        {
          key: 'now',
          label: t(`${ns}.now`),
          value: (
            <span className="inline-flex flex-wrap items-center gap-x-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  online
                    ? 'bg-success-400 shadow-[0_0_6px_rgba(var(--color-success-400),0.6)]'
                    : 'bg-dark-600',
                )}
              />
              <span className={cn(online && 'text-success-400')}>
                {online ? t('common.relative.online') : relativeLabel(lastSeen, t)}
              </span>
              {panelInfo.last_connected_node_name && (
                <span className="text-dark-400">· {panelInfo.last_connected_node_name}</span>
              )}
            </span>
          ),
        },
        {
          key: 'first',
          label: t(`${ns}.firstConnection`),
          value: panelInfo.first_connected_at ? formatShortDate(panelInfo.first_connected_at) : '—',
        },
        {
          key: 'devices',
          label: t(`${ns}.devices`),
          value:
            devices && devices.length > 0
              ? devices.map(deviceLongName).join(', ')
              : t(`${ns}.noDevices`),
        },
        {
          key: 'lifetime',
          label: t(`${ns}.lifetimeTraffic`),
          value: `${formatGb(panelInfo.lifetime_used_traffic_bytes / BYTES_IN_GB)} ${t('common.units.gb')}`,
        },
      ]}
    />
  );
}

interface EditorProps {
  editor: Editor | null;
  onEditor: (editor: Editor | null) => void;
}

function OriginFacts({
  user,
  promoGroups,
  can,
  busy,
  onChangePromoGroup,
  onGoTo,
  editor,
  onEditor,
}: OverviewTabProps & EditorProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const ns = 'admin.users.detail.overview';
  const referrer = user.referral;

  return (
    <KeyValues
      rows={[
        {
          key: 'registered',
          label: t(`${ns}.registered`),
          value: formatShortDate(user.created_at),
        },
        { key: 'campaign', label: t(`${ns}.campaign`), value: user.campaign_name ?? '—' },
        {
          key: 'promo',
          label: t(`${ns}.promoGroup`),
          value:
            editor === 'promo' ? (
              <PromoGroupEditor
                user={user}
                promoGroups={promoGroups}
                busy={busy}
                onSave={onChangePromoGroup}
                onClose={() => onEditor(null)}
              />
            ) : (
              <span className="inline-flex flex-wrap items-center gap-x-2">
                {user.promo_group?.name ?? (
                  <span className="text-dark-500">{t(`${ns}.noPromoGroup`)}</span>
                )}
                {can.promoGroup && (
                  <LinkAction onClick={() => onEditor('promo')}>{t(`${ns}.change`)}</LinkAction>
                )}
              </span>
            ),
        },
        {
          key: 'referrer',
          label: t(`${ns}.referrer`),
          value: referrer.referred_by_id ? (
            <Link
              to={`/admin/users/${referrer.referred_by_id}`}
              state={backTo(location).state}
              className="text-accent-400 hover:text-accent-300"
            >
              {referrer.referred_by_username
                ? `@${referrer.referred_by_username}`
                : `#${referrer.referred_by_id}`}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-x-2">
              <span className="text-dark-500">—</span>
              <LinkAction onClick={() => onGoTo('referrals')}>{t(`${ns}.assign`)}</LinkAction>
            </span>
          ),
        },
        {
          key: 'activity',
          label: t(`${ns}.lastActivity`),
          value: user.last_activity ? relativeLabel(relativeTimeParts(user.last_activity), t) : '—',
        },
        {
          key: 'login',
          label: t(`${ns}.cabinetLogin`),
          value: user.cabinet_last_login ? dayTimeLabel(user.cabinet_last_login, t) : '—',
        },
      ]}
    />
  );
}

function SupportFacts({
  user,
  tickets,
  gifts,
  can,
  busy,
  onUpdateRestrictions,
  onGoTo,
  editor,
  onEditor,
}: OverviewTabProps & EditorProps) {
  const { t } = useTranslation();
  const ns = 'admin.users.detail.overview';
  const restricted = [
    user.restriction_topup && t(`${ns}.restrictTopup`),
    user.restriction_subscription && t(`${ns}.restrictSubscription`),
  ].filter(Boolean) as string[];
  const openTickets = tickets?.filter((ticket) => ticket.status !== 'closed').length ?? 0;
  const closedTickets = (tickets?.length ?? 0) - openTickets;

  const countsOrNone = (parts: (string | false)[]) => {
    const shown = parts.filter(Boolean);
    return shown.length > 0 ? shown.join(', ') : t(`${ns}.none`);
  };

  return (
    <div className="flex flex-col gap-3">
      <KeyValues
        rows={[
          {
            key: 'restrictions',
            label: t(`${ns}.restrictions`),
            value: (
              <span className="inline-flex flex-wrap items-center gap-x-2">
                <span className={cn(restricted.length > 0 && 'text-error-400')}>
                  {restricted.length > 0 ? restricted.join(', ') : t(`${ns}.noRestrictions`)}
                </span>
                {can.restrictions && editor !== 'restrictions' && (
                  <LinkAction onClick={() => onEditor('restrictions')}>
                    {t(`${ns}.configure`)}
                  </LinkAction>
                )}
              </span>
            ),
          },
          ...(restricted.length > 0 && user.restriction_reason
            ? [
                {
                  key: 'reason',
                  label: t('admin.users.detail.restrictions.reason'),
                  value: user.restriction_reason,
                },
              ]
            : []),
          {
            key: 'tickets',
            label: t(`${ns}.tickets`),
            value: (
              <span className="inline-flex flex-wrap items-center gap-x-2">
                {tickets === null
                  ? '—'
                  : countsOrNone([
                      openTickets > 0 && t(`${ns}.ticketsOpen`, { count: openTickets }),
                      closedTickets > 0 && t(`${ns}.ticketsClosed`, { count: closedTickets }),
                    ])}
                {tickets && tickets.length > 0 && (
                  <LinkAction arrow onClick={() => onGoTo('activity', 'tickets')}>
                    {t(`${ns}.open`)}
                  </LinkAction>
                )}
              </span>
            ),
          },
          {
            key: 'gifts',
            label: t(`${ns}.gifts`),
            value: (
              <span className="inline-flex flex-wrap items-center gap-x-2">
                {gifts === null
                  ? '—'
                  : countsOrNone([
                      gifts.sent_total > 0 && t(`${ns}.giftsSent`, { count: gifts.sent_total }),
                      gifts.received_total > 0 &&
                        t(`${ns}.giftsReceived`, { count: gifts.received_total }),
                    ])}
                {gifts && gifts.sent_total + gifts.received_total > 0 && (
                  <LinkAction arrow onClick={() => onGoTo('activity', 'gifts')}>
                    {t(`${ns}.list`)}
                  </LinkAction>
                )}
              </span>
            ),
          },
          {
            key: 'promocodes',
            label: t(`${ns}.promocodes`),
            value:
              user.used_promocodes > 0
                ? t(`${ns}.promocodesUsed`, { count: user.used_promocodes })
                : t(`${ns}.none`),
          },
        ]}
      />
      {editor === 'restrictions' && (
        <RestrictionsEditor
          user={user}
          busy={busy}
          onSave={onUpdateRestrictions}
          onClose={() => onEditor(null)}
        />
      )}
    </div>
  );
}
