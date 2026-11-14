import { tariffTrafficLabel } from '../../../utils/tariffTrafficLabel';
import { useTranslation } from 'react-i18next';
import { BestValueBadge } from '../BestValueBadge';
import { Link, useNavigate } from 'react-router';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { subscriptionApi } from '../../../api/subscription';
import { Trans } from 'react-i18next';
import { useCurrency } from '../../../hooks/useCurrency';
import { usePromoDiscount } from '../../../hooks/usePromoDiscount';
import { dailyPriceQuote } from './dailyPrice';
import { ArrowRightIcon, GiftIcon, InfoIcon } from '@/components/icons';
import { RvCheckIcon } from '@/components/rv';
import { cn } from '@/lib/utils';
import type { Tariff, Subscription, PurchaseOptions } from '../../../types';
import { tariffAction } from './tariffAction';

// ──────────────────────────────────────────────────────────────────
// TariffPickerGrid
//
// The tariff selection surface inside SubscriptionPurchase. Renders:
//   - an optional promo-group banner when any tariff carries a
//     promo_group_name
//   - the "all tariffs purchased" empty state (multi-tariff mode)
//   - the grid itself (1 col mobile, 2 cols sm+) with promo prices,
//     per-tariff CTAs differentiated by user state (extend / switch /
//     purchase / legacy renewal)
//
// Owns nothing — pure presentation that calls back into the parent
// for selection (`onSelectTariff`) and switch (`onSwitchTariff`).
// ──────────────────────────────────────────────────────────────────

export interface TariffPickerGridProps {
  tariffs: Tariff[];
  subscription: Subscription | null;
  purchaseOptions: PurchaseOptions | undefined;
  isTariffsMode: boolean;
  isMultiTariff: boolean;
  subscriptionId?: number;
  switchSelection?: boolean;
  /** periodDays — период, выбранный переключателем витрины. */
  onSelectTariff: (tariff: Tariff, periodDays?: number) => void;
  onSwitchTariff: (tariffId: number) => void;
}

/** Сроки длиннее этого — «навсегда» (999 дн.): не в переключателе, карточкой внизу. */
const LIFETIME_MIN_DAYS = 400;

/**
 * Витрина тарифов — макет «05 · Выбор тарифа»: переключатель периода со
 * скидками, тарифы радио-карточками (выбранный — лаймовый с галочкой), цена за
 * выбранный период и закреплённая панель «к оплате». Что делает нажатие —
 * по-прежнему решает tariffAction().
 */
export function TariffPickerGrid({
  tariffs,
  subscription,
  purchaseOptions,
  isTariffsMode,
  isMultiTariff,
  subscriptionId,
  switchSelection = false,
  onSelectTariff,
  onSwitchTariff,
}: TariffPickerGridProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { formatAmount, currencySymbol } = useCurrency();
  const { applyPromoDiscount } = usePromoDiscount();

  const money = (kopeks: number) =>
    kopeks === 0
      ? t('subscription.free', 'Бесплатно')
      : `${formatAmount(kopeks / 100, kopeks % 100 === 0 ? 0 : 2)}\u00A0${currencySymbol}`;
  const num = (kopeks: number) => formatAmount(kopeks / 100, kopeks % 100 === 0 ? 0 : 2);

  // Купленные тарифы (мульти-тариф) не прячем: карточка ведёт на продление.
  const { data: subsList } = useQuery({
    queryKey: ['subscriptions-list'],
    queryFn: () => subscriptionApi.getSubscriptions(),
    staleTime: 60_000,
    enabled: !!isMultiTariff,
  });
  const purchasedSubId = (tariff: Tariff) =>
    isMultiTariff && tariff.is_purchased
      ? subsList?.subscriptions?.find((sub) => sub.tariff_id === tariff.id)?.id
      : undefined;

  const visible = useMemo(
    () =>
      tariffs.filter((tariff) => {
        if (subscription?.is_trial && tariff.name.toLowerCase().includes('trial')) return false;
        return true;
      }),
    [tariffs, isMultiTariff, subscription?.is_trial],
  );
  const daily = visible.filter((tariff) => dailyPriceQuote(tariff, applyPromoDiscount));
  const periodicAll = visible.filter((tariff) => !dailyPriceQuote(tariff, applyPromoDiscount));
  const isLifetimeOnly = (tariff: Tariff) =>
    tariff.periods.length > 0 && tariff.periods.every((p) => p.days >= LIFETIME_MIN_DAYS);
  // Обычные тарифы — в сетке под переключателем; «навсегда» и посуточные — внизу.
  const periodic = periodicAll.filter((tariff) => !isLifetimeOnly(tariff));
  const lifetime = periodicAll.filter(isLifetimeOnly);

  // Периоды переключателя: все сроки обычных тарифов, кроме «навсегда».
  const periods = useMemo(
    () =>
      [
        ...new Set(
          periodic.flatMap((tariff) =>
            tariff.periods.filter((p) => p.days < LIFETIME_MIN_DAYS).map((p) => p.days),
          ),
        ),
      ].sort((a, b) => a - b),
    [periodic],
  );
  // Скидка периода — к цене месяца того же тарифа (среднее по тарифам).
  const periodDiscount = (days: number) => {
    const rates = periodic
      .map((tariff) => {
        const month = tariff.periods.find((p) => p.days === 30);
        const per = tariff.periods.find((p) => p.days === days);
        if (!month || !per || days <= 30) return null;
        return 1 - per.price_kopeks / (days / 30) / month.price_kopeks;
      })
      .filter((v): v is number => v !== null);
    if (!rates.length) return 0;
    return Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100);
  };

  const [periodDays, setPeriodDays] = useState<number | undefined>(() =>
    periods.includes(30) ? 30 : periods[0],
  );
  const activePeriod =
    periodDays !== undefined && periods.includes(periodDays) ? periodDays : periods[0];

  const allCards = [...periodic, ...lifetime, ...daily];
  const defaultTariff =
    allCards.find((tariff) => tariff.is_current || tariff.id === subscription?.tariff_id) ??
    periodic.find((tariff) => tariff.is_highlighted) ??
    allCards[0];
  const [selectedId, setSelectedId] = useState<number | undefined>(defaultTariff?.id);
  const selected = allCards.find((tariff) => tariff.id === selectedId) ?? defaultTariff;

  const ordered = [...periodic].sort(
    (a, b) => Number(!!b.is_highlighted) - Number(!!a.is_highlighted),
  );
  const highlighted = periodic.find((tariff) => tariff.is_highlighted);

  type Quote = {
    promo: { price: number; original?: number | null };
    unit: string;
    days?: number;
    perMonth?: number;
    saving?: number;
  };
  const quote = (tariff: Tariff): Quote | null => {
    const d = dailyPriceQuote(tariff, applyPromoDiscount);
    if (d) return { promo: d, unit: t('rv.pick.perDay') };
    if (isLifetimeOnly(tariff)) {
      const period = [...tariff.periods].sort((a, b) => b.days - a.days)[0];
      const promo = applyPromoDiscount(period.price_kopeks, period.original_price_kopeks);
      return { promo, unit: t('rv.pick.forever'), days: period.days };
    }
    const period = tariff.periods.find((p) => p.days === activePeriod);
    if (!period || activePeriod === undefined) return null;
    const promo = applyPromoDiscount(period.price_kopeks, period.original_price_kopeks);
    const month = tariff.periods.find((p) => p.days === 30);
    const perMonth = Math.round(promo.price / Math.max(1, activePeriod / 30) / 100) * 100;
    const saving =
      month && activePeriod > 30
        ? Math.round((1 - period.price_kopeks / (activePeriod / 30) / month.price_kopeks) * 100)
        : 0;
    return {
      promo,
      unit: t('rv.pick.days', { count: activePeriod }),
      days: activePeriod,
      perMonth: activePeriod > 30 ? perMonth : undefined,
      saving,
    };
  };

  const selectedAction = selected
    ? tariffAction({
        tariff: selected,
        subscription,
        purchaseOptions,
        isTariffsMode,
        isMultiTariff,
        subscriptionId,
      })
    : null;
  const selectedQuote = selected ? quote(selected) : null;
  const balance =
    purchaseOptions && 'balance_kopeks' in purchaseOptions
      ? purchaseOptions.balance_kopeks
      : undefined;

  const renewSubId = selected ? purchasedSubId(selected) : undefined;
  const go = () => {
    if (selected && isMultiTariff && selected.is_purchased) {
      navigate(renewSubId ? `/subscriptions/${renewSubId}/renew` : '/subscriptions');
      return;
    }
    if (!selected || !selectedAction || selectedAction === 'current-daily') return;
    if (selectedAction === 'switch') onSwitchTariff(selected.id);
    else onSelectTariff(selected, selectedQuote?.days);
  };

  const specs = (tariff: Tariff) =>
    [
      tariffTrafficLabel(tariff.traffic_limit_gb, t),
      tariff.device_limit === 0 ? '∞' : t('subscription.devices', { count: tariff.device_limit }),
      tariff.servers_count ? t('rv.pick.countries', { count: tariff.servers_count }) : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const allPurchased =
    isMultiTariff &&
    purchaseOptions &&
    'all_tariffs_purchased' in purchaseOptions &&
    purchaseOptions.all_tariffs_purchased;

  const renderCard = (tariff: Tariff) => {
    const isSel = tariff.id === selected?.id;
    const q = quote(tariff);
    const isCurrent = tariff.is_current || tariff.id === subscription?.tariff_id;
    const owned = isMultiTariff && !!tariff.is_purchased;
    return (
      <button
        key={tariff.id}
        type="button"
        role="radio"
        aria-checked={isSel}
        disabled={!q}
        onClick={() => setSelectedId(tariff.id)}
        className={cn(
          'bento-card relative flex flex-col !overflow-visible !p-5 text-left transition-transform disabled:opacity-50',
          isSel ? 'rv-card-acc rv-shadow' : 'hover:border-dark-600',
        )}
      >
        {(tariff.is_highlighted || isCurrent || owned) && (
          <span className="absolute -top-3 left-4 flex gap-1.5">
            {tariff.is_highlighted && <BestValueBadge />}
            {owned && !isCurrent && <span className="rv-badge">{t('rv.pick.owned')}</span>}
            {isCurrent && (
              <span className="rv-badge rv-badge-lime">{t('subscription.currentTariff')}</span>
            )}
          </span>
        )}
        <span className="flex items-start justify-between gap-3">
          <span className="rv-d text-[30px] text-dark-100">{tariff.name}</span>
          <span
            className={cn(
              'grid h-7 w-7 shrink-0 place-items-center rounded-full border-2',
              isSel
                ? 'border-[#111] bg-[#111] text-[rgb(var(--color-accent-500))]'
                : 'border-dark-400',
            )}
            aria-hidden="true"
          >
            {isSel && <RvCheckIcon className="h-4 w-4" />}
          </span>
        </span>
        {tariff.description && (
          <span className="mt-1.5 whitespace-pre-line text-[15px] leading-snug text-dark-300">
            {tariff.description}
          </span>
        )}
        {/* Цена и характеристики прижаты к низу — карточки в ряду выровнены */}
        <span className="mt-auto flex flex-col pt-4">
          {q ? (
            <>
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="rv-num text-[52px] text-dark-100">
                  {num(q.promo.price)}
                  <span className="rv-rub">{currencySymbol}</span>
                </span>
                {q.promo.original && q.promo.original > q.promo.price && (
                  <span className="text-sm text-dark-400 line-through">
                    {money(q.promo.original)}
                  </span>
                )}
                <span className="text-[15px] text-dark-300">/ {q.unit}</span>
              </span>
              {q.perMonth !== undefined && (
                <span className="mt-1 text-[13px] text-dark-400">
                  ≈ {money(q.perMonth)} {t('rv.pick.perMonth')}
                  {q.saving && q.saving > 0
                    ? ` · ${t('rv.pick.saving', { percent: q.saving })}`
                    : ''}
                </span>
              )}
            </>
          ) : (
            <span className="text-sm text-dark-400">{t('rv.pick.noPeriod')}</span>
          )}
          <span className="mt-4 border-t-2 border-dark-700 pt-3 text-[15px] font-bold text-dark-100">
            {specs(tariff)}
          </span>
        </span>
      </button>
    );
  };

  return (
    <>
      {tariffs.some((tariff) => tariff.promo_group_name) && (
        <div className="mb-3 flex items-center gap-3 rounded-2xl bg-[var(--rv-acc-bg)] p-3.5">
          <span className="rv-ic rv-ic-acc">
            <GiftIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-bold text-dark-100">
              {t('subscription.promoGroup.yourGroup', {
                name: tariffs.find((tariff) => tariff.promo_group_name)?.promo_group_name,
              })}
            </div>
            <div className="text-xs text-dark-400">
              {t('subscription.promoGroup.personalDiscountsApplied')}
            </div>
          </div>
        </div>
      )}

      {allPurchased && visible.length === 0 && (
        <div className="bento-card !p-6 text-center">
          <h3 className="rv-d text-[32px] text-dark-100">
            {t('subscription.allTariffsPurchased', 'Все тарифы подключены')}
          </h3>
          <p className="mt-2 text-sm text-dark-400">
            {t(
              'subscription.allTariffsPurchasedDesc',
              'Вы уже приобрели все доступные тарифы. Продлить подписку можно на странице тарифа.',
            )}
          </p>
          <button onClick={() => navigate('/subscriptions')} className="btn btn-primary mt-4">
            {t('subscription.backToList', 'Мои подписки')}
          </button>
        </div>
      )}

      {periods.length > 1 && (
        <div className="rv-seg mt-7" role="tablist">
          {periods.map((days) => {
            const discount = periodDiscount(days);
            return (
              <button
                key={days}
                type="button"
                role="tab"
                aria-selected={days === activePeriod}
                className={days === activePeriod ? 'on' : undefined}
                onClick={() => setPeriodDays(days)}
              >
                {t('rv.pick.days', { count: days })}
                {discount > 0 && <em>−{discount}%</em>}
              </button>
            );
          })}
        </div>
      )}

      {highlighted && periodic.length > 1 && (
        <div className="bento-card rv-card-dash mt-3 flex items-start gap-3 !p-4">
          <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent-400" />
          <p className="text-[15px] leading-snug text-dark-200">
            <Trans
              i18nKey="rv.pick.hint"
              values={{ name: highlighted.name }}
              components={{ b: <b className="font-bold text-dark-100" /> }}
            />
          </p>
        </div>
      )}

      <div
        className="mt-6 grid grid-cols-1 gap-x-3 gap-y-6 lg:grid-cols-3 lg:gap-x-5 lg:gap-y-8"
        role="radiogroup"
      >
        {ordered.map((tariff) => renderCard(tariff))}
      </div>

      {(lifetime.length > 0 || daily.length > 0) && (
        <>
          <p className="rv-kicker mt-6">{t('rv.pick.special')}</p>
          <div
            className="mt-6 grid grid-cols-1 gap-x-3 gap-y-6 lg:grid-cols-3 lg:gap-x-5 lg:gap-y-8"
            role="radiogroup"
          >
            {[...lifetime, ...daily].map((tariff) => renderCard(tariff))}
          </div>
        </>
      )}

      {/* Закреплённая панель «к оплате» */}
      {selected &&
        selectedQuote &&
        ((isMultiTariff && selected.is_purchased) ||
          (selectedAction && selectedAction !== 'current-daily')) && (
          <div className="sticky bottom-0 z-30 -mx-4 mt-5 border-t-2 border-dark-700 bg-dark-950 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4 lg:mx-0 lg:rounded-[22px] lg:border-2 lg:p-5">
            <div className="lg:flex lg:items-center lg:gap-6">
              <div className="flex items-end justify-between gap-3 lg:flex-1">
                <div className="min-w-0">
                  <div className="truncate text-base font-bold text-dark-100">
                    {selected.name} · {selectedQuote.unit}
                  </div>
                  {balance !== undefined && (
                    <div className="text-[13px] text-dark-400">
                      {t('rv.pick.balanceNote', { amount: money(balance) })}
                    </div>
                  )}
                </div>
                <div className="rv-num shrink-0 text-[40px] text-dark-100">
                  {num(selectedQuote.promo.price)}
                  <span className="rv-rub">{currencySymbol}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={go}
                className="btn btn-primary rv-btn-lg mt-3 w-full lg:mt-0 lg:w-auto lg:min-w-[320px]"
                aria-label={
                  switchSelection
                    ? `${selected.name}: ${t('subscription.switchTariff.choose')}`
                    : undefined
                }
              >
                {isMultiTariff && selected.is_purchased
                  ? t('rv.pick.renew')
                  : selectedAction === 'switch'
                    ? t(
                        switchSelection
                          ? 'subscription.switchTariff.choose'
                          : 'subscription.switchTariff.switch',
                      )
                    : selectedAction === 'moveToTariff'
                      ? t('subscription.cta.moveToTariff')
                      : t('rv.pick.toPayment')}
                <ArrowRightIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      <Link to="/balance" className="sr-only">
        {t('nav.balance')}
      </Link>
    </>
  );
}
