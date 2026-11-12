import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { statsApi } from '../api/admin';
import { StatCard } from '@/components/stats';
import { RvAdminOverview } from '@/components/admin/RvAdminOverview';
import { PageSkeleton, Skeleton } from '@/components/ui/skeleton';

export default function AdminDashboard() {
  const { t } = useTranslation();

  // Data fetching via React Query: caching, dedupe, and auto-refetch every 30s
  // (replaces the manual setInterval + useState + console.error pattern).
  const statsQuery = useQuery({
    queryKey: ['admin-dashboard-stats'] as const,
    queryFn: () => statsApi.getDashboardStats(),
    refetchInterval: 30_000,
  });
  const stats = statsQuery.data ?? null;
  const loading = statsQuery.isLoading;
  const error = statsQuery.isError ? t('adminDashboard.loadError') : null;

  const extendedQuery = useQuery({
    queryKey: ['admin-dashboard-extended'] as const,
    queryFn: async () => {
      const [topCampaigns, recentPayments, sysInfo] = await Promise.all([
        statsApi.getTopCampaigns(10),
        statsApi.getRecentPayments(20),
        statsApi.getSystemInfo(),
      ]);
      return { topCampaigns, recentPayments, sysInfo };
    },
    refetchInterval: 30_000,
  });
  const campaigns = extendedQuery.data?.topCampaigns ?? null;
  const payments = extendedQuery.data?.recentPayments ?? null;
  const systemInfo = extendedQuery.data?.sysInfo ?? null;

  if (loading && !stats) {
    return (
      <PageSkeleton variant="admin" leading={1} titleWidth="w-56" className="space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard loading />
          <StatCard loading />
          <StatCard loading />
          <StatCard loading />
        </div>
        <Skeleton variant="card" count={2} className="h-40" />
      </PageSkeleton>
    );
  }

  if (error && !stats) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <div className="text-error-400">{error}</div>
        <button onClick={() => statsQuery.refetch()} className="btn-primary">
          {t('common.loading')}
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-5">
      {stats && (
        <RvAdminOverview
          stats={stats}
          payments={payments}
          campaigns={campaigns}
          systemInfo={systemInfo}
          onRefresh={() => {
            statsQuery.refetch();
            extendedQuery.refetch();
          }}
          refreshing={statsQuery.isFetching}
        />
      )}
    </div>
  );
}
