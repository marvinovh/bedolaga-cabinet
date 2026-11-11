import { useTranslation } from 'react-i18next';
import { useIsTelegram } from '@/platform/hooks/usePlatform';
import { LogoutIcon } from './icons';

interface LogoutButtonProps {
  /** `menu` — пункт мобильного меню, `icon` — кнопка в шапке на широком экране. */
  variant: 'menu' | 'icon';
  onLogout: () => void;
}

/**
 * Выход есть только в браузере. В Telegram вход идёт по initData: после
 * «выхода» страница входа тут же входит обратно, кнопка лишь путает.
 */
export function LogoutButton({ variant, onLogout }: LogoutButtonProps) {
  const { t } = useTranslation();
  const isTelegram = useIsTelegram();
  if (isTelegram) return null;

  if (variant === 'menu') {
    return (
      <button type="button" onClick={onLogout} className="nav-item w-full text-error-400">
        <LogoutIcon className="h-5 w-5" />
        {t('nav.logout')}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onLogout}
      className="grid h-10 w-10 place-items-center rounded-full text-[#111] transition-colors duration-150 hover:bg-[#111]/10"
      aria-label={t('nav.logout')}
      title={t('nav.logout')}
    >
      <LogoutIcon className="h-5 w-5" />
    </button>
  );
}
