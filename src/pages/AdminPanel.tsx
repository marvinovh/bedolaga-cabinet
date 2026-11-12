import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { usePermissionStore } from '@/store/permissions';
import { statsApi, type SystemInfo, type DashboardStats } from '@/api/admin';
import { useAnimatedNumber } from '@/hooks/useAnimatedNumber';
import { useTelegramSDK } from '@/hooks/useTelegramSDK';
import { cn } from '@/lib/utils';
import {
  StatBotIcon,
  StatCabinetIcon,
  StatPaidIcon,
  StatTrialIcon,
  StatUptimeIcon,
} from '@/components/icons';

const CABINET_VERSION = __APP_VERSION__;
const IS_MAC = /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);

import { icons, sections, type AdminSection } from '@/components/admin/adminNav';

// ─── Helpers ───

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ─── Animated Stat Number ───

function AnimatedStat({ value, suffix }: { value: number; suffix?: string }) {
  const animated = useAnimatedNumber(value);
  return (
    <span>
      {Math.round(animated).toLocaleString()}
      {suffix}
    </span>
  );
}

// ─── Stats Bar ───

interface StatsBarProps {
  systemInfo: SystemInfo | null;
  dashboardStats: DashboardStats | null;
  loading: boolean;
}

const StatsBar = memo(function StatsBar({ systemInfo, dashboardStats, loading }: StatsBarProps) {
  const { t } = useTranslation();

  const stats = useMemo(() => {
    const uptime = systemInfo?.uptime_seconds ?? 0;
    const trial = dashboardStats?.subscriptions.trial ?? 0;
    const paid = dashboardStats?.subscriptions.paid ?? 0;
    const purchasedToday = dashboardStats?.subscriptions.purchased_today ?? 0;

    return [
      {
        icon: <StatUptimeIcon />,
        label: t('admin.panel.statsUptime'),
        value: uptime > 0 ? formatUptime(uptime) : '--',
        colorClass: 'text-success-400 bg-success-400/10 border-success-400/20',
      },
      {
        icon: <StatBotIcon className="h-3.5 w-3.5" />,
        label: t('admin.panel.statsBot'),
        value: systemInfo?.bot_version ?? '--',
        colorClass: 'text-accent-400 bg-accent-400/10 border-accent-400/20',
      },
      {
        icon: <StatCabinetIcon className="h-3.5 w-3.5" />,
        label: t('admin.panel.statsCabinet'),
        value: `v${CABINET_VERSION}`,
        colorClass: 'text-accent-300 bg-accent-300/10 border-accent-300/20',
      },
      {
        icon: <StatTrialIcon className="h-3.5 w-3.5" />,
        label: t('admin.panel.statsTrials'),
        numericValue: trial,
        colorClass: 'text-warning-400 bg-warning-400/10 border-warning-400/20',
      },
      {
        icon: <StatPaidIcon className="h-3.5 w-3.5" />,
        label: t('admin.panel.statsPaid'),
        numericValue: paid,
        delta: purchasedToday > 0 ? `+${purchasedToday}` : undefined,
        colorClass: 'text-success-400 bg-success-400/10 border-success-400/20',
      },
    ];
  }, [systemInfo, dashboardStats, t]);

  return (
    <div className="scrollbar-hide flex w-full gap-2 overflow-x-auto pb-1">
      {stats.map((s, i) => (
        <div
          key={i}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-dark-700/50 bg-dark-800/40 px-3 py-2 transition-all duration-200',
            'light:border-champagne-300/50 light:bg-champagne-100/60',
            loading && 'animate-pulse',
          )}
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border',
              s.colorClass,
            )}
          >
            {s.icon}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 overflow-hidden">
            <span className="flex items-center gap-1 font-mono text-xs font-bold text-dark-100 light:text-champagne-900">
              {'numericValue' in s && s.numericValue !== undefined ? (
                <AnimatedStat value={s.numericValue} />
              ) : (
                <span className="truncate">{s.value}</span>
              )}
              {s.delta && (
                <span className="shrink-0 rounded-md border border-success-400/20 bg-success-400/10 px-1.5 py-px text-2xs font-semibold text-success-400">
                  {s.delta}
                </span>
              )}
            </span>
            <span className="truncate text-2xs text-dark-500 light:text-champagne-600">
              {s.label}
              {s.delta && ` · ${t('admin.panel.statsToday')}`}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
});

// ─── Glass Card (Section) ───

interface GlassCardProps {
  section: AdminSection;
  index: number;
  searchTerm: string;
}

const GlassCard = memo(function GlassCard({ section, index, searchTerm }: GlassCardProps) {
  const { t } = useTranslation();
  const hasPermission = usePermissionStore((state) => state.hasPermission);
  const [hoveredItem, setHoveredItem] = useState<number | null>(null);
  // 3D mouse-tracking tilt removed: decorative motion that didn't convey state.
  // Hover styling alone signals interactivity.
  void index;

  const visibleItems = useMemo(
    () =>
      section.items.filter((item) => {
        if (!hasPermission(item.permission)) return false;
        if (!searchTerm) return true;
        return t(item.name).toLowerCase().includes(searchTerm.toLowerCase());
      }),
    [section.items, hasPermission, searchTerm, t],
  );

  const highlightMatch = useCallback(
    (text: string) => {
      if (!searchTerm) return text;
      const idx = text.toLowerCase().indexOf(searchTerm.toLowerCase());
      if (idx === -1) return text;
      return (
        <>
          {text.slice(0, idx)}
          <mark className="rounded-sm bg-accent-400/30 px-0.5 text-dark-100 light:text-champagne-900">
            {text.slice(idx, idx + searchTerm.length)}
          </mark>
          {text.slice(idx + searchTerm.length)}
        </>
      );
    },
    [searchTerm],
  );

  if (visibleItems.length === 0) return null;

  return (
    <div className="bento-card group/card !p-0">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b-2 border-dark-700 px-4 py-3">
        <h2 className="rv-d flex-1 truncate text-[24px] text-dark-100">{t(section.titleKey)}</h2>
        <span className="text-xs font-bold text-dark-400" aria-hidden="true">
          {visibleItems.length}
        </span>
      </div>

      {/* Items */}
      <div className="flex flex-col gap-px p-1.5">
        {visibleItems.map((item, i) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              'group/item flex min-h-[44px] items-center gap-3 rounded-xl px-2.5 py-2 transition-colors duration-150',
              hoveredItem === i ? 'bg-dark-800' : 'hover:bg-dark-800',
            )}
            onMouseEnter={() => setHoveredItem(i)}
            onMouseLeave={() => setHoveredItem(null)}
          >
            {/* Icon */}
            <div className="rv-ic !h-8 !w-8 !rounded-[9px] [&>svg]:!h-4 [&>svg]:!w-4">
              {icons[item.icon]}
            </div>

            {/* Label */}
            <span className="flex-1 truncate text-[15px] font-medium text-dark-100">
              {highlightMatch(t(item.name))}
            </span>

            {/* Chevron */}
            <div className="h-3 w-3 shrink-0 -translate-x-1 text-dark-600 opacity-0 transition-all duration-150 group-hover/item:translate-x-0 group-hover/item:opacity-60 [&>svg]:h-3 [&>svg]:w-3">
              {icons.chevron}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
});

// ─── Main Component ───

export default function AdminPanel() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { safeAreaInset, contentSafeAreaInset } = useTelegramSDK();

  const safeTop = Math.max(safeAreaInset.top, contentSafeAreaInset.top);
  const safeBottom = Math.max(safeAreaInset.bottom, contentSafeAreaInset.bottom);

  // System info + dashboard stats — polled every 60s via React Query
  // (replaces the manual setInterval + useState + cancelled-flag pattern).
  const systemInfoQuery = useQuery<SystemInfo>({
    queryKey: ['admin-panel-system-info'] as const,
    queryFn: () => statsApi.getSystemInfo(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
  const dashboardStatsQuery = useQuery<DashboardStats>({
    queryKey: ['admin-panel-dashboard-stats'] as const,
    queryFn: () => statsApi.getDashboardStats(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });

  const systemInfo = systemInfoQuery.data ?? null;
  const dashboardStats = dashboardStatsQuery.data ?? null;
  // "loading" only counts the very first fetch — once we have any data, render it.
  const loading = systemInfoQuery.isLoading || dashboardStatsQuery.isLoading;

  // Keyboard shortcuts: Cmd+K to focus search, Escape to clear
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setSearch('');
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Track which sections have matching items (keeps original section refs for memo stability)
  const visibleSectionIds = useMemo(() => {
    if (!search.trim()) return null; // null = show all
    const lower = search.toLowerCase();
    return new Set(
      sections
        .filter((s) => s.items.some((item) => t(item.name).toLowerCase().includes(lower)))
        .map((s) => s.id),
    );
  }, [search, t]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        className="relative z-10 mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-3 overflow-hidden lg:gap-5"
        style={{
          paddingTop: safeTop > 0 ? `${safeTop}px` : 'env(safe-area-inset-top, 0px)',
          paddingBottom: safeBottom > 0 ? `${safeBottom}px` : 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Stats Bar */}
        <div className="hidden shrink-0 sm:flex">
          <StatsBar systemInfo={systemInfo} dashboardStats={dashboardStats} loading={loading} />
        </div>

        {/* Mobile: compact 2-column stats */}
        <div className="grid shrink-0 grid-cols-2 gap-1.5 sm:hidden">
          {[
            {
              icon: <StatUptimeIcon />,
              label: t('admin.panel.statsUptime'),
              value: systemInfo?.uptime_seconds ? formatUptime(systemInfo.uptime_seconds) : '--',
              cls: 'text-success-400',
            },
            {
              icon: <StatBotIcon className="h-3.5 w-3.5" />,
              label: t('admin.panel.statsBot'),
              value: systemInfo?.bot_version ?? '--',
              cls: 'text-accent-400',
            },
            {
              icon: <StatTrialIcon className="h-3.5 w-3.5" />,
              label: t('admin.panel.statsTrials'),
              value: dashboardStats?.subscriptions.trial?.toLocaleString() ?? '--',
              cls: 'text-warning-400',
            },
            {
              icon: <StatPaidIcon className="h-3.5 w-3.5" />,
              label: t('admin.panel.statsPaid'),
              value: dashboardStats?.subscriptions.paid?.toLocaleString() ?? '--',
              delta:
                (dashboardStats?.subscriptions.purchased_today ?? 0) > 0
                  ? `+${dashboardStats?.subscriptions.purchased_today}`
                  : undefined,
              cls: 'text-success-400',
            },
          ].map((s, i) => (
            <div
              key={i}
              className={cn(
                'flex items-center gap-2 rounded-xl border border-dark-700/50 bg-dark-800/40 px-2.5 py-2',
                'light:border-champagne-300/50 light:bg-champagne-100/60',
                loading && 'animate-pulse',
              )}
            >
              <div className={cn('shrink-0', s.cls)}>{s.icon}</div>
              <div className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1 font-mono text-[11px] font-bold text-dark-100 light:text-champagne-900">
                  <span className="truncate">{s.value}</span>
                  {'delta' in s && s.delta && (
                    <span className="shrink-0 rounded border border-success-400/20 bg-success-400/10 px-1 text-2xs font-semibold text-success-400">
                      {s.delta}
                    </span>
                  )}
                </span>
                <span className="truncate text-2xs text-dark-500 light:text-champagne-600">
                  {s.label}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Hero + Search */}
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <h1 className="rv-title !text-[40px] lg:!text-[56px]">{t('admin.panel.title')}</h1>
          <div className="flex items-center gap-1.5 text-xs text-dark-400 light:text-champagne-500">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-success-400"
              style={{ animation: 'adminPulse 2s ease-in-out infinite' }}
            />
            {t('admin.panel.statsOnline')}
          </div>
          {/* Search */}
          <div className="relative ml-auto min-w-[160px] max-w-[360px] flex-1">
            <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500 [&>svg]:h-3.5 [&>svg]:w-3.5">
              {icons.search}
            </div>
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('admin.panel.searchPlaceholder')}
              aria-label={t('admin.panel.searchPlaceholder')}
              className="input !min-h-11 !py-2 !pl-8 !pr-16 !text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label={t('admin.panel.searchClear')}
                className="absolute right-12 top-1/2 -translate-y-1/2 text-dark-500 transition-colors hover:text-dark-300 [&>svg]:h-3.5 [&>svg]:w-3.5"
              >
                {icons.x}
              </button>
            )}
            <kbd
              aria-hidden="true"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-dark-700/50 bg-dark-800/60 px-1.5 py-0.5 font-mono text-2xs text-dark-500"
            >
              {IS_MAC ? '\u2318' : 'Ctrl+'}K
            </kbd>
          </div>
        </div>

        {/* Grid */}
        <div className="scrollbar-hide min-h-0 flex-1 overflow-auto pb-4">
          {visibleSectionIds === null || visibleSectionIds.size > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 lg:gap-5">
              {sections
                .filter((s) => !visibleSectionIds || visibleSectionIds.has(s.id))
                .map((section, i) => (
                  <GlassCard key={section.id} section={section} index={i} searchTerm={search} />
                ))}
            </div>
          ) : (
            <div
              className="flex flex-col items-center justify-center py-16"
              role="status"
              aria-live="polite"
            >
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-dark-700/50 bg-dark-800/40 text-dark-500 [&>svg]:h-6 [&>svg]:w-6">
                {icons.search}
              </div>
              <h3 className="text-sm font-semibold text-dark-200 light:text-champagne-800">
                {t('admin.panel.searchEmpty')}
              </h3>
              <p className="text-xs text-dark-500 light:text-champagne-600">
                {t('admin.panel.searchEmptyHint')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
