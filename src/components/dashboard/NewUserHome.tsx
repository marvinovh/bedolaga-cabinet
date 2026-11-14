import { useState } from 'react';
import { Link } from 'react-router';
import { Trans, useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import type { UseMutationResult } from '@tanstack/react-query';

import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { usePromoDiscount } from '@/hooks/usePromoDiscount';
import { uiLocale } from '@/utils/uiLocale';
import { tariffTrafficLabel } from '@/utils/tariffTrafficLabel';
import { dailyPriceQuote } from '@/components/subscription/purchase/dailyPrice';
import { ArrowRightIcon, ChevronRightIcon, StarIcon } from '@/components/icons';
import { RvCardIcon, RvCheckIcon, RvChatIcon, RvGiftIcon } from '@/components/rv';
import type { Subscription, Tariff, TrialInfo } from '@/types';

const PLATFORMS = [
  'iPhone и iPad',
  'Android',
  'Windows',
  'macOS',
  'Android TV',
  'Apple TV',
  'Linux',
];

/**
 * Главная нового пользователя — макеты «02e · Главная — новичок, пробный период»
 * (телефон) и «19 · Главная новичка на компьютере». Три состояния: пробный ещё
 * не включён, пробный включён (но устройство не подключено) и пробный
 * недоступен — тогда герой ведёт сразу к тарифам.
 */
export function NewUserHome({
  userName,
  groupName,
  trialInfo,
  trialSub,
  activateTrialMutation,
  trialError,
  balanceKopeks,
  tariffs,
  referralPercent,
  referralEnabled,
  heroOnly = false,
  orPickTo,
}: {
  userName: string;
  groupName?: string | null;
  trialInfo?: TrialInfo;
  /** Пробная подписка уже включена — состояние «Готово. Теперь подключаемся». */
  trialSub?: Subscription | null;
  activateTrialMutation: UseMutationResult<unknown, unknown, void, unknown>;
  trialError: string | null;
  balanceKopeks: number;
  tariffs?: Tariff[];
  referralPercent?: number;
  referralEnabled: boolean;
  /** Только лаймовый герой (для «Моих подписок» без подписок). */
  heroOnly?: boolean;
  /** Куда ведёт «или сразу выбрать тариф»; без него — к тарифам ниже на главной. */
  orPickTo?: string;
}) {
  const { t } = useTranslation();
  const { formatAmount, currencySymbol } = useCurrency();
  const { applyPromoDiscount } = usePromoDiscount();
  const [showQr, setShowQr] = useState(false);

  const money = (kopeks: number) =>
    `${formatAmount(kopeks / 100, kopeks % 100 ? 2 : 0)} ${currencySymbol}`;

  const done = !!trialSub;
  const trialOn = !done && !!trialInfo?.is_available;
  const paidTrial = trialOn && !!trialInfo?.requires_payment && trialInfo.price_kopeks > 0;
  const canAfford = !paidTrial || balanceKopeks >= (trialInfo?.price_kopeks ?? 0);

  // Тарифы «вторым планом»: обычные помесячные, по цене месяца.
  const monthly = (tariffs ?? [])
    .filter((tariff) => !dailyPriceQuote(tariff, applyPromoDiscount))
    .map((tariff) => {
      const period =
        tariff.periods.find((p) => p.days === 30) ??
        [...tariff.periods].filter((p) => p.days < 400).sort((a, b) => a.days - b.days)[0];
      return period
        ? {
            tariff,
            days: period.days,
            price: applyPromoDiscount(period.price_kopeks, period.original_price_kopeks).price,
          }
        : null;
    })
    .filter((x): x is { tariff: Tariff; days: number; price: number } => x !== null);
  const cheapest = [...monthly].sort((a, b) => a.price - b.price)[0];
  const other =
    monthly.find((m) => m !== cheapest && m.tariff.is_highlighted) ??
    monthly.find((m) => m !== cheapest);
  const specs = (tariff: Tariff) =>
    [
      tariffTrafficLabel(tariff.traffic_limit_gb, t),
      tariff.device_limit === 0 ? '∞' : t('subscription.devices', { count: tariff.device_limit }),
      tariff.servers_count ? t('rv.pick.countries', { count: tariff.servers_count }) : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const until = trialSub?.end_date
    ? new Date(trialSub.end_date).toLocaleString(uiLocale(), {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const activate = () => {
    if (!activateTrialMutation.isPending) activateTrialMutation.mutate();
  };

  const trialStats = trialInfo
    ? [
        { n: trialInfo.duration_days, l: t('rv.nu.statDays', { count: trialInfo.duration_days }) },
        trialInfo.traffic_limit_gb > 0
          ? { n: trialInfo.traffic_limit_gb, l: t('rv.nu.statGb') }
          : { n: '∞', l: t('rv.nu.statTraffic') },
        trialInfo.device_limit > 0
          ? {
              n: trialInfo.device_limit,
              l: t('rv.nu.statDevices', { count: trialInfo.device_limit }),
            }
          : { n: '∞', l: t('rv.nu.statDevicesAny') },
      ]
    : [];

  const InkArrowBtn = ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {children}
      <ArrowRightIcon className="h-5 w-5" />
    </span>
  );

  /* ───────── Герой ───────── */
  const hero = (
    <section className="bento-card rv-card-acc rv-topo flex flex-col gap-4 !rounded-[26px] !px-5 !pb-5 !pt-[22px] lg:flex-[1.4_1_560px] lg:gap-5 lg:!rounded-[30px] lg:!p-9">
      {done ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="rv-kicker">{t('rv.nu.trialKicker')}</p>
            <span className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-full bg-[#111] px-2.5 py-[7px] text-xs font-bold leading-none text-[rgb(var(--color-accent-500))]">
              <i className="rv-dot ping" />
              {t('rv.nu.on')}
            </span>
          </div>
          <h1 className="rv-d text-[56px] lg:text-[clamp(72px,7vw,112px)]">
            {t('rv.nu.doneA')}{' '}
            <span className="rv-pill rv-pill-ink inline-block">{t('rv.nu.doneB')}</span>
          </h1>
          <p className="text-base font-medium leading-snug lg:max-w-[30em] lg:text-lg lg:leading-[1.45]">
            <Trans
              i18nKey="rv.nu.doneText"
              values={{ date: until }}
              components={{ b: <b className="font-bold" /> }}
            />
            <span className="hidden lg:inline"> {t('rv.nu.doneQr')}</span>
          </p>
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
            <Link
              to={`/connection?sub=${trialSub?.id}`}
              className="btn rv-btn-lg rv-btn-ink w-full lg:w-auto"
            >
              <InkArrowBtn>
                <span className="lg:hidden">{t('rv.connectDevice')}</span>
                <span className="hidden lg:inline">{t('rv.connectThisPc')}</span>
              </InkArrowBtn>
            </Link>
            <button
              type="button"
              onClick={() => setShowQr((v) => !v)}
              className="btn rv-btn-lg rv-btn-ghost-ink hidden lg:inline-flex"
            >
              {t('rv.nu.qrPhone')}
            </button>
          </div>
          {showQr && trialSub && (
            <div className="hidden items-center gap-4 lg:flex">
              <div className="shrink-0 rounded-xl bg-white p-2">
                <QRCodeSVG
                  value={`${window.location.origin}/connection?sub=${trialSub.id}`}
                  size={132}
                  level="M"
                />
              </div>
              <p className="max-w-[22em] text-[15px] font-medium leading-snug">
                {t('rv.connectPhoneText')}
              </p>
            </div>
          )}
        </>
      ) : trialOn && trialInfo ? (
        <>
          <p className="rv-kicker">{t('rv.nu.kicker')}</p>
          <h1 className="rv-d text-[72px] lg:text-[clamp(80px,8vw,124px)]">
            {t('rv.nu.days', { count: trialInfo.duration_days })}
            <br className="lg:hidden" />{' '}
            <span className="rv-pill rv-pill-ink inline-block">
              {paidTrial
                ? t('rv.nu.forPrice', { price: money(trialInfo.price_kopeks) })
                : t('rv.nu.free')}
            </span>
          </h1>
          <div className="grid max-w-[620px] grid-cols-3 border-t-2 border-[#111]">
            {trialStats.map((s, i) => (
              <div
                key={i}
                className={cn(
                  'min-w-0 pr-2 pt-3.5 lg:pr-3 lg:pt-4',
                  i > 0 && 'border-l-2 border-[#111] pl-3.5 lg:pl-[18px]',
                )}
              >
                <b className="block font-display text-[52px] font-normal leading-[0.9] lg:text-[64px]">
                  {s.n}
                </b>
                <span className="text-[13px] font-medium lg:text-sm">{s.l}</span>
              </div>
            ))}
          </div>
          <p className="text-sm font-medium leading-[1.4] lg:max-w-[30em] lg:text-lg lg:leading-[1.45]">
            {paidTrial ? (
              t('rv.nu.paidNote', { price: money(trialInfo.price_kopeks) })
            ) : (
              <>
                {t('rv.nu.freeNote')}
                <span className="hidden lg:inline"> {t('rv.nu.freeNoteMore')}</span>
              </>
            )}
          </p>
          {trialError && (
            <p className="rounded-xl bg-[#111] px-3 py-2 text-sm font-medium text-[#F2F0E8]">
              {trialError}
            </p>
          )}
          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-center">
            {canAfford ? (
              <button
                type="button"
                onClick={activate}
                disabled={activateTrialMutation.isPending}
                className="btn rv-btn-lg rv-btn-ink w-full lg:w-auto"
              >
                <InkArrowBtn>
                  {paidTrial
                    ? t('rv.nu.activateFor', { price: money(trialInfo.price_kopeks) })
                    : t('rv.nu.activate')}
                </InkArrowBtn>
              </button>
            ) : (
              <Link to="/balance" className="btn rv-btn-lg rv-btn-ink w-full lg:w-auto">
                <InkArrowBtn>{t('rv.topUp')}</InkArrowBtn>
              </Link>
            )}
            {orPickTo ? (
              <Link
                to={orPickTo}
                className="link self-center !text-base !text-[#111] !decoration-[#111]"
              >
                {t('rv.nu.orPick')}
              </Link>
            ) : (
              <a
                href="#tariffs"
                className="link hidden !text-base !text-[#111] !decoration-[#111] lg:inline"
              >
                {t('rv.nu.orPick')}
              </a>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="rv-kicker">{t('rv.nu.noSubKicker')}</p>
          <h1 className="rv-d text-[64px] lg:text-[clamp(80px,8vw,124px)]">
            {t('rv.nu.noSubA')}{' '}
            <span className="rv-pill rv-pill-ink inline-block">{t('rv.nu.noSubB')}</span>
          </h1>
          <p className="text-sm font-medium leading-[1.4] lg:max-w-[30em] lg:text-lg lg:leading-[1.45]">
            {cheapest
              ? t('rv.nu.noSubTextFrom', { price: money(cheapest.price) })
              : t('rv.nu.noSubText')}
          </p>
          <Link
            to="/subscription/purchase"
            className="btn rv-btn-lg rv-btn-ink w-full lg:w-auto lg:self-start"
          >
            <InkArrowBtn>{t('rv.nu.pickTariff')}</InkArrowBtn>
          </Link>
        </>
      )}
    </section>
  );

  if (heroOnly) return hero;

  /* ───────── Как подключиться ───────── */
  const steps = [
    trialOn || done
      ? { t: t('rv.nu.s1'), tl: t('rv.nu.s1l'), d: t('rv.nu.s1d'), dl: t('rv.nu.s1dl') }
      : { t: t('rv.nu.s1b'), tl: t('rv.nu.s1b'), d: t('rv.nu.s1bd'), dl: t('rv.nu.s1bd') },
    { t: t('rv.nu.s2'), tl: t('rv.nu.s2l'), d: t('rv.nu.s2d'), dl: t('rv.nu.s2dl') },
    { t: t('rv.nu.s3'), tl: t('rv.nu.s3l'), d: t('rv.nu.s3d'), dl: t('rv.nu.s3dl') },
  ];
  const stepsCard = (
    <section className="bento-card flex flex-col !px-[18px] !pb-1.5 !pt-2 lg:flex-[1_1_380px] lg:!px-[26px] lg:!pb-2.5 lg:!pt-6">
      <p className="rv-kicker pb-1 pt-2.5 lg:rv-kicker-acc lg:p-0">{t('rv.nu.howTo')}</p>
      {steps.map((s, i) => (
        <div
          key={i}
          className={cn(
            'flex items-center gap-3.5 border-dark-700 py-3 lg:items-start lg:gap-[18px] lg:border-b lg:py-[18px]',
            i < steps.length - 1 && 'border-b',
          )}
        >
          {i === 0 && done ? (
            <span className="grid h-[34px] w-[46px] shrink-0 place-items-center rounded-[10px] bg-accent-500 text-[#111] lg:h-12 lg:w-[60px] lg:rounded-[14px]">
              <RvCheckIcon className="h-5 w-5 lg:h-6 lg:w-6" />
            </span>
          ) : (
            <span
              className="w-[46px] shrink-0 pt-1 font-display text-[42px] leading-[0.8] text-transparent [-webkit-text-stroke:1.6px_rgb(var(--color-accent-500))] lg:w-[70px] lg:pt-0 lg:text-[64px] lg:leading-[0.78] lg:[-webkit-text-stroke-width:2px]"
              aria-hidden="true"
            >
              {String(i + 1).padStart(2, '0')}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-base font-bold leading-[1.3] text-dark-100 lg:hidden">{s.t}</p>
            <h3 className="hidden font-display text-[28px] font-normal uppercase leading-none text-dark-100 lg:block">
              {s.tl}
            </h3>
            <small className="mt-0.5 block text-[13px] font-medium text-dark-400 lg:hidden">
              {s.d}
            </small>
            <p className="mt-1.5 hidden text-sm text-dark-300 lg:block">{s.dl}</p>
          </div>
        </div>
      ))}
      <div className="mt-auto hidden flex-col gap-2 pb-4 pt-3.5 lg:flex">
        <p className="text-xs font-bold text-dark-400">{t('rv.nu.worksOn')}</p>
        <div className="flex flex-wrap gap-1.5">
          {PLATFORMS.map((p) => (
            <span
              key={p}
              className="inline-flex items-center whitespace-nowrap rounded-full bg-[var(--rv-s3)] px-2.5 py-[7px] text-xs font-bold leading-none text-dark-100"
            >
              {p}
            </span>
          ))}
        </div>
      </div>
    </section>
  );

  const greeting = (
    <div className="flex flex-wrap items-center gap-2.5 lg:gap-3">
      <h1 className="sr-only">{t('dashboard.title')}</h1>
      <p className="text-base font-medium text-dark-300 lg:text-lg">
        {userName ? t('rv.hi', { name: userName }) : t('rv.hiNoName')}
      </p>
      {groupName && (
        <span className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full bg-[var(--rv-acc-bg)] px-2.5 py-[7px] text-xs font-bold leading-none text-accent-400 lg:px-3 lg:py-2 lg:text-[13px]">
          <StarIcon filled className="h-[13px] w-[13px] shrink-0 lg:h-3.5 lg:w-3.5" />
          <span className="truncate">{groupName}</span>
        </span>
      )}
    </div>
  );

  const helpCard = (
    <Link
      to="/support"
      className="bento-card bento-card-hover flex items-center gap-3.5 !p-[18px] lg:max-w-[520px]"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--rv-s3)] text-dark-100 [&>svg]:h-5 [&>svg]:w-5">
        <RvChatIcon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold text-dark-100">{t('rv.nu.question')}</span>
        <span className="block text-sm text-dark-400">{t('rv.helpText')}</span>
      </span>
      <ChevronRightIcon className="h-5 w-5 text-dark-400 lg:hidden" />
    </Link>
  );

  return (
    <div className="flex min-w-0 flex-col gap-3.5 lg:gap-5">
      {greeting}

      <div className="flex flex-col gap-3.5 lg:flex-row lg:items-stretch lg:gap-5">
        {hero}

        {/* Телефон: «Сразу нужен тариф?» — только пока пробный не включён */}
        {trialOn && cheapest && (
          <Link
            to="/subscription/purchase"
            className="bento-card flex items-center gap-3.5 !py-4 !pl-[18px] !pr-4 lg:hidden"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold text-dark-100">
                {t('rv.nu.needTariff')}
              </span>
              <span className="text-sm leading-[1.4] text-dark-300">
                {t('rv.nu.fromMonth', { price: money(cheapest.price) })}
                {cheapest.tariff.servers_count
                  ? `, ${t('rv.pick.countries', { count: cheapest.tariff.servers_count })}`
                  : ''}
                .
                {other
                  ? ` ${t('rv.nu.otherFrom', { name: other.tariff.name, price: money(other.price) })}`
                  : ''}
              </span>
            </span>
            <span className="btn btn-secondary pointer-events-none !min-h-9 shrink-0 !rounded-[9px] !px-3 !pb-[7px] !pt-[9px] font-display !text-base uppercase">
              {t('rv.nu.tariffs')}
            </span>
          </Link>
        )}

        {stepsCard}
      </div>

      {/* Телефон: пополнить / позвать друга */}
      <div className="grid grid-cols-2 gap-2.5 lg:hidden">
        <Link to="/balance" className="bento-card bento-card-hover flex flex-col gap-3 !p-4">
          <span className="grid h-10 w-10 place-items-center rounded-[11px] bg-[var(--rv-s3)] text-dark-100 [&>svg]:h-5 [&>svg]:w-5">
            <RvCardIcon />
          </span>
          <span className="text-base font-bold leading-tight text-dark-100">{t('rv.topUp')}</span>
        </Link>
        {referralEnabled ? (
          <Link to="/referral" className="bento-card bento-card-hover flex flex-col gap-3 !p-4">
            <span className="grid h-10 w-10 place-items-center rounded-[11px] bg-[var(--rv-s3)] text-dark-100 [&>svg]:h-5 [&>svg]:w-5">
              <RvGiftIcon />
            </span>
            <span className="text-base font-bold leading-tight text-dark-100">
              {t('rv.inviteFriend')}
              {referralPercent ? (
                <span className="text-accent-400"> +{referralPercent}%</span>
              ) : null}
            </span>
          </Link>
        ) : (
          <Link to="/connection" className="bento-card bento-card-hover flex flex-col gap-3 !p-4">
            <span className="grid h-10 w-10 place-items-center rounded-[11px] bg-[var(--rv-s3)] text-dark-100 [&>svg]:h-5 [&>svg]:w-5">
              <RvChatIcon />
            </span>
            <span className="text-base font-bold leading-tight text-dark-100">
              {t('rv.tvOrPc')}
            </span>
          </Link>
        )}
      </div>

      {/* Компьютер: тарифы вторым планом */}
      {monthly.length > 0 && (
        <section id="tariffs" className="hidden flex-col gap-3.5 pt-2.5 lg:flex">
          <div className="flex flex-wrap items-end justify-between gap-2.5">
            <h2 className="rv-d text-[44px] text-dark-100">
              {done ? t('rv.nu.keepA') : t('rv.nu.orA')}{' '}
              <span className="rv-pill inline-block">
                {done ? t('rv.nu.keepB') : t('rv.nu.orB')}
              </span>
            </h2>
            <Link to="/subscription/purchase" className="link text-sm !text-dark-300">
              {t('rv.nu.allTariffs')}
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {monthly.slice(0, 3).map(({ tariff, days, price }) => (
              <Link
                key={tariff.id}
                to="/subscription/purchase"
                className="flex flex-col gap-2 rounded-[20px] border-2 border-dark-700 bg-dark-900 p-5 transition-colors hover:border-dark-600"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="rv-d text-[28px] text-dark-100">{tariff.name}</span>
                  {tariff.is_highlighted && <span className="rv-badge">{t('rv.nu.hit')}</span>}
                </span>
                {tariff.description && (
                  <span className="line-clamp-2 text-sm text-dark-300">{tariff.description}</span>
                )}
                <span className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="rv-num text-[48px] text-dark-100">
                    {formatAmount(price / 100, price % 100 ? 2 : 0)}
                    <span className="rv-rub">{currencySymbol}</span>
                  </span>
                  <span className="text-sm font-medium text-dark-200">
                    / {t('rv.pick.days', { count: days })}
                  </span>
                </span>
                <span className="text-xs text-dark-400">{specs(tariff)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {helpCard}
    </div>
  );
}
