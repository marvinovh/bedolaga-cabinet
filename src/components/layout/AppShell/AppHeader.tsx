import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuthStore } from '@/store/auth';
import { displayName } from '@/utils/displayName';
import { useShallow } from 'zustand/shallow';
import { useTheme } from '@/hooks/useTheme';
import { usePlatform } from '@/platform';
import { themeColorsApi } from '@/api/themeColors';
import { cn } from '@/lib/utils';

import LanguageSwitcher from '@/components/LanguageSwitcher';
import TicketNotificationBell from '@/components/TicketNotificationBell';
import { LogoutButton } from './LogoutButton';
import { Avatar, BalanceChip, Brand } from '@/components/rv';

// Icons
import {
  HomeIcon,
  SubscriptionIcon,
  WalletIcon,
  UsersIcon,
  UserIcon,
  ChatIcon,
  GamepadIcon,
  ClipboardIcon,
  InfoIcon,
  CogIcon,
  WheelIcon,
  GiftIcon,
  CloseIcon,
  SunIcon,
  MoonIcon,
} from './icons';

import type { TelegramPlatform } from '@/hooks/useTelegramSDK';

interface AppHeaderProps {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  onCommandPaletteOpen: () => void;
  /** CSS-длина шапки (учитывает safe-area) — сдвиг оверлея меню. */
  headerHeight: string;
  isFullscreen: boolean;
  safeAreaInset: { top: number; bottom: number; left: number; right: number };
  contentSafeAreaInset: { top: number; bottom: number; left: number; right: number };
  telegramPlatform?: TelegramPlatform;
  wheelEnabled?: boolean;
  referralEnabled?: boolean;
  hasContests?: boolean;
  hasPolls?: boolean;
  giftEnabled?: boolean;
}

export function AppHeader({
  mobileMenuOpen,
  setMobileMenuOpen,
  headerHeight,
  isFullscreen,
  safeAreaInset,
  contentSafeAreaInset,
  telegramPlatform,
  wheelEnabled,
  referralEnabled,
  hasContests,
  hasPolls,
  giftEnabled,
}: AppHeaderProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { user, logout, isAdmin } = useAuthStore(
    useShallow((state) => ({ user: state.user, logout: state.logout, isAdmin: state.isAdmin })),
  );
  const { toggleTheme, isDark } = useTheme();
  const { haptic } = usePlatform();
  // Theme toggle visibility
  const { data: enabledThemes } = useQuery({
    queryKey: ['enabled-themes'],
    queryFn: themeColorsApi.getEnabledThemes,
    staleTime: 1000 * 60 * 5,
  });
  const canToggle = enabledThemes?.dark && enabledThemes?.light;

  // Lock scroll when menu is open (works in iframe/Telegram Mini App)
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const preventDefault = (e: TouchEvent) => {
      // Allow scrolling inside menu content
      const target = e.target as HTMLElement;
      if (target.closest('.mobile-menu-content')) return;
      e.preventDefault();
    };

    document.addEventListener('touchmove', preventDefault, { passive: false });
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('touchmove', preventDefault);
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };
  const isAdminActive = () => location.pathname.startsWith('/admin');

  const navItems = [
    { path: '/', label: t('nav.dashboard'), icon: HomeIcon },
    { path: '/subscriptions', label: t('nav.subscription'), icon: SubscriptionIcon },
    { path: '/balance', label: t('nav.balance'), icon: WalletIcon },
    ...(referralEnabled ? [{ path: '/referral', label: t('nav.referral'), icon: UsersIcon }] : []),
    { path: '/support', label: t('nav.support'), icon: ChatIcon },
    ...(hasContests ? [{ path: '/contests', label: t('nav.contests'), icon: GamepadIcon }] : []),
    ...(hasPolls ? [{ path: '/polls', label: t('nav.polls'), icon: ClipboardIcon }] : []),
    ...(wheelEnabled ? [{ path: '/wheel', label: t('nav.wheel'), icon: WheelIcon }] : []),
    ...(giftEnabled ? [{ path: '/gift', label: t('nav.gift'), icon: GiftIcon }] : []),
    { path: '/info', label: t('nav.info'), icon: InfoIcon },
  ];

  return (
    <>
      {/* Header - only on mobile. В standalone-режиме iOS («На экран Домой»)
          шапка продолжается под статус-бар через padding-top; тон для этого
          режима задаёт .app-mobile-header в globals.css (display-mode: standalone),
          чтобы не было ни отдельного светлого блока, ни жёсткой границы. */}
      <header
        className="app-mobile-header fixed left-0 right-0 top-0 z-50 bg-dark-950 lg:hidden"
        style={{
          paddingTop: isFullscreen
            ? `${Math.max(safeAreaInset.top, contentSafeAreaInset.top) + (telegramPlatform === 'android' ? 48 : 45)}px`
            : 'env(safe-area-inset-top, 0px)',
        }}
      >
        <div
          // Боковые отступы не меньше вырезов: в альбомной ориентации iPhone
          // env(safe-area-inset-left/right) — это чёлка и скруглённые углы.
          className="mx-auto w-full pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]"
          onClick={() => mobileMenuOpen && setMobileMenuOpen(false)}
        >
          <div className="flex h-16 items-center justify-between gap-2.5">
            <Brand size={36} onClick={() => setMobileMenuOpen(false)} />

            <div className="flex min-w-0 items-center gap-2">
              <div onClick={() => setMobileMenuOpen(false)}>
                <BalanceChip />
              </div>
              {/* Аватар открывает меню: профиль, остальные разделы, тема, язык */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  haptic.impact('light');
                  setMobileMenuOpen(!mobileMenuOpen);
                }}
                className="relative rounded-full"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? (
                  <span className="grid h-11 w-11 place-items-center rounded-full border-2 border-dark-700 bg-dark-900 text-dark-100">
                    <CloseIcon className="h-5 w-5" />
                  </span>
                ) : (
                  <Avatar size={44} />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 animate-fade-in lg:hidden"
          style={{ top: headerHeight }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-dark-950/60"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Menu content */}
          <div
            className="mobile-menu-content absolute inset-x-0 bottom-0 top-0 overflow-y-auto overscroll-contain border-t border-dark-800/50 bg-dark-900/95 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="mx-auto max-w-6xl py-4 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]">
              {/* User info */}
              <div className="mb-4 flex items-center justify-between gap-2 border-b-2 border-dark-700 pb-4">
                {/* min-w-0 — иначе truncate у имени не срабатывал, и длинное имя
                    уходило за правый край экрана. */}
                <Link
                  to="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <Avatar size={44} />
                  <div className="min-w-0">
                    <div className="truncate text-base font-bold text-dark-100">
                      {displayName(user)}
                    </div>
                    <div className="truncate text-xs text-dark-400">
                      @{user?.username || `ID: ${user?.telegram_id}`}
                    </div>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-1.5">
                  {canToggle && (
                    <button
                      onClick={() => {
                        haptic.impact('light');
                        toggleTheme();
                      }}
                      className="rv-ibtn"
                      aria-label={
                        isDark ? t('theme.light') || 'Light mode' : t('theme.dark') || 'Dark mode'
                      }
                    >
                      {isDark ? <MoonIcon className="h-5 w-5" /> : <SunIcon className="h-5 w-5" />}
                    </button>
                  )}
                  <TicketNotificationBell isAdmin={isAdminActive()} />
                  <LanguageSwitcher />
                </div>
              </div>

              {/* Nav items */}
              <nav className="space-y-1">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={isActive(item.path) ? 'nav-item-active' : 'nav-item'}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                ))}

                {isAdmin && (
                  <>
                    <div className="divider my-3" />
                    <div className="px-4 py-1 text-xs font-medium uppercase tracking-wider text-dark-500">
                      {t('admin.nav.title')}
                    </div>
                    <Link
                      to="/admin"
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'nav-item',
                        isAdminActive() ? 'bg-warning-500/10 text-warning-400' : 'text-warning-500',
                      )}
                    >
                      <CogIcon className="h-5 w-5" />
                      {t('admin.nav.title')}
                    </Link>
                  </>
                )}

                <div className="divider my-3" />

                <Link
                  to="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className={isActive('/profile') ? 'nav-item-active' : 'nav-item'}
                >
                  <UserIcon className="h-5 w-5" />
                  {t('nav.profile')}
                </Link>

                <LogoutButton
                  variant="menu"
                  onLogout={() => {
                    setMobileMenuOpen(false);
                    logout();
                  }}
                />
              </nav>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
