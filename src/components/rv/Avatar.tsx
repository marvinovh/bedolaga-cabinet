import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useUserAvatar } from '@/hooks/useUserAvatar';
import { displayName } from '@/utils/displayName';

interface AvatarProps {
  className?: string;
  size?: number;
  /** Чёрный кружок с лаймовой буквой (на лаймовой шапке) */
  onAccent?: boolean;
}

/** Круглый аватар с первой буквой имени, если фото нет. */
export function Avatar({ className, size = 44, onAccent = false }: AvatarProps) {
  const user = useAuthStore((s) => s.user);
  const avatar = useUserAvatar(user);
  const letter = (displayName(user) || '?').trim().charAt(0).toUpperCase();

  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-full border-2 font-bold',
        onAccent
          ? 'border-[#111] bg-[#111] text-[rgb(var(--color-accent-500))]'
          : 'border-dark-700 bg-dark-700 text-dark-100',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {avatar.src ? (
        <img
          src={avatar.src}
          alt=""
          className="h-full w-full object-cover"
          onError={avatar.onError}
        />
      ) : (
        letter
      )}
    </span>
  );
}
