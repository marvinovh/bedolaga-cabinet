import { Link } from 'react-router';
import { usePlatform } from '../platform';
import { BackIcon } from './icons';

interface WebBackButtonProps {
  to: string;
  replace?: boolean;
  className?: string;
}

/**
 * Back button visible only on web platform.
 * Hidden in Telegram Mini App — native back button handles navigation there.
 */
export function WebBackButton({ to, replace, className }: WebBackButtonProps) {
  const { platform } = usePlatform();

  if (platform === 'telegram') return null;

  return (
    <Link
      to={to}
      replace={replace}
      className={className || 'rv-ibtn transition-colors hover:border-dark-600'}
    >
      <BackIcon />
    </Link>
  );
}
