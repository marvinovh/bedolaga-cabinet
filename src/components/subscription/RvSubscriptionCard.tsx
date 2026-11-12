import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { cn } from '@/lib/utils';
import { subscriptionApi } from '@/api/subscription';
import { uiLocale } from '@/utils/uiLocale';
import { ChevronRightIcon } from '@/components/icons';
import type { SubscriptionListItem } from '@/types';

export type RvSubState = 'ok' | 'warn' | 'limited' | 'off';

const SOON_MS = 3 * 864e5;

export function rvSubState(sub: SubscriptionListItem): RvSubState {
  const end = sub.end_date ? new Date(sub.end_date).getTime() : 0;
  if (sub.status === 'limited') return 'limited';
  const active = sub.status === 'active' || sub.status === 'trial';
  if (!active || (end && end < Date.now())) return 'off';
  if (end && end - Date.now() <= SOON_MS) return 'warn';
  return 'ok';
}

const dayMonth = (iso: string) =>
  new Date(iso).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'long' });

/**
 * Карточка подписки в списке — макеты «02d · Мои подписки» и «17 · Подписки на
 * компьютере»: статус, трафик и устройства, автопродление тогглом, одно главное
 * действие по состоянию и «Открыть».
 */
export function RvSubscriptionCard({
  sub,
  devicesUsed,
  price,
}: {
  sub: SubscriptionListItem;
  devicesUsed: number;
  /** Цена месяца тарифа, уже с валютой — для «Продлить за …». */
  price: string | null;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const st = rvSubState(sub);
  const daysLeft = sub.end_date
    ? Math.max(0, Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 864e5))
    : 0;

  const autopay = useMutation({
    mutationFn: (enabled: boolean) => subscriptionApi.updateAutopay(enabled, undefined, sub.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['subscription', sub.id] });
    },
  });
  const pause = useMutation({
    mutationFn: () => subscriptionApi.togglePause(sub.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] }),
  });

  const unlimited = sub.traffic_limit_gb === 0;
  const tp = unlimited
    ? 0
    : Math.min(100, (sub.traffic_used_gb / Math.max(1, sub.traffic_limit_gb)) * 100);
  const canAutopay = !sub.is_trial && !sub.requires_tariff_selection;
  const renewTo = sub.requires_tariff_selection
    ? `/subscription/purchase?subscriptionId=${sub.id}`
    : `/subscriptions/${sub.id}/renew`;

  const plan = sub.is_daily
    ? t('rv.subs.dailyPlan')
    : sub.end_date
      ? st === 'off'
        ? t('rv.multi.endedOn', { date: dayMonth(sub.end_date) })
        : `${t('rv.multi.until', { date: dayMonth(sub.end_date) })}${
            sub.next_traffic_refresh_at && !unlimited
              ? ` · ${t('rv.subs.trafficRenews', { date: dayMonth(sub.next_traffic_refresh_at) })}`
              : st === 'ok'
                ? ` · ${t('rv.subs.leftDays', { count: daysLeft })}`
                : ''
          }`
      : '';

  const tag =
    st === 'limited'
      ? { cls: 'badge-error', text: t('rv.subs.trafficOut') }
      : st === 'warn'
        ? { cls: 'badge-warning', text: t('rv.subs.leftShort', { count: daysLeft }) }
        : st === 'off'
          ? { cls: 'badge-neutral', text: t('rv.subs.ended') }
          : { cls: 'badge-success', text: t('rv.subp.active') };

  const cta =
    st === 'limited'
      ? {
          label: t('rv.subp.buyTraffic'),
          primary: true,
          onClick: () => navigate(`/subscriptions/${sub.id}`),
        }
      : st === 'warn'
        ? {
            label: price ? t('rv.multi.renewFor', { price }) : t('rv.renew'),
            onClick: () => navigate(renewTo),
          }
        : st === 'off'
          ? {
              label: price ? t('rv.multi.restoreFor', { price }) : t('rv.multi.restore'),
              onClick: () => navigate(renewTo),
            }
          : sub.is_daily
            ? { label: t('rv.subs.pause'), onClick: () => pause.mutate() }
            : {
                label: t('rv.connectDevice'),
                onClick: () => navigate(`/connection?sub=${sub.id}`),
              };

  const autopayText = sub.is_daily
    ? t('rv.subs.dailyCharge')
    : st === 'off'
      ? t('rv.subs.notRenewing')
      : sub.autopay_enabled && sub.end_date
        ? price
          ? t('rv.subs.autopayOnPrice', { date: dayMonth(sub.end_date), price })
          : t('rv.subs.autopayOnDate', { date: dayMonth(sub.end_date) })
        : t('rv.subs.autopayOff');

  return (
    <article
      className={cn(
        'flex flex-col gap-3.5 rounded-[22px] border-2 bg-dark-900 p-5',
        st === 'limited' && 'border-[var(--rv-bad)]',
        st === 'warn' && 'border-[var(--rv-warn)]',
        st === 'ok' && 'border-dark-700',
        st === 'off' && 'border-dashed border-dark-600 !bg-transparent',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="rv-d break-words text-[34px] text-dark-100">
            {sub.tariff_name || t('subscription.defaultName', 'Подписка')}
          </h3>
          <p className="mt-1 text-[15px] text-dark-300 first-letter:uppercase">{plan}</p>
        </div>
        <span className={cn(tag.cls, 'mt-1 shrink-0')}>
          <i className="rv-tag-dot" />
          {tag.text}
        </span>
      </div>

      <div className={cn('grid grid-cols-2 gap-4', st === 'off' && 'opacity-45')}>
        <div>
          <p className="mb-2 flex justify-between gap-1.5 text-xs font-bold text-dark-400">
            <span>{t('rv.traffic')}</span>
            <b className="text-dark-100">
              {st === 'off'
                ? '—'
                : unlimited
                  ? '∞'
                  : `${Math.round(sub.traffic_used_gb)} ${t('rv.of')} ${Math.round(sub.traffic_limit_gb)} ${t('rv.gb')}`}
            </b>
          </p>
          <div
            className={cn(
              'rv-meter !h-2',
              st === 'warn' && 'rv-warn',
              st === 'limited' && 'rv-bad',
            )}
          >
            <i style={{ width: `${st === 'limited' ? 100 : tp}%` }} />
          </div>
        </div>
        <div>
          <p className="mb-2 flex justify-between gap-1.5 text-xs font-bold text-dark-400">
            <span>{t('rv.devices')}</span>
            <b className="text-dark-100">
              {sub.device_limit > 0
                ? `${devicesUsed} ${t('rv.of')} ${sub.device_limit}`
                : devicesUsed}
            </b>
          </p>
          {sub.device_limit > 0 && sub.device_limit <= 12 ? (
            <div className="rv-slots">
              {Array.from({ length: sub.device_limit }, (_, i) => (
                <i key={i} className={cn('!h-2', i < devicesUsed && 'on')} />
              ))}
            </div>
          ) : (
            <div className="rv-meter !h-2">
              <i
                style={{
                  width:
                    sub.device_limit > 0
                      ? `${Math.min(100, (devicesUsed / sub.device_limit) * 100)}%`
                      : '0%',
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t-2 border-dark-700 pt-3.5">
        {canAutopay && !sub.is_daily && st !== 'off' ? (
          <button
            type="button"
            role="switch"
            aria-checked={sub.autopay_enabled}
            aria-label={t('subscription.autoRenewal')}
            disabled={autopay.isPending}
            onClick={() => autopay.mutate(!sub.autopay_enabled)}
            className="rv-tog !h-7 !w-12 shrink-0 after:!h-[18px] after:!w-[18px] aria-checked:after:!translate-x-5"
          />
        ) : (
          <span
            role="switch"
            aria-checked={sub.is_daily ? !sub.is_daily_paused : false}
            aria-disabled="true"
            className="rv-tog !h-7 !w-12 shrink-0 opacity-70 after:!h-[18px] after:!w-[18px] aria-checked:after:!translate-x-5"
          />
        )}
        <span className="text-sm text-dark-300">{autopayText}</span>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={cta.onClick}
          disabled={pause.isPending}
          className={cn('btn flex-1', cta.primary ? 'btn-primary !shadow-none' : 'btn-secondary')}
        >
          {cta.label}
        </button>
        <Link
          to={`/subscriptions/${sub.id}`}
          className="btn btn-secondary hidden !px-5 lg:inline-flex"
        >
          {t('rv.subs.open')}
        </Link>
        <Link
          to={`/subscriptions/${sub.id}`}
          className="rv-ibtn lg:hidden"
          aria-label={t('rv.subs.open')}
        >
          <ChevronRightIcon className="h-5 w-5" />
        </Link>
      </div>
    </article>
  );
}
