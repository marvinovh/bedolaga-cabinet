import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { subscriptionApi } from '../api/subscription';
import { WebBackButton } from '../components/WebBackButton';
import { DevicesPanel } from '../components/subscription/manage/DevicesPanel';
import { ChevronRightIcon, PlusIcon } from '@/components/icons';
import { PageSkeleton, Skeleton } from '@/components/ui/skeleton';

/** «Мои устройства» — отдельный экран (макет «13 · Мои устройства»). */
export default function SubscriptionDevices() {
  const { t } = useTranslation();
  const { subscriptionId: idParam } = useParams<{ subscriptionId: string }>();
  const subscriptionId = idParam ? Number.parseInt(idParam, 10) : undefined;

  const { data: subResponse, isLoading } = useQuery({
    queryKey: ['subscription', subscriptionId],
    queryFn: () => subscriptionApi.getSubscription(subscriptionId),
  });
  const { data: devicesData } = useQuery({
    queryKey: ['devices', subscriptionId],
    queryFn: () => subscriptionApi.getDevices(subscriptionId),
  });
  const subscription = subResponse?.subscription ?? null;

  if (isLoading) {
    return (
      <PageSkeleton leading={1} titleWidth="w-48">
        <Skeleton variant="card" className="h-32" />
        <Skeleton variant="card" className="h-48" />
      </PageSkeleton>
    );
  }
  if (!subscription) return null;

  const used = devicesData?.total ?? 0;
  const limit = subscription.device_limit;
  const back = `/subscriptions/${subscription.id}`;

  return (
    <div className="mx-auto max-w-[760px] space-y-3 lg:space-y-5">
      <div className="flex items-center gap-3">
        <WebBackButton to={back} />
        <h1 className="rv-title !text-[30px] lg:!text-[44px]">{t('rv.dev.title')}</h1>
      </div>

      <section className="bento-card !p-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-base font-bold text-dark-100">{t('rv.dev.taken')}</span>
          <span className="text-sm text-dark-400">
            <span className="rv-num mr-1 text-[36px] text-dark-100">{used}</span>
            {limit > 0 ? `${t('rv.of')} ${limit}` : '∞'}
          </span>
        </div>
        {limit > 0 && limit <= 12 && (
          <div className="rv-slots mt-3">
            {Array.from({ length: limit }, (_, i) => (
              <i key={i} className={i < used ? 'on' : undefined} />
            ))}
          </div>
        )}
        <p className="mt-3 text-sm leading-snug text-dark-400">{t('rv.dev.hint')}</p>
      </section>

      <section className="bento-card !px-5 !py-4">
        <DevicesPanel subscription={subscription} subscriptionId={subscription.id} />
      </section>

      {subscription.subscription_url && (
        <Link
          to={`/connection?sub=${subscription.id}`}
          className="btn btn-primary rv-btn-lg w-full"
        >
          <PlusIcon className="h-5 w-5" />
          {t('rv.connectDevice')}
        </Link>
      )}

      {limit > 0 && (
        <Link to={back} className="bento-card rv-card-dash flex items-center gap-4 !p-5">
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold text-dark-100">
              {t('rv.dev.needMore', { count: limit })}
            </span>
            <span className="mt-1 block text-sm text-dark-400">{t('rv.dev.needMoreHint')}</span>
          </span>
          <ChevronRightIcon className="h-5 w-5 text-dark-400" />
        </Link>
      )}
    </div>
  );
}
