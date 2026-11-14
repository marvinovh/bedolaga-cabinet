import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '../hooks/useCurrency';
import i18n from '../i18n';
import { promocodesApi, type PromoCode, type PromoCodeType } from '../api/promocodes';
import { copyToClipboard } from '../utils/clipboard';
import { uiLocale } from '../utils/uiLocale';
import { getErrorMessage } from '../utils/subscriptionHelpers';
import { CheckIcon, EditIcon, SearchIcon, TrashIcon, XIcon } from '@/components/icons';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// Helper functions
const getTypeLabel = (type: PromoCodeType): string => {
  const labels: Record<PromoCodeType, string> = {
    balance: i18n.t('admin.promocodes.type.balance'),
    subscription_days: i18n.t('admin.promocodes.type.subscriptionDays'),
    trial_subscription: i18n.t('admin.promocodes.type.trialSubscription'),
    promo_group: i18n.t('admin.promocodes.type.promoGroup'),
    discount: i18n.t('admin.promocodes.type.discount'),
    balance_and_days: i18n.t('admin.promocodes.type.balanceAndDays'),
  };
  return labels[type] || type;
};

type PromoState = 'active' | 'exhausted' | 'expired' | 'off';
const promoState = (p: PromoCode): PromoState => {
  if (!p.is_active) return 'off';
  if (p.max_uses > 0 && p.current_uses >= p.max_uses) return 'exhausted';
  if (p.valid_until && new Date(p.valid_until).getTime() < Date.now()) return 'expired';
  return 'active';
};

export default function AdminPromocodes() {
  const { t } = useTranslation();
  const { formatAmount, currencySymbol } = useCurrency();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const codeRef = useRef<HTMLInputElement>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<PromoCode | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [panelOpen, setPanelOpen] = useState(true);

  const { data: promocodesData, isLoading } = useQuery({
    queryKey: ['admin-promocodes'],
    queryFn: () => promocodesApi.getPromocodes({ limit: 100 }),
  });

  const deleteMutation = useMutation({
    mutationFn: promocodesApi.deletePromocode,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-promocodes'] });
      setDeleteConfirm(null);
    },
  });

  const handleCopyCode = (code: string) => {
    void copyToClipboard(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const promocodes = useMemo(() => {
    const all = promocodesData?.items || [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (p) => p.code.toLowerCase().includes(q) || describe(p).toLowerCase().includes(q),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promocodesData, query]);

  const rub = (rubles: number) => `${formatAmount(rubles, rubles % 1 ? 2 : 0)} ${currencySymbol}`;
  function describe(p: PromoCode): string {
    const parts: string[] = [];
    if (p.type === 'discount')
      return t('rv.pc.give.discount', {
        percent: p.balance_bonus_kopeks,
        hours: p.subscription_days,
      });
    if (p.type === 'trial_subscription')
      return t('rv.pc.give.trial', { count: p.subscription_days });
    if (p.type === 'promo_group') return t('rv.pc.give.group');
    if (p.balance_bonus_rubles > 0)
      parts.push(t('rv.pc.give.balance', { amount: rub(p.balance_bonus_rubles) }));
    if (p.subscription_days > 0) parts.push(t('rv.pc.give.days', { count: p.subscription_days }));
    if ((p.traffic_gb || 0) > 0) parts.push(t('rv.pc.give.traffic', { count: p.traffic_gb }));
    return parts.join(' · ') || getTypeLabel(p.type);
  }
  const until = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' }) : '—';

  const stateTag = (st: PromoState) =>
    st === 'active'
      ? { cls: 'badge-success', text: t('rv.pc.st.active'), dot: true }
      : st === 'exhausted'
        ? { cls: 'badge-neutral', text: t('rv.pc.st.exhausted') }
        : st === 'expired'
          ? { cls: 'badge-error', text: t('rv.pc.st.expired'), dot: true }
          : { cls: 'badge-neutral', text: t('rv.pc.st.off') };

  const usage = (p: PromoCode) => {
    const pct = p.max_uses > 0 ? Math.min(100, (p.current_uses / p.max_uses) * 100) : 0;
    return (
      <div className="min-w-[110px]">
        {p.max_uses > 0 && (
          <div className={cn('rv-meter !h-2', pct >= 100 && 'rv-warn')}>
            <i style={{ width: `${pct}%` }} />
          </div>
        )}
        <span className="mt-1 block text-xs text-dark-400">
          {p.max_uses > 0
            ? t('rv.pc.usedOf', {
                used: p.current_uses.toLocaleString('ru-RU'),
                max: p.max_uses.toLocaleString('ru-RU'),
              })
            : p.current_uses.toLocaleString('ru-RU')}
        </span>
      </div>
    );
  };

  const actions = (p: PromoCode) => (
    <span className="flex items-center justify-end gap-1">
      <Link to={`/admin/promocodes/${p.id}/stats`} className="link mr-2 text-sm">
        {t('rv.pc.stats')}
      </Link>
      <button
        type="button"
        onClick={() => navigate(`/admin/promocodes/${p.id}/edit`)}
        className="grid h-8 w-8 place-items-center rounded-lg text-dark-400 hover:bg-dark-800 hover:text-dark-100"
        aria-label={t('admin.promocodes.actions.edit')}
      >
        <EditIcon />
      </button>
      <button
        type="button"
        onClick={() => setDeleteConfirm(p)}
        className="grid h-8 w-8 place-items-center rounded-lg text-dark-400 hover:bg-[var(--rv-bad-bg)] hover:text-[var(--rv-bad)]"
        aria-label={t('admin.promocodes.actions.delete')}
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </span>
  );

  const codeChip = (p: PromoCode, nowrap = false) => (
    <button
      type="button"
      onClick={() => handleCopyCode(p.code)}
      className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-[var(--rv-s3)] px-2 py-1 text-left font-mono text-[13px] font-bold text-dark-100 hover:text-accent-400"
      title={t('rv.pc.copy')}
    >
      <span className={nowrap ? 'whitespace-nowrap' : 'break-all'}>{p.code}</span>
      {copiedCode === p.code && <CheckIcon className="h-3.5 w-3.5 shrink-0" />}
    </button>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-dark-400">{t('rv.pc.crumb')}</p>
          <h1 className="rv-d mt-1 text-[44px] text-dark-100 lg:text-[56px]">
            {t('admin.promocodes.title')}
          </h1>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto">
          <label className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-[14px] border-2 border-dark-600 bg-dark-900 px-3.5 lg:w-[260px] lg:flex-none">
            <SearchIcon className="h-4 w-4 shrink-0 text-dark-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('rv.pc.search')}
              className="min-w-0 flex-1 bg-transparent text-[15px] text-dark-100 outline-none placeholder:text-dark-400"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              if (window.matchMedia('(min-width: 1280px)').matches) {
                setPanelOpen(true);
                requestAnimationFrame(() => codeRef.current?.focus());
              } else navigate('/admin/promocodes/create');
            }}
            className="btn btn-primary w-full !shadow-none sm:w-auto"
          >
            {t('rv.pc.create')}
          </button>
        </div>
      </div>

      <div
        className={cn(
          'grid grid-cols-1 items-start gap-5',
          panelOpen && 'xl:grid-cols-[minmax(0,1fr)_340px]',
        )}
      >
        <div className="flex min-w-0 flex-col gap-4">
          {isLoading ? (
            <SkeletonGroup className="space-y-3">
              <Skeleton variant="card" count={3} className="h-16" />
            </SkeletonGroup>
          ) : promocodes.length === 0 ? (
            <section className="flex flex-col items-center gap-3 rounded-[22px] border-2 border-dashed border-dark-600 px-6 py-10 text-center">
              <h2 className="rv-d text-[36px] text-dark-100">
                {query ? t('rv.pc.notFound') : t('rv.pc.emptyA')}{' '}
                {!query && <span className="rv-pill inline-block">{t('rv.pc.emptyB')}</span>}
              </h2>
              {!query && (
                <>
                  <p className="max-w-[360px] text-sm text-dark-300">{t('rv.pc.emptyText')}</p>
                  <button
                    type="button"
                    onClick={() => navigate('/admin/promocodes/create')}
                    className="btn btn-primary mt-1 !shadow-none"
                  >
                    {t('rv.pc.create')}
                  </button>
                </>
              )}
            </section>
          ) : (
            <>
              <div className="rv-tbox hidden md:block">
                <table className="rv-tbl w-full">
                  <thead>
                    <tr>
                      <th>{t('rv.pc.col.code')}</th>
                      <th>{t('rv.pc.col.gives')}</th>
                      <th>{t('rv.pc.col.used')}</th>
                      <th>{t('rv.pc.col.until')}</th>
                      <th>{t('rv.pc.col.status')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {promocodes.map((p) => {
                      const tag = stateTag(promoState(p));
                      return (
                        <tr key={p.id} className={cn(promoState(p) === 'off' && 'opacity-60')}>
                          <td>{codeChip(p, true)}</td>
                          <td className="text-dark-100">
                            {describe(p)}
                            {p.first_purchase_only && (
                              <span className="block text-xs text-dark-400">
                                {t('rv.pc.newOnly')}
                              </span>
                            )}
                          </td>
                          <td>{usage(p)}</td>
                          <td className="whitespace-nowrap text-dark-200">
                            {until(p.valid_until)}
                          </td>
                          <td>
                            <span className={tag.cls}>
                              {tag.dot && <i className="rv-tag-dot" />}
                              {tag.text}
                            </span>
                          </td>
                          <td>{actions(p)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-2.5 md:hidden">
                {promocodes.map((p) => {
                  const tag = stateTag(promoState(p));
                  return (
                    <article key={p.id} className="bento-card flex flex-col gap-3 !p-4">
                      <div className="flex items-start justify-between gap-2">
                        {codeChip(p)}
                        <span className={cn(tag.cls, 'shrink-0')}>
                          {tag.dot && <i className="rv-tag-dot" />}
                          {tag.text}
                        </span>
                      </div>
                      <p className="text-[15px] text-dark-100">
                        {describe(p)}
                        {p.valid_until && (
                          <span className="text-dark-400">
                            {' '}
                            · {t('rv.pc.col.until').toLowerCase()} {until(p.valid_until)}
                          </span>
                        )}
                      </p>
                      {usage(p)}
                      <div className="border-t-2 border-dark-700 pt-2">{actions(p)}</div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {panelOpen && (
          <NewPromoPanel
            codeRef={codeRef}
            onClose={() => setPanelOpen(false)}
            onCreated={() => queryClient.invalidateQueries({ queryKey: ['admin-promocodes'] })}
          />
        )}
      </div>

      {deleteConfirm && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-[380px] rounded-[22px] border-2 border-dark-600 bg-dark-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="rv-kicker !text-[var(--rv-bad)]">{t('rv.pc.confirm')}</p>
            <h3 className="rv-d mt-3 break-words text-[30px] text-dark-100">
              {t('rv.pc.deleteTitle', { code: deleteConfirm.code })}
            </h3>
            <p className="mt-2 text-sm leading-snug text-dark-300">
              {t('rv.pc.deleteText', { count: deleteConfirm.current_uses })}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="btn btn-secondary"
              >
                {t('admin.promocodes.form.cancel')}
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteConfirm.id)}
                className="btn border-2 border-[var(--rv-bad)] bg-[var(--rv-bad)] text-[#111]"
              >
                {t('rv.pc.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type QuickKind = 'discount' | 'days' | 'balance';

/** «Новый промокод» — быстрая форма справа (макет A10). Всё остальное — на полной странице. */
function NewPromoPanel({
  codeRef,
  onClose,
  onCreated,
}: {
  codeRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const { currencySymbol } = useCurrency();
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<QuickKind>('discount');
  const [value, setValue] = useState('');
  const [hours, setHours] = useState('72');
  const [limit, setLimit] = useState('');
  const [untilDate, setUntilDate] = useState('');
  const [newOnly, setNewOnly] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const random = () => {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    setCode(Array.from({ length: 8 }, () => abc[Math.floor(Math.random() * abc.length)]).join(''));
  };

  const n = Math.max(0, parseInt(value, 10) || 0);
  const valid =
    /^[A-Za-z0-9_-]{3,50}$/.test(code.trim()) &&
    n > 0 &&
    (kind !== 'discount' || (n <= 100 && (parseInt(hours, 10) || 0) > 0));

  const create = useMutation({
    mutationFn: () =>
      promocodesApi.createPromocode({
        code: code.trim().toUpperCase(),
        type: kind === 'discount' ? 'discount' : kind === 'days' ? 'subscription_days' : 'balance',
        balance_bonus_kopeks: kind === 'discount' ? n : kind === 'balance' ? n * 100 : 0,
        subscription_days: kind === 'discount' ? parseInt(hours, 10) || 0 : kind === 'days' ? n : 0,
        max_uses: parseInt(limit, 10) || 0,
        is_active: true,
        first_purchase_only: newOnly,
        valid_until: untilDate ? new Date(`${untilDate}T23:59:59`).toISOString() : null,
      }),
    onSuccess: (p) => {
      setDone(p.code);
      setCode('');
      setValue('');
      setLimit('');
      onCreated();
    },
  });

  const preview = code.trim()
    ? kind === 'discount'
      ? t('rv.pc.pv.discount', { code: code.trim().toUpperCase(), percent: n || '…' })
      : kind === 'days'
        ? t('rv.pc.pv.days', { code: code.trim().toUpperCase(), count: n })
        : t('rv.pc.pv.balance', {
            code: code.trim().toUpperCase(),
            amount: `${n || '…'} ${currencySymbol}`,
          })
    : null;

  const opt = (k: QuickKind, label: string) => (
    <button
      key={k}
      type="button"
      role="radio"
      aria-checked={kind === k}
      onClick={() => setKind(k)}
      className={cn(
        'flex min-h-[52px] items-center gap-3 rounded-[14px] border-2 px-4 text-left text-[15px] font-bold',
        kind === k
          ? 'border-accent-500 bg-[var(--rv-acc-bg)] text-dark-100'
          : 'border-dark-700 text-dark-200',
      )}
    >
      <span
        className={cn(
          'grid h-6 w-6 shrink-0 place-items-center rounded-full border-2',
          kind === k ? 'border-accent-500' : 'border-dark-500',
        )}
      >
        {kind === k && <i className="h-2.5 w-2.5 rounded-full bg-accent-500" />}
      </span>
      {label}
    </button>
  );

  const label = 'mb-2 block text-[13px] font-bold text-dark-200';

  return (
    <section className="hidden flex-col gap-4 rounded-[22px] border-2 border-accent-500 bg-dark-900 p-5 xl:sticky xl:top-6 xl:flex">
      <div className="flex items-center justify-between gap-3">
        <h2 className="rv-d text-[30px] text-dark-100">{t('rv.pc.newTitle')}</h2>
        <button type="button" onClick={onClose} className="rv-ibtn" aria-label={t('common.close')}>
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      <div>
        <span className={label}>{t('rv.pc.code')}</span>
        <div className="flex gap-2">
          <input
            ref={codeRef}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="BLACKFRIDAY"
            maxLength={50}
            className="input min-w-0 flex-1 font-bold uppercase"
          />
          <button
            type="button"
            onClick={random}
            className="btn btn-secondary shrink-0 !px-3 !text-sm"
          >
            {t('rv.pc.random')}
          </button>
        </div>
      </div>

      <div>
        <span className={label}>{t('rv.pc.gives')}</span>
        <div className="flex flex-col gap-2" role="radiogroup">
          {opt('discount', t('rv.pc.kind.discount'))}
          {opt('days', t('rv.pc.kind.days'))}
          {opt('balance', t('rv.pc.kind.balance'))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <label>
          <span className={label}>
            {kind === 'discount'
              ? t('rv.pc.f.discount')
              : kind === 'days'
                ? t('rv.pc.f.days')
                : t('rv.pc.f.amount', { cur: currencySymbol })}
          </span>
          <input
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
            placeholder={kind === 'discount' ? '40' : kind === 'days' ? '7' : '100'}
            className="input"
          />
        </label>
        <label>
          <span className={label}>{t('rv.pc.f.limit')}</span>
          <input
            inputMode="numeric"
            value={limit}
            onChange={(e) => setLimit(e.target.value.replace(/\D/g, ''))}
            placeholder="∞"
            className="input"
          />
        </label>
      </div>
      {kind === 'discount' && (
        <label>
          <span className={label}>{t('rv.pc.f.hours')}</span>
          <input
            inputMode="numeric"
            value={hours}
            onChange={(e) => setHours(e.target.value.replace(/\D/g, ''))}
            className="input"
          />
        </label>
      )}
      <label>
        <span className={label}>{t('rv.pc.f.until')}</span>
        <input
          type="date"
          value={untilDate}
          onChange={(e) => setUntilDate(e.target.value)}
          className="input [color-scheme:dark]"
        />
      </label>

      <label className="flex cursor-pointer items-center gap-3 text-sm text-dark-100">
        <button
          type="button"
          role="switch"
          aria-checked={newOnly}
          onClick={() => setNewOnly((v) => !v)}
          className="rv-tog shrink-0"
        />
        {t('rv.pc.newOnlyToggle')}
      </label>

      {preview && <p className="text-xs leading-snug text-dark-400">{preview}</p>}
      {create.isError && (
        <p className="text-sm text-[var(--rv-bad)]">{getErrorMessage(create.error)}</p>
      )}
      {done && !create.isError && (
        <p className="text-sm font-bold text-accent-400">{t('rv.pc.created', { code: done })}</p>
      )}

      <button
        type="button"
        disabled={!valid || create.isPending}
        onClick={() => {
          setDone(null);
          create.mutate();
        }}
        className="btn btn-primary w-full !shadow-none"
      >
        {t('rv.pc.createShort')}
      </button>
      <Link
        to="/admin/promocodes/create"
        className="text-center text-xs text-dark-400 underline-offset-2 hover:underline"
      >
        {t('rv.pc.more')}
      </Link>
    </section>
  );
}
