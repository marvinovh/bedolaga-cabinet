import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { uiLocale } from '@/utils/uiLocale';
import { getFlagEmoji } from '@/utils/subscriptionHelpers';
import { RefreshIcon } from '@/components/icons';
import type {
  DashboardStats,
  RecentPaymentsResponse,
  SystemInfo,
  TopCampaignsResponse,
} from '@/api/admin';

type Period = 1 | 7 | 'month';

const CABINET_VERSION = __APP_VERSION__;

function relTime(iso: string, t: (k: string, o?: Record<string, unknown>) => string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return t('rv.adm.minAgo', { count: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('rv.adm.hAgo', { count: h });
  return new Date(iso).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' });
}

/**
 * Админка → «Статистика» (макет «A1 · Статистика»): KPI, выручка по дням,
 * ноды, последние платежи, топ кампаний.
 */
export function RvAdminOverview({
  stats,
  payments,
  campaigns,
  systemInfo,
  onRefresh,
  refreshing,
}: {
  stats: DashboardStats;
  payments: RecentPaymentsResponse | null;
  campaigns: TopCampaignsResponse | null;
  systemInfo: SystemInfo | null;
  onRefresh: () => void;
  refreshing?: boolean;
}) {
  const { t } = useTranslation();
  const { formatAmount, currencySymbol } = useCurrency();
  const [period, setPeriod] = useState<Period>(1);
  const [hover, setHover] = useState<number | null>(null);

  const chart = stats.revenue_chart ?? [];
  // «Этот месяц» — дни с 1-го числа; сравнение — с тем же числом дней до них.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const span =
    period === 'month'
      ? Math.max(1, chart.filter((r) => new Date(r.date) >= monthStart).length)
      : period;
  const cur = chart.slice(-span);
  const prev = chart.slice(-span * 2, -span);
  const sum = (rows: typeof chart) => rows.reduce((a, r) => a + r.amount_rubles, 0);
  const revenue =
    period === 1
      ? stats.financial.income_today_rubles
      : period === 'month'
        ? stats.financial.income_month_rubles
        : sum(cur);
  const prevRevenue = sum(prev);
  const revDelta =
    prevRevenue > 0 ? Math.round(((sum(cur) - prevRevenue) / prevRevenue) * 100) : null;
  const newSubs =
    period === 1
      ? stats.subscriptions.purchased_today
      : period === 7
        ? stats.subscriptions.purchased_week
        : stats.subscriptions.purchased_month;
  const rub = (v: number) => `${formatAmount(v, 0)} ${currencySymbol}`;

  const bars = chart.slice(-Math.max(14, span * 2));
  const maxBar = Math.max(1, ...bars.map((b) => b.amount_rubles));
  const nodes = [...(stats.nodes.nodes ?? [])].sort(
    (a, b) => Number(a.is_connected) - Number(b.is_connected),
  );
  const maxOnline = Math.max(1, ...nodes.map((n) => n.users_online));
  const topCampaigns = (campaigns?.campaigns ?? []).slice(0, 3);
  const maxReg = Math.max(1, ...topCampaigns.map((c) => c.registrations));
  const uptime = systemInfo ? Math.floor(systemInfo.uptime_seconds / 86400) : null;

  const kpis = [
    {
      k: t('rv.adm.revenue', { period: t(`rv.adm.p${period}`) }),
      n: rub(revenue),
      d: revDelta !== null ? `${revDelta >= 0 ? '+' : ''}${revDelta}% ${t('rv.adm.vsPrev')}` : '',
      up: (revDelta ?? 0) >= 0,
      acc: true,
    },
    {
      k: t('rv.adm.activeSubs'),
      n: stats.subscriptions.active.toLocaleString(uiLocale()),
      d: `+${stats.subscriptions.purchased_week} ${t('rv.adm.perWeek')}`,
      up: true,
    },
    {
      k: t('rv.adm.online'),
      n: stats.nodes.total_users_online.toLocaleString(uiLocale()),
      d: t('rv.adm.onNodes', { count: stats.nodes.online }),
      neutral: true,
    },
    {
      k: t('rv.adm.newFor', { period: t(`rv.adm.p${period}`) }),
      n: newSubs.toLocaleString(uiLocale()),
      d: '',
      up: true,
    },
    {
      k: t('rv.adm.trialToPaid'),
      n: `${Math.round(stats.subscriptions.trial_to_paid_conversion)}%`,
      d: '',
      up: true,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[13px] font-medium text-dark-400">{t('rv.adm.overview')}</p>
          <h1 className="rv-title !text-[44px] lg:!text-[56px]">{t('rv.adm.stats')}</h1>
        </div>
        <div className="flex w-full items-center gap-2.5 sm:w-auto">
          <div
            className="rv-seg min-w-0 flex-1 sm:min-w-[340px] [&>*]:whitespace-nowrap [&>*]:!px-3"
            role="tablist"
          >
            {([1, 7, 'month'] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={p === period}
                className={p === period ? 'on' : undefined}
                onClick={() => setPeriod(p)}
              >
                {t(`rv.adm.seg${p}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="rv-ibtn !h-[52px] !w-[52px]"
            aria-label={t('adminDashboard.refresh')}
          >
            <RefreshIcon className={cn('h-5 w-5', refreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((x, i) => (
          <div
            key={i}
            className={cn('rv-kpi', x.acc && 'acc', i === 0 && 'col-span-2 md:col-span-1')}
          >
            <p className="k">{x.k}</p>
            <p className="n">{x.n}</p>
            {x.d && (
              <p
                className={cn(
                  'mt-2 text-xs font-bold',
                  x.acc
                    ? 'text-[#111]'
                    : x.neutral
                      ? 'text-dark-400'
                      : x.up
                        ? 'text-accent-400'
                        : 'text-[var(--rv-bad)]',
                )}
              >
                {x.d}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <section className="bento-card !p-5 lg:!p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="rv-d text-[32px] text-dark-100">{t('rv.adm.revenueByDay')}</h2>
              <div className="flex items-center gap-4 text-[13px] text-dark-300">
                <span className="flex items-center gap-1.5">
                  <i className="rv-dot" />
                  {t('rv.adm.thisPeriod')}
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-full bg-dark-700" />
                  {t('rv.adm.prevPeriod')}
                </span>
              </div>
            </div>
            <div
              className="mt-3 flex h-[230px] items-end gap-[5px] pt-12"
              onMouseLeave={() => setHover(null)}
            >
              {bars.map((b, i) => (
                <i
                  key={b.date}
                  onMouseEnter={() => setHover(i)}
                  onClick={() => setHover(i)}
                  className={cn(
                    'relative flex-1 cursor-pointer rounded-t-[5px] transition-opacity',
                    i >= bars.length - Math.min(span, bars.length)
                      ? 'bg-accent-500'
                      : 'bg-dark-700',
                    hover !== null && hover !== i && 'opacity-60',
                  )}
                  style={{ height: `${Math.max(3, (b.amount_rubles / maxBar) * 100)}%` }}
                >
                  {hover === i && (
                    <span
                      className={cn(
                        'pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-xl border-2 border-dark-600 bg-dark-950 px-3 py-2 text-left not-italic shadow-[4px_4px_0_rgba(0,0,0,.5)]',
                        i < 3
                          ? 'left-0'
                          : i > bars.length - 4
                            ? 'right-0'
                            : 'left-1/2 -translate-x-1/2',
                      )}
                    >
                      <span className="block text-xs text-dark-400">
                        {new Date(b.date).toLocaleDateString(uiLocale(), {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'long',
                        })}
                      </span>
                      <span className="rv-num block text-[24px] text-dark-100">
                        {rub(b.amount_rubles)}
                      </span>
                    </span>
                  )}
                </i>
              ))}
            </div>
            {bars.length > 0 && (
              <div className="mt-3 flex justify-between text-xs text-dark-400">
                {[bars[0], bars[Math.floor(bars.length / 2)], bars[bars.length - 1]].map((b, i) => (
                  <span key={i}>
                    {new Date(b.date).toLocaleDateString(uiLocale(), {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                ))}
              </div>
            )}
          </section>

          {payments && payments.payments.length > 0 && (
            <section>
              <div className="mb-3 flex items-end justify-between gap-3">
                <h2 className="rv-d text-[40px] text-dark-100">{t('rv.adm.lastPayments')}</h2>
                <Link to="/admin/payments" className="link pb-1.5 text-sm">
                  {t('rv.adm.allPayments')}
                </Link>
              </div>
              <div className="rv-tbox">
                <table className="rv-tbl min-w-[640px]">
                  <thead>
                    <tr>
                      <th>{t('rv.adm.user')}</th>
                      <th>{t('rv.adm.what')}</th>
                      <th>{t('rv.adm.method')}</th>
                      <th>{t('rv.adm.when')}</th>
                      <th className="!text-right">{t('rv.ops.sum')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.payments.slice(0, 6).map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Link
                            to={`/admin/users/${p.user_id}`}
                            className="flex items-center gap-2.5 font-bold text-dark-100"
                          >
                            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-dark-700 text-[13px]">
                              {(p.display_name || '?').charAt(0).toUpperCase()}
                            </span>
                            <span className="truncate">
                              {p.username ? `@${p.username}` : p.display_name}
                            </span>
                          </Link>
                        </td>
                        <td className="text-dark-200">{p.description || p.type_display}</td>
                        <td className="text-dark-200">{p.payment_method || '—'}</td>
                        <td className="whitespace-nowrap text-dark-400">
                          {relTime(p.created_at, t)}
                        </td>
                        <td className="whitespace-nowrap text-right font-bold text-dark-100">
                          {rub(p.amount_rubles)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          <section className="bento-card !p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="rv-d text-[30px] text-dark-100">{t('rv.adm.nodes')}</h2>
              <Link to="/admin/remnawave" className="link text-sm">
                {t('rv.adm.allN', { count: stats.nodes.total })}
              </Link>
            </div>
            <div className="mt-2">
              {nodes.slice(0, 5).map((n) => (
                <div
                  key={n.uuid}
                  className="flex items-center gap-3 border-b border-dark-700 py-3 last:border-0"
                >
                  <span className="text-xl leading-none">
                    {n.country_code ? getFlagEmoji(n.country_code) : '🌐'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-dark-100">{n.name}</p>
                    <p
                      className={cn(
                        'text-xs',
                        n.is_connected ? 'text-dark-400' : 'text-[var(--rv-bad)]',
                      )}
                    >
                      {n.is_connected
                        ? t('rv.adm.onlineN', { count: n.users_online })
                        : t('rv.adm.notResponding')}
                    </p>
                  </div>
                  {n.is_connected && !n.is_disabled ? (
                    <div className="rv-meter !h-1.5 w-[90px] shrink-0">
                      <i style={{ width: `${(n.users_online / maxOnline) * 100}%` }} />
                    </div>
                  ) : (
                    <span className="badge-error shrink-0">
                      <i className="rv-tag-dot" />
                      offline
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="bento-card !p-5">
            <h2 className="rv-d text-[30px] text-dark-100">{t('rv.adm.topCampaigns')}</h2>
            <div className="mt-3 space-y-3">
              {topCampaigns.length === 0 && <p className="text-sm text-dark-400">—</p>}
              {topCampaigns.map((c) => (
                <div key={c.id}>
                  <div className="flex justify-between gap-3 text-sm">
                    <b className="truncate text-dark-100">{c.name}</b>
                    <span className="shrink-0 text-dark-300">
                      {t('rv.adm.regs', { count: c.registrations })}
                    </span>
                  </div>
                  <div className="rv-meter mt-1.5 !h-1.5">
                    <i style={{ width: `${(c.registrations / maxReg) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-dark-400">{t('rv.adm.uptime')}</p>
                <b className="text-sm text-dark-100">
                  {uptime !== null ? t('rv.adm.days', { count: uptime }) : '—'}
                </b>
              </div>
              <div>
                <p className="text-dark-400">{t('rv.adm.bot')}</p>
                <b className="text-sm text-dark-100">
                  {systemInfo ? `v${systemInfo.bot_version}` : '—'}
                </b>
              </div>
              <div>
                <p className="text-dark-400">{t('rv.adm.cabinet')}</p>
                <b className="text-sm text-dark-100">v{CABINET_VERSION}</b>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
