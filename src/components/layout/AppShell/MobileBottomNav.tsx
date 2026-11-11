import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

import { cn } from '@/lib/utils';
import { usePlatform } from '@/platform';
import { HIDDEN_UNDER_KEYBOARD, useVirtualKeyboard } from '@/hooks/useVirtualKeyboard';

import { HomeIcon, SubscriptionIcon, WalletIcon, UsersIcon, ChatIcon, WheelIcon } from './icons';
import type { MobileNavItem, MobileNavKey } from './mobileNavRoutes';

type NavIcon = React.ComponentType<{ className?: string }>;

const ICONS: Record<MobileNavKey, NavIcon> = {
  dashboard: HomeIcon,
  subscription: SubscriptionIcon,
  balance: WalletIcon,
  wheel: WheelIcon,
  referral: UsersIcon,
  support: ChatIcon,
};

interface MobileBottomNavProps {
  /** Экраны панели — из mobileNavItems(); AppShell рендерит панель только на них. */
  items: readonly MobileNavItem[];
  /** Открыто выезжающее меню шапки: у него есть все те же пункты, панель поверх него лишняя. */
  isMenuOpen?: boolean;
}

export function MobileBottomNav({ items, isMenuOpen = false }: MobileBottomNavProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { haptic } = usePlatform();
  const isKeyboardOpen = useVirtualKeyboard();

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const handleNavClick = () => {
    haptic.impact('light');
  };

  return (
    <nav
      className={cn(
        'fixed z-50 transition-all duration-200 lg:hidden',
        isKeyboardOpen || isMenuOpen ? HIDDEN_UNDER_KEYBOARD : 'opacity-100',
      )}
      style={{
        // Отступ снизу и просвет под панелью объявлены в globals.css
        // (--mobile-nav-*): в standalone iOS inset около 34pt, в браузере — 16px.
        bottom: 'var(--mobile-nav-offset)',
        // В альбомной ориентации iPhone панель не уходит под чёлку и углы.
        left: 'max(12px, env(safe-area-inset-left, 0px))',
        right: 'max(12px, env(safe-area-inset-right, 0px))',
      }}
    >
      <div className="flex gap-1 rounded-[24px] border-2 border-[#2A2A2A] bg-[#111] p-1.5 shadow-[0_14px_34px_rgba(0,0,0,.45)] [.light_&]:border-[#111]">
        {items.map((item) => {
          const Icon = ICONS[item.key];
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={handleNavClick}
              aria-current={active ? 'page' : undefined}
              className={cn(
                // На 360 пяти пунктам достаётся по ~64 px: подпись короткая
                // (navShort), а если и она не влезла — многоточие, не наезд.
                'relative flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[17px] px-0.5 py-2 text-[11px] font-bold leading-none transition-colors duration-150',
                active ? 'text-[#111]' : 'text-[#A9A8A0] hover:text-[#F2F0E8]',
              )}
            >
              {active && (
                <motion.div
                  layoutId="bottom-nav-active"
                  className="absolute inset-0 rounded-[17px] bg-accent-500"
                  transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                />
              )}
              <Icon className="relative z-10 h-[22px] w-[22px]" />
              <span className="relative z-10 max-w-full truncate">
                {t(`navShort.${item.key}`, { defaultValue: t(`nav.${item.key}`) })}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
