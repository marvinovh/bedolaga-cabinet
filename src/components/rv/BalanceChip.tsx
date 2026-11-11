import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { balanceApi } from '@/api/balance';
import { useAuthStore } from '@/store/auth';
import { useCurrency } from '@/hooks/useCurrency';
import { API } from '@/config/constants';
import { PlusIcon } from '@/components/icons';

interface BalanceChipProps {
  className?: string;
  /** На лаймовой шапке (десктоп) — чернильная обводка */
  onAccent?: boolean;
}

/** «245 ₽ (+)» — баланс в шапке, ведёт на пополнение. */
export function BalanceChip({ className, onAccent = false }: BalanceChipProps) {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { formatAmount, currencySymbol } = useCurrency();
  const { data } = useQuery({
    queryKey: ['balance'],
    queryFn: balanceApi.getBalance,
    staleTime: API.BALANCE_STALE_TIME_MS,
    enabled: isAuthenticated,
  });

  const rubles = data?.balance_rubles;

  return (
    <Link
      to="/balance"
      aria-label={t('nav.balance')}
      className={cn(
        'inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border-2 py-1.5 pl-3 pr-1.5 text-[15px] font-bold leading-none',
        onAccent
          ? 'border-[#111] bg-[#111]/0 text-[#111] hover:bg-[#111]/5'
          : 'border-dark-700 bg-dark-900 text-dark-100 hover:border-dark-600',
        className,
      )}
    >
      <span className="whitespace-nowrap tabular-nums">
        {rubles === undefined ? '—' : `${formatAmount(rubles, 0)} ${currencySymbol}`}
      </span>
      <span
        className={cn(
          'grid h-[30px] w-[30px] place-items-center rounded-full',
          onAccent ? 'bg-[#111] text-[rgb(var(--color-accent-500))]' : 'bg-accent-500 text-[#111]',
        )}
      >
        <PlusIcon className="h-4 w-4" />
      </span>
    </Link>
  );
}
