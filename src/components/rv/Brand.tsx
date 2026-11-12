import { useState } from 'react';

import { cn } from '@/lib/utils';
import { isLogoPreloaded } from '@/api/branding';
import { useBranding } from '@/hooks/useBranding';

interface BrandProps {
  className?: string;
  /** Размер квадрата лого, px */
  size?: number;
  /** Чёрный квадрат под лого (для лаймовой шапки) */
  onAccent?: boolean;
  onClick?: () => void;
}

/** Куда ведёт логотип: сайт сервиса (можно переопределить VITE_BRAND_HOME_URL). */
const BRAND_HOME_URL =
  (import.meta.env.VITE_BRAND_HOME_URL as string | undefined) || 'https://richvpn.fun';

/** Лого + название, как в шапке макета («richvpn»). Клик ведёт на сайт сервиса. */
export function Brand({ className, size = 36, onAccent = false, onClick }: BrandProps) {
  const { appName, logoLetter, hasCustomLogo, logoUrl } = useBranding();
  const [loaded, setLoaded] = useState(() => isLogoPreloaded());
  const name = (appName || '').trim();

  return (
    <a
      href={BRAND_HOME_URL}
      onClick={onClick}
      aria-label={name || 'Home'}
      className={cn('flex min-w-0 shrink-0 items-center gap-2.5', className)}
    >
      <span
        className={cn(
          'relative grid shrink-0 place-items-center overflow-hidden',
          // Своё лого рисуется как есть — без лаймовой подложки, иначе по углам
          // скруглённой картинки просвечивала зелёная рамка.
          hasCustomLogo && logoUrl
            ? 'bg-transparent'
            : onAccent
              ? 'bg-[#111] text-[rgb(var(--color-accent-500))]'
              : 'bg-accent-500 text-[#111]',
        )}
        style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}
      >
        <span
          className={cn(
            'rv-d absolute text-[22px] transition-opacity',
            hasCustomLogo && loaded ? 'opacity-0' : 'opacity-100',
          )}
        >
          {logoLetter}
        </span>
        {hasCustomLogo && logoUrl && (
          <img
            src={logoUrl}
            alt=""
            className={cn(
              'absolute h-full w-full object-contain transition-opacity',
              loaded ? 'opacity-100' : 'opacity-0',
            )}
            onLoad={() => setLoaded(true)}
          />
        )}
      </span>
      {name && (
        <span
          className={cn(
            'truncate text-[22px] font-bold lowercase leading-none tracking-[-0.01em]',
            onAccent ? 'text-[#111]' : 'text-dark-50',
          )}
        >
          {name.replace(/\s+/g, '').toLowerCase()}
        </span>
      )}
    </a>
  );
}
