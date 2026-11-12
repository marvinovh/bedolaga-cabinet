import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { tariffsApi, type TariffListItem } from '../api/tariffs';
import { useDestructiveConfirm, useNotify } from '@/platform';
import { usePlatform } from '../platform/hooks/usePlatform';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { BackIcon, GripIcon, PlusIcon, SaveIcon } from '@/components/icons';

// ============ Sortable Tariff Card ============

interface SortableTariffCardProps {
  selected?: boolean;
  onSelect?: () => void;
  tariff: TariffListItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onToggleTrial: () => void;
}

function SortableTariffCard({ selected, onSelect, tariff, onToggle }: SortableTariffCardProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tariff.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: isDragging ? 'relative' : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-[18px] border-2 bg-dark-900 px-3 py-3.5 transition-colors',
        isDragging && 'shadow-[6px_6px_0_rgba(0,0,0,.6)]',
        selected
          ? 'border-accent-500 bg-[var(--rv-acc-bg)]'
          : 'border-dark-700 hover:border-dark-600',
        !tariff.is_active && 'opacity-55',
      )}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 cursor-grab touch-none rounded-lg p-2 text-dark-400 hover:text-dark-100 active:cursor-grabbing"
        title={t('admin.tariffs.dragToReorder')}
      >
        <GripIcon />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-base font-bold text-dark-100">{tariff.name}</h3>
          {tariff.is_daily && (
            <span className="rounded-md border-2 border-accent-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-400">
              {t('admin.tariffs.dailyType')}
            </span>
          )}
          {tariff.is_trial_available && (
            <span className="rounded-md border-2 border-accent-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-400">
              {t('admin.tariffs.trial')}
            </span>
          )}
          {tariff.show_in_gift && (
            <span className="rounded-md border-2 border-dark-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-dark-300">
              {t('admin.tariffs.giftBadge')}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-dark-400">
          {tariff.is_daily && tariff.daily_price_kopeks > 0
            ? `${(tariff.daily_price_kopeks / 100).toFixed(0)} ${t('admin.tariffs.currencyPerDay')} · `
            : ''}
          {tariff.traffic_limit_gb === 0
            ? t('admin.tariffs.unlimited')
            : `${tariff.traffic_limit_gb} ГБ`}
          {' · '}
          {t('admin.tariffs.devices', { count: tariff.device_limit })}
          {' · '}
          {t('admin.tariffs.subscriptions', { count: tariff.subscriptions_count })}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={tariff.is_active}
        aria-label={tariff.is_active ? t('admin.tariffs.deactivate') : t('admin.tariffs.activate')}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="rv-tog shrink-0"
      />
    </div>
  );
}

// ============ Main Page ============

export default function AdminTariffs() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirmDelete = useDestructiveConfirm();
  const notify = useNotify();
  const { capabilities } = usePlatform();

  const [localTariffs, setLocalTariffs] = useState<TariffListItem[]>([]);
  const [orderChanged, setOrderChanged] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Queries
  const { data: tariffsData, isLoading } = useQuery({
    queryKey: ['admin-tariffs'],
    queryFn: () => tariffsApi.getTariffs(true),
  });

  // Sync fetched data to local state
  useEffect(() => {
    if (tariffsData?.tariffs && !orderChanged) {
      setLocalTariffs(tariffsData.tariffs);
    }
  }, [tariffsData, orderChanged]);

  // Save order mutation
  const saveOrderMutation = useMutation({
    mutationFn: (tariffIds: number[]) => tariffsApi.updateOrder(tariffIds),
    onSuccess: () => {
      setOrderChanged(false);
      queryClient.invalidateQueries({ queryKey: ['admin-tariffs'] });
      notify.success(t('admin.tariffs.orderSaved'));
    },
  });

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: tariffsApi.deleteTariff,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-tariffs'] });
      if (data.affected_subscriptions > 0) {
        notify.success(
          t('admin.tariffs.deleteSuccessWithSubscriptions', { count: data.affected_subscriptions }),
        );
      } else {
        notify.success(t('admin.tariffs.deleteSuccess'));
      }
    },
  });

  const handleDelete = async (tariff: TariffListItem) => {
    const confirmText =
      tariff.subscriptions_count > 0
        ? t('admin.tariffs.confirmDeleteWithSubscriptions', {
            count: tariff.subscriptions_count,
          })
        : t('admin.tariffs.confirmDeleteText');

    const confirmed = await confirmDelete(
      confirmText,
      t('common.delete'),
      t('admin.tariffs.confirmDelete'),
    );

    if (confirmed) {
      deleteMutation.mutate(tariff.id);
    }
  };

  const toggleMutation = useMutation({
    mutationFn: tariffsApi.toggleTariff,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tariffs'] });
    },
  });

  const toggleTrialMutation = useMutation({
    mutationFn: tariffsApi.toggleTrial,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tariffs'] });
    },
  });

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLocalTariffs((prev) => {
        const oldIndex = prev.findIndex((t) => t.id === active.id);
        const newIndex = prev.findIndex((t) => t.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
      setOrderChanged(true);
    }
  }, []);

  const handleSaveOrder = () => {
    saveOrderMutation.mutate(localTariffs.map((t) => t.id));
  };

  const selectedTariff = localTariffs.find((x) => x.id === selectedId) ?? localTariffs[0];

  return (
    <div className="animate-fade-in">
      {/* Шапка (макет «A4 · Тарифы») */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-end gap-3">
          {!capabilities.hasBackButton && (
            <button
              onClick={() => navigate('/admin')}
              className="rv-ibtn lg:hidden"
              aria-label={t('common.back')}
            >
              <BackIcon />
            </button>
          )}
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-dark-400">
              {t('admin.groups.tariffs')}
            </p>
            <h1 className="rv-title !text-[44px] lg:!text-[56px]">{t('admin.tariffs.title')}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {orderChanged && (
            <button
              onClick={handleSaveOrder}
              disabled={saveOrderMutation.isPending}
              className="btn btn-secondary"
            >
              <SaveIcon className="h-4 w-4" />
              {t('admin.tariffs.saveOrder')}
            </button>
          )}
          <button onClick={() => navigate('/admin/tariffs/create')} className="btn btn-primary">
            <PlusIcon />
            {t('admin.tariffs.create')}
          </button>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div>
          <p className="mb-3 text-sm text-dark-400">{t('admin.tariffs.dragToReorder')}</p>
          {isLoading ? (
            <SkeletonGroup className="space-y-3">
              <Skeleton variant="card" count={3} className="h-16" />
            </SkeletonGroup>
          ) : localTariffs.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-dark-400">{t('admin.tariffs.noTariffs')}</p>
            </div>
          ) : (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <SortableContext
                items={localTariffs.map((x) => x.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2.5">
                  {localTariffs.map((tariff) => (
                    <SortableTariffCard
                      key={tariff.id}
                      tariff={tariff}
                      selected={tariff.id === selectedTariff?.id}
                      onSelect={() =>
                        window.matchMedia('(min-width: 1024px)').matches
                          ? setSelectedId(tariff.id)
                          : navigate(`/admin/tariffs/${tariff.id}/edit`)
                      }
                      onEdit={() => navigate(`/admin/tariffs/${tariff.id}/edit`)}
                      onDelete={() => handleDelete(tariff)}
                      onToggle={() => toggleMutation.mutate(tariff.id)}
                      onToggleTrial={() => toggleTrialMutation.mutate(tariff.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {selectedTariff && (
          <TariffPanel
            tariff={selectedTariff}
            onEdit={() => navigate(`/admin/tariffs/${selectedTariff.id}/edit`)}
            onDelete={() => handleDelete(selectedTariff)}
            onToggleTrial={() => toggleTrialMutation.mutate(selectedTariff.id)}
          />
        )}
      </div>
    </div>
  );
}

/** Правая панель выбранного тарифа: превью «Так увидит клиент» и действия. */
function TariffPanel({
  tariff,
  onEdit,
  onDelete,
  onToggleTrial,
}: {
  tariff: TariffListItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggleTrial: () => void;
}) {
  const { t } = useTranslation();
  const { data: detail } = useQuery({
    queryKey: ['admin-tariff', tariff.id],
    queryFn: () => tariffsApi.getTariff(tariff.id),
    staleTime: 30_000,
  });
  const periods = [...(detail?.period_prices ?? [])].sort((a, b) => a.days - b.days);
  const shown =
    periods.find((p) => p.days === detail?.highlight_period_days) ??
    periods.find((p) => p.days === 90) ??
    periods[0];
  const month = periods.find((p) => p.days === 30);
  return (
    <section className="bento-card hidden !p-6 lg:block">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="rv-d text-[40px] text-dark-100">{tariff.name}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDelete}
            className="btn btn-danger !min-h-10 !py-2 !text-[16px]"
          >
            {t('admin.tariffs.delete')}
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="btn btn-primary !min-h-10 !py-2 !text-[16px] !shadow-none"
          >
            {t('admin.tariffs.edit')}
          </button>
        </div>
      </div>
      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3">
            {[
              [
                t('rv.at.traffic'),
                tariff.traffic_limit_gb === 0
                  ? t('admin.tariffs.unlimited')
                  : `${tariff.traffic_limit_gb} ГБ`,
              ],
              [t('rv.at.devices'), String(tariff.device_limit)],
              [t('rv.at.servers'), String(tariff.servers_count)],
              [t('rv.at.subscribers'), String(tariff.subscriptions_count)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border-2 border-dark-700 bg-dark-800 px-4 py-3">
                <dt className="text-xs font-bold text-dark-400">{k}</dt>
                <dd className="mt-1 text-lg font-bold text-dark-100">{v}</dd>
              </div>
            ))}
          </dl>
          {periods.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-bold text-dark-200">{t('rv.at.prices')}</p>
              <div className="grid grid-cols-3 gap-2.5">
                {periods.map((p) => {
                  const off =
                    month && p.days > 30
                      ? Math.round((1 - p.price_kopeks / (p.days / 30) / month.price_kopeks) * 100)
                      : 0;
                  return (
                    <div
                      key={p.days}
                      className="rounded-xl border-2 border-dark-700 bg-dark-800 px-4 py-3"
                    >
                      <p className="text-xs text-dark-400">
                        {t('rv.pick.days', { count: p.days })}
                        {off > 0 ? ` · −${off}%` : ''}
                      </p>
                      <p className="mt-1 text-lg font-bold text-dark-100">
                        {Math.round(p.price_kopeks / 100)} ₽
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={tariff.is_trial_available}
              onClick={onToggleTrial}
              className="rv-tog"
              aria-label={t('admin.tariffs.toggleTrial')}
            />
            <span className="text-[15px] text-dark-200">{t('admin.tariffs.toggleTrial')}</span>
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-bold text-dark-200">{t('rv.at.preview')}</p>
          <div className="rv-card-acc relative rounded-[22px] border-2 p-5">
            <h3 className="rv-d text-[30px]">{tariff.name}</h3>
            {tariff.description && (
              <p className="mt-1.5 text-sm leading-snug">{tariff.description}</p>
            )}
            {shown && (
              <p className="mt-3 flex items-baseline gap-2">
                <span className="rv-num text-[52px]">
                  {Math.round(shown.price_kopeks / 100)}
                  <span className="rv-rub">₽</span>
                </span>
                <span className="text-sm">/ {t('rv.pick.days', { count: shown.days })}</span>
              </p>
            )}
            <p className="mt-3 border-t-2 border-[#111]/35 pt-3 text-[15px] font-bold">
              {tariff.traffic_limit_gb === 0
                ? t('admin.tariffs.unlimited')
                : `${tariff.traffic_limit_gb} ГБ`}
              {' · '}
              {t('subscription.devices', { count: tariff.device_limit })}
            </p>
          </div>
          <p className="mt-2 text-xs leading-snug text-dark-400">
            {t('rv.at.previewNote', { count: tariff.subscriptions_count })}
          </p>
        </div>
      </div>
    </section>
  );
}
