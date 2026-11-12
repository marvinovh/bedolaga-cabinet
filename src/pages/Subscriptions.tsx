import { getLocalizedApiErrorMessage } from '../utils/api-error-display';
import { useState } from 'react';
import { hasLegacySubscription } from '../utils/legacySubscription';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ClipboardIcon, PlusIcon } from '@/components/icons';
import { subscriptionApi } from '../api/subscription';
import { balanceApi } from '../api/balance';
import { useTheme } from '../hooks/useTheme';
import { getGlassColors } from '../utils/glassTheme';
import { useAuthStore } from '../store/auth';

import {
  RvSubscriptionCard,
  rvSubState,
  type RvSubState,
} from '../components/subscription/RvSubscriptionCard';
import { useCurrency } from '../hooks/useCurrency';
import TrialOfferCard from '../components/dashboard/TrialOfferCard';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';

function EmptyState({ onBuy }: { onBuy: () => void }) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const g = getGlassColors(isDark);

  return (
    <div
      className="rounded-2xl border p-10 text-center"
      style={{ background: g.cardBg, borderColor: g.cardBorder }}
    >
      <div
        className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ background: g.innerBg }}
      >
        <ClipboardIcon className="h-8 w-8 opacity-40" />
      </div>
      <h3 className="mb-2 text-xl font-semibold" style={{ color: g.text }}>
        {t('subscriptions.empty', 'Нет подписок')}
      </h3>
      <p className="mb-6 text-sm" style={{ color: g.textSecondary }}>
        {t('subscriptions.emptyDesc', 'У вас пока нет активных подписок')}
      </p>
      <button
        onClick={onBuy}
        className="rounded-xl bg-accent-500 px-8 py-3 text-sm font-medium text-on-accent transition-colors hover:bg-accent-600"
      >
        {t('subscriptions.buy', 'Купить подписку')}
      </button>
    </div>
  );
}

export default function Subscriptions() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const g = getGlassColors(isDark);
  const queryClient = useQueryClient();
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const [trialError, setTrialError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['subscriptions-list'],
    queryFn: () => subscriptionApi.getSubscriptions(),
    staleTime: 30_000,
    refetchOnMount: 'always',
  });

  const subscriptions = data?.subscriptions ?? [];
  const isMultiTariff = data?.multi_tariff_enabled ?? false;
  const hasNoSubscriptions = !isLoading && subscriptions.length === 0;
  // Есть ли хотя бы одна НАСТОЯЩАЯ (платная, не триал) живая подписка. От этого
  // зависит CTA: «+ Купить ещё» — только если уже есть платная; иначе показываем
  // явную «Посмотреть тарифы и купить подписку» (триал/истёкшие — это ещё не покупка).
  const hasActivePaid = subscriptions.some(
    (s) => !s.is_trial && (s.status === 'active' || s.status === 'limited'),
  );
  // Старая подписка (без тарифа при включённых тарифах) в списке: «купить ещё»
  // не предлагаем, её карточка ведёт на переход на тариф.
  const hasLegacy = hasLegacySubscription(subscriptions);

  const { formatAmount, currencySymbol } = useCurrency();
  const order: Record<RvSubState, number> = { limited: 0, warn: 1, ok: 2, off: 3 };
  const sorted = [...subscriptions].sort((a, b) => order[rvSubState(a)] - order[rvSubState(b)]);
  const counts = { ok: 0, warn: 0, limited: 0, off: 0 } as Record<RvSubState, number>;
  for (const sub of subscriptions) counts[rvSubState(sub)] += 1;
  const deviceQueries = useQueries({
    queries: subscriptions.map((sub) => ({
      queryKey: ['devices', sub.id],
      queryFn: () => subscriptionApi.getDevices(sub.id),
      staleTime: 60_000,
    })),
  });
  const devicesOf = (id: number) =>
    deviceQueries[subscriptions.findIndex((x) => x.id === id)]?.data?.total ?? 0;
  const { data: purchaseOptions } = useQuery({
    queryKey: ['purchase-options', undefined],
    queryFn: () => subscriptionApi.getPurchaseOptions(),
    staleTime: 60_000,
    enabled: subscriptions.length > 0,
  });
  const monthPrice = (tariffId: number | null) => {
    const tariffs =
      purchaseOptions && 'tariffs' in purchaseOptions ? purchaseOptions.tariffs : undefined;
    const tariff = tariffs?.find((x) => x.id === tariffId);
    const p = tariff?.periods.find((x) => x.days === 30) ?? tariff?.periods[0];
    return p
      ? `${formatAmount(p.price_kopeks / 100, p.price_kopeks % 100 ? 2 : 0)}\u00A0${currencySymbol}`
      : null;
  };

  // Если у юзера нет подписок — проверяем доступность триала, иначе
  // (в multi-tariff) ему вообще негде увидеть оффер.
  const { data: trialInfo, isLoading: trialLoading } = useQuery({
    queryKey: ['trial-info'],
    queryFn: () => subscriptionApi.getTrialInfo(),
    enabled: hasNoSubscriptions,
    staleTime: 30_000,
  });

  const { data: balanceData } = useQuery({
    queryKey: ['balance'],
    queryFn: balanceApi.getBalance,
    enabled: hasNoSubscriptions && !!trialInfo?.is_available,
    staleTime: 30_000,
  });

  const activateTrialMutation = useMutation({
    mutationFn: () => subscriptionApi.activateTrial(),
    onSuccess: () => {
      setTrialError(null);
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['trial-info'] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-options'] });
      refreshUser();
    },
    onError: (error: unknown) => {
      setTrialError(getLocalizedApiErrorMessage(error, t('common.error'), t));
    },
  });

  // Single-tariff mode with one subscription: skip list, go directly to detail
  if (data && !isMultiTariff && subscriptions.length === 1) {
    return <Navigate to={`/subscriptions/${subscriptions[0].id}`} replace />;
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Шапка (макеты «02d» / «17 · Мои подписки») */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="rv-title !text-[52px] lg:!text-[72px]">
            {t('rv.subs.title1')} <span className="rv-pill">{t('rv.subs.title2')}</span>
          </h1>
          {subscriptions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {counts.ok > 0 && (
                <span className="badge-success">
                  <i className="rv-tag-dot" />
                  {t('rv.subs.cWorking', { count: counts.ok + counts.warn })}
                </span>
              )}
              {counts.warn > 0 && (
                <span className="badge-warning">
                  <i className="rv-tag-dot" />
                  {t('rv.subs.cEnding', { count: counts.warn })}
                </span>
              )}
              {counts.limited > 0 && (
                <span className="badge-error">
                  <i className="rv-tag-dot" />
                  {t('rv.subs.cLimited', { count: counts.limited })}
                </span>
              )}
              {counts.off > 0 && (
                <span className="badge-neutral">
                  <i className="rv-tag-dot" />
                  {t('rv.subs.cOff', { count: counts.off })}
                </span>
              )}
            </div>
          )}
        </div>
        {!isLoading && !hasLegacy && hasActivePaid && (
          <button
            onClick={() => navigate('/subscription/purchase')}
            className="btn btn-secondary hidden lg:inline-flex"
          >
            <PlusIcon className="h-5 w-5" />
            {t('rv.subs.newTariff')}
          </button>
        )}
      </div>

      {/* Есть подписки, но платной активной нет (только триал/истёкшие) —
          даём ЯВНУЮ primary-кнопку покупки: мы продаём подписки. */}
      {!isLoading && subscriptions.length > 0 && !hasActivePaid && !hasLegacy && (
        <button
          onClick={() => navigate('/subscription/purchase')}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-500 p-3.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-600"
        >
          <PlusIcon className="h-5 w-5" />
          {t('subscriptions.browsePlans', 'Посмотреть тарифы и купить подписку')}
        </button>
      )}

      {/* Loading */}
      {isLoading && (
        <SkeletonGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton
              key={i}
              variant="card"
              // Фон и рамку задаёт стеклянная тема, поэтому вариантную заливку гасим.
              className="h-36 border-0 bg-transparent"
              style={{ background: g.innerBg }}
            />
          ))}
        </SkeletonGroup>
      )}

      {/* Empty state: показываем триал, если доступен; иначе — обычный empty */}
      {hasNoSubscriptions && !trialLoading && trialInfo?.is_available && (
        <div className="space-y-4">
          <TrialOfferCard
            trialInfo={trialInfo}
            balanceKopeks={balanceData?.balance_kopeks ?? 0}
            balanceRubles={balanceData?.balance_rubles ?? 0}
            activateTrialMutation={activateTrialMutation}
            trialError={trialError}
          />
          {/* Новый пользователь не обязан активировать триал, чтобы попасть
              в витрину — даём явный путь к покупке подписки. Раньше при
              доступном триале это был единственный экран без кнопки «Купить»
              (Telegram-баг #605056/#605063). */}
          <button
            onClick={() => navigate('/subscription/purchase')}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-500 px-6 py-3 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-600"
          >
            <PlusIcon className="h-5 w-5" />
            {t('subscriptions.browsePlans', 'Посмотреть тарифы и купить подписку')}
          </button>
        </div>
      )}
      {hasNoSubscriptions && !trialLoading && !trialInfo?.is_available && (
        <EmptyState onBuy={() => navigate('/subscription/purchase')} />
      )}

      {/* Подписки: сначала требующие внимания */}
      {subscriptions.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-5">
          {sorted.map((sub) => (
            <RvSubscriptionCard
              key={sub.id}
              sub={sub}
              devicesUsed={devicesOf(sub.id)}
              price={monthPrice(sub.tariff_id)}
            />
          ))}
          {!hasLegacy && hasActivePaid && (
            <button
              type="button"
              onClick={() => navigate('/subscription/purchase')}
              className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-[22px] border-2 border-dashed border-[var(--rv-bd2)] p-6 text-center"
            >
              <span className="grid h-12 w-12 place-items-center rounded-full bg-accent-500 text-[#111]">
                <PlusIcon className="h-6 w-6" />
              </span>
              <span className="rv-d text-[28px] text-dark-100">{t('rv.subs.newTariff')}</span>
              <span className="max-w-[320px] text-sm text-dark-400">
                {t('rv.subs.newTariffHint')}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
