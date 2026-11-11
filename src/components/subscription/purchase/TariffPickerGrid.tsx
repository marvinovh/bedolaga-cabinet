import { tariffTrafficLabel } from '../../../utils/tariffTrafficLabel';
import { useTranslation } from 'react-i18next';
import { BestValueBadge } from '../BestValueBadge';
import { Link, useNavigate } from 'react-router';
import { useMemo, useState } from 'react';
import { Trans } from 'react-i18next';
import { useCurrency } from '../../../hooks/useCurrency';
import { usePromoDiscount } from '../../../hooks/usePromoDiscount';
import { dailyPriceQuote } from './dailyPrice';
import { ArrowRightIcon, ChevronDownIcon, GiftIcon, InfoIcon } from '@/components/icons';
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

const VISIBLE_TARIFFS = 3;

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
  const [showAll, setShowAll] = useState(false);

  const money = (kopeks: number) =>
    kopeks === 0
      ? t('subscription.free', 'Бесплатно')
      : `${formatAmount(kopeks / 100, kopeks % 100 === 0 ? 0 : 2)}\u00A0${currencySymbol}`;
  const num = (kopeks: number) => formatAmount(kopeks / 100, kopeks % 100 === 0 ? 0 : 2);

  const visible = useMemo(
    () =>
      tariffs.filter((tariff) => {
        if (isMultiTariff && tariff.is_purchased) return false;
        if (subscription?.is_trial && tariff.name.toLowerCase().includes('trial')) return false;
        return true;
      }),
    [tariffs, isMultiTariff, subscription?.is_trial],
  );
  const daily = visible.filter((tariff) => dailyPriceQuote(tariff, applyPromoDiscount));
  const periodic = visible.filter((tariff) => !dailyPriceQuote(tariff, applyPromoDiscount));

  // Периоды переключателя: все сроки, что продаются хоть одним тарифом.
  const periods = useMemo(
    () =>
      [...new Set(periodic.flatMap((tariff) => tariff.periods.map((p) => p.days)))].sort(
        (a, b) => a - b,
      ),
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
    periods.includes(90) ? 90 : periods[0],
  );
  const activePeriod =
    periodDays !== undefined && periods.includes(periodDays) ? periodDays : periods[0];

  const defaultTariff =
    periodic.find((tariff) => tariff.is_current || tariff.id === subscription?.tariff_id) ??
    periodic.find((tariff) => tariff.is_highlighted) ??
    periodic[0];
  const [selectedId, setSelectedId] = useState<number | undefined>(defaultTariff?.id);
  const selected = periodic.find((tariff) => tariff.id === selectedId) ?? defaultTariff;

  const ordered = [...periodic].sort(
    (a, b) => Number(!!b.is_highlighted) - Number(!!a.is_highlighted),
  );
  const shown = showAll ? ordered : ordered.slice(0, VISIBLE_TARIFFS);
  const hidden = ordered.slice(VISIBLE_TARIFFS);
  const highlighted = periodic.find((tariff) => tariff.is_highlighted);

  const quote = (tariff: Tariff) => {
    const period = tariff.periods.find((p) => p.days === activePeriod);
    if (!period) return null;
    const promo = applyPromoDiscount(period.price_kopeks, period.original_price_kopeks);
    const month = tariff.periods.find((p) => p.days === 30);
    const perMonth = Math.round(promo.price / Math.max(1, activePeriod / 30) / 100) * 100;
    const saving =
      month && activePeriod > 30
        ? Math.round((1 - period.price_kopeks / (activePeriod / 30) / month.price_kopeks) * 100)
        : 0;
    return { promo, perMonth, saving };
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

  const go = () => {
    if (!selected || !selectedAction || selectedAction === 'current-daily') return;
    if (selectedAction === 'switch') onSwitchTariff(selected.id);
    else onSelectTariff(selected, activePeriod);
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

      {allPurchased && (
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

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3 lg:gap-5" role="radiogroup">
        {shown.map((tariff) => {
          const isSel = tariff.id === selected?.id;
          const q = quote(tariff);
          const isCurrent = tariff.is_current || tariff.id === subscription?.tariff_id;
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
                (tariff.is_highlighted || isCurrent) && 'mt-3',
              )}
            >
              {(tariff.is_highlighted || isCurrent) && (
                <span className="absolute -top-3 left-4 flex gap-1.5">
                  {tariff.is_highlighted && <BestValueBadge />}
                  {isCurrent && (
                    <span className="rv-badge rv-badge-lime">
                      {t('subscription.currentTariff')}
                    </span>
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
              {q ? (
                <>
                  <span className="mt-4 flex items-baseline gap-2">
                    <span className="rv-num text-[52px] text-dark-100">
                      {num(q.promo.price)}
                      <span className="rv-rub">{currencySymbol}</span>
                    </span>
                    {q.promo.original && q.promo.original > q.promo.price && (
                      <span className="text-sm text-dark-400 line-through">
                        {money(q.promo.original)}
                      </span>
                    )}
                    <span className="text-[15px] text-dark-300">
                      / {t('rv.pick.days', { count: activePeriod })}
                    </span>
                  </span>
                  {activePeriod > 30 && (
                    <span className="mt-1 text-[13px] text-dark-400">
                      ≈ {money(q.perMonth)} {t('rv.pick.perMonth')}
                      {q.saving > 0 ? ` · ${t('rv.pick.saving', { percent: q.saving })}` : ''}
                    </span>
                  )}
                </>
              ) : (
                <span className="mt-4 text-sm text-dark-400">{t('rv.pick.noPeriod')}</span>
              )}
              <span className="mt-4 border-t-2 border-dark-700 pt-3 text-[15px] font-bold text-dark-100">
                {specs(tariff)}
              </span>
            </button>
          );
        })}
      </div>

      {hidden.length > 0 && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="bento-card rv-card-dash mt-3 flex w-full items-center justify-between gap-3 !p-4 text-left font-bold text-dark-100"
        >
          <span className="min-w-0 truncate">
            {t('rv.pick.more', {
              count: hidden.length,
              names: hidden.map((x) => x.name).join(', '),
            })}
          </span>
          <ChevronDownIcon className="h-5 w-5 shrink-0" />
        </button>
      )}

      {daily.map((tariff) => {
        const d = dailyPriceQuote(tariff, applyPromoDiscount);
        if (!d) return null;
        const action = tariffAction({
          tariff,
          subscription,
          purchaseOptions,
          isTariffsMode,
          isMultiTariff,
          subscriptionId,
        });
        return (
          <p key={tariff.id} className="mt-4 text-center text-[15px] text-dark-300">
            {t('rv.pick.dailyPrefix')}{' '}
            {action === 'current-daily' ? (
              <b className="text-dark-100">{t('subscription.currentTariff')}</b>
            ) : (
              <button
                type="button"
                className="link"
                onClick={() =>
                  action === 'switch' ? onSwitchTariff(tariff.id) : onSelectTariff(tariff)
                }
              >
                {t('rv.pick.daily', { name: tariff.name, price: money(d.price) })}
              </button>
            )}
          </p>
        );
      })}

      {/* Закреплённая панель «к оплате» */}
      {selected && selectedQuote && selectedAction && selectedAction !== 'current-daily' && (
        <div className="sticky bottom-0 z-30 -mx-4 mt-5 border-t-2 border-dark-700 bg-dark-950 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4 lg:mx-0 lg:rounded-[22px] lg:border-2 lg:p-5">
          <div className="lg:flex lg:items-center lg:gap-6">
            <div className="flex items-end justify-between gap-3 lg:flex-1">
              <div className="min-w-0">
                <div className="truncate text-base font-bold text-dark-100">
                  {selected.name} · {t('rv.pick.days', { count: activePeriod })}
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
              {selectedAction === 'switch'
                ? t('subscription.switchTariff.switch')
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
