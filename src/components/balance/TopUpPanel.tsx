import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { ArrowRightIcon } from '@/components/icons';
import type { PaymentMethod } from '@/types';

const DEFAULT_PRESETS = [100, 300, 500, 1000, 2000, 5000];

/**
 * «Пополнить» — макет «08 · Баланс и пополнение»: суммы плитками, своя сумма,
 * способ оплаты радио-карточкой и большая кнопка «Пополнить на N ₽».
 * Оплата идёт прежним путём: /balance/top-up/:method?amount=N.
 */
export function TopUpPanel({ methods }: { methods: PaymentMethod[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { formatAmount, currencySymbol } = useCurrency();
  const available = methods.filter((m) => m.is_available);
  const [methodId, setMethodId] = useState(available[0]?.id ?? methods[0]?.id);
  const method = methods.find((m) => m.id === methodId) ?? methods[0];

  const presets = useMemo(() => {
    const quick = method?.quick_amounts?.length
      ? method.quick_amounts.map((k) => k / 100)
      : DEFAULT_PRESETS;
    return quick.slice(0, 6);
  }, [method]);
  const [amount, setAmount] = useState<number>(presets[1] ?? presets[0] ?? 300);
  const [custom, setCustom] = useState('');

  const min = (method?.min_amount_kopeks ?? 0) / 100;
  const max = (method?.max_amount_kopeks ?? 0) / 100;
  const value = custom ? Number(custom.replace(/\s/g, '').replace(',', '.')) : amount;
  const valid =
    Number.isFinite(value) && value > 0 && (!min || value >= min) && (!max || value <= max);
  const rub = (v: number) => `${formatAmount(v, v % 1 === 0 ? 0 : 2)} ${currencySymbol}`;

  const methodName = (m: PaymentMethod) => {
    const key = m.id.toLowerCase().replace(/-/g, '_');
    return m.name || t(`balance.paymentMethods.${key}.name`, { defaultValue: m.id });
  };

  return (
    <section className="space-y-3">
      <h2 className="rv-d text-[40px] text-dark-100">{t('rv.topup.title')}</h2>

      <div className="grid grid-cols-3 gap-2.5">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setAmount(p);
              setCustom('');
            }}
            className={cn(
              'rv-num min-h-[52px] rounded-[14px] border-2 text-[24px] transition-colors',
              !custom && amount === p
                ? 'border-accent-500 bg-accent-500 text-[#111]'
                : 'border-dark-700 bg-dark-900 text-dark-100 hover:border-dark-600',
            )}
          >
            {formatAmount(p, 0)}
            <span className="ml-1 font-sans text-[0.8em] font-bold">{currencySymbol}</span>
          </button>
        ))}
      </div>

      <div className="field">
        <label htmlFor="rv-topup-custom" className="label">
          {t('rv.topup.custom')}
        </label>
        <input
          id="rv-topup-custom"
          inputMode="decimal"
          className="input mt-1.5"
          placeholder={max ? t('rv.topup.range', { min: rub(min), max: rub(max) }) : ''}
          value={custom}
          onChange={(e) => setCustom(e.target.value.replace(/[^\d.,\s]/g, ''))}
        />
      </div>

      <div className="space-y-2" role="radiogroup">
        {methods.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={m.id === methodId}
            disabled={!m.is_available}
            onClick={() => setMethodId(m.id)}
            className={cn(
              'rv-opt disabled:cursor-not-allowed disabled:opacity-50',
              m.id === methodId && 'on',
            )}
          >
            <span className="rv-rad" />
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-dark-100">{methodName(m)}</span>
              {m.description && (
                <span className="mt-0.5 block text-[13px] text-dark-400">{m.description}</span>
              )}
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={!valid || !method}
        onClick={() =>
          method &&
          navigate(`/balance/top-up/${method.id}?amount=${encodeURIComponent(String(value))}`)
        }
        className="btn btn-primary rv-btn-lg w-full"
      >
        {valid ? t('rv.topup.cta', { amount: rub(value) }) : t('rv.topup.title')}
        <ArrowRightIcon className="h-5 w-5" />
      </button>
      <p className="text-center">
        <Link to="/balance/saved-cards" className="link text-sm">
          {t('rv.topup.savedCards')}
        </Link>
      </p>
    </section>
  );
}
