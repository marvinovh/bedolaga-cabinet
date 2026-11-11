import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueries } from '@tanstack/react-query';

import { cn } from '@/lib/utils';
import { subscriptionApi } from '@/api/subscription';
import { useCurrency } from '@/hooks/useCurrency';
import { uiLocale } from '@/utils/uiLocale';
import { formatTraffic } from '@/utils/formatTraffic';
import { ChevronRightIcon, PlusIcon } from '@/components/icons';
import type { SubscriptionListItem, Tariff } from '@/types';

type State = 'warn' | 'ok' | 'off';

/** Подписка «кончается», если до конца ≤ 3 дней. */
const SOON_MS = 3 * 864e5;

function stateOf(sub: SubscriptionListItem): State {
  const end = sub.end_date ? new Date(sub.end_date).getTime() : 0;
  const active = sub.status === 'active' || sub.status === 'trial';
  if (!active || (end && end < Date.now())) return 'off';
  if (sub.status === 'limited') return 'warn';
  if (end && end - Date.now() <= SOON_MS) return 'warn';
  return 'ok';
}

const daysLeft = (iso: string | null) =>
  iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5)) : 0;

const dayMonth = (iso: string) =>
  new Date(iso).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'long' });

/**
 * Главная при нескольких подписках — макет «02c · Главная — несколько подписок»:
 * лаймовая сводка с одним главным действием и список подписок (сначала те,
 * что требуют внимания).
 */
export function MultiSubscriptions({
  subscriptions,
  tariffs,
  canBuyMore,
}: {
  subscriptions: SubscriptionListItem[];
  tariffs: Tariff[] | undefined;
  canBuyMore: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { formatAmount, currencySymbol } = useCurrency();

  const devices = useQueries({
    queries: subscriptions.map((sub) => ({
      queryKey: ['devices', sub.id],
      queryFn: () => subscriptionApi.getDevices(sub.id),
      staleTime: 60_000,
    })),
  });
  const devicesOf = (id: number) =>
    devices[subscriptions.findIndex((s) => s.id === id)]?.data?.total ?? 0;

  const monthPrice = (tariffId: number | null) => {
    const tariff = tariffs?.find((x) => x.id === tariffId);
    const p = tariff?.periods.find((x) => x.days === 30) ?? tariff?.periods[0];
    return p
      ? `${formatAmount(p.price_kopeks / 100, p.price_kopeks % 100 ? 2 : 0)} ${currencySymbol}`
      : null;
  };
  const nameOf = (sub: SubscriptionListItem) =>
    sub.tariff_name || t('subscription.defaultName', 'Подписка');

  const order: Record<State, number> = { warn: 0, off: 1, ok: 2 };
  const sorted = [...subscriptions].sort((a, b) => order[stateOf(a)] - order[stateOf(b)]);
  const working = subscriptions.filter((s) => stateOf(s) !== 'off').length;
  const ending = subscriptions.filter((s) => stateOf(s) === 'warn');
  const off = subscriptions.filter((s) => stateOf(s) === 'off');
  const focus = ending[0] ?? off[0];
  const renewPath = (sub: SubscriptionListItem) =>
    sub.requires_tariff_selection
      ? `/subscription/purchase?subscriptionId=${sub.id}`
      : `/subscriptions/${sub.id}/renew`;

  return (
    <>
      {/* Сводка + одно главное действие */}
      <section className="bento-card rv-card-acc rv-topo !rounded-[26px] !px-5 !pb-5 !pt-[22px]">
        <p className="rv-kicker">{t('rv.multi.kicker', { count: subscriptions.length })}</p>
        <h2 className="rv-d mt-3.5 text-[54px]">
          {t('rv.multi.working', { count: working })}
          {focus && (
            <>
              ,{' '}
              <span className="rv-pill rv-pill-ink inline-block">
                {ending.length > 0
                  ? t('rv.multi.ending', { count: ending.length })
                  : t('rv.multi.off', { count: off.length })}
              </span>
            </>
          )}
        </h2>
        {focus && (
          <p className="mt-3.5 text-base font-medium leading-snug">
            {stateOf(focus) === 'warn' && focus.end_date
              ? t('rv.multi.endsOn', { name: nameOf(focus), date: dayMonth(focus.end_date) })
              : t('rv.multi.isOff', { name: nameOf(focus) })}
          </p>
        )}
        {focus ? (
          <Link to={renewPath(focus)} className="btn rv-btn-lg rv-btn-ink mt-3.5 w-full">
            {monthPrice(focus.tariff_id)
              ? t('rv.multi.renewNamedFor', {
                  name: nameOf(focus),
                  price: monthPrice(focus.tariff_id),
                })
              : t('rv.multi.renewNamed', { name: nameOf(focus) })}
          </Link>
        ) : (
          <Link
            to={`/connection?sub=${sorted[0]?.id}`}
            className="btn rv-btn-lg rv-btn-ink mt-3.5 w-full"
          >
            {t('rv.connectDevice')}
          </Link>
        )}
        <p className="mt-3.5 text-center">
          <Link to="/subscriptions" className="link !text-[#111] text-sm !decoration-[#111]">
            {t('rv.multi.manageAll')}
          </Link>
        </p>
      </section>

      {/* Список подписок */}
      <div className="flex items-end justify-between gap-3 px-0.5 pt-2.5">
        <h2 className="rv-d text-[36px] text-dark-100">{t('rv.multi.title')}</h2>
        <span className="pb-1 text-xs text-dark-400">{t('rv.multi.attentionFirst')}</span>
      </div>

      {sorted.map((sub) => {
        const st = stateOf(sub);
        const used = devicesOf(sub.id);
        const unlimitedTraffic = sub.traffic_limit_gb === 0;
        const tp = unlimitedTraffic
          ? 0
          : Math.min(100, (sub.traffic_used_gb / Math.max(1, sub.traffic_limit_gb)) * 100);
        const left = daysLeft(sub.end_date);
        const plan = sub.end_date
          ? st === 'off'
            ? t('rv.multi.endedOn', { date: dayMonth(sub.end_date) })
            : t('rv.multi.until', { date: dayMonth(sub.end_date) })
          : '';
        const price = monthPrice(sub.tariff_id);
        const cta =
          st === 'ok'
            ? { to: `/connection?sub=${sub.id}`, label: t('rv.connectDevice') }
            : {
                to: renewPath(sub),
                label:
                  st === 'off'
                    ? price
                      ? t('rv.multi.restoreFor', { price })
                      : t('rv.multi.restore')
                    : price
                      ? t('rv.multi.renewFor', { price })
                      : t('rv.renew'),
              };
        return (
          <article
            key={sub.id}
            className={cn(
              'flex flex-col gap-3.5 rounded-[22px] border-2 bg-dark-900 px-4 pb-3.5 pt-4',
              st === 'warn' && 'border-[var(--rv-warn)]',
              st === 'ok' && 'border-dark-700',
              st === 'off' && 'border-dashed border-dark-600 !bg-transparent',
            )}
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0">
                <p className="truncate text-lg font-bold leading-tight text-dark-100">
                  {nameOf(sub)}
                </p>
                <p className="mt-1 text-sm text-dark-400">{plan}</p>
              </div>
              <span
                className={cn(
                  'shrink-0',
                  st === 'warn' ? 'badge-warning' : st === 'off' ? 'badge-error' : 'badge-success',
                )}
              >
                <i className="rv-tag-dot" />
                {st === 'warn'
                  ? sub.status === 'limited'
                    ? t('rv.limited')
                    : t('subscription.days', { count: left })
                  : st === 'off'
                    ? t('rv.multi.offTag')
                    : t('rv.subp.active')}
              </span>
            </div>

            <div className={cn('grid grid-cols-2 gap-3.5', st === 'off' && 'opacity-45')}>
              <div>
                <p className="mb-[7px] flex justify-between gap-1.5 text-xs font-bold text-dark-400">
                  <span>{t('rv.traffic')}</span>
                  <b className="text-dark-100">
                    {unlimitedTraffic
                      ? '∞'
                      : `${Math.round(sub.traffic_used_gb)} ${t('rv.of')} ${sub.traffic_limit_gb >= 10 ? `${Math.round(sub.traffic_limit_gb)} ${t('rv.gb')}` : formatTraffic(sub.traffic_limit_gb)}`}
                  </b>
                </p>
                <div className={cn('rv-meter !h-2', st === 'warn' && 'rv-warn')}>
                  <i style={{ width: `${tp}%` }} />
                </div>
              </div>
              <div>
                <p className="mb-[7px] flex justify-between gap-1.5 text-xs font-bold text-dark-400">
                  <span>{t('rv.devices')}</span>
                  <b className="text-dark-100">
                    {sub.device_limit > 0 ? `${used} ${t('rv.of')} ${sub.device_limit}` : used}
                  </b>
                </p>
                {sub.device_limit > 0 && sub.device_limit <= 12 ? (
                  <div className="rv-slots">
                    {Array.from({ length: sub.device_limit }, (_, i) => (
                      <i key={i} className={cn('!h-2', i < used && 'on')} />
                    ))}
                  </div>
                ) : (
                  <div className="rv-meter !h-2">
                    <i
                      style={{
                        width:
                          sub.device_limit > 0
                            ? `${Math.min(100, (used / sub.device_limit) * 100)}%`
                            : '0%',
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link to={cta.to} className="btn btn-secondary flex-1">
                {cta.label}
              </Link>
              <button
                type="button"
                onClick={() => navigate(`/subscriptions/${sub.id}`)}
                className="rv-ibtn"
                aria-label={t('rv.multi.open')}
              >
                <ChevronRightIcon className="h-5 w-5" />
              </button>
            </div>
          </article>
        );
      })}

      {canBuyMore && (
        <Link
          to="/subscription/purchase"
          className="flex min-h-[58px] w-full items-center justify-center gap-2.5 rounded-[18px] border-2 border-dashed border-[var(--rv-bd2)] text-[15px] font-bold text-dark-100"
        >
          <PlusIcon className="h-5 w-5" />
          {t('rv.multi.buyMore')}
        </Link>
      )}
      <p className="px-3 text-center text-xs text-dark-400">{t('rv.multi.note')}</p>
    </>
  );
}
