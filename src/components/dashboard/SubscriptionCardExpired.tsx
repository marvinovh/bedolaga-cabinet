import { getLocalizedApiErrorMessage } from '@/utils/api-error-display';
import { uiLocale } from '@/utils/uiLocale';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import type { Subscription } from '../../types';
import { subscriptionApi } from '../../api/subscription';
import { useCurrency } from '../../hooks/useCurrency';
import { useHapticFeedback } from '../../platform/hooks/useHaptic';
import { getInsufficientBalanceError } from '../../utils/subscriptionHelpers';
import { needsTariff, tariffSelectionPath } from '../../utils/legacySubscription';
import { ClockIcon, ExclamationIcon, PlusIcon, SubscriptionIcon } from '@/components/icons';

interface SubscriptionCardExpiredProps {
  subscription: Subscription;
  balanceKopeks?: number;
  balanceRubles?: number;
  className?: string;
}

export default function SubscriptionCardExpired({
  subscription,
  balanceKopeks = 0,
  balanceRubles = 0,
  className,
}: SubscriptionCardExpiredProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { formatAmount, currencySymbol } = useCurrency();
  const haptic = useHapticFeedback();

  const [isRenewing, setIsRenewing] = useState(false);
  const [renewError, setRenewError] = useState<string | null>(null);

  const formattedDate = new Date(subscription.end_date).toLocaleDateString(uiLocale());

  // Detect limited (traffic exhausted) state
  const isLimited = subscription.is_limited;

  // Detect daily subscription (disabled or expired)
  const isDaily = subscription.is_daily;
  const isDisabledDaily = subscription.status === 'disabled' && isDaily;

  /*
   * Списывать с баланса прямо из карточки можно только там, где выбирать нечего:
   * суточный тариф стоит один день, а приостановленный просто возобновляется.
   *
   * Обычной подписке период выбирает клиент. Кнопка раньше молча продлевала на
   * 30 дней — то есть решала за него и мимо скидок за длинные периоды (месяц за
   * 600 ₽ против полугода со скидкой). Хуже того, тариф вообще мог не
   * продаваться месяцем: тогда сервер отвечал «период недоступен», и кнопка
   * выглядела сломанной. Теперь она открывает выбор периода текущего тарифа.
   */
  const isInstantRenew = isDisabledDaily || (isDaily && !!subscription.tariff_id);
  // Старая подписка (куплена в классике, тарифа нет): продлевать нечего,
  // единственная кнопка ведёт на витрину тарифов с этой подпиской.
  const requiresTariff = needsTariff(subscription);

  // For daily subs, check if balance covers daily price; otherwise 100 kopeks minimum
  const dailyPrice = subscription.daily_price_kopeks ?? 0;
  const hasBalance = isDaily ? balanceKopeks >= dailyPrice && dailyPrice > 0 : balanceKopeks >= 100;

  const handleQuickRenew = async () => {
    setIsRenewing(true);
    setRenewError(null);
    haptic.buttonPressHeavy();

    try {
      if (isDisabledDaily) {
        // Resume daily subscription via toggle pause endpoint
        await subscriptionApi.togglePause(subscription.id);
      } else if (isDaily && subscription.tariff_id) {
        // Expired daily tariff — purchase for 1 day. Pass subscription.id
        // so the backend resolves the EXACT row instead of doing a
        // (user_id, tariff_id) re-lookup that races with concurrent
        // panel webhooks (would surface as "Тариф уже активен" + refund).
        await subscriptionApi.purchaseTariff(subscription.tariff_id, 1, undefined, subscription.id);
      } else {
        // Сюда кнопка не ведёт: обычной подписке период выбирает клиент. Если
        // условия показа когда-нибудь разъедутся, открываем выбор периода, а не
        // списываем месяц молча.
        navigate(`/subscriptions/${subscription.id}/renew`);
        return;
      }
      haptic.success();
      queryClient.invalidateQueries({
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'subscription',
      });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-options'] });
    } catch (err: unknown) {
      haptic.error();
      const insufficientData = getInsufficientBalanceError(err);
      if (insufficientData) {
        setRenewError(t('dashboard.expired.insufficientFunds'));
      } else if (err instanceof AxiosError) {
        const detail = err.response?.data?.detail;
        if (typeof detail === 'string') {
          setRenewError(getLocalizedApiErrorMessage(err, t('dashboard.expired.renewError'), t));
        } else {
          setRenewError(t('dashboard.expired.renewError'));
        }
      } else {
        setRenewError(t('dashboard.expired.renewError'));
      }
    } finally {
      setIsRenewing(false);
    }
  };

  const handleTopUp = () => {
    haptic.buttonPress();
    const params = new URLSearchParams();
    params.set('returnTo', location.pathname);
    navigate(`/balance/top-up?${params.toString()}`);
  };

  // Цвет статуса: жёлтый — трафик кончился, красный — подписка закончилась/отключена.
  const tone = isLimited ? 'var(--rv-warn)' : 'var(--rv-bad)';
  const title = isLimited
    ? t('subscription.trafficLimitedTitle')
    : isDisabledDaily
      ? t('dashboard.suspended.title')
      : subscription.is_trial
        ? t('dashboard.expired.trialTitle')
        : t('dashboard.expired.title');

  const primary = 'btn btn-primary rv-btn-lg w-full sm:w-auto';

  return (
    <section className={`bento-card !p-5 sm:!p-8 ${className ?? ''}`} style={{ borderColor: tone }}>
      <div className="flex items-center justify-between gap-3">
        <p className="rv-kicker min-w-0 truncate" style={{ color: tone }}>
          <span className="truncate">{title}</span>
        </p>
        <span className="badge-neutral shrink-0">
          {isLimited ? (
            <ExclamationIcon className="h-3.5 w-3.5" />
          ) : (
            <ClockIcon className="h-3.5 w-3.5" />
          )}
          {isLimited ? t('rv.limited') : t('rv.notWorking')}
        </span>
      </div>

      <h2 className="rv-d mt-5 text-[56px] text-dark-100 sm:text-[80px]">
        {t('rv.vpn')}{' '}
        <span
          className="rv-pill inline-block px-[0.18em] !text-[#111]"
          style={{ background: tone }}
        >
          {isLimited ? t('rv.paused') : t('rv.notWorking')}
        </span>
      </h2>

      {isLimited && (
        <p className="mt-4 text-base text-dark-300">
          {t('subscription.trafficLimitedDescription')}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-[15px] text-dark-300">
        <span>
          {isLimited
            ? t('dashboard.expired.activeUntil')
            : t('dashboard.expired.expiredDate', {
                context: subscription.is_trial ? 'trial' : '',
              })}{' '}
          <b className="text-dark-100">{formattedDate}</b>
        </span>
        <span>
          {t('dashboard.expired.balance')}{' '}
          <b className={hasBalance ? 'text-accent-400' : 'text-dark-100'}>
            {formatAmount(balanceRubles)}
            {'\u00A0'}
            {currencySymbol}
          </b>
        </span>
      </div>

      {renewError && (
        <div
          className="mt-4 rounded-xl bg-[var(--rv-bad-bg)] p-3 text-center text-sm font-medium text-[var(--rv-bad)]"
          role="alert"
        >
          {renewError}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        {isLimited ? (
          <Link
            to={
              requiresTariff
                ? tariffSelectionPath(subscription.id)
                : `/subscriptions/${subscription.id}`
            }
            className={primary}
          >
            <PlusIcon className="h-5 w-5" />
            {requiresTariff ? t('subscription.cta.moveToTariff') : t('subscription.buyTraffic')}
          </Link>
        ) : (
          <>
            {!subscription.is_trial &&
              (!isInstantRenew ? (
                <Link
                  to={
                    requiresTariff
                      ? tariffSelectionPath(subscription.id)
                      : `/subscriptions/${subscription.id}/renew`
                  }
                  onClick={() => haptic.buttonPressHeavy()}
                  className={primary}
                >
                  <SubscriptionIcon className="h-5 w-5" />
                  {requiresTariff
                    ? t('subscription.cta.moveToTariff')
                    : t('dashboard.expired.quickRenew')}
                </Link>
              ) : hasBalance ? (
                <button
                  type="button"
                  onClick={handleQuickRenew}
                  disabled={isRenewing}
                  className={primary}
                >
                  {isRenewing ? (
                    <span
                      className="h-5 w-5 animate-spin rounded-full border-2 border-current/30 border-t-current"
                      aria-hidden="true"
                    />
                  ) : (
                    <SubscriptionIcon className="h-5 w-5" />
                  )}
                  {isRenewing
                    ? t('common.loading')
                    : isDisabledDaily
                      ? t('dashboard.suspended.resume')
                      : t('dashboard.expired.quickRenew')}
                </button>
              ) : (
                <button type="button" onClick={handleTopUp} className={primary}>
                  <PlusIcon className="h-5 w-5" />
                  {t('dashboard.expired.topUp')}
                </button>
              ))}

            {!requiresTariff && (
              <Link
                to="/subscription/purchase"
                className={
                  subscription.is_trial ? primary : 'btn btn-secondary rv-btn-lg w-full sm:w-auto'
                }
              >
                {t('dashboard.expired.tariffs')}
              </Link>
            )}
          </>
        )}
      </div>
    </section>
  );
}
