import { useTranslation } from 'react-i18next';
import { useIsTelegram } from '@/platform/hooks/usePlatform';
import { closeTelegramApp } from '@/hooks/useTelegramSDK';
import { LogoutIcon } from './icons';

interface LogoutButtonProps {
  variant: 'menu' | 'icon' | 'profile';
  onLogout: () => void;
}

/** Telegram signs in with initData on reopening, so exit also closes the Mini App. */
export function LogoutButton({ variant, onLogout }: LogoutButtonProps) {
  const { t } = useTranslation();
  const isTelegram = useIsTelegram();
  const handleLogout = () => {
    onLogout();
    if (isTelegram) closeTelegramApp();
  };

  if (variant === 'profile') {
    return (
      <button
        type="button"
        onClick={handleLogout}
        className="min-h-11 text-sm text-dark-400 hover:text-[var(--rv-bad)]"
      >
        {t('rv.profile.logout')}
      </button>
    );
  }

  if (variant === 'menu') {
    return (
      <button type="button" onClick={handleLogout} className="nav-item w-full text-error-400">
        <LogoutIcon className="h-5 w-5" />
        {t('nav.logout')}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={handleLogout}
      className="grid h-10 w-10 place-items-center rounded-full text-[#111] transition-colors duration-150 hover:bg-[#111]/10"
      aria-label={t('nav.logout')}
      title={t('nav.logout')}
    >
      <LogoutIcon className="h-5 w-5" />
    </button>
  );
}
