import { Link } from 'react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserDetailResponse, UserPanelInfo } from '@/api/adminUsers';
import { AdminBackButton } from '@/components/admin/AdminBackButton';
import { AccountStatusChip } from '@/components/admin/users';
import { cn } from '@/lib/utils';
import { useNotify } from '@/platform/hooks/useNotify';
import { copyToClipboard } from '@/utils/clipboard';
import { isConnectedNow } from '@/utils/relativeTime';

interface UserHeaderProps {
  user: UserDetailResponse;
  panelInfo: UserPanelInfo | null;
  /** «Написать»; продление — у подписки во вкладке «Подписка», начисление — во вкладке «Баланс». */
  actions: ReactNode;
  /** Меню «⋯»: на телефоне стоит у имени, на широком экране — после кнопок. */
  menu: ReactNode;
}

/**
 * Шапка отвечает на первые вопросы поддержки, не заставляя листать: кто это,
 * в каком состоянии аккаунт и подписка, онлайн ли сейчас, что с ним сделать.
 */
export function UserHeader({ user, panelInfo, actions, menu }: UserHeaderProps) {
  const { t } = useTranslation();
  const notify = useNotify();
  // Как зелёная точка в самой панели: отметка подключения не старше минуты.
  const online = isConnectedNow(panelInfo?.online_at);
  const muted = user.status === 'blocked' || user.status === 'deleted';

  const copy = async (value: string) => {
    try {
      await copyToClipboard(value);
      notify.success(t('admin.users.detail.copied'));
    } catch {
      notify.error(t('common.error'));
    }
  };

  const sub = user.subscription;
  const subChip = sub
    ? sub.is_active
      ? { cls: 'badge-success', text: t('rv.ud.subActive') }
      : { cls: 'badge-error', text: t('rv.ud.subInactive') }
    : { cls: 'badge-neutral', text: t('rv.ud.noSub') };

  // Макет «A3 · Карточка пользователя»: крошки, лаймовый аватар, имя Bebas, теги.
  return (
    <div>
      <p className="mb-4 hidden text-[13px] text-dark-400 lg:block">
        <Link to="/admin/users" className="underline underline-offset-2">
          {t('admin.users.title')}
        </Link>{' '}
        / {user.full_name}
      </p>
      <div className="flex items-start gap-3 lg:items-center lg:gap-4">
        <AdminBackButton to="/admin/users" />
        <span
          className={cn(
            'grid h-14 w-14 shrink-0 place-items-center rounded-full text-2xl font-bold lg:h-[76px] lg:w-[76px] lg:text-3xl',
            muted ? 'bg-dark-700 text-dark-300' : 'bg-accent-500 text-[#111]',
          )}
        >
          {(user.first_name || user.username || '?').charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="rv-d break-words text-[34px] text-dark-100 lg:text-[52px]">
            {user.full_name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {user.status !== 'active' ? (
              <AccountStatusChip status={user.status} />
            ) : (
              <span className={subChip.cls}>
                <i className="rv-tag-dot" />
                {subChip.text}
              </span>
            )}
            {online && (
              <span className="badge-neutral">
                <i className="rv-tag-dot text-accent-500" />
                {panelInfo?.last_connected_node_name
                  ? t('admin.users.detail.header.onlineAt', {
                      node: panelInfo.last_connected_node_name,
                    })
                  : t('common.relative.online')}
              </span>
            )}
            {user.username && (
              <button
                type="button"
                onClick={() => copy(`@${user.username}`)}
                className="badge-neutral"
              >
                @{user.username}
              </button>
            )}
            {user.telegram_id > 0 && (
              <button
                type="button"
                onClick={() => copy(String(user.telegram_id))}
                className="badge-neutral"
              >
                ID {user.telegram_id}
              </button>
            )}
            {user.promo_group && (
              <span className="badge-neutral">
                {t('admin.users.detail.header.group', { name: user.promo_group.name })}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {menu}
        </div>
      </div>
    </div>
  );
}
