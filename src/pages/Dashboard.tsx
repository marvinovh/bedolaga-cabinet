import { getLocalizedApiErrorMessage } from '../utils/api-error-display';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import { displayName } from '../utils/displayName';
import { useBlockingStore } from '../store/blocking';
import { subscriptionApi } from '../api/subscription';
import { referralApi } from '../api/referral';
import { balanceApi } from '../api/balance';
import { wheelApi } from '../api/wheel';
import Onboarding, { useOnboarding } from '../components/Onboarding';
import PromoOffersSection from '../components/PromoOffersSection';
import { MultiSubscriptions } from '../components/dashboard/MultiSubscriptions';
import SubscriptionCardActive from '../components/dashboard/SubscriptionCardActive';
import SubscriptionCardExpired from '../components/dashboard/SubscriptionCardExpired';
import { hasLegacySubscription } from '../utils/legacySubscription';
import TrialOfferCard from '../components/dashboard/TrialOfferCard';
import ReminderCards from '../components/dashboard/ReminderCards';
import {
  ConnectPhoneCard,
  HelpCard,
  PartnerCard,
  QuickTile,
  RecentOpsTable,
  RenewOfferCard,
} from '../components/dashboard/RvDashboardCards';
import { RvCardIcon, RvChatIcon, RvGiftIcon, RvMonitorIcon, RvShieldIcon } from '@/components/rv';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { giftApi } from '../api/gift';
import { promoApi } from '../api/promo';
import PendingGiftCard from '../components/dashboard/PendingGiftCard';
import { DeviceLimitSheet } from '../components/subscription/DeviceLimitSheet';
import { API } from '../config/constants';
import { ChevronRightIcon, StarIcon } from '@/components/icons';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { safeLocal } from '../utils/safeStorage';

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const queryClient = useQueryClient();
  const { isCompleted: isOnboardingCompleted, complete: completeOnboarding } = useOnboarding();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const blockingType = useBlockingStore((state) => state.blockingType);
  const [trialError, setTrialError] = useState<string | null>(null);
  const { referralEnabled } = useFeatureFlags();
  const { data: purchaseOptions } = useQuery({
    queryKey: ['purchase-options', undefined],
    queryFn: () => subscriptionApi.getPurchaseOptions(),
    staleTime: 60_000,
  });

  // Refresh user data on mount
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Fetch balance from API
  const { data: balanceData } = useQuery({
    queryKey: ['balance'],
    queryFn: balanceApi.getBalance,
    staleTime: API.BALANCE_STALE_TIME_MS,
    refetchOnMount: 'always',
  });

  // Multi-tariff: check if user has multiple subscriptions
  const { data: multiSubData } = useQuery({
    queryKey: ['subscriptions-list'],
    queryFn: () => subscriptionApi.getSubscriptions(),
    staleTime: 60_000,
  });
  const isMultiTariff = multiSubData?.multi_tariff_enabled ?? false;
  const multiList = multiSubData?.subscriptions ?? [];
  // Мультитариф с одной подпиской выглядит как обычная главная (макет 02),
  // список — только когда подписок несколько (макет 02c).
  const singleSubId = isMultiTariff && multiList.length === 1 ? multiList[0].id : undefined;
  const multiView = isMultiTariff && multiList.length > 1;

  const { data: subscriptionResponse, isLoading: subLoading } = useQuery({
    queryKey: singleSubId ? ['subscription', singleSubId] : ['subscription'],
    queryFn: () => subscriptionApi.getSubscription(singleSubId),
    retry: false,
    staleTime: API.BALANCE_STALE_TIME_MS,
    refetchOnMount: 'always',
    enabled: multiSubData !== undefined && (!isMultiTariff || !!singleSubId),
  });

  const subscription = subscriptionResponse?.subscription ?? null;

  const { data: trialInfo, isLoading: trialLoading } = useQuery({
    queryKey: ['trial-info'],
    queryFn: () => subscriptionApi.getTrialInfo(),
    enabled: !subscription && !subLoading,
  });

  const { data: devicesData } = useQuery({
    queryKey: singleSubId ? ['devices', singleSubId] : ['devices'],
    queryFn: () => subscriptionApi.getDevices(singleSubId),
    enabled: !!subscription && !multiView,
    staleTime: API.BALANCE_STALE_TIME_MS,
  });

  // Плитка «Подключить устройство» на главной живёт в МУЛЬТИТАРИФНОЙ ветке, а
  // запрос выше там выключен: он привязан к одиночной подписке (`subscription`
  // в мультитарифе всегда null). Без отдельного запроса счётчик плитки всегда
  // показывал бы «0 из N», а лимит устройств не срабатывал бы никогда — то
  // есть ровно то, ради чего плитку и добавили, не работало бы.
  // Ключ ['devices', id] — тот же, что на странице подписки, так что кэш общий.
  // Карточки подписок на главной показывают, сколько устройств подключено, и
  // дают подключить ещё. Число устройств живёт в панели, поэтому запрос идёт
  // на каждую показанную подписку; ключ ['devices', id] тот же, что на
  // странице подписки, так что кэш общий и переход туда не стоит сети.
  const visibleSubscriptions = useMemo(
    () => multiSubData?.subscriptions?.slice(0, 3) ?? [],
    [multiSubData],
  );

  const deviceQueries = useQueries({
    queries: visibleSubscriptions.map((sub) => ({
      queryKey: ['devices', sub.id],
      queryFn: () => subscriptionApi.getDevices(sub.id),
      staleTime: API.BALANCE_STALE_TIME_MS,
    })),
  });

  // Подписка, у которой разбираем исчерпанный лимит устройств.
  const [deviceLimitSubId, setDeviceLimitSubId] = useState<number | null>(null);
  const deviceLimitSub = visibleSubscriptions.find((s) => s.id === deviceLimitSubId) ?? null;
  const deviceLimitDevices =
    deviceQueries[visibleSubscriptions.findIndex((s) => s.id === deviceLimitSubId)]?.data;

  const { data: referralInfo, isLoading: refLoading } = useQuery({
    queryKey: ['referral-info'],
    queryFn: referralApi.getReferralInfo,
  });

  const { data: wheelConfig } = useQuery({
    queryKey: ['wheel-config'],
    queryFn: wheelApi.getConfig,
    staleTime: 60000,
    retry: false,
  });

  const { data: pendingGifts } = useQuery({
    queryKey: ['pending-gifts'],
    queryFn: giftApi.getPendingGifts,
    staleTime: 30_000,
    retry: false,
  });

  const { data: promoGroupData } = useQuery({
    queryKey: ['promo-group-discounts'],
    queryFn: promoApi.getGroupDiscounts,
    staleTime: 60_000,
    retry: false,
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

  // Traffic refresh state and mutation
  const [trafficRefreshCooldown, setTrafficRefreshCooldown] = useState(0);
  const [trafficData, setTrafficData] = useState<{
    traffic_used_gb: number;
    traffic_used_percent: number;
    is_unlimited: boolean;
    traffic_accounting_mode?: 'legacy' | 'managed';
    traffic_remaining_gb?: number | null;
    base_traffic_remaining_gb?: number | null;
    next_traffic_refresh_at?: string | null;
  } | null>(null);

  const refreshTrafficMutation = useMutation({
    mutationFn: () => subscriptionApi.refreshTraffic(subscription?.id),
    onSuccess: (data) => {
      setTrafficData({
        traffic_used_gb: data.traffic_used_gb,
        traffic_used_percent: data.traffic_used_percent,
        is_unlimited: data.is_unlimited,
        traffic_accounting_mode: data.traffic_accounting_mode,
        traffic_remaining_gb: data.traffic_remaining_gb,
        base_traffic_remaining_gb: data.base_traffic_remaining_gb,
        next_traffic_refresh_at: data.next_traffic_refresh_at,
      });
      safeLocal.setItem(
        `traffic_refresh_ts_${subscription?.id ?? 'default'}`,
        Date.now().toString(),
      );
      if (data.rate_limited && data.retry_after_seconds) {
        setTrafficRefreshCooldown(data.retry_after_seconds);
      } else {
        setTrafficRefreshCooldown(30);
      }
      queryClient.invalidateQueries({ queryKey: ['subscription', subscription?.id] });
    },
    onError: (error: {
      response?: { status?: number; headers?: { get?: (key: string) => string } };
    }) => {
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers?.get?.('Retry-After');
        setTrafficRefreshCooldown(retryAfter ? parseInt(retryAfter, 10) : 30);
      }
    },
  });

  // Cooldown timer
  useEffect(() => {
    if (trafficRefreshCooldown <= 0) return;
    const timer = setInterval(() => {
      setTrafficRefreshCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [trafficRefreshCooldown]);

  // Auto-refresh traffic on mount (with 30s caching)
  const hasAutoRefreshed = useRef(false);

  useEffect(() => {
    if (!subscription) return;
    if (hasAutoRefreshed.current) return;
    hasAutoRefreshed.current = true;

    const lastRefresh = safeLocal.getItem(`traffic_refresh_ts_${subscription?.id ?? 'default'}`);
    const now = Date.now();
    const cacheMs = API.TRAFFIC_CACHE_MS;

    if (lastRefresh && now - parseInt(lastRefresh, 10) < cacheMs) {
      const elapsed = now - parseInt(lastRefresh, 10);
      const remaining = Math.ceil((cacheMs - elapsed) / 1000);
      if (remaining > 0) {
        setTrafficRefreshCooldown(remaining);
      }
      return;
    }

    refreshTrafficMutation.mutate();
  }, [subscription, refreshTrafficMutation]);

  // В multi-tariff /cabinet/subscription отключён, поэтому subscriptionResponse=undefined.
  // Используем список из /cabinet/subscriptions/list — пустой массив означает «нет подписок»,
  // и тогда показываем TrialOfferCard. Без этой ветки multi-tariff юзер никогда не видел триал.
  const hasNoSubscription = isMultiTariff
    ? multiSubData !== undefined && (multiSubData.subscriptions?.length ?? 0) === 0
    : subscriptionResponse?.has_subscription === false && !subLoading;

  // Старая подписка (без тарифа при включённых тарифах) в списке: «купить ещё»
  // не предлагаем, её карточка ведёт на переход на тариф.
  const hasLegacy = hasLegacySubscription(multiSubData?.subscriptions);

  // Show onboarding for new users after data loads
  useEffect(() => {
    if (!isOnboardingCompleted && !subLoading && !refLoading && !blockingType) {
      const timer = setTimeout(() => setShowOnboarding(true), 500);
      return () => clearTimeout(timer);
    }
  }, [isOnboardingCompleted, subLoading, refLoading, blockingType]);

  const onboardingSteps = useMemo(() => {
    type Placement = 'top' | 'bottom' | 'left' | 'right';
    const steps: Array<{
      target: string;
      title: string;
      description: string;
      placement: Placement;
    }> = [
      {
        target: 'welcome',
        title: t('onboarding.steps.welcome.title'),
        description: t('onboarding.steps.welcome.description'),
        placement: 'bottom',
      },
      {
        target: 'balance',
        title: t('onboarding.steps.balance.title'),
        description: t('onboarding.steps.balance.description'),
        placement: 'bottom',
      },
    ];

    if (subscription?.subscription_url) {
      steps.splice(1, 0, {
        target: 'connect-devices',
        title: t('onboarding.steps.connectDevices.title'),
        description: t('onboarding.steps.connectDevices.description'),
        placement: 'bottom',
      });
    }

    return steps;
  }, [t, subscription]);

  const handleOnboardingComplete = () => {
    completeOnboarding();
    setShowOnboarding(false);
  };

  const userName = displayName(user);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-5">
      <div className="flex min-w-0 flex-col gap-3 lg:gap-5">
        {/* Приветствие */}
        <div data-onboarding="welcome" className="flex flex-wrap items-center gap-2 lg:hidden">
          <h1 className="sr-only">{t('dashboard.title')}</h1>
          <p className="text-base font-medium text-dark-300">
            {userName ? t('rv.hi', { name: userName }) : t('rv.hiNoName')}
          </p>
          {promoGroupData?.group_name && (
            <span className="badge-success max-w-[180px]">
              <StarIcon filled className="h-3 w-3 shrink-0" />
              <span className="truncate">{promoGroupData.group_name}</span>
            </span>
          )}
        </div>

        {/* Pending Gift Activations */}
        {pendingGifts && pendingGifts.length > 0 && <PendingGiftCard gifts={pendingGifts} />}

        {/* Multi-tariff: show subscription cards (max 3) — только когда подписки
          реально есть. Пустой случай (нет подписок) ведёт блок ниже (триал/покупка),
          иначе кнопка покупки дублировалась. */}
        {multiView && (
          <MultiSubscriptions
            subscriptions={multiList}
            tariffs={
              purchaseOptions && 'tariffs' in purchaseOptions ? purchaseOptions.tariffs : undefined
            }
            canBuyMore={!hasLegacy}
          />
        )}

        {!multiView &&
          (subLoading ? (
            <SkeletonGroup className="bento-card">
              <div className="mb-4 flex items-center justify-between">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <Skeleton className="mb-3 h-10 w-32" />
              <Skeleton className="mb-3 h-4 w-40" />
              <Skeleton className="h-3 w-full rounded-full" />
              <div className="mt-5">
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            </SkeletonGroup>
          ) : subscription?.is_expired ||
            subscription?.status === 'disabled' ||
            subscription?.is_limited ? (
            <SubscriptionCardExpired
              subscription={subscription}
              balanceKopeks={balanceData?.balance_kopeks ?? 0}
              balanceRubles={balanceData?.balance_rubles ?? 0}
            />
          ) : subscription ? (
            <SubscriptionCardActive
              subscription={subscription}
              trafficData={trafficData}
              refreshTrafficMutation={refreshTrafficMutation}
              trafficRefreshCooldown={trafficRefreshCooldown}
              connectedDevices={devicesData?.total ?? 0}
              deviceNames={(devicesData?.devices ?? []).map(
                (d) => d.local_name || d.device_model || d.platform,
              )}
            />
          ) : null)}

        {/* Нет подписок: показываем триал (если доступен) и ВСЕГДА одну явную
          кнопку покупки. Триал не обязателен, чтобы попасть в витрину — раньше
          при доступном триале это был единственный экран без кнопки покупки
          (Telegram-баг #605056/#605063). Единственная кнопка тут (вместо дубля
          с мульти-тариф блоком). */}
        {hasNoSubscription && !trialLoading && (
          <div className="space-y-3">
            {trialInfo?.is_available && (
              <TrialOfferCard
                trialInfo={trialInfo}
                balanceKopeks={balanceData?.balance_kopeks || 0}
                balanceRubles={balanceData?.balance_rubles || 0}
                activateTrialMutation={activateTrialMutation}
                trialError={trialError}
              />
            )}
            <Link
              to="/subscription/purchase"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-500 p-3.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-600"
            >
              <span className="text-base">+</span>{' '}
              {t('subscriptions.browsePlans', 'Посмотреть тарифы и купить подписку')}
            </Link>
          </div>
        )}

        {/* Promo Offers */}
        <PromoOffersSection />

        {/* «−9% Продли сразу на 90 дней» */}
        {subscription?.is_active && !subscription.is_trial && !multiView && (
          <RenewOfferCard
            subscriptionId={subscription.id}
            tariffs={
              purchaseOptions && 'tariffs' in purchaseOptions ? purchaseOptions.tariffs : undefined
            }
          />
        )}

        {/* Быстрые действия (макет: 2×2 плитки) */}
        <div className="grid grid-cols-2 gap-2.5 lg:hidden">
          <QuickTile to="/balance" icon={<RvCardIcon />} accent label={t('rv.topUp')} />
          {referralEnabled ? (
            <QuickTile
              to="/referral"
              icon={<RvGiftIcon />}
              label={t('rv.inviteFriend')}
              note={
                referralInfo?.commission_percent
                  ? `+${referralInfo.commission_percent}%`
                  : undefined
              }
            />
          ) : (
            <QuickTile to="/support" icon={<RvChatIcon />} label={t('nav.support')} />
          )}
          {!multiView && (
            <QuickTile to="/subscriptions" icon={<RvShieldIcon />} label={t('rv.mySubscription')} />
          )}
          {!multiView && (
            <QuickTile
              to={subscription ? `/connection?sub=${subscription.id}` : '/connection'}
              icon={<RvMonitorIcon />}
              label={t('rv.tvOrPc')}
            />
          )}
        </div>

        {wheelConfig?.is_enabled && (
          <Link
            to="/wheel"
            className="bento-card bento-card-hover group flex items-center gap-4 !p-4"
          >
            <span className="rv-ic rv-ic-acc text-xl">🎰</span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-dark-100">{t('wheel.banner.title')}</h3>
              <p className="text-sm text-dark-400">{t('wheel.banner.description')}</p>
            </div>
            <ChevronRightIcon className="h-5 w-5 text-dark-400" />
          </Link>
        )}

        <div className="hidden lg:block">
          <RecentOpsTable />
        </div>

        <div className="space-y-3 lg:hidden">
          {referralEnabled && !multiView && (
            <PartnerCard percent={referralInfo?.commission_percent} />
          )}
          <HelpCard />
        </div>

        {/* Напоминания (админка → Напоминания) */}
        <ReminderCards />
      </div>

      {/* Правая колонка на компьютере */}
      <aside className="hidden space-y-5 lg:block">
        {subscription?.subscription_url && <ConnectPhoneCard subscriptionId={subscription.id} />}
        {referralEnabled && <PartnerCard percent={referralInfo?.commission_percent} />}
        <HelpCard />
      </aside>

      {/* Onboarding Tutorial */}
      {showOnboarding && (
        <Onboarding
          steps={onboardingSteps}
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingComplete}
        />
      )}

      {deviceLimitSub && (
        <DeviceLimitSheet
          isOpen
          onClose={() => setDeviceLimitSubId(null)}
          subscriptionId={deviceLimitSub.id}
          subscriptionName={deviceLimitSub.tariff_name || t('subscription.defaultName', 'Подписка')}
          deviceLimit={deviceLimitSub.device_limit}
          isTrial={deviceLimitSub.is_trial}
          devices={deviceLimitDevices?.devices ?? []}
          onOpenSubscription={() => {
            setDeviceLimitSubId(null);
            navigate(`/subscriptions/${deviceLimitSub.id}`);
          }}
        />
      )}
    </div>
  );
}
