import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { SalesStatsParams } from '../api/adminSalesStats';
import { salesStatsApi } from '../api/adminSalesStats';
import { SALES_STATS } from '../constants/salesStats';
import { useCurrency } from '../hooks/useCurrency';
import { statsApi, type RecentPaymentItem } from '../api/admin';
import { uiLocale } from '../utils/uiLocale';
import { cn } from '@/lib/utils';
import {
  AddonsTab,
  DepositsTab,
  PaymentHealthTab,
  RenewalsTab,
  SalesTab,
  TrialsTab,
} from '../components/sales-stats';

type TabId = 'trials' | 'sales' | 'renewals' | 'addons' | 'deposits' | 'payment';

type Delta = { percent: number; trend: 'up' | 'down' | 'stable' };

/** Same-length window immediately before the selected one, for period-over-period
 * deltas. Returns null for "all time" — nothing meaningful to compare against. */
function getPreviousPeriodParams(period: {
  days?: number;
  startDate?: string;
  endDate?: string;
}): SalesStatsParams | null {
  if (period.startDate && period.endDate) {
    const start = new Date(period.startDate).getTime();
    const length = new Date(period.endDate).getTime() - start;
    return {
      start_date: new Date(start - length).toISOString(),
      end_date: new Date(start).toISOString(),
    };
  }
  if (period.days !== undefined && period.days > 0) {
    const dayMs = 86_400_000;
    const now = Date.now();
    return {
      start_date: new Date(now - 2 * period.days * dayMs).toISOString(),
      end_date: new Date(now - period.days * dayMs).toISOString(),
    };
  }
  return null;
}

function computeDelta(current: number, previous: number): Delta | null {
  if (previous === 0) return current === 0 ? null : { percent: 100, trend: 'up' };
  const percent = Math.round(((current - previous) / previous) * 1000) / 10;
  return { percent, trend: percent > 0 ? 'up' : percent < 0 ? 'down' : 'stable' };
}

export default function AdminSalesStats() {
  const { t } = useTranslation();
  const { formatAmount, currencySymbol } = useCurrency();
  const money = (kopeks: number) =>
    `${formatAmount(kopeks / SALES_STATS.KOPEKS_DIVISOR, 0)} ${currencySymbol}`;

  const [days, setDays] = useState(30);
  const [activeTab, setActiveTab] = useState<TabId>('sales');
  const [showDetails, setShowDetails] = useState(false);
  const [method, setMethod] = useState<string>('all');

  const params: SalesStatsParams = useMemo(() => ({ days }), [days]);
  const prevParams = useMemo(() => getPreviousPeriodParams({ days }), [days]);
  const q = <T,>(key: string, fn: () => Promise<T>, enabled = true) => ({
    queryKey: ['sales-stats', key, params],
    queryFn: fn,
    staleTime: SALES_STATS.STALE_TIME,
    placeholderData: keepPreviousData,
    enabled,
  });

  const { data: summary, isError: summaryError } = useQuery(
    q('summary', () => salesStatsApi.getSummary(params)),
  );
  const { data: prevSummary } = useQuery({
    queryKey: ['sales-stats', 'summary', prevParams],
    queryFn: () => salesStatsApi.getSummary(prevParams as SalesStatsParams),
    staleTime: SALES_STATS.STALE_TIME,
    enabled: prevParams !== null,
  });
  const { data: sales } = useQuery(q('subscriptions', () => salesStatsApi.getSales(params)));
  const { data: trials } = useQuery(q('trials', () => salesStatsApi.getTrials(params)));
  const { data: renewals } = useQuery(q('renewals', () => salesStatsApi.getRenewals(params)));
  const { data: health } = useQuery(
    q('payment-health', () => salesStatsApi.getPaymentHealth(params)),
  );
  const { data: recent } = useQuery({
    queryKey: ['admin-recent-payments', 50],
    queryFn: () => statsApi.getRecentPayments(50),
    refetchInterval: 60_000,
  });

  const revenueDelta =
    summary && prevSummary
      ? computeDelta(summary.total_revenue_kopeks, prevSummary.total_revenue_kopeks)
      : null;
  const paymentsCount = health?.total_paid ?? sales?.total_sales ?? 0;
  const avgCheck =
    sales?.avg_order_kopeks ??
    (paymentsCount ? Math.round((summary?.total_revenue_kopeks ?? 0) / paymentsCount) : 0);

  // Воронка новичков: регистрация → пробный → оплата → продление.
  const funnel = [
    { label: t('rv.sl.f.registered'), value: trials?.total_registrations ?? 0 },
    { label: t('rv.sl.f.trial'), value: trials?.total_trials ?? 0 },
    { label: t('rv.sl.f.paid'), value: summary?.new_paid_subscriptions ?? 0, acc: true },
    { label: t('rv.sl.f.renewed'), value: renewals?.total_renewals ?? 0, acc: true },
  ];
  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));

  const byTariff = [...(sales?.by_tariff ?? [])].sort((a, b) => b.count - a.count);
  const tariffTotal = Math.max(
    1,
    byTariff.reduce((acc, x) => acc + x.count, 0),
  );
  const shades = [
    'rgb(var(--color-accent-500))',
    '#F2F0E8',
    '#8E8D86',
    '#6B6A64',
    '#4A4945',
    '#36352F',
  ];

  const payments = recent?.payments ?? [];
  const methods = [...new Set(payments.map((p) => p.payment_method).filter(Boolean))] as string[];
  const failed = payments.filter((p) => !p.is_completed);
  const shown = payments.filter((p) =>
    method === 'all' ? true : method === 'failed' ? !p.is_completed : p.payment_method === method,
  );
  const methodLabel = (m?: string | null) =>
    m ? t(`rv.sl.m.${m}`, { defaultValue: m.replace(/_/g, ' ') }) : '—';
  const time = (iso: string) => {
    const d = new Date(iso);
    const today = new Date().toDateString() === d.toDateString();
    return today
      ? d.toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' });
  };

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ['id', 'user', 'type', 'method', 'status', 'created_at', 'amount_rub'],
      ...shown.map((p: RecentPaymentItem) => [
        p.id,
        p.username ? `@${p.username}` : p.display_name,
        p.description || p.type_display,
        p.payment_method || '',
        p.is_completed ? 'paid' : 'pending',
        p.created_at,
        p.amount_rubles,
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'sales', label: t('admin.salesStats.tabs.sales') },
    { id: 'trials', label: t('admin.salesStats.tabs.trials') },
    { id: 'renewals', label: t('admin.salesStats.tabs.renewals') },
    { id: 'addons', label: t('admin.salesStats.tabs.addons') },
    { id: 'deposits', label: t('admin.salesStats.tabs.deposits') },
    { id: 'payment', label: t('admin.salesStats.tabs.payment') },
  ];

  const kpi = 'bento-card flex flex-col !p-5';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-dark-400">{t('rv.sl.crumb')}</p>
          <h1 className="rv-d mt-1 text-[44px] text-dark-100 lg:text-[56px]">{t('rv.sl.title')}</h1>
        </div>
        <div className="flex w-full items-center gap-3 lg:w-auto">
          <div className="rv-seg flex-1 lg:w-[340px] lg:flex-none" role="tablist">
            {[7, 30, 365].map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={days === d}
                className={days === d ? 'on' : undefined}
                onClick={() => setDays(d)}
              >
                {d === 365 ? t('rv.sl.year') : t('rv.pick.days', { count: d })}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={shown.length === 0}
            className="btn btn-secondary !min-h-12 shrink-0"
          >
            {t('rv.sl.export')}
          </button>
        </div>
      </div>

      {summaryError && (
        <div className="rounded-xl bg-[var(--rv-bad-bg)] px-4 py-3 text-sm text-[var(--rv-bad)]">
          {t('admin.salesStats.loadError')}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <div className={cn(kpi, 'rv-card-acc')}>
          <span className="text-[13px] font-medium">{t('rv.sl.revenue')}</span>
          <span className="rv-num mt-3 text-[36px] lg:text-[44px]">
            {money(summary?.total_revenue_kopeks ?? 0)}
          </span>
          {revenueDelta && (
            <span className="mt-2 text-xs font-bold">
              {revenueDelta.percent > 0 ? '+' : ''}
              {revenueDelta.percent}% {t('rv.sl.vsPrev')}
            </span>
          )}
        </div>
        <div className={kpi}>
          <span className="text-[13px] font-medium text-dark-300">{t('rv.sl.payments')}</span>
          <span className="rv-num mt-3 text-[36px] text-dark-100 lg:text-[44px]">
            {paymentsCount.toLocaleString('ru-RU')}
          </span>
          {health && (
            <span className="mt-2 text-xs font-bold text-accent-400">
              {t('rv.sl.success', { percent: Math.round(health.success_rate) })}
            </span>
          )}
        </div>
        <div className={kpi}>
          <span className="text-[13px] font-medium text-dark-300">{t('rv.sl.avg')}</span>
          <span className="rv-num mt-3 text-[36px] text-dark-100 lg:text-[44px]">
            {money(avgCheck)}
          </span>
        </div>
        <div className={kpi}>
          <span className="text-[13px] font-medium text-dark-300">{t('rv.sl.renewedSelf')}</span>
          <span className="rv-num mt-3 text-[36px] text-dark-100 lg:text-[44px]">
            {Math.round(renewals?.renewal_rate ?? 0)}%
          </span>
          <span className="mt-2 text-xs font-bold text-dark-400">
            {t('rv.sl.renewals', { count: renewals?.total_renewals ?? 0 })}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] lg:gap-5">
        <section className="bento-card !p-5 lg:!p-6">
          <h2 className="rv-d text-[32px] text-dark-100">{t('rv.sl.funnel')}</h2>
          <div className="mt-4 flex flex-col gap-3">
            {funnel.map((f) => (
              <div
                key={f.label}
                className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3 lg:grid-cols-[150px_minmax(0,1fr)]"
              >
                <span className="text-sm font-bold text-dark-100">{f.label}</span>
                <span
                  className={cn(
                    'flex h-10 min-w-[64px] items-center rounded-[10px] px-3 font-display text-xl',
                    f.acc ? 'bg-accent-500 text-[#111]' : 'bg-dark-700 text-dark-100',
                  )}
                  style={{ width: `${Math.max(14, (f.value / funnelMax) * 100)}%` }}
                >
                  {f.value.toLocaleString('ru-RU')}
                </span>
              </div>
            ))}
          </div>
          {trials && trials.total_registrations > 0 && (
            <p className="mt-4 text-sm text-dark-300">
              {t('rv.sl.funnelNote', {
                trial: Math.round((trials.total_trials / trials.total_registrations) * 100),
                paid: Math.round(summary?.trial_to_paid_conversion ?? trials.conversion_rate ?? 0),
              })}
            </p>
          )}
        </section>

        <section className="bento-card !p-5 lg:!p-6">
          <h2 className="rv-d text-[32px] text-dark-100">{t('rv.sl.byTariff')}</h2>
          {byTariff.length > 0 ? (
            <>
              <div className="mt-4 flex h-3.5 gap-1 overflow-hidden rounded-full">
                {byTariff.map((x, i) => (
                  <i
                    key={x.tariff_id}
                    style={{
                      width: `${(x.count / tariffTotal) * 100}%`,
                      background: shades[Math.min(i, shades.length - 1)],
                    }}
                  />
                ))}
              </div>
              <ul className="mt-4 flex flex-col gap-2.5">
                {byTariff.slice(0, 6).map((x, i) => (
                  <li key={x.tariff_id} className="flex items-center gap-2.5 text-sm">
                    <i
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: shades[Math.min(i, shades.length - 1)] }}
                    />
                    <span className="min-w-0 flex-1 truncate text-dark-200">{x.tariff_name}</span>
                    <b className="text-dark-100">{t('rv.sl.pcs', { count: x.count })}</b>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-4 text-sm text-dark-400">{t('rv.sl.noSales')}</p>
          )}
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="rv-d text-[36px] text-dark-100">{t('rv.sl.paymentsTitle')}</h2>
          <div className="scrollbar-hide -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:px-0">
            {['all', ...methods].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold',
                  method === m ? 'bg-accent-500 text-[#111]' : 'bg-[var(--rv-s3)] text-dark-100',
                )}
              >
                {m === 'all' ? t('rv.sl.all') : methodLabel(m)}
              </button>
            ))}
            {failed.length > 0 && (
              <button
                type="button"
                onClick={() => setMethod('failed')}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold',
                  method === 'failed'
                    ? 'bg-[var(--rv-bad)] text-[#111]'
                    : 'bg-[var(--rv-bad-bg)] text-[var(--rv-bad)]',
                )}
              >
                <i className="rv-tag-dot" />
                {t('rv.sl.failed', { count: failed.length })}
              </button>
            )}
          </div>
        </div>

        {/* Компьютер: таблица */}
        <div className="rv-tbox hidden lg:block">
          <table className="rv-tbl w-full">
            <thead>
              <tr>
                <th>№</th>
                <th>{t('rv.sl.col.user')}</th>
                <th>{t('rv.sl.col.what')}</th>
                <th>{t('rv.sl.col.method')}</th>
                <th>{t('rv.sl.col.status')}</th>
                <th>{t('rv.sl.col.when')}</th>
                <th className="text-right">{t('rv.sl.col.sum')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id}>
                  <td className="text-dark-400">{p.id}</td>
                  <td className="font-bold text-dark-100">
                    {p.username ? `@${p.username}` : p.display_name}
                  </td>
                  <td className="text-dark-200">{p.description || p.type_display}</td>
                  <td className="text-dark-200">{methodLabel(p.payment_method)}</td>
                  <td>
                    <span className={p.is_completed ? 'badge-success' : 'badge-warning'}>
                      <i className="rv-tag-dot" />
                      {p.is_completed ? t('rv.sl.paid') : t('rv.sl.waiting')}
                    </span>
                  </td>
                  <td className="text-dark-400">{time(p.created_at)}</td>
                  <td className="text-right font-bold text-dark-100">{money(p.amount_kopeks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-dark-400">{t('rv.sl.noPayments')}</p>
          )}
        </div>

        {/* Телефон: карточки */}
        <div className="flex flex-col gap-2.5 lg:hidden">
          {shown.map((p) => (
            <div key={p.id} className="bento-card flex items-center gap-3 !p-4">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-dark-100">
                  {p.username ? `@${p.username}` : p.display_name}
                </span>
                <span className="block truncate text-xs text-dark-400">
                  {p.description || p.type_display} · {methodLabel(p.payment_method)} ·{' '}
                  {time(p.created_at)}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <b className="text-[15px] text-dark-100">{money(p.amount_kopeks)}</b>
                {!p.is_completed && (
                  <span className="badge-warning !py-0.5">{t('rv.sl.waiting')}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="link self-start text-sm"
      >
        {showDetails ? t('rv.sl.hideDetails') : t('rv.sl.details')}
      </button>
      {showDetails && (
        <>
          <div className="rv-seg scrollbar-hide overflow-x-auto" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={cn('shrink-0 whitespace-nowrap', activeTab === tab.id && 'on')}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div role="tabpanel">
            {activeTab === 'trials' && <TrialsTab params={params} />}
            {activeTab === 'sales' && <SalesTab params={params} />}
            {activeTab === 'renewals' && <RenewalsTab params={params} />}
            {activeTab === 'addons' && <AddonsTab params={params} />}
            {activeTab === 'deposits' && <DepositsTab params={params} />}
            {activeTab === 'payment' && <PaymentHealthTab params={params} />}
          </div>
        </>
      )}
    </div>
  );
}
