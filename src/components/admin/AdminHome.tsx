import { Navigate } from 'react-router';

import { usePermissionStore } from '@/store/permissions';
import { sections } from './adminNav';

export function getAdminHomePath(hasPermission: (permission: string) => boolean): string {
  if (hasPermission('stats:read')) return '/admin/dashboard';
  const first = sections.flatMap((s) => s.items).find((i) => hasPermission(i.permission));
  return first?.to ?? '/';
}

/**
 * Вход в админку: сразу «Статистика» (макет A1). Без права на статистику —
 * первый раздел меню, который доступен.
 */
export default function AdminHome() {
  const hasPermission = usePermissionStore((s) => s.hasPermission);
  const isLoaded = usePermissionStore((s) => s.isLoaded);
  // Права ещё грузятся — ждём, иначе ушли бы на главную кабинета.
  if (!isLoaded) return null;
  return <Navigate to={getAdminHomePath(hasPermission)} replace />;
}
