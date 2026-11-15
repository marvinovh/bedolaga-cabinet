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
  ArrowRightIcon,
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
        className={cn(
          'app-mobile-header fixed left-0 right-0 top-0 z-50 transition-colors duration-200 lg:hidden',
          mobileMenuOpen ? 'border-b-2 border-[#111]/10 !bg-accent-500' : 'bg-dark-950',
        )}
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
        >
          <div className="flex h-16 items-center justify-between gap-2.5">
            <Brand
              size={36}
              radius={10}
              onAccent={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(false)}
            />

            <div className="flex min-w-0 items-center gap-2">
              <div onClick={() => setMobileMenuOpen(false)}>
                <BalanceChip onAccent={mobileMenuOpen} />
              </div>
              {/* Бургер как на лендинге: рамка, три полоски; открыт — чёрный с крестиком */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  haptic.impact('light');
                  setMobileMenuOpen(!mobileMenuOpen);
                }}
                className={cn(
                  'relative h-11 w-11 shrink-0 rounded-[11px] border-2 transition-colors',
                  mobileMenuOpen ? 'border-[#111] bg-[#111]' : 'border-dark-600 bg-transparent',
                )}
                aria-label={mobileMenuOpen ? t('common.close') : t('rv.menu')}
                aria-expanded={mobileMenuOpen}
                aria-controls="rv-mnav"
              >
                {[0, 1, 2].map((i) => (
                  <i
                    key={i}
                    className={cn(
                      'absolute left-[10px] right-[10px] h-[2.5px] rounded-sm transition-all duration-200',
                      mobileMenuOpen ? 'bg-[rgb(var(--color-accent-500))]' : 'bg-dark-100',
                      mobileMenuOpen
                        ? i === 0
                          ? 'top-[18.75px] rotate-45'
                          : i === 1
                            ? 'top-[18.75px] opacity-0'
                            : 'top-[18.75px] -rotate-45'
                        : i === 0
                          ? 'top-[11px]'
                          : i === 1
                            ? 'top-[18.75px]'
                            : 'top-[26.5px]',
                    )}
                  />
                ))}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Меню как на лендинге: лаймовая панель под шапкой, крупные пункты со стрелками */}
      {mobileMenuOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden" style={{ top: headerHeight }}>
          <div className="absolute inset-0 bg-black/55" onClick={() => setMobileMenuOpen(false)} />
          <nav
            id="rv-mnav"
            aria-label={t('rv.menu')}
            className="mobile-menu-content relative max-h-full animate-fade-in overflow-y-auto overscroll-contain border-b-2 border-[#111] bg-accent-500 pb-[calc(1.4rem+env(safe-area-inset-bottom,0px))] text-[#111] shadow-[0_24px_40px_rgba(0,0,0,.25)]"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]">
              {/* Кто вошёл + язык, уведомления, тема */}
              <div className="flex items-center justify-between gap-2 border-b-2 border-[#111]/15 py-3">
                <Link
                  to="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <Avatar size={40} onAccent />
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-bold">
                      {displayName(user)}
                    </span>
                    <span className="block truncate text-xs text-[#111]/65">
                      @{user?.username || `ID: ${user?.telegram_id}`}
                    </span>
                  </span>
                </Link>
                <div className="flex shrink-0 items-center gap-1.5">
                  {canToggle && (
                    <button
                      type="button"
                      onClick={() => {
                        haptic.impact('light');
                        toggleTheme();
                      }}
                      className="grid h-10 w-10 place-items-center rounded-[11px] border-2 border-[#111]"
                      aria-label={isDark ? t('theme.light') : t('theme.dark')}
                    >
                      {isDark ? <MoonIcon className="h-5 w-5" /> : <SunIcon className="h-5 w-5" />}
                    </button>
                  )}
                  <TicketNotificationBell isAdmin={isAdminActive()} />
                  <LanguageSwitcher />
                </div>
              </div>

              {[
                ...navItems,
                ...(isAdmin
                  ? [{ path: '/admin', label: t('admin.nav.title'), icon: CogIcon }]
                  : []),
                { path: '/profile', label: t('nav.profile'), icon: UserIcon },
              ].map((item) => {
                const active = item.path === '/admin' ? isAdminActive() : isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className="flex items-center justify-between gap-3 border-b-2 border-[#111]/15 py-3.5"
                  >
                    <span
                      className={cn(
                        'font-display text-[36px] uppercase leading-[0.95]',
                        active &&
                          'inline-block -rotate-[1.6deg] rounded-[0.22em] bg-[#111] px-[0.16em] pt-[0.06em] text-[rgb(var(--color-accent-500))]',
                      )}
                    >
                      {item.label}
                    </span>
                    <ArrowRightIcon className="h-6 w-6 shrink-0" />
                  </Link>
                );
              })}

              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <Link
                  to="/balance"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex min-h-[54px] items-center justify-center rounded-[14px] border-2 border-[#111] bg-[#111] px-2 text-center font-display text-[20px] uppercase leading-none text-[rgb(var(--color-accent-500))]"
                >
                  {t('rv.topUp')}
                </Link>
                <Link
                  to="/support"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex min-h-[54px] items-center justify-center rounded-[14px] border-2 border-[#111] px-2 text-center font-display text-[20px] uppercase leading-none"
                >
                  {t('nav.support')}
                </Link>
              </div>
              <div className="mt-3 [&_button]:!text-[#111]">
                <LogoutButton
                  variant="menu"
                  onLogout={() => {
                    setMobileMenuOpen(false);
                    logout();
                  }}
                />
              </div>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
