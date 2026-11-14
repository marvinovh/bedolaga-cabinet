import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { cn } from '@/lib/utils';
import { brandingApi } from '@/api/branding';
import { themeColorsApi } from '@/api/themeColors';
import { applyThemeColors } from '@/hooks/useThemeColors';
import { useBranding } from '@/hooks/useBranding';
import type { ThemeColors } from '@/types/theme';

const SWATCHES = ['#CDFB24', '#7EF0C6', '#FFB020', '#9DB4FF', '#FF8EDC', '#F2F0E8'];
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * «Оформление» — макет «A7 · Настройки и оформление»: акцентный цвет, какие темы
 * доступны клиентам, название и логотип сервиса и живое превью кабинета.
 * Нейтральные цвета в редизайне фиксированы — из админки меняется только акцент.
 */
export function RvAppearance() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const { appName, logoUrl, hasCustomLogo, logoLetter } = useBranding();

  const { data: colors } = useQuery({
    queryKey: ['theme-colors'],
    queryFn: themeColorsApi.getColors,
  });
  const { data: themes } = useQuery({
    queryKey: ['enabled-themes'],
    queryFn: themeColorsApi.getEnabledThemes,
  });

  const [accent, setAccent] = useState('#CDFB24');
  const [hex, setHex] = useState('#CDFB24');
  useEffect(() => {
    if (colors?.accent) {
      setAccent(colors.accent.toUpperCase());
      setHex(colors.accent.toUpperCase());
    }
  }, [colors?.accent]);

  const [name, setName] = useState('');
  useEffect(() => setName(appName || ''), [appName]);

  const saveAccent = useMutation({
    mutationFn: (value: string) => themeColorsApi.updateColors({ accent: value }),
    onSuccess: (data) => {
      queryClient.setQueryData(['theme-colors'], data);
      applyThemeColors(data as unknown as ThemeColors);
    },
  });
  const pickAccent = (value: string) => {
    const v = value.toUpperCase();
    setAccent(v);
    setHex(v);
    if (HEX.test(v)) saveAccent.mutate(v);
  };

  const saveThemes = useMutation({
    mutationFn: themeColorsApi.updateEnabledThemes,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['enabled-themes'] }),
  });
  const themeMode = themes
    ? themes.dark && themes.light
      ? 'both'
      : themes.light
        ? 'light'
        : 'dark'
    : 'dark';

  const saveName = useMutation({
    mutationFn: brandingApi.updateName,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['branding'] }),
  });
  const uploadLogo = useMutation({
    mutationFn: brandingApi.uploadLogo,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['branding'] }),
  });

  const row =
    'flex flex-wrap items-center justify-between gap-4 border-b border-dark-700 py-[18px] last:border-b-0';

  return (
    <section className="bento-card grid gap-6 !p-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:!p-6">
      <div className="min-w-0">
        <h3 className="text-lg font-bold text-dark-100">{t('rv.st.accent')}</h3>
        <p className="mt-1.5 text-sm leading-snug text-dark-300">{t('rv.st.accentHint')}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={accent === c}
              onClick={() => pickAccent(c)}
              className={cn(
                'h-12 w-12 rounded-[14px] border-[3px] transition-transform hover:scale-105',
                accent === c ? 'border-[#F2F0E8]' : 'border-transparent',
              )}
              style={{ background: c }}
            />
          ))}
          <input
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            onBlur={() => (HEX.test(hex) ? pickAccent(hex) : setHex(accent))}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="input !h-12 !w-32 font-mono uppercase"
            aria-label={t('rv.st.accent')}
          />
        </div>

        <h3 className="mt-7 text-lg font-bold text-dark-100">{t('rv.st.theme')}</h3>
        <div className="rv-seg mt-3 max-w-[420px]" role="tablist">
          {(['dark', 'light', 'both'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={themeMode === mode}
              className={themeMode === mode ? 'on' : undefined}
              onClick={() => saveThemes.mutate({ dark: mode !== 'light', light: mode !== 'dark' })}
            >
              {t(`rv.st.themes.${mode}`)}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <div className={row}>
            <p className="text-[15px] font-bold text-dark-100">{t('rv.st.name')}</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name !== appName && saveName.mutate(name.trim())}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="input !w-full sm:!w-[200px]"
              maxLength={50}
            />
          </div>
          <div className={row}>
            <div>
              <p className="text-[15px] font-bold text-dark-100">{t('rv.st.logo')}</p>
              <p className="text-xs text-dark-400">{t('rv.st.logoHint')}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-[#111] font-display text-xl text-[rgb(var(--color-accent-500))]">
                {hasCustomLogo && logoUrl ? (
                  <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  logoLetter
                )}
              </span>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploadLogo.isPending}
                className="btn btn-secondary !min-h-10 !px-3.5 !text-sm"
              >
                {t('rv.st.replace')}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/svg+xml,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadLogo.mutate(f);
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Превью кабинета */}
      <div>
        <p className="mb-2.5 text-[13px] font-bold text-dark-300">{t('rv.st.preview')}</p>
        <div
          className="rounded-[24px] border-2 border-dark-600 bg-[#111] p-3.5"
          style={{ ['--pv' as string]: accent }}
        >
          <div className="flex items-center justify-between px-1 pb-3">
            <span className="text-lg font-bold text-[#F2F0E8]">{name || appName || 'richvpn'}</span>
            <span className="rounded-full border-2 border-[#F2F0E8] px-2 py-0.5 text-xs font-bold text-[#F2F0E8]">
              245 ₽
            </span>
          </div>
          <div className="rounded-[18px] p-4 text-[#111]" style={{ background: 'var(--pv)' }}>
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#111]/75">
              <i className="h-0.5 w-3.5 bg-current" />
              {t('rv.st.pvKicker')}
            </p>
            <p className="rv-d mt-2 text-[38px]">
              VPN{' '}
              <span
                className="inline-block rounded-[0.22em] bg-[#111] px-[0.16em] pb-[0.02em] pt-[0.06em] leading-[0.92]"
                style={{ color: 'var(--pv)', transform: 'rotate(-1.8deg)' }}
              >
                {t('rv.st.pvWorks')}
              </span>
            </p>
            <p className="mt-1 text-xs font-medium">{t('rv.st.pvLeft')}</p>
            <span
              className="mt-3 grid h-10 place-items-center rounded-xl bg-[#111] font-display text-base uppercase"
              style={{ color: 'var(--pv)' }}
            >
              {t('rv.st.pvConnect')}
            </span>
          </div>
          <div className="mt-2.5 rounded-[14px] bg-[#1B1B1B] p-3">
            <p className="flex justify-between text-xs font-bold text-[#F2F0E8]">
              <span>{t('rv.traffic')}</span>
              <span className="font-medium text-[#B9B8B0]">42 / 150 {t('rv.gb')}</span>
            </p>
            <div className="mt-2 h-1.5 rounded-full bg-[#2A2A2A]">
              <i
                className="block h-full w-[28%] rounded-full"
                style={{ background: 'var(--pv)' }}
              />
            </div>
          </div>
          <div className="mt-2.5 flex rounded-[16px] border-2 border-[#2A2A2A] bg-[#0B0B0B] p-1.5">
            <span className="h-8 w-14 rounded-[11px]" style={{ background: 'var(--pv)' }} />
          </div>
        </div>
      </div>
    </section>
  );
}
