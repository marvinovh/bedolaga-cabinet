import { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { useAuthStore } from '@/store/auth';
import { useHaptic } from '@/platform';
import { useTelegramSDK } from '@/hooks/useTelegramSDK';
import { useHeaderHeight } from '@/hooks/useHeaderHeight';
import { useTheme } from '@/hooks/useTheme';
import { useBranding } from '@/hooks/useBranding';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useLiteMode } from '@/hooks/useLiteMode';
import { useScrollRestoration } from '@/hooks/useScrollRestoration';
import { resetVirtualKeyboard } from '@/hooks/useVirtualKeyboard';
import { themeColorsApi } from '@/api/themeColors';
import { cn } from '@/lib/utils';

import WebSocketNotifications from '@/components/WebSocketNotifications';
import CampaignBonusNotifier from '@/components/CampaignBonusNotifier';
import SuccessNotificationModal from '@/components/SuccessNotificationModal';
import { PromptDialogHost } from '@/components/PromptDialogHost';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import TicketNotificationBell from '@/components/TicketNotificationBell';
import {
  SubscriptionIcon,
  GiftIcon,
  HomeIcon,
  CreditCardIcon,
  ChatIcon,
  UsersIcon,
  ShieldIcon,
  InfoIcon,
  SunIcon,
  MoonIcon,
} from '@/components/icons';

import { MobileBottomNav } from './MobileBottomNav';
import { isMobileNavScreen, mobileNavItems } from './mobileNavRoutes';
import { AppHeader } from './AppHeader';
import { LogoutButton } from './LogoutButton';
import { useBackgroundConsumer } from '@/components/backgrounds/BackgroundHost';
import { Avatar, BalanceChip, Brand } from '@/components/rv';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const logout = useAuthStore((state) => state.logout);
  const { isFullscreen, safeAreaInset, contentSafeAreaInset, platform, isMobile } =
    useTelegramSDK();
  const { mobileCss: headerHeight } = useHeaderHeight();
  const haptic = useHaptic();
  const { toggleTheme, isDark } = useTheme();

  // Extracted hooks
  // useBranding тянет брендинг и включает fullscreen в Mini App — нужен и без вывода тут.
  useBranding();
  const { referralEnabled, wheelEnabled, hasContests, hasPolls, giftEnabled } = useFeatureFlags();
  const { lite } = useLiteMode();
  useScrollRestoration();
  // Анимированный фон рендерит BackgroundHost в App (не перемонтируется при
  // смене роута) — здесь только регистрируем, что на этом роуте он нужен.
  useBackgroundConsumer();

  // Theme toggle visibility
  const { data: enabledThemes } = useQuery({
    queryKey: ['enabled-themes'],
    queryFn: themeColorsApi.getEnabledThemes,
    staleTime: 1000 * 60 * 5,
  });
  const canToggleTheme = enabledThemes?.dark && enabledThemes?.light;

  // Only apply fullscreen UI adjustments on mobile Telegram (iOS/Android)
  const isMobileFullscreen = isFullscreen && isMobile;

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Смена экрана закрывает сигнал «клавиатура открыта» (useVirtualKeyboard):
  // поле с фокусом размонтировано, blur не приходит, и прижатые к низу элементы
  // иначе остаются спрятанными.
  // biome-ignore lint/correctness/useExhaustiveDependencies: путь нужен как триггер — сброс на каждой смене экрана
  useEffect(() => {
    resetVirtualKeyboard();
  }, [location.pathname]);

  // Нижняя панель живёт только на экранах своих кнопок; на остальных её нет и
  // место под неё не резервируется (data-mobile-nav="off" → --mobile-nav-clearance).
  const navItems = mobileNavItems({ wheelEnabled, referralEnabled, lite });
  const showMobileNav = isMobileNavScreen(location.pathname, navItems);

  // Desktop navigation — labels always visible (no hover-reveal gimmick)
  const desktopNav = [
    { path: '/', label: t('nav.dashboard'), icon: HomeIcon },
    { path: '/subscriptions', label: t('nav.subscription'), icon: SubscriptionIcon },
    { path: '/balance', label: t('nav.balance'), icon: CreditCardIcon },
    ...(referralEnabled ? [{ path: '/referral', label: t('nav.referral'), icon: UsersIcon }] : []),
    ...(giftEnabled ? [{ path: '/gift', label: t('nav.gift'), icon: GiftIcon }] : []),
    { path: '/support', label: t('nav.support'), icon: ChatIcon },
    { path: '/info', label: t('nav.info'), icon: InfoIcon },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const handleNavClick = () => {
    haptic.impact('light');
  };

  // Пункт лаймовой шапки: активный — чёрная плашка с лаймовым текстом.
  const renderNavLink = (
    path: string,
    label: string,
    Icon: React.ComponentType<{ className?: string }>,
    admin = false,
  ) => {
    const active = admin ? location.pathname.startsWith('/admin') : isActive(path);
    return (
      <Link
        key={path}
        to={path}
        onClick={handleNavClick}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex shrink-0 items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[15px] font-bold leading-none text-[#111] transition-colors duration-150',
          active ? 'bg-[#111] text-[rgb(var(--color-accent-500))]' : 'hover:bg-[#111]/10',
        )}
      >
        {admin && <Icon className="h-4 w-4 shrink-0" />}
        <span className="whitespace-nowrap">{label}</span>
      </Link>
    );
  };

  // headerHeight comes from useHeaderHeight() — accounts for TG safe area in fullscreen

  return (
    <div className="min-h-viewport" data-mobile-nav={showMobileNav ? 'on' : 'off'}>
      {/* Global components */}
      <WebSocketNotifications />
      <CampaignBonusNotifier />
      <SuccessNotificationModal />
      <PromptDialogHost />

      {/* Desktop Header */}
      {/* w-screen вместо left-0 right-0: right-0 упирается в край вьюпорта БЕЗ
          скроллбара, и капсула по центру прыгала бы на полширины скроллбара при
          переходах между страницами со скроллом и без. 100vw даёт ту же ось
          центрирования, что и у body (тоже 100vw). */}
      <header className="fixed left-0 top-0 z-50 hidden w-screen bg-accent-500 text-[#111] lg:block">
        <div className="mx-auto flex h-[68px] max-w-[1184px] items-center gap-4 px-6">
          <Brand size={36} onAccent onClick={handleNavClick} />

          <nav className="mx-auto flex min-w-0 items-center gap-1 overflow-x-auto scrollbar-hide">
            {desktopNav.map((item) => renderNavLink(item.path, item.label, item.icon))}
            {isAdmin && renderNavLink('/admin', t('admin.nav.title'), ShieldIcon, true)}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => {
                haptic.impact('light');
                toggleTheme();
              }}
              className={cn(
                'grid h-10 w-10 place-items-center rounded-full text-[#111] transition-colors hover:bg-[#111]/10',
                !canToggleTheme && 'hidden',
              )}
              aria-label={
                isDark ? t('theme.light') || 'Light mode' : t('theme.dark') || 'Dark mode'
              }
              title={isDark ? t('theme.light') || 'Light mode' : t('theme.dark') || 'Dark mode'}
            >
              {isDark ? <MoonIcon className="h-5 w-5" /> : <SunIcon className="h-5 w-5" />}
            </button>
            <div className="rv-on-accent-tools flex items-center gap-1">
              <TicketNotificationBell isAdmin={location.pathname.startsWith('/admin')} />
              <LanguageSwitcher />
            </div>
            <BalanceChip onAccent />
            <Link to="/profile" aria-label={t('nav.profile')} onClick={handleNavClick}>
              <Avatar size={44} onAccent />
            </Link>
            <LogoutButton
              variant="icon"
              onLogout={() => {
                haptic.impact('light');
                logout();
              }}
            />
          </div>
        </div>
      </header>

      {/* Mobile Header */}
      <AppHeader
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onCommandPaletteOpen={() => {}}
        headerHeight={headerHeight}
        isFullscreen={isMobileFullscreen}
        safeAreaInset={safeAreaInset}
        contentSafeAreaInset={contentSafeAreaInset}
        telegramPlatform={platform}
        wheelEnabled={wheelEnabled}
        referralEnabled={referralEnabled}
        hasContests={hasContests}
        hasPolls={hasPolls}
        giftEnabled={giftEnabled}
      />

      {/* Desktop spacer */}
      <div className="hidden h-[68px] lg:block" />

      {/* Mobile spacer */}
      <div className="lg:hidden" style={{ height: headerHeight }} />

      {/* Main content */}
      {/* Боковые отступы не меньше вырезов (альбомная ориентация iPhone); снизу —
          просвет под панелью: фиксированные 112px в standalone iOS не хватало,
          и низ контента уходил под неё. */}
      <main className="mx-auto max-w-[1136px] py-4 lg:py-8 pb-[calc(var(--mobile-nav-clearance)+0.5rem)] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] lg:px-6 lg:pb-8">
        {children}
      </main>

      {/* Mobile Bottom Navigation — только на экранах её кнопок */}
      {showMobileNav && <MobileBottomNav items={navItems} isMenuOpen={mobileMenuOpen} />}
    </div>
  );
}
