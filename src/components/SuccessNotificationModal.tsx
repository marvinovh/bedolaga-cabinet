/**
 * Global success notification modal.
 * Shows prominent success messages for balance top-ups and subscription purchases.
 */

import { uiLocale } from '@/utils/uiLocale';
import { formatDateOrRaw } from '@/utils/format';
import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Brand, RvCheckIcon } from '@/components/rv';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useSuccessNotification } from '../store/successNotification';
import { useCurrency } from '../hooks/useCurrency';
import { useTelegramSDK } from '../hooks/useTelegramSDK';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useHaptic } from '@/platform';
import { CloseIcon } from '@/components/icons';

export default function SuccessNotificationModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isOpen = useSuccessNotification((state) => state.isOpen);
  const data = useSuccessNotification((state) => state.data);
  const hide = useSuccessNotification((state) => state.hide);
  const { formatAmount, currencySymbol } = useCurrency();
  const { safeAreaInset, contentSafeAreaInset, isTelegramWebApp } = useTelegramSDK();
  const haptic = useHaptic();

  const safeBottom = isTelegramWebApp
    ? Math.max(safeAreaInset.bottom, contentSafeAreaInset.bottom)
    : 0;

  const handleClose = useCallback(() => {
    hide();
  }, [hide]);

  // Esc + scroll-lock are handled by the effects below; the trap only manages focus.
  const modalRef = useFocusTrap<HTMLDivElement>(isOpen, { lockScroll: false });

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  useEffect(() => {
    if (isOpen) {
      haptic.notification('success');
    }
  }, [isOpen, haptic]);

  // Scroll lock
  useEffect(() => {
    if (!isOpen) return;

    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !data) return null;

  const isBalanceTopup = data.type === 'balance_topup';
  const isSubscription =
    data.type === 'subscription_activated' ||
    data.type === 'subscription_renewed' ||
    data.type === 'subscription_purchased';
  const isDevicesPurchased = data.type === 'devices_purchased';
  const isTrafficPurchased = data.type === 'traffic_purchased';

  // Format amount
  const formattedAmount = data.amountKopeks
    ? `${formatAmount(data.amountKopeks / 100, data.amountKopeks % 100 === 0 ? 0 : 2)}\u00A0${currencySymbol}`
    : null;

  // Format new balance
  const formattedBalance =
    data.newBalanceKopeks !== undefined
      ? `${formatAmount(data.newBalanceKopeks / 100)}\u00A0${currencySymbol}`
      : null;

  // Format expiry date
  const formattedExpiry = formatDateOrRaw(data.expiresAt, uiLocale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Determine title and message
  let title = data.title;
  const message = data.message;

  if (!title) {
    if (isBalanceTopup) {
      title = t('successNotification.balanceTopup.title', 'Balance topped up!');
    } else if (data.type === 'subscription_activated') {
      title = t('successNotification.subscriptionActivated.title', 'Subscription activated!');
    } else if (data.type === 'subscription_renewed') {
      title = t('successNotification.subscriptionRenewed.title', 'Subscription renewed!');
    } else if (data.type === 'subscription_purchased') {
      title = t('successNotification.subscriptionPurchased.title', 'Subscription purchased!');
    } else if (data.type === 'devices_purchased') {
      title = t('successNotification.devicesPurchased.title', 'Devices added!');
    } else if (data.type === 'traffic_purchased') {
      title = t('successNotification.trafficPurchased.title', 'Traffic added!');
    }
  }

  const handleGoToSubscription = () => {
    hide();
    navigate('/subscriptions');
  };

  const handleGoToBalance = () => {
    hide();
    navigate('/balance');
  };

  // RichVPN: полноэкранный лаймовый экран (макет «07 · Оплата прошла»).
  const head = isSubscription
    ? { a: t('rv.done.subA'), pre: t('rv.done.subPre'), b: t('rv.done.subB') }
    : isBalanceTopup
      ? { a: t('rv.done.balA'), b: t('rv.done.balB') }
      : isDevicesPurchased
        ? { a: t('rv.done.devA'), b: t('rv.done.devB') }
        : isTrafficPurchased
          ? { a: t('rv.done.trA'), b: t('rv.done.trB') }
          : { a: '', b: title };
  const headPre = 'pre' in head ? head.pre : '';
  const rows: Array<[string, string]> = [];
  if (data.tariffName) rows.push([t('successNotification.tariff', 'Tariff'), data.tariffName]);
  if (formattedExpiry)
    rows.push([t('successNotification.validUntil', 'Valid until'), formattedExpiry]);
  if (isDevicesPurchased && data.devicesAdded)
    rows.push([t('successNotification.devicesAdded', 'Devices added'), `+${data.devicesAdded}`]);
  if (isDevicesPurchased && data.newDeviceLimit)
    rows.push([
      t('successNotification.totalDevices', 'Total devices'),
      String(data.newDeviceLimit),
    ]);
  if (isTrafficPurchased && data.trafficGbAdded)
    rows.push([
      t('successNotification.trafficAdded', 'Traffic added'),
      `+${data.trafficGbAdded} ${t('common.units.gb', 'GB')}`,
    ]);
  if (isTrafficPurchased && data.newTrafficLimitGb)
    rows.push([
      t('successNotification.totalTraffic', 'Total traffic'),
      `${data.newTrafficLimitGb} ${t('common.units.gb', 'GB')}`,
    ]);
  if (isBalanceTopup && formattedBalance)
    rows.push([t('successNotification.newBalance', 'New balance'), formattedBalance]);

  const modalContent = (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="success-modal-title"
      tabIndex={-1}
      className="rv-card-acc rv-topo fixed inset-0 z-[100] flex flex-col overflow-y-auto"
      style={{
        paddingTop: 'max(14px, env(safe-area-inset-top, 0px))',
        paddingBottom: safeBottom
          ? `${safeBottom + 16}px`
          : 'max(20px, env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-5">
        <div className="flex items-center justify-between">
          <Brand size={36} onAccent onClick={() => hide()} />
          <button
            onClick={handleClose}
            aria-label={t('common.close')}
            className="grid h-11 w-11 place-items-center rounded-xl border-2 border-[#111] text-[#111]"
          >
            <CloseIcon />
          </button>
        </div>

        <span className="mt-8 grid h-[76px] w-[76px] -rotate-3 place-items-center rounded-[20px] bg-[#111] text-[rgb(var(--color-accent-500))]">
          <RvCheckIcon className="h-9 w-9" />
        </span>

        <h2 id="success-modal-title" className="rv-d mt-7 text-[72px] text-[#111]">
          {head.a && (
            <>
              {head.a}
              <br />
            </>
          )}
          {headPre ? `${headPre} ` : ''}
          <span className="rv-pill rv-pill-ink inline-block">{head.b}</span>
        </h2>
        {message && <p className="mt-5 text-[17px] leading-snug">{message}</p>}

        {(rows.length > 0 || formattedAmount) && (
          <div className="mt-6 rounded-[20px] bg-[#111] p-5 text-[#F2F0E8]">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 py-1.5 text-[15px]">
                <span className="text-[#9C9B93]">{k}</span>
                <b className="min-w-0 truncate text-right">{v}</b>
              </div>
            ))}
            {formattedAmount && (
              <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-[#3D3D3A] pt-3">
                <b className="text-[15px]">
                  {isBalanceTopup
                    ? t('successNotification.amount', 'Amount')
                    : t('successNotification.price', 'Price')}
                </b>
                <span className="rv-num text-[32px] text-[rgb(var(--color-accent-500))]">
                  {formattedAmount}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="mt-auto space-y-3 pt-8">
          <button
            onClick={() => {
              hide();
              navigate('/');
            }}
            className="btn rv-btn-lg rv-btn-ink w-full"
          >
            {t('rv.done.home')}
          </button>
          {isSubscription ? (
            <button
              onClick={() => {
                hide();
                navigate('/connection');
              }}
              className="btn rv-btn-ghost-ink w-full"
            >
              {t('rv.done.connectMore')}
            </button>
          ) : isBalanceTopup ? (
            <button onClick={handleGoToBalance} className="btn rv-btn-ghost-ink w-full">
              {t('successNotification.goToBalance', 'Go to Balance')}
            </button>
          ) : (
            <button onClick={handleGoToSubscription} className="btn rv-btn-ghost-ink w-full">
              {t('successNotification.goToSubscription', 'Go to Subscription')}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
}
