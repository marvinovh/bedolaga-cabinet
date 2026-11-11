import { hasUnknownManagedTraffic } from '@/utils/trafficAccounting';
import ManagedTrafficSummary from '@/components/subscription/ManagedTrafficSummary';
import { uiLocale } from '@/utils/uiLocale';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { subscriptionApi } from '../api/subscription';
import { WebBackButton } from '../components/WebBackButton';
import { useTrafficZone } from '../hooks/useTrafficZone';
import { formatTraffic } from '../utils/formatTraffic';
import { getGlassColors } from '../utils/glassTheme';
import { copyToClipboard } from '../utils/clipboard';
import { useTheme } from '../hooks/useTheme';
import { useCloseOnSuccessNotification } from '../store/successNotification';
import { purchaseCtaTarget } from '../components/subscription/PurchaseCTAButton';
import { canOpenTariffSwitch, tariffSelectionPath } from '../utils/legacySubscription';
import { RvBoltIcon, RvCheckIcon, RvCopyIcon, RvPhoneIcon, RvQrIcon } from '@/components/rv';
import { planTitle, showsAddonOptions } from '../utils/legacySubscription';
import { ChevronRightIcon, RefreshIcon } from '../components/icons';
import { useHaptic } from '../platform';
import { resolveConnectionUrlForUi } from '../utils/connectionLink';
import { getFlagEmoji } from '../utils/subscriptionHelpers';
import Twemoji from '@/lib/twemoji';
import { AutopayToggle } from '../components/subscription/manage/AutopayToggle';
import { DailyPausePanel } from '../components/subscription/manage/DailyPausePanel';
import {
  canReissueLink,
  ReissueLinkButton,
} from '../components/subscription/manage/ReissueLinkButton';
import { DevicesPanel } from '../components/subscription/manage/DevicesPanel';
import { RecurringPanels } from '../components/subscription/manage/RecurringPanels';
import { DeviceTopupSheet } from '../components/subscription/sheets/DeviceTopupSheet';
import { DeviceReductionSheet } from '../components/subscription/sheets/DeviceReductionSheet';
import { TrafficTopupSheet } from '../components/subscription/sheets/TrafficTopupSheet';
import { ServerManagementSheet } from '../components/subscription/sheets/ServerManagementSheet';
import { DeleteSubscriptionSheet } from '../components/subscription/sheets/DeleteSubscriptionSheet';
import { PageSkeleton, Skeleton } from '@/components/ui/skeleton';
import { safeLocal } from '../utils/safeStorage';

export default function Subscription() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { subscriptionId: subIdParam } = useParams<{ subscriptionId?: string }>();
  const subscriptionId = subIdParam ? parseInt(subIdParam, 10) : undefined;
  const { isDark } = useTheme();
  const g = getGlassColors(isDark);
  const haptic = useHaptic();
  const [copied, setCopied] = useState(false);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [showDevices, setShowDevices] = useState(false);

  // Device/traffic topup state
  const [showDeviceTopup, setShowDeviceTopup] = useState(false);
  const [devicesToAdd, setDevicesToAdd] = useState(1);
  const [showDeviceReduction, setShowDeviceReduction] = useState(false);
  const [targetDeviceLimit, setTargetDeviceLimit] = useState<number>(1);
  const [showTrafficTopup, setShowTrafficTopup] = useState(false);
  const [selectedTrafficPackage, setSelectedTrafficPackage] = useState<number | null>(null);
  const [showServerManagement, setShowServerManagement] = useState(false);
  const [selectedServersToUpdate, setSelectedServersToUpdate] = useState<string[]>([]);

  // Traffic refresh state
  const [trafficRefreshCooldown, setTrafficRefreshCooldown] = useState(0);

  // Revoke (reissue) cooldown state
  const [trafficData, setTrafficData] = useState<{
    traffic_used_gb: number;
    traffic_used_percent: number;
    is_unlimited: boolean;
    traffic_accounting_mode?: 'legacy' | 'managed';
    traffic_remaining_gb?: number | null;
    base_traffic_remaining_gb?: number | null;
    next_traffic_refresh_at?: string | null;
  } | null>(null);

  // Detect multi-tariff mode from cached subscriptions-list
  const { data: multiSubData } = useQuery({
    queryKey: ['subscriptions-list'],
    queryFn: () => subscriptionApi.getSubscriptions(),
    staleTime: 60_000,
  });
  const isMultiTariff = multiSubData?.multi_tariff_enabled ?? false;

  const { data: subscriptionResponse, isLoading } = useQuery({
    queryKey: ['subscription', subscriptionId],
    queryFn: () => subscriptionApi.getSubscription(subscriptionId),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const { data: connectionLink, isLoading: isConnectionLinkLoading } = useQuery({
    queryKey: ['connection-link', subscriptionId],
    queryFn: () => subscriptionApi.getConnectionLink(subscriptionId),
    retry: false,
    staleTime: 0,
  });

  // Extract subscription from response (null if no subscription)
  const subscription = subscriptionResponse?.subscription ?? null;
  const displayedConnectionUrl = useMemo(
    () =>
      resolveConnectionUrlForUi({
        mode: connectionLink?.connect_mode,
        happSchemeLink: connectionLink?.happ_scheme_link,
        displayLink: connectionLink?.display_link,
        subscriptionUrl: connectionLink?.subscription_url,
        happCryptLink: connectionLink?.happ_cryptolink,
        happCryptoLink: connectionLink?.happ_crypto_link,
        happLink: connectionLink?.happ_link,
        fallbackUrl: isConnectionLinkLoading ? null : (subscription?.subscription_url ?? null),
      }),
    [
      connectionLink?.connect_mode,
      connectionLink?.display_link,
      connectionLink?.happ_cryptolink,
      connectionLink?.happ_crypto_link,
      connectionLink?.happ_link,
      connectionLink?.happ_scheme_link,
      connectionLink?.subscription_url,
      isConnectionLinkLoading,
      subscription?.subscription_url,
    ],
  );
  const shouldHideConnectionLink =
    subscription?.hide_subscription_link || connectionLink?.hide_link;

  // Traffic zone (theme-aware) — called unconditionally at top level
  const usedPercent = trafficData?.traffic_used_percent ?? subscription?.traffic_used_percent ?? 0;
  const zone = useTrafficZone(usedPercent);

  // Purchase options (needed for balance_kopeks in device/traffic/server management)
  const purchaseOptionsQuery = useQuery({
    queryKey: ['purchase-options', subscriptionId],
    queryFn: () => subscriptionApi.getPurchaseOptions(subscriptionId),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const purchaseOptions = purchaseOptionsQuery.data;

  const isTariffsMode = purchaseOptions?.sales_mode === 'tariffs';

  // Devices query
  // Счётчик подключённых устройств в шапке. Сам список живёт в <DevicesPanel>
  // и ходит по тому же ключу, так что второго запроса не возникает.
  const { data: devicesData } = useQuery({
    queryKey: ['devices', subscriptionId],
    queryFn: () => subscriptionApi.getDevices(subscriptionId),
    enabled: !!subscription,
  });

  // Pause subscription mutation
  // Auto-close all modals/forms when success notification appears
  const handleCloseAllModals = useCallback(() => {
    setShowDeviceTopup(false);
    setShowDeviceReduction(false);
    setShowTrafficTopup(false);
    setShowServerManagement(false);
  }, []);
  useCloseOnSuccessNotification(handleCloseAllModals);

  // (device price + purchase moved into <DeviceTopupSheet>)
  // (device reduction info + mutation moved into <DeviceReductionSheet>)

  // (traffic packages + purchase moved into <TrafficTopupSheet>)
  // (countries query + update mutation moved into <ServerManagementSheet>)

  // Traffic refresh mutation
  const refreshTrafficMutation = useMutation({
    mutationFn: () => subscriptionApi.refreshTraffic(subscriptionId),
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
      safeLocal.setItem(`traffic_refresh_ts_${subscriptionId ?? 'default'}`, Date.now().toString());
      if (data.rate_limited && data.retry_after_seconds) {
        setTrafficRefreshCooldown(data.retry_after_seconds);
      } else {
        setTrafficRefreshCooldown(30);
      }
      queryClient.invalidateQueries({ queryKey: ['subscription', subscriptionId] });
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

  // Track if we've already triggered auto-refresh this session
  const hasAutoRefreshed = useRef(false);

  // Cooldown timer for traffic refresh
  useEffect(() => {
    if (trafficRefreshCooldown <= 0) return;
    const timer = setInterval(() => {
      setTrafficRefreshCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [trafficRefreshCooldown]);

  // Auto-refresh traffic on mount (with 30s caching)
  useEffect(() => {
    if (!subscription) return;
    if (hasAutoRefreshed.current) return;
    hasAutoRefreshed.current = true;

    const lastRefresh = safeLocal.getItem(`traffic_refresh_ts_${subscriptionId ?? 'default'}`);
    const now = Date.now();
    const cacheMs = 30 * 1000;

    if (lastRefresh && now - parseInt(lastRefresh, 10) < cacheMs) {
      const elapsed = now - parseInt(lastRefresh, 10);
      const remaining = Math.ceil((cacheMs - elapsed) / 1000);
      if (remaining > 0) {
        setTrafficRefreshCooldown(remaining);
      }
      return;
    }

    refreshTrafficMutation.mutate();
  }, [subscription, refreshTrafficMutation, subscriptionId]);

  const copyUrl = () => {
    if (displayedConnectionUrl) {
      void copyToClipboard(displayedConnectionUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // In multi-tariff mode without a specific subscription ID, redirect to list
  if (isMultiTariff && !subscriptionId && !isLoading) {
    return <Navigate to="/subscriptions" replace />;
  }

  if (isLoading) {
    return (
      <PageSkeleton leading={1} titleWidth="w-48">
        <Skeleton variant="card" className="h-64" />
        <Skeleton variant="card" count={2} className="h-20" />
      </PageSkeleton>
    );
  }

  if (!subscription && subscriptionId) {
    return (
      <div className="mx-auto max-w-lg p-4 text-center">
        <div className="mb-4 text-4xl">😕</div>
        <h2 className="mb-2 text-xl font-bold text-dark-50">
          {t('subscription.notFound', 'Подписка не найдена')}
        </h2>
        <p className="mb-4 text-sm text-dark-50/60">
          {t('subscription.notFoundDesc', 'Возможно, подписка была удалена или не существует')}
        </p>
        <button
          onClick={() => navigate('/subscriptions')}
          className="rounded-xl bg-accent-500 px-6 py-2.5 text-sm font-medium text-on-accent"
        >
          {t('subscription.backToList', 'Мои подписки')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 lg:space-y-5">
      {/* Шапка экрана: «назад» + заголовок (макет «04 · Подписка») */}
      <div className="flex items-center gap-3">
        <WebBackButton to={isMultiTariff ? '/subscriptions' : '/'} />
        <h1 className="rv-title !text-[30px] lg:!text-[44px]">{t('rv.subp.title')}</h1>
      </div>

      {subscription ? (
        (() => {
          const unknownTraffic = hasUnknownManagedTraffic(subscription, trafficData);
          const usedGb = trafficData?.traffic_used_gb ?? subscription.traffic_used_gb;
          const isUnlimited =
            (trafficData?.is_unlimited ?? false) || subscription.traffic_limit_gb === 0;
          const limitGb = subscription.traffic_limit_gb;
          const leftGb = Math.max(0, limitGb - usedGb);
          const leftPct = Math.max(0, Math.min(100, 100 - usedPercent));
          const connectedDevices = devicesData?.total ?? 0;
          const unlimitedDevices = subscription.device_limit <= 0;
          const freeSlots = Math.max(0, subscription.device_limit - connectedDevices);
          const isAtDeviceLimit = !unlimitedDevices && freeSlots === 0;
          const resetAt =
            trafficData?.next_traffic_refresh_at ?? subscription.next_traffic_refresh_at;
          const shortDate = (iso: string) =>
            new Date(iso).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' });
          const longDate = new Date(subscription.end_date).toLocaleDateString(uiLocale(), {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          });
          const leftLabel =
            subscription.days_left > 0
              ? t('subscription.days', { count: subscription.days_left })
              : t('subscription.hours', { count: Math.max(0, subscription.hours_left) });
          const statusTag = subscription.is_active
            ? {
                cls: 'badge-success',
                text: subscription.is_trial ? t('subscription.trialStatus') : t('rv.subp.active'),
              }
            : subscription.is_limited
              ? { cls: 'badge-warning', text: t('subscription.trafficLimited') }
              : subscription.status === 'disabled'
                ? { cls: 'badge-warning', text: t('subscription.pause.suspended') }
                : { cls: 'badge-error', text: t('subscription.expired') };
          const cta = purchaseCtaTarget(
            subscription,
            (k, f) => (f === undefined ? t(k) : t(k, f)),
            { isMultiTariff, isTariffsMode },
          );
          const trafficZone = usedPercent >= 90 ? 'rv-bad' : usedPercent >= 75 ? 'rv-warn' : '';

          return (
            <div className="space-y-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-5 lg:space-y-0">
              {/* ─── Герой тарифа ─── */}
              <section className="bento-card !p-5 sm:!p-7 lg:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <span className={statusTag.cls}>
                    <i className="rv-tag-dot" />
                    {statusTag.text}
                  </span>
                  <span className="text-sm font-bold text-dark-400">№ {subscription.id}</span>
                </div>
                <h2 className="rv-d mt-4 break-words text-[52px] text-dark-100 sm:text-[64px]">
                  {planTitle(subscription, t)}
                </h2>
                <p className="mt-2 text-base text-dark-200">
                  <Trans
                    i18nKey={
                      subscription.is_active || subscription.is_limited
                        ? 'rv.subp.untilDate'
                        : 'rv.subp.ended'
                    }
                    values={{ date: longDate, left: leftLabel }}
                    components={{ b: <b className="font-bold text-dark-100" /> }}
                  />
                </p>

                {subscription.is_limited && (
                  <p className="mt-3 rounded-xl bg-[var(--rv-warn-bg)] px-3 py-2.5 text-sm font-medium text-[var(--rv-warn)]">
                    {t('subscription.trafficLimitedDescription')}
                  </p>
                )}
                {subscription.is_trial && subscription.is_active && (
                  <p className="mt-3 text-sm text-dark-400">
                    {t('subscription.trialInfo.description')}
                  </p>
                )}

                <div className="mt-5 grid grid-cols-2 gap-2.5 sm:flex sm:gap-3">
                  {cta && (
                    <Link to={cta.to} className="btn btn-primary sm:rv-btn-lg sm:min-w-[200px]">
                      {cta.label === t('subscription.extend') ? t('rv.renew') : cta.label}
                    </Link>
                  )}
                  {subscription.subscription_url && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isAtDeviceLimit) {
                          haptic.notification('error');
                          return;
                        }
                        navigate(
                          subscriptionId ? `/connection?sub=${subscriptionId}` : '/connection',
                        );
                      }}
                      aria-disabled={isAtDeviceLimit}
                      className={`btn btn-secondary sm:rv-btn-lg sm:min-w-[200px] ${cta ? '' : 'col-span-2'} ${isAtDeviceLimit ? 'opacity-60' : ''}`}
                    >
                      {t('rv.subp.connect')}
                    </button>
                  )}
                </div>
              </section>

              {/* ─── Трафик + Устройства ─── */}
              <div className="grid grid-cols-2 gap-2.5 lg:col-span-2 lg:gap-5">
                <section className="bento-card flex flex-col !p-4 sm:!p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[15px] font-bold text-dark-100">{t('rv.traffic')}</span>
                    <button
                      type="button"
                      onClick={() => refreshTrafficMutation.mutate()}
                      disabled={refreshTrafficMutation.isPending || trafficRefreshCooldown > 0}
                      className="text-dark-400 transition-colors hover:text-dark-100 disabled:opacity-50"
                      aria-label={t('common.refresh')}
                      title={
                        trafficRefreshCooldown > 0
                          ? `${trafficRefreshCooldown}s`
                          : t('common.refresh')
                      }
                    >
                      <RefreshIcon
                        className="h-4 w-4"
                        spinning={refreshTrafficMutation.isPending}
                      />
                    </button>
                  </div>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="rv-num text-[44px] text-dark-100">
                      {unknownTraffic
                        ? '—'
                        : isUnlimited
                          ? '∞'
                          : leftGb >= 10
                            ? Math.floor(leftGb)
                            : formatTraffic(leftGb).split(/\s/)[0]}
                    </span>
                    {!unknownTraffic && !isUnlimited && (
                      <span className="text-sm text-dark-400">{t('rv.subp.gb')}</span>
                    )}
                  </div>
                  {!unknownTraffic && !isUnlimited && (
                    <div className={`rv-meter mt-3 ${trafficZone}`}>
                      <i style={{ width: `${leftPct}%` }} />
                    </div>
                  )}
                  <p className="mt-2 text-[12px] leading-snug text-dark-400">
                    {isUnlimited
                      ? t('rv.usedGb', { amount: formatTraffic(usedGb) })
                      : t('rv.subp.leftOf', { total: formatTraffic(limitGb) })}
                    {!isUnlimited && resetAt
                      ? ` · ${t('rv.subp.renewsOn', { date: shortDate(resetAt) })}`
                      : ''}
                  </p>
                  <ManagedTrafficSummary subscription={subscription} refreshed={trafficData} />
                </section>

                <button
                  type="button"
                  onClick={() => {
                    setShowDevices(true);
                    setTimeout(
                      () =>
                        document.getElementById('devices')?.scrollIntoView({ behavior: 'smooth' }),
                      50,
                    );
                  }}
                  className="bento-card bento-card-hover flex flex-col !p-4 text-left sm:!p-5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[15px] font-bold text-dark-100">{t('rv.devices')}</span>
                    <ChevronRightIcon className="h-4 w-4 text-dark-400" />
                  </div>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="rv-num text-[44px] text-dark-100">{connectedDevices}</span>
                    <span className="text-sm text-dark-400">
                      {unlimitedDevices ? '' : `${t('rv.of')} ${subscription.device_limit}`}
                    </span>
                  </div>
                  {!unlimitedDevices &&
                    (subscription.device_limit <= 12 ? (
                      <div className="rv-slots mt-3">
                        {Array.from({ length: subscription.device_limit }, (_, i) => (
                          <i key={i} className={i < connectedDevices ? 'on' : undefined} />
                        ))}
                      </div>
                    ) : (
                      <div className="rv-meter mt-3">
                        <i
                          style={{
                            width: `${Math.min(100, (connectedDevices / subscription.device_limit) * 100)}%`,
                          }}
                        />
                      </div>
                    ))}
                  <p className="mt-2 text-[12px] leading-snug text-dark-400">
                    {unlimitedDevices
                      ? t('rv.subp.noLimit')
                      : isAtDeviceLimit
                        ? t('rv.subp.allTaken')
                        : t('rv.subp.canAddMore', { count: freeSlots })}
                  </p>
                </button>
              </div>

              {/* ─── Страны ─── */}
              {subscription.servers && subscription.servers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 lg:col-span-2">
                  {subscription.servers.map((server) => (
                    <span key={server.uuid} className="rv-chip">
                      {server.country_code && <span>{getFlagEmoji(server.country_code)}</span>}
                      <Twemoji
                        tag="span"
                        options={{ className: 'twemoji', folder: 'svg', ext: '.svg' }}
                      >
                        {server.name}
                      </Twemoji>
                    </span>
                  ))}
                </div>
              )}

              {/* ─── Автопродление ─── */}
              <div className="lg:col-span-2">
                <AutopayToggle
                  subscription={subscription}
                  subscriptionId={subscriptionId}
                  accentColor={zone.mainHex}
                  offColor={g.textGhost}
                />
                <RecurringPanels subscription={subscription} subscriptionId={subscriptionId} />
              </div>

              {/* ─── Купленные пакеты трафика ─── */}
              {subscription.traffic_purchases && subscription.traffic_purchases.length > 0 && (
                <section className="bento-card !p-5 lg:col-span-2">
                  <p className="rv-kicker">{t('subscription.purchasedTraffic')}</p>
                  <div className="mt-3 space-y-3">
                    {subscription.traffic_purchases.map((purchase) => (
                      <div key={purchase.id}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-base font-bold text-dark-100">
                            {purchase.traffic_gb} {t('common.units.gb')}
                          </span>
                          <span
                            className={`text-[13px] font-medium ${purchase.days_remaining === 0 ? 'text-[var(--rv-bad)]' : 'text-dark-400'}`}
                          >
                            {purchase.days_remaining === 0
                              ? t('subscription.expired')
                              : `${t('subscription.accounting.packageExpires')}: ${new Date(purchase.expires_at).toLocaleDateString(uiLocale())}`}
                          </span>
                        </div>
                        {subscription.traffic_accounting_mode === 'managed' &&
                          typeof purchase.remaining_gb === 'number' &&
                          Number.isFinite(purchase.remaining_gb) &&
                          purchase.remaining_gb >= 0 && (
                            <p className="mt-1 text-sm tabular-nums text-dark-300">
                              {t('subscription.accounting.packageRemaining', {
                                amount: formatTraffic(purchase.remaining_gb),
                              })}
                            </p>
                          )}
                        <div className="rv-meter mt-2 !h-2">
                          <i style={{ width: `${purchase.progress_percent}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ─── Действия ─── */}
              <section className="bento-card rv-actions !px-4 !py-1 lg:col-span-2">
                {showsAddonOptions(subscription) && subscription.traffic_limit_gb > 0 && (
                  <TrafficTopupSheet
                    open={showTrafficTopup}
                    onOpen={() => setShowTrafficTopup(true)}
                    onClose={() => setShowTrafficTopup(false)}
                    subscription={subscription}
                    subscriptionId={subscriptionId}
                    selectedTrafficPackage={selectedTrafficPackage}
                    onSelectedTrafficPackageChange={setSelectedTrafficPackage}
                    purchaseOptions={purchaseOptions}
                    isDark={isDark}
                  />
                )}
                <button
                  type="button"
                  id="devices"
                  onClick={() => setShowDevices((v) => !v)}
                  aria-expanded={showDevices}
                  className="rv-action scroll-mt-24"
                >
                  <div className="flex items-center gap-4">
                    <span className="rv-ic">
                      <RvPhoneIcon />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="rv-action-t">{t('rv.subp.myDevices')}</div>
                      <div className="text-sm">
                        {t('rv.subp.myDevicesHint', { count: connectedDevices })}
                      </div>
                    </div>
                    <ChevronRightIcon
                      className={`text-dark-400 transition-transform ${showDevices ? 'rotate-90' : ''}`}
                    />
                  </div>
                </button>
                {showDevices && (
                  <div className="rv-panel">
                    <DevicesPanel subscription={subscription} subscriptionId={subscriptionId} />
                  </div>
                )}
                {showsAddonOptions(subscription) && (
                  <>
                    <DeviceTopupSheet
                      open={showDeviceTopup}
                      onOpen={() => setShowDeviceTopup(true)}
                      onClose={() => setShowDeviceTopup(false)}
                      subscription={subscription}
                      subscriptionId={subscriptionId}
                      devicesToAdd={devicesToAdd}
                      onDevicesToAddChange={setDevicesToAdd}
                      purchaseOptions={purchaseOptions}
                      isDark={isDark}
                    />
                    <DeviceReductionSheet
                      open={showDeviceReduction}
                      onOpen={() => setShowDeviceReduction(true)}
                      onClose={() => setShowDeviceReduction(false)}
                      subscriptionPresent={!!subscription}
                      subscriptionId={subscriptionId}
                      targetDeviceLimit={targetDeviceLimit}
                      onTargetDeviceLimitChange={setTargetDeviceLimit}
                      isDark={isDark}
                    />
                    {!isTariffsMode && (
                      <ServerManagementSheet
                        open={showServerManagement}
                        onOpen={() => setShowServerManagement(true)}
                        onClose={() => setShowServerManagement(false)}
                        subscription={subscription}
                        subscriptionId={subscriptionId}
                        selectedServers={selectedServersToUpdate}
                        onSelectedServersChange={setSelectedServersToUpdate}
                        purchaseOptions={purchaseOptions}
                        isDark={isDark}
                      />
                    )}
                  </>
                )}
                {isTariffsMode && canOpenTariffSwitch(subscription) && (
                  <Link to={tariffSelectionPath(subscription.id)} className="rv-action">
                    <div className="flex items-center gap-4">
                      <span className="rv-ic rv-ic-acc">
                        <RvBoltIcon />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="rv-action-t">{t('rv.subp.switchTariff')}</div>
                        <div className="text-sm">{t('rv.subp.switchTariffHint')}</div>
                      </div>
                      <ChevronRightIcon className="text-dark-400" />
                    </div>
                  </Link>
                )}
                {displayedConnectionUrl && !shouldHideConnectionLink && (
                  <button type="button" onClick={copyUrl} className="rv-action">
                    <div className="flex items-center gap-4">
                      <span className={`rv-ic ${copied ? 'rv-ic-acc' : ''}`}>
                        {copied ? <RvCheckIcon /> : <RvCopyIcon />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="rv-action-t">
                          {copied ? t('rv.subp.copied') : t('rv.subp.copyLink')}
                        </div>
                        <div className="truncate text-sm">{t('rv.subp.copyLinkHint')}</div>
                      </div>
                    </div>
                  </button>
                )}
                {subscription.subscription_url && (
                  <Link
                    to={subscriptionId ? `/connection/qr?sub=${subscriptionId}` : '/connection/qr'}
                    className="rv-action"
                  >
                    <div className="flex items-center gap-4">
                      <span className="rv-ic">
                        <RvQrIcon />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="rv-action-t">{t('rv.subp.qr')}</div>
                        <div className="text-sm">{t('rv.subp.qrHint')}</div>
                      </div>
                      <ChevronRightIcon className="text-dark-400" />
                    </div>
                  </Link>
                )}
                {canReissueLink(subscription) && (
                  <div className="rv-action">
                    <ReissueLinkButton
                      subscription={subscription}
                      subscriptionId={subscriptionId}
                    />
                  </div>
                )}
              </section>
            </div>
          );
        })()
      ) : (
        <div className="bento-card py-12 text-center text-sm text-dark-400">
          {t('subscription.noSubscription')}
        </div>
      )}

      {/* Daily Subscription Pause */}
      {subscription && subscription.is_daily && !subscription.is_trial && (
        <div className="bento-card !p-5">
          <DailyPausePanel subscription={subscription} subscriptionId={subscriptionId} />
        </div>
      )}

      {/* Delete expired subscription */}
      {isMultiTariff &&
        subscription &&
        !subscription.is_active &&
        !subscription.is_trial &&
        !subscription.is_limited && (
          <div className="space-y-3">
            <DeleteSubscriptionSheet
              subscriptionId={subscription.id}
              open={showDeleteSheet}
              onOpen={() => setShowDeleteSheet(true)}
              onClose={() => setShowDeleteSheet(false)}
              textSecondary={g.textSecondary}
              onDeleted={() => {
                queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
                navigate('/subscriptions', { replace: true });
              }}
            />
          </div>
        )}
    </div>
  );
}
