import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';

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
