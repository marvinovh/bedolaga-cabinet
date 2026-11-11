import { hasUnknownManagedTraffic } from '@/utils/trafficAccounting';
import ManagedTrafficSummary from '@/components/subscription/ManagedTrafficSummary';
import { uiLocale } from '@/utils/uiLocale';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import type { UseMutationResult } from '@tanstack/react-query';
import { useHaptic } from '@/platform';
import { formatTraffic } from '../../utils/formatTraffic';
import { ArrowRightIcon, ChevronRightIcon, RefreshIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { Subscription } from '../../types';

interface SubscriptionCardActiveProps {
  subscription: Subscription;
  trafficData: {
    traffic_used_gb: number;
    traffic_used_percent: number;
    is_unlimited: boolean;
    traffic_accounting_mode?: 'legacy' | 'managed';
    traffic_remaining_gb?: number | null;
    base_traffic_remaining_gb?: number | null;
    next_traffic_refresh_at?: string | null;
  } | null;
  refreshTrafficMutation: UseMutationResult<unknown, unknown, void, unknown>;
  trafficRefreshCooldown: number;
  connectedDevices: number;
}

const dayMonth = (iso: string) =>
  new Date(iso).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'long' });

/**
 * Главная → карточка активной подписки (макет «02 · Главная»):
 * лаймовый герой «VPN РАБОТАЕТ» + карточка трафика и устройств.
 */
export default function SubscriptionCardActive({
  subscription,
  trafficData,
  refreshTrafficMutation,
  trafficRefreshCooldown,
  connectedDevices,
}: SubscriptionCardActiveProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const haptic = useHaptic();

  const unknownTraffic = hasUnknownManagedTraffic(subscription, trafficData);
  const usedPercent = trafficData?.traffic_used_percent ?? subscription.traffic_used_percent;
  const usedGb = trafficData?.traffic_used_gb ?? subscription.traffic_used_gb;
  const isUnlimited = trafficData?.is_unlimited ?? subscription.traffic_limit_gb === 0;
  const limitGb = subscription.traffic_limit_gb;
  const leftGb = Math.max(0, limitGb - usedGb);
  const leftPercent = Math.max(0, Math.min(100, 100 - usedPercent));
  const trafficZone = usedPercent >= 90 ? 'rv-bad' : usedPercent >= 75 ? 'rv-warn' : '';

  const daysLeft = subscription.days_left;
  const unlimitedDevices = subscription.device_limit <= 0;
  const isAtDeviceLimit = !unlimitedDevices && connectedDevices >= subscription.device_limit;
  const resetAt = trafficData?.next_traffic_refresh_at ?? subscription.next_traffic_refresh_at;

  const leftLabel =
    daysLeft > 0
      ? t('subscription.days', { count: daysLeft })
      : t('subscription.hours', { count: Math.max(1, subscription.hours_left) });

  return (
    <div className="space-y-3 lg:space-y-5">
      {/* ─── Герой ─── */}
      <section
        className="bento-card rv-card-acc rv-topo !p-5 sm:!p-8"
        data-onboarding="connect-devices"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="rv-kicker min-w-0">
            <span className="line-clamp-2 min-w-0 break-words">
              {subscription.tariff_name || t('subscription.currentPlan')}
            </span>
          </p>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#111] px-2.5 py-1.5 text-xs font-bold leading-none text-[rgb(var(--color-accent-500))]">
            <i className="rv-dot ping" />
            {subscription.is_trial ? t('rv.trial') : t('rv.online')}
          </span>
        </div>

        <h2 className="rv-d mt-5 text-[60px] sm:text-[88px]">
          {t('rv.vpn')}{' '}
          <span className="rv-pill rv-pill-ink inline-block px-[0.18em]">{t('rv.works')}</span>
        </h2>

        <p className="mt-4 text-[17px] font-medium leading-snug sm:text-lg">
          <Trans
            i18nKey="rv.daysLeftUntil"
            values={{ left: leftLabel, date: dayMonth(subscription.end_date) }}
            components={{ b: <b className="font-bold" /> }}
          />
          {subscription.autopay_enabled && (
            <span className="hidden sm:inline">. {t('rv.autopayOn')}</span>
          )}
        </p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          {subscription.subscription_url && (
            <button
              type="button"
              onClick={() => {
                if (isAtDeviceLimit) {
                  haptic.notification('error');
                  return;
                }
                navigate(`/connection?sub=${subscription.id}`);
              }}
              aria-disabled={isAtDeviceLimit}
              className={cn(
                'btn btn-primary rv-btn-lg rv-btn-ink w-full sm:w-auto',
                isAtDeviceLimit && 'opacity-60',
              )}
            >
              {t('rv.connectDevice')}
              <ArrowRightIcon className="h-5 w-5" />
            </button>
          )}
          <Link
            to={`/subscriptions/${subscription.id}/renew`}
            className="btn rv-btn-lg rv-btn-ghost-ink hidden sm:inline-flex"
          >
            {t('rv.renew')}
          </Link>
        </div>

        <p className="mt-3 text-center text-sm text-[#111]/75 sm:text-left">
          {isAtDeviceLimit
            ? t('rv.deviceLimitReached')
            : unlimitedDevices
              ? t('rv.connectedUnlimited', { used: connectedDevices })
              : t('rv.connectedOf', { used: connectedDevices, max: subscription.device_limit })}
        </p>
      </section>

      {/* ─── Трафик и устройства ─── */}
      <section className="bento-card !p-5 lg:grid lg:grid-cols-2 lg:gap-5 lg:!border-0 lg:!bg-transparent lg:!p-0">
        <div className="lg:bento-card lg:!p-6">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-base font-bold text-dark-100">
              {isUnlimited ? t('rv.traffic') : t('rv.trafficLeft')}
            </span>
            {unknownTraffic ? (
              <span className="text-dark-400">—</span>
            ) : isUnlimited ? (
              <span className="rv-num text-[28px] text-dark-100">∞</span>
            ) : (
              <span className="whitespace-nowrap text-sm text-dark-400">
                <span className="rv-num mr-1 text-[28px] text-dark-100">
                  {leftGb >= 10 ? Math.floor(leftGb) : formatTraffic(leftGb).split(/\s/)[0]}
                </span>
                {t('rv.of')}{' '}
                {limitGb >= 10
                  ? `${Math.round(limitGb)}\u00A0${t('rv.gb')}`
                  : formatTraffic(limitGb)}
              </span>
            )}
          </div>
          {!unknownTraffic && !isUnlimited && (
            <div className={cn('rv-meter mt-3', trafficZone)}>
              <i style={{ width: `${leftPercent}%` }} />
            </div>
          )}
          <div className="mt-2 flex items-center justify-between gap-2 text-[13px] text-dark-400">
            <span className="min-w-0 truncate">
              {!isUnlimited && resetAt
                ? t('rv.resetsOn', { date: dayMonth(resetAt) })
                : t('rv.usedGb', { amount: formatTraffic(usedGb) })}
            </span>
            <button
              type="button"
              onClick={() => refreshTrafficMutation.mutate()}
              disabled={refreshTrafficMutation.isPending || trafficRefreshCooldown > 0}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 font-medium text-dark-400 transition-colors hover:text-dark-100 disabled:opacity-50"
              aria-label={t('common.refresh')}
            >
              <RefreshIcon
                className={cn('h-3.5 w-3.5', refreshTrafficMutation.isPending && 'animate-spin')}
              />
              {trafficRefreshCooldown > 0 ? `${trafficRefreshCooldown}s` : t('rv.refresh')}
            </button>
          </div>
          <ManagedTrafficSummary subscription={subscription} refreshed={trafficData} />
        </div>

        <div className="mt-6 border-t-2 border-dark-700 pt-5 lg:bento-card lg:mt-0 lg:!p-6">
          <Link
            to={`/subscriptions/${subscription.id}`}
            className="flex items-center justify-between gap-3"
          >
            <span className="text-base font-bold text-dark-100">{t('rv.devices')}</span>
            <span className="flex items-center gap-1 text-sm font-bold text-dark-100">
              {unlimitedDevices
                ? connectedDevices
                : `${connectedDevices} ${t('rv.of')} ${subscription.device_limit}`}
              <ChevronRightIcon className="h-4 w-4 text-dark-400" />
            </span>
          </Link>
          {!unlimitedDevices && subscription.device_limit <= 12 ? (
            <div className="rv-slots mt-3">
              {Array.from({ length: subscription.device_limit }, (_, i) => (
                <i key={i} className={i < connectedDevices ? 'on' : undefined} />
              ))}
            </div>
          ) : !unlimitedDevices ? (
            <div className="rv-meter mt-3">
              <i
                style={{
                  width: `${Math.min(100, (connectedDevices / subscription.device_limit) * 100)}%`,
                }}
              />
            </div>
          ) : null}
          <p className="mt-2 text-[13px] text-dark-400">
            {t('dashboard.validUntil', {
              date: new Date(subscription.end_date).toLocaleDateString(uiLocale()),
            })}
          </p>
        </div>
      </section>
    </div>
  );
}
