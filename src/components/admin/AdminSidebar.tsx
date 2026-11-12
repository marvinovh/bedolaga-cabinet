import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { usePermissionStore } from '@/store/permissions';
import { useAuthStore } from '@/store/auth';
import { displayName } from '@/utils/displayName';
import { Brand } from '@/components/rv';
import { ChevronRightIcon, SearchIcon } from '@/components/icons';
import { icons, sections } from './adminNav';

/**
 * Боковое меню админки на компьютере — макет «A0 · Меню админки»: группы со
 * счётчиками, раскрыта та, где текущая страница; активный пункт лаймовый.
 */
export function AdminSidebar({
  drawer = false,
  onClose,
}: {
  drawer?: boolean;
  onClose?: () => void;
} = {}) {
  const { t } = useTranslation();
  const location = useLocation();
  const hasPermission = usePermissionStore((s) => s.hasPermission);
  const user = useAuthStore((s) => s.user);
  const [query, setQuery] = useState('');

  const groups = useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) =>
              hasPermission(item.permission) &&
              (!query.trim() || t(item.name).toLowerCase().includes(query.trim().toLowerCase())),
          ),
        }))
        .filter((section) => section.items.length > 0),
    [hasPermission, query, t],
  );

  const isActive = (to: string) =>
    location.pathname === to || location.pathname.startsWith(`${to}/`);
  const activeGroup = groups.find((g) => g.items.some((i) => isActive(i.to)))?.id;
  const [open, setOpen] = useState<string | undefined>(activeGroup);
  const openId = query.trim() ? 'all' : (open ?? activeGroup);

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 flex-col gap-3.5 bg-[#0B0B0B] px-3 pb-6 text-[#E9E7DF]',
        drawer
          ? 'z-[70] flex w-full pt-[max(18px,env(safe-area-inset-top))] lg:hidden'
          : 'z-40 hidden w-[264px] border-r-2 border-[#222] pt-[18px] lg:flex',
      )}
      onClickCapture={(e) => {
        if (drawer && (e.target as HTMLElement).closest('a')) onClose?.();
      }}
    >
      <div className="flex items-center justify-between gap-2 px-1.5">
        <Brand size={34} className="[&>span:last-child]:!text-[#F2F0E8]" />
        <div className="flex items-center gap-2">
          <span className="rv-badge rv-badge-lime !rotate-0">{t('rv.admin.badge')}</span>
          {drawer && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="grid h-10 w-10 place-items-center rounded-xl border-2 border-[#2A2A2A] text-[#F2F0E8]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <label className="flex items-center gap-2.5 rounded-xl border-2 border-[#2A2A2A] bg-[#1B1B1B] px-3 py-2.5 text-sm text-[#8E8D86]">
        <SearchIcon className="h-4 w-4 shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('admin.panel.searchPlaceholder')}
          className="min-w-0 flex-1 bg-transparent text-[#F2F0E8] outline-none placeholder:text-[#8E8D86]"
        />
      </label>

      <nav className="scrollbar-hide -mx-1 flex-1 overflow-y-auto px-1">
        {groups.map((group) => {
          const expanded = openId === 'all' || openId === group.id;
          const groupActive = group.id === activeGroup;
          return (
            <div key={group.id} className="mb-0.5">
              <button
                type="button"
                onClick={() => setOpen(expanded ? '__none' : group.id)}
                aria-expanded={expanded}
                className={cn(
                  'flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left text-sm font-bold hover:bg-[#1B1B1B]',
                  groupActive ? 'text-[rgb(var(--color-accent-500))]' : 'text-[#F2F0E8]',
                )}
              >
                <ChevronRightIcon
                  className={cn('h-4 w-4 shrink-0 transition-transform', expanded && 'rotate-90')}
                />
                <span className="flex-1 truncate">{t(group.titleKey)}</span>
                <span className="text-[11px] font-bold text-[#8E8D86]">{group.items.length}</span>
              </button>
              {expanded && (
                <div className="ml-[18px] flex flex-col gap-0.5 border-l-2 border-[#2A2A2A] py-1 pl-2.5">
                  {group.items.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        'flex min-h-[36px] items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-sm',
                        isActive(item.to)
                          ? 'bg-accent-500 font-bold text-[#111]'
                          : 'font-medium text-[#D8D7CF] hover:bg-[#1B1B1B]',
                      )}
                    >
                      <span className="h-4 w-4 shrink-0 opacity-80 [&>svg]:h-4 [&>svg]:w-4">
                        {icons[item.icon]}
                      </span>
                      <span className="truncate">{t(item.name)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t-2 border-[#222] pt-3">
        <Link
          to="/"
          className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm font-medium text-[#D8D7CF] hover:bg-[#1B1B1B]"
        >
          <ChevronRightIcon className="h-4 w-4 rotate-180" />
          {t('rv.admin.toCabinet')}
        </Link>
        <div className="mt-2 flex items-center gap-2.5 px-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-500 text-sm font-bold text-[#111]">
            {(displayName(user) || '?').charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-[#F2F0E8]">
              {displayName(user)}
            </span>
            {user?.username && (
              <span className="block truncate text-xs text-[#8E8D86]">@{user.username}</span>
            )}
          </span>
        </div>
      </div>
    </aside>
  );
}
