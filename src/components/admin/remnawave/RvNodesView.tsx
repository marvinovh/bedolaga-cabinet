import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import type { NodeInfo, NodeRealtimeStats } from '@/api/adminRemnawave';

/** Флаг страны из ISO-кода: «FI» → 🇫🇮. */
const flag = (code?: string) =>
  code && /^[a-z]{2}$/i.test(code)
    ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : '🌐';

const tb = (bytes: number) => {
  if (bytes >= 1e11) return { v: (bytes / 1e12).toFixed(1).replace('.', ','), u: 'ТБ' };
  if (bytes >= 1e9) return { v: (bytes / 1e9).toFixed(1).replace('.', ','), u: 'ГБ' };
  return { v: Math.round(bytes / 1e6).toString(), u: 'МБ' };
};

/** Нагрузка ноды: load average к числу ядер, иначе занятая память. */
export function nodeLoad(node: NodeInfo): number | null {
  const sys = node.system;
  if (!sys) return null;
  const cpus = sys.info?.cpus || 1;
  const load = sys.stats?.loadAvg?.[0];
  if (typeof load === 'number') return Math.min(100, Math.round((load / cpus) * 100));
  const total = sys.info?.memoryTotal;
  if (total) return Math.round((sys.stats.memoryUsed / total) * 100);
  return null;
}

type NodeState = 'online' | 'busy' | 'offline' | 'off';
export function nodeState(node: NodeInfo): NodeState {
  if (node.is_disabled) return 'off';
  if (!node.is_connected || !node.is_node_online) return 'offline';
  const load = nodeLoad(node);
  return load !== null && load >= 80 ? 'busy' : 'online';
}

/**
 * Сетка нод — макет «A9 · Ноды Remnawave»: KPI сверху и карточка на каждую ноду
 * со статусом, нагрузкой, онлайном и трафиком. Упавшая нода — красной рамкой
 * с действиями.
 */
export function RvNodesView({
  nodes,
  realtimeByUuid,
  isLoading,
  onAction,
  isActionLoading,
}: {
  nodes: NodeInfo[];
  realtimeByUuid: Record<string, NodeRealtimeStats>;
  isLoading: boolean;
  onAction: (uuid: string, action: 'enable' | 'disable' | 'restart') => void;
  isActionLoading: boolean;
}) {
  const { t } = useTranslation();

  const active = nodes.filter((n) => !n.is_disabled);
  const online = active.filter((n) => nodeState(n) !== 'offline');
  const down = active.filter((n) => nodeState(n) === 'offline');
  const usersOnline = nodes.reduce((acc, n) => acc + (n.users_online ?? 0), 0);
  const traffic = Object.values(realtimeByUuid).reduce((acc, r) => acc + (r.totalBytes || 0), 0);
  const versions = nodes.map((n) => n.versions?.xray).filter(Boolean) as string[];
  const xray = versions.sort(
    (a, b) => versions.filter((v) => v === b).length - versions.filter((v) => v === a).length,
  )[0];
  const xraySame = xray && versions.every((v) => v === xray);

  const order: Record<NodeState, number> = { offline: 0, busy: 1, online: 2, off: 3 };
  const sorted = [...nodes].sort((a, b) => order[nodeState(a)] - order[nodeState(b)]);
  const tTraffic = tb(traffic);

  const kpi = 'bento-card flex flex-col !p-5';
  const since = (iso?: string) => {
    if (!iso) return null;
    const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    return min < 120
      ? t('rv.nd.minAgo', { count: min })
      : t('rv.nd.hAgo', { count: Math.round(min / 60) });
  };

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <div className={kpi}>
          <span className="text-[13px] font-medium text-dark-300">{t('rv.nd.online')}</span>
          <span className="mt-3 flex items-baseline gap-1.5">
            <span className="rv-num text-[40px] text-dark-100 lg:text-[44px]">{online.length}</span>
            <span className="text-base text-dark-400">/ {active.length}</span>
          </span>
          {down.length > 0 ? (
            <span className="mt-2 truncate text-xs font-bold text-[var(--rv-bad)]">
              {down.length === 1
                ? t('rv.nd.oneDown', { name: down[0].name })
                : t('rv.nd.manyDown', { count: down.length })}
            </span>
          ) : (
            <span className="mt-2 text-xs font-bold text-accent-400">{t('rv.nd.allUp')}</span>
          )}
        </div>
        <div className={kpi}>
          <span className="text-[13px] font-medium text-dark-300">{t('rv.nd.users')}</span>
          <span className="rv-num mt-3 text-[40px] text-dark-100 lg:text-[44px]">
            {usersOnline.toLocaleString('ru-RU')}
          </span>
        </div>
        <div className={kpi}>
          <span className="text-[13px] font-medium text-dark-300">{t('rv.nd.traffic')}</span>
          <span className="rv-num mt-3 text-[40px] text-dark-100 lg:text-[44px]">
            {tTraffic.v} {tTraffic.u}
          </span>
        </div>
        <div className={kpi}>
          <span className="text-[13px] font-medium text-dark-300">{t('rv.nd.xray')}</span>
          <span className="rv-num mt-3 text-[40px] text-dark-100 lg:text-[44px]">
            {xray || '—'}
          </span>
          {xray && (
            <span className="mt-2 text-xs font-bold text-dark-400">
              {xraySame ? t('rv.nd.allNodes') : t('rv.nd.mixed')}
            </span>
          )}
        </div>
      </div>

      {isLoading && nodes.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="bento-card h-[150px] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:gap-4">
          {sorted.map((node) => {
            const st = nodeState(node);
            const load = nodeLoad(node);
            const rt = realtimeByUuid[node.uuid];
            const nodeTraffic = rt ? tb(rt.totalBytes) : null;
            const tag =
              st === 'offline'
                ? { cls: 'badge-error', text: 'offline' }
                : st === 'busy'
                  ? { cls: 'badge-warning', text: t('rv.nd.busy') }
                  : st === 'off'
                    ? { cls: 'badge-neutral', text: t('rv.nd.off') }
                    : { cls: 'badge-success', text: 'online' };
            return (
              <article
                key={node.uuid}
                className={cn(
                  'flex flex-col gap-3 rounded-[20px] border-2 bg-dark-900 p-4',
                  st === 'offline' ? 'border-[var(--rv-bad)]' : 'border-dark-700',
                  st === 'off' && 'border-dashed !bg-transparent opacity-70',
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#0B0B0B] text-2xl leading-none">
                    {flag(node.country_code)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold text-dark-100">
                      {node.name}
                    </span>
                    <span className="block truncate text-xs text-dark-400">{node.address}</span>
                  </span>
                  <span className={cn(tag.cls, 'shrink-0')}>
                    <i className="rv-tag-dot" />
                    {tag.text}
                  </span>
                </div>

                {st === 'offline' ? (
                  <>
                    <p className="text-xs font-bold leading-snug text-[var(--rv-bad)]">
                      {[
                        node.last_status_change
                          ? t('rv.nd.downFor', { time: since(node.last_status_change) })
                          : t('rv.nd.down'),
                        node.last_status_message,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <div className="mt-auto grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={isActionLoading}
                        onClick={() => onAction(node.uuid, 'restart')}
                        className="btn !min-h-10 border-2 border-[var(--rv-bad)] bg-transparent !px-2 !text-sm text-[var(--rv-bad)]"
                      >
                        {t('rv.nd.restart')}
                      </button>
                      <button
                        type="button"
                        disabled={isActionLoading}
                        onClick={() => onAction(node.uuid, 'disable')}
                        className="btn btn-secondary !min-h-10 !px-2 !text-sm"
                      >
                        {t('rv.nd.disable')}
                      </button>
                    </div>
                  </>
                ) : st === 'off' ? (
                  <button
                    type="button"
                    disabled={isActionLoading}
                    onClick={() => onAction(node.uuid, 'enable')}
                    className="btn btn-secondary mt-auto !min-h-10 !text-sm"
                  >
                    {t('rv.nd.enable')}
                  </button>
                ) : (
                  <>
                    <div>
                      <p className="mb-2 flex justify-between text-xs">
                        <span className="text-dark-400">{t('rv.nd.load')}</span>
                        <b className="text-dark-100">{load !== null ? `${load}%` : '—'}</b>
                      </p>
                      <div className={cn('rv-meter !h-2', st === 'busy' && 'rv-warn')}>
                        <i style={{ width: `${load ?? 0}%` }} />
                      </div>
                    </div>
                    <p className="flex justify-between gap-2 text-xs text-dark-400">
                      <span>
                        <b className="text-dark-100">{node.users_online ?? 0}</b>{' '}
                        {t('rv.nd.onlineShort')}
                      </span>
                      {nodeTraffic && (
                        <span>
                          <b className="text-dark-100">
                            {nodeTraffic.v} {nodeTraffic.u}
                          </b>{' '}
                          {t('rv.nd.today')}
                        </span>
                      )}
                    </p>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
