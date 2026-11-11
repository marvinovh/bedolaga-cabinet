import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { subscriptionApi } from '@/api/subscription';
import type { Subscription } from '@/types';
import { showsAutopayToggle } from '@/utils/legacySubscription';

export interface AutopayToggleProps {
  subscription: Subscription;
  subscriptionId: number | undefined;
  /** Цвет включённого тумблера — акцент зоны трафика на полной странице. */
  accentColor: string;
  /** Цвет выключенного тумблера. */
  offColor: string;
  /** Фон и рамка плашки; без них компонент рисуется без подложки. */
  surface?: { background: string; border: string };
}

/**
 * Тумблер автоплатежа с баланса.
 *
 * Вынесен из тела страницы подписки, чтобы тем же тумблером мог пользоваться
 * простой вид. Мутация живёт здесь: она инвалидирует ещё и состояние
 * СБП-автоплатежа — включение списания с баланса отменяет его на стороне
 * сервера, и без этого сброса блок СБП продолжал бы показывать протухшее
 * «активен».
 *
 * Возвращает null, когда тумблер неуместен (пробные, суточные и старые
 * подписки) — решение принимает общий помощник, а не вызывающий экран.
 */
export function AutopayToggle({
  subscription,
  subscriptionId,
  accentColor,
  offColor,
  surface,
}: AutopayToggleProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const autopayMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      subscriptionApi.updateAutopay(enabled, undefined, subscriptionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription', subscriptionId] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      // Enabling balance-autopay cancels SBP auto-pay server-side — refresh so
      // the SBP block doesn't keep showing a now-stale 'active'/'pending' state.
      queryClient.invalidateQueries({ queryKey: ['sbp-recurring', subscriptionId] });
    },
  });

  if (!showsAutopayToggle(subscription)) return null;

  // RichVPN: карточка «Автопродление» с тогглом макета (цвета — из токенов).
  void accentColor;
  void offColor;
  void surface;
  return (
    <div className="bento-card flex items-center justify-between gap-4 !p-5">
      <div className="min-w-0">
        <div className="text-lg font-bold leading-tight text-dark-100">
          {t('subscription.autoRenewal')}
        </div>
        <div className="mt-1 text-[15px] leading-snug text-dark-300">
          {t('subscription.daysBeforeExpiry', { count: subscription.autopay_days_before })}
        </div>
      </div>
      <button
        type="button"
        onClick={() => autopayMutation.mutate(!subscription.autopay_enabled)}
        disabled={autopayMutation.isPending}
        role="switch"
        aria-checked={subscription.autopay_enabled}
        aria-label={t('subscription.autopay', 'Auto-payment')}
        className="rv-tog disabled:opacity-60"
      />
    </div>
  );
}

export default AutopayToggle;
