import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { UserListItem } from '@/api/adminUsers';
import { backTo } from '@/components/admin/AdminBackButton';
import { cn } from '@/lib/utils';
import { useNow } from '@/hooks/useNow';
import { formatShortDate } from '@/utils/format';
import { ONLINE_TICK_MS, isUserOnline } from './online';
import { RelativeTime } from './RelativeTime';
import { TrafficBar } from './TrafficBar';
import { UserAvatar } from './UserAvatar';
import { UserStatusChip } from './UserStatusChip';
import { useMoney } from './useMoney';

interface UsersTableProps {
  users: UserListItem[];
  className?: string;
}

// Колонки как в макете A2: пользователь · статус · тариф · до · трафик · баланс · был.
const GRID =
  'grid grid-cols-[minmax(0,1.5fr)_130px_minmax(0,1fr)_80px_minmax(0,1fr)_90px_110px] items-center gap-4 px-4';

/** Сколько тарифов у человека сверх показанного в строке: `0` — показывать нечего. */
export function extraTariffsCount(user: Pick<UserListItem, 'subscriptions'>): number {
  return Math.max(0, (user.subscriptions?.length ?? 0) - 1);
}

export function isMutedUser(user: Pick<UserListItem, 'status'>): boolean {
  return user.status === 'blocked' || user.status === 'deleted';
}

/** «до 20.09.2026» под тарифом; без подписки подписи нет — всё скажет чип. */
export function subscriptionCaption(
  user: Pick<UserListItem, 'has_subscription' | 'subscription_end_date'>,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string | null {
  if (user.has_subscription && user.subscription_end_date) {
    return t('admin.users.until', { date: formatShortDate(user.subscription_end_date) });
  }
  return null;
}

/** Таблица для широких экранов; на телефоне вместо неё `UserCards`. */
export function UsersTable({ users, className }: UsersTableProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const money = useMoney();
  const now = useNow(ONLINE_TICK_MS);

  return (
    <div className={cn('rounded-[18px] border-2 border-dark-700 bg-dark-900', className)}>
      {/* Шапка прилипает под шапкой кабинета; скругления свои — у контейнера нет overflow. */}
      <div
        className={cn(
          GRID,
          'sticky top-[var(--sticky-top,0px)] z-10 h-12 rounded-t-[16px] border-b-2 border-dark-700 bg-dark-900 text-[11px] font-bold uppercase tracking-[0.1em] text-dark-400 lg:top-0',
        )}
      >
        <span>{t('admin.users.columns.user')}</span>
        <span>{t('rv.au.status')}</span>
        <span>{t('rv.au.tariff')}</span>
        <span>{t('rv.au.until')}</span>
        <span>{t('rv.au.traffic')}</span>
        <span className="text-right">{t('admin.users.columns.balance')}</span>
        <span>{t('rv.au.seen')}</span>
      </div>
      {users.map((user) => {
        return (
          <Link
            key={user.id}
            to={`/admin/users/${user.id}`}
            state={backTo(location).state}
            className={cn(
              GRID,
              'group min-h-[66px] border-b border-dark-700 py-3 transition-colors last:rounded-b-[16px] last:border-b-0 hover:bg-[var(--rv-acc-bg)] focus-visible:bg-[var(--rv-acc-bg)] focus-visible:outline-none',
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar
                firstName={user.first_name}
                username={user.username}
                muted={isMutedUser(user)}
                online={isUserOnline(user, now)}
              />
              <div className="min-w-0">
                <div className="relative truncate font-bold text-dark-100">
                  {user.full_name}
                  {isUserOnline(user, now) && (
                    <span className="sr-only">, {t('admin.users.connectedNow')}</span>
                  )}
                </div>
                <div className="truncate text-xs tabular-nums text-dark-500">
                  {user.username ? `@${user.username} · ` : ''}
                  <span className="text-dark-400">{user.telegram_id}</span>
                  {user.promo_group_name ? ` · ${user.promo_group_name}` : ''}
                </div>
              </div>
            </div>

            <div className="min-w-0">
              <UserStatusChip user={user} />
            </div>
            <div className="min-w-0 truncate text-sm text-dark-100">
              {user.has_subscription ? user.tariff_name || '—' : '—'}
              {extraTariffsCount(user) > 0 && (
                <span className="ml-1.5 rounded-full bg-dark-700 px-2 py-0.5 text-[11px] font-bold text-dark-300">
                  {t('admin.users.moreTariffs', { count: extraTariffsCount(user) })}
                </span>
              )}
            </div>
            <div className="text-sm tabular-nums text-dark-200">
              {user.has_subscription && user.subscription_end_date
                ? new Date(user.subscription_end_date).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                  })
                : '—'}
            </div>
            <div className="min-w-0">
              {user.has_subscription && (
                <TrafficBar
                  usedGb={user.traffic_used_gb}
                  limitGb={user.traffic_limit_gb}
                  barClassName="w-28 flex-none"
                />
              )}
            </div>
            <span
              className={cn(
                'text-right text-sm font-bold tabular-nums',
                user.balance_rubles > 0 ? 'text-dark-100' : 'text-dark-400',
              )}
            >
              {money(user.balance_rubles)}
            </span>
            <RelativeTime value={user.last_activity} />
          </Link>
        );
      })}
    </div>
  );
}
