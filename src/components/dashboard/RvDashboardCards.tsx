import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { useQuery } from '@tanstack/react-query';

import { balanceApi } from '@/api/balance';
import { useCurrency } from '@/hooks/useCurrency';
import { uiLocale } from '@/utils/uiLocale';
import type { Tariff } from '@/types';
import { transactionTypeLabelKey } from '@/utils/transactionType';

import { cn } from '@/lib/utils';
import { ChevronRightIcon } from '@/components/icons';
import { RvChatIcon } from '@/components/rv';

/** Плитка быстрого действия на главной (2×2). */
export function QuickTile({
  to,
  icon,
  label,
  note,
  accent = false,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  note?: string;
  accent?: boolean;
}) {
  return (
    <Link
      to={to}
      className="bento-card bento-card-hover flex min-h-[132px] flex-col justify-between gap-4 !p-4"
    >
      <span className={cn('rv-ic', accent && 'rv-ic-acc')}>{icon}</span>
      <span className="text-[17px] font-bold leading-tight text-dark-100">
        {label}
        {note && <span className="block text-accent-400">{note}</span>}
      </span>
    </Link>
  );
}

/** Чёрная карточка партнёрки с топо-волнами: «Зови друзей — получай N%». */
export function PartnerCard({ percent }: { percent?: number }) {
  const { t } = useTranslation();
  return (
    <section className="bento-card rv-card-ink rv-topo !p-5">
      <p className="rv-kicker">{t('rv.partner')}</p>
      <h3 className="rv-d mt-3 text-[38px] text-[#F2F0E8]">
        {t('rv.inviteTitle')}{' '}
        {percent ? <span className="rv-pill inline-block">{percent}%</span> : null}
      </h3>
      <p className="mt-3 text-[15px] leading-snug text-[#B9B8B0]">{t('rv.inviteText')}</p>
      <Link to="/referral" className="btn btn-primary mt-4 w-full !shadow-none">
        {t('rv.getLink')}
      </Link>
    </section>
  );
}

/** Ряд «Что-то не работает? → поддержка». */
export function HelpCard() {
  const { t } = useTranslation();
  return (
    <Link to="/support" className="bento-card bento-card-hover flex items-center gap-4 !p-4">
      <span className="rv-ic">
        <RvChatIcon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold text-dark-100">{t('rv.helpTitle')}</span>
        <span className="block text-sm text-dark-400">{t('rv.helpText')}</span>
      </span>
      <ChevronRightIcon className="h-5 w-5 text-dark-400" />
    </Link>
  );
}

/** Десктоп: QR, который открывает мастер подключения на телефоне. */
export function ConnectPhoneCard({ subscriptionId }: { subscriptionId: number }) {
  const { t } = useTranslation();
  const url = `${window.location.origin}/connection?sub=${subscriptionId}`;
  return (
    <section className="bento-card !p-5">
      <p className="rv-kicker rv-kicker-acc">{t('rv.connectPhone')}</p>
      <div className="mt-4 flex items-center gap-4">
        <div className="shrink-0 rounded-xl bg-white p-2">
          <QRCodeSVG value={url} size={116} level="M" />
        </div>
        <p className="text-sm leading-snug text-dark-300">{t('rv.connectPhoneText')}</p>
      </div>
      <Link to={`/connection?sub=${subscriptionId}`} className="btn btn-secondary mt-4 w-full">
        {t('rv.connectThisPc')}
      </Link>
    </section>
  );
}

/** «−9% Продли сразу на 90 дней» — пунктирная карточка-предложение. */
export function RenewOfferCard({
  subscriptionId,
  tariffs,
}: {
  subscriptionId: number;
  tariffs: Tariff[] | undefined;
}) {
  const { t } = useTranslation();
  const { formatAmount, currencySymbol } = useCurrency();
  const current = tariffs?.find((x) => x.is_current);
  const month = current?.periods.find((p) => p.days === 30);
  const long = current?.periods.find((p) => p.days === 90);
  if (!current || !month || !long) return null;
  const full = month.price_kopeks * 3;
  const percent = Math.round((1 - long.price_kopeks / full) * 100);
  if (percent <= 0) return null;
  const rub = (k: number) => `${formatAmount(k / 100, k % 100 === 0 ? 0 : 2)} ${currencySymbol}`;
  return (
    <section className="bento-card rv-card-dash !p-5 lg:flex lg:items-center lg:gap-6">
      <div className="flex items-start gap-4 lg:flex-1 lg:items-center">
        <span className="rv-num shrink-0 text-[52px] text-accent-400">−{percent}%</span>
        <div className="min-w-0">
          <p className="text-[17px] font-bold leading-tight text-dark-100">{t('rv.offer.title')}</p>
          <p className="mt-1 text-sm leading-snug text-dark-300">
            {t('rv.offer.text', { price: rub(long.price_kopeks), full: rub(full) })}
          </p>
        </div>
      </div>
      <Link
        to={`/subscriptions/${subscriptionId}/renew`}
        className="btn btn-secondary mt-4 w-full lg:mt-0 lg:w-auto"
      >
        {t('rv.offer.cta')}
      </Link>
    </section>
  );
}

/** Десктоп: «Последние операции» — таблица из трёх строк. */
export function RecentOpsTable() {
  const { t } = useTranslation();
  const { formatAmount, currencySymbol } = useCurrency();
  const { data } = useQuery({
    queryKey: ['transactions', 'recent3'],
    queryFn: () => balanceApi.getTransactions({ page: 1, per_page: 3 }),
    staleTime: 60_000,
  });
  const items = data?.items ?? [];
  if (!items.length) return null;
  return (
    <section>
      <h2 className="rv-d mb-3 text-[36px] text-dark-100">{t('rv.recentOps')}</h2>
      <div className="rv-tbox">
        <table className="rv-tbl">
          <thead>
            <tr>
              <th>{t('rv.ops.date')}</th>
              <th>{t('rv.ops.op')}</th>
              <th className="!text-right">{t('rv.ops.sum')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((tx) => {
              const positive = tx.amount_rubles > 0;
              return (
                <tr key={tx.id}>
                  <td className="whitespace-nowrap text-dark-300">
                    {new Date(tx.created_at).toLocaleDateString(uiLocale(), {
                      day: 'numeric',
                      month: 'long',
                    })}
                  </td>
                  <td className="text-dark-100">
                    {tx.description || t(transactionTypeLabelKey(tx.type))}
                  </td>
                  <td
                    className={`whitespace-nowrap text-right font-bold ${positive ? 'text-accent-400' : 'text-dark-100'}`}
                  >
                    {positive ? '+' : tx.amount_rubles < 0 ? '−' : ''}
                    {formatAmount(Math.abs(tx.amount_rubles), 0)}
                    {' '}
                    {currencySymbol}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
