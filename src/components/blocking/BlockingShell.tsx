import type { ReactNode, Ref } from 'react';
import { motion } from 'framer-motion';
import { slideUp, slideUpTransition } from '../motion/transitions';
import { getCachedBranding } from '@/api/branding';
import { cn } from '@/lib/utils';

export type BlockingAccent = 'warning' | 'error' | 'info';

interface BlockingShellProps {
  /** Unique id wired to aria-labelledby (e.g. 'maintenance-title'). */
  titleId: string;
  accent: BlockingAccent;
  /** Rendered icon element (sized by the caller, e.g. <WrenchIcon className="h-9 w-9" />). */
  icon: ReactNode;
  /** Already-translated title. */
  title: string;
  description?: ReactNode;
  /** Per-screen body: reason cards, channel list, error block. */
  children?: ReactNode;
  /** CTA area — pass canonical <Button> elements. */
  actions?: ReactNode;
  /** Hint / contact-support line under the card. */
  footer?: ReactNode;
  /** Accent-tinted "working" dots, for screens that actively wait/poll. */
  pulse?: boolean;
  /** 'polite' for screens whose state changes (retry/error) should announce. */
  ariaLive?: 'polite' | 'off';
  /** Focus-trap ref — owned by the caller so each screen keeps its own trap. */
  screenRef: Ref<HTMLDivElement>;
}

/**
 * Служебный экран — макет «15 · Служебные экраны»: на всю высоту, лого слева,
 * плитка-иконка с наклоном, заголовок Bebas с «таблеткой» на последнем слове,
 * действия прижаты к низу. warning — лаймовый экран (техработы), info — тёмный
 * с лаймом (подписка на канал), error — тёмный с красным (доступ закрыт).
 * Поведение (фокус, aria, действия) задаёт каждый экран.
 */
export default function BlockingShell({
  titleId,
  accent,
  icon,
  title,
  description,
  children,
  actions,
  footer,
  pulse = false,
  ariaLive = 'off',
  screenRef,
}: BlockingShellProps) {
  const words = title.trim().split(/\s+/);
  const last = words.pop() ?? '';
  const head = words.join(' ');
  const lime = accent === 'warning';

  return (
    <div
      ref={screenRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={cn(
        'fixed inset-0 z-[100] overflow-y-auto',
        lime ? 'rv-card-acc rv-topo' : 'bg-dark-950',
      )}
    >
      <motion.div
        variants={slideUp}
        initial="initial"
        animate="animate"
        transition={slideUpTransition}
        aria-live={ariaLive === 'polite' ? 'polite' : undefined}
        aria-atomic={ariaLive === 'polite' ? true : undefined}
        className="mx-auto flex min-h-full w-full max-w-[480px] flex-col px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(18px,env(safe-area-inset-top))]"
      >
        <BlockingBrand onAccent={lime} />

        <span
          className={cn(
            'mt-16 grid h-[84px] w-[84px] -rotate-3 place-items-center rounded-[22px]',
            lime && 'bg-[#111] text-[rgb(var(--color-accent-500))]',
            accent === 'info' && 'bg-accent-500 text-[#111]',
            accent === 'error' && 'bg-[var(--rv-bad-bg)] text-[var(--rv-bad)]',
          )}
        >
          {icon}
        </span>

        <h1
          id={titleId}
          className={cn(
            'rv-d mt-7 text-[64px] sm:text-[72px]',
            lime ? 'text-[#111]' : 'text-dark-50',
          )}
        >
          {head && (
            <>
              {head}
              <br />
            </>
          )}
          <span
            className={cn(
              'rv-pill inline-block',
              lime && 'rv-pill-ink',
              accent === 'error' && '!bg-[var(--rv-bad)] !text-[#111]',
            )}
          >
            {last}
          </span>
        </h1>
        {description && (
          <p
            className={cn('mt-5 text-[17px] leading-snug', lime ? 'text-[#111]' : 'text-dark-300')}
          >
            {description}
          </p>
        )}

        {children && <div className="mt-6 space-y-3 text-left">{children}</div>}

        {pulse && (
          <div aria-hidden className="mt-8">
            <div
              className={cn(
                'rv-meter !h-5',
                lime && '!bg-transparent !outline !outline-[3px] !outline-[#111]',
              )}
            >
              <i className="animate-pulse" style={{ width: '64%' }} />
            </div>
          </div>
        )}

        <div className="mt-auto pt-10">
          {actions && <div className="flex flex-col gap-3">{actions}</div>}
          {footer && (
            <p
              className={cn('mt-4 text-center text-sm', lime ? 'text-[#111]/75' : 'text-dark-400')}
            >
              {footer}
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function BlockingBrand({ onAccent }: { onAccent: boolean }) {
  const branding = getCachedBranding();
  const name = (branding?.name || import.meta.env.VITE_APP_NAME || '')
    .replace(/\s+/g, '')
    .toLowerCase();
  const letter = branding?.logo_letter || import.meta.env.VITE_APP_LOGO || 'R';
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          'rv-d grid h-9 w-9 place-items-center rounded-[10px] text-[22px]',
          onAccent ? 'bg-[#111] text-[rgb(var(--color-accent-500))]' : 'bg-accent-500 text-[#111]',
        )}
      >
        {letter}
      </span>
      {name && (
        <span
          className={cn(
            'text-[22px] font-bold leading-none',
            onAccent ? 'text-[#111]' : 'text-dark-50',
          )}
        >
          {name}
        </span>
      )}
    </div>
  );
}
