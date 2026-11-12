import { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'dompurify';
import type {
  AppConfig,
  LocalizedText,
  RemnawaveAppClient,
  RemnawavePlatformData,
  RemnawaveButtonClient,
} from '@/types';
import { useTheme } from '@/hooks/useTheme';
import { CardsBlock, TimelineBlock, AccordionBlock, MinimalBlock, BlockButtons } from './blocks';
import { RvStepsBlock } from './blocks/RvStepsBlock';
import type { BlockRendererProps, RenderBlock } from './blocks';
import TvQuickConnect from './TvQuickConnect';
import { BackIcon, BookOpenIcon, QrCodeIcon } from '@/components/icons';
import { QRCodeSVG } from 'qrcode.react';
import { Link } from 'react-router';

const platformOrder = ['ios', 'android', 'windows', 'macos', 'linux', 'androidTV', 'appleTV'];

function detectPlatform(): string | null {
  if (typeof window === 'undefined' || !navigator?.userAgent) return null;
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return /tv|television/.test(ua) ? 'androidTV' : 'android';
  if (/macintosh|mac os x/.test(ua)) return 'macos';
  if (/windows/.test(ua)) return 'windows';
  if (/linux/.test(ua)) return 'linux';
  return null;
}

// RichVPN: все стили конфига рисуются шагами макета «03 · Подключение».
const RENDERERS: Record<string, React.ComponentType<BlockRendererProps>> = {
  cards: RvStepsBlock,
  timeline: RvStepsBlock,
  accordion: RvStepsBlock,
  minimal: RvStepsBlock,
};
void CardsBlock;
void TimelineBlock;
void AccordionBlock;
void MinimalBlock;

/** TV quick-connect is a Happ-only feature (check.happ.su/sendtv) — show it only
 *  for the Happ app, detected by its happ:// deep-link scheme (name as fallback). */
function isHappApp(app: RemnawaveAppClient | null): boolean {
  if (!app) return false;
  if ((app.deepLink ?? '').toLowerCase().startsWith('happ://')) return true;
  return app.name.toLowerCase().includes('happ');
}

interface Props {
  appConfig: AppConfig;
  onOpenDeepLink: (url: string) => void;
  isTelegramWebApp: boolean;
  onGoBack: () => void;
  onOpenQR?: () => void;
  username?: string;
}

export default function InstallationGuide({
  appConfig,
  onOpenDeepLink,
  isTelegramWebApp,
  onGoBack,
  onOpenQR,
  username,
}: Props) {
  const { t, i18n } = useTranslation();
  const { isLight } = useTheme();

  const detectedPlatform = useMemo(() => detectPlatform(), []);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const [activePlatformKey, setActivePlatformKey] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<RemnawaveAppClient | null>(null);

  const getLocalizedText = useCallback(
    (text: LocalizedText | undefined): string => {
      if (!text) return '';
      const lang = i18n.language || 'en';
      return text[lang] || text['en'] || text['ru'] || Object.values(text)[0] || '';
    },
    [i18n.language],
  );

  const getBaseTranslation = useCallback(
    (key: string, i18nKey: string): string => {
      const bt = appConfig.baseTranslations;
      if (bt && key in bt) {
        const text = getLocalizedText(bt[key as keyof typeof bt] as LocalizedText);
        if (text) return text;
      }
      return t(i18nKey);
    },
    [appConfig.baseTranslations, getLocalizedText, t],
  );

  const getSvgHtml = useCallback(
    (svgKey: string | undefined): string => {
      if (!svgKey || !appConfig.svgLibrary?.[svgKey]) return '';
      const entry = appConfig.svgLibrary[svgKey];
      const raw = typeof entry === 'string' ? entry : entry.svgString;
      if (!raw) return '';
      return DOMPurify.sanitize(raw, { USE_PROFILES: { svg: true, svgFilters: true } });
    },
    [appConfig.svgLibrary],
  );

  const availablePlatforms = useMemo(() => {
    if (!appConfig.platforms) return [];
    const available = platformOrder.filter((key) => {
      const data = appConfig.platforms[key] as RemnawavePlatformData | undefined;
      return data && data.apps && data.apps.length > 0;
    });
    if (detectedPlatform && available.includes(detectedPlatform)) {
      return [detectedPlatform, ...available.filter((p) => p !== detectedPlatform)];
    }
    return available;
  }, [appConfig.platforms, detectedPlatform]);

  useEffect(() => {
    if (selectedApp || !availablePlatforms.length) return;
    const platform = availablePlatforms[0];
    const data = appConfig.platforms[platform] as RemnawavePlatformData | undefined;
    if (!data?.apps?.length) return;
    const app = data.apps.find((a) => a.featured) || data.apps[0];
    if (app) {
      setSelectedApp(app);
      setActivePlatformKey(platform);
    }
  }, [appConfig.platforms, availablePlatforms, selectedApp]);

  const renderBlockButtons = useCallback(
    (buttons: RemnawaveButtonClient[] | undefined, variant: 'light' | 'subtle') => (
      <BlockButtons
        buttons={buttons}
        variant={variant}
        isLight={isLight}
        subscriptionUrl={appConfig.subscriptionUrl}
        hideLink={appConfig.hideLink}
        deepLink={selectedApp?.deepLink}
        username={username}
        getLocalizedText={getLocalizedText}
        getBaseTranslation={getBaseTranslation}
        getSvgHtml={getSvgHtml}
        onOpenDeepLink={onOpenDeepLink}
      />
    ),
    [
      appConfig.subscriptionUrl,
      appConfig.hideLink,
      selectedApp?.deepLink,
      username,
      isLight,
      getLocalizedText,
      getBaseTranslation,
      getSvgHtml,
      onOpenDeepLink,
    ],
  );

  const userIsOnTv = detectedPlatform === 'androidTV' || detectedPlatform === 'appleTV';
  // Happ's TV quick-connect (check.happ.su/sendtv) is ONE API serving BOTH
  // Android TV and Apple TV — show the widget on either.
  const selectedPlatform = activePlatformKey || availablePlatforms[0];
  const isTvLayout =
    (selectedPlatform === 'androidTV' || selectedPlatform === 'appleTV') && !userIsOnTv;

  const currentPlatformKey = activePlatformKey || availablePlatforms[0];
  const currentPlatformData = currentPlatformKey
    ? (appConfig.platforms[currentPlatformKey] as RemnawavePlatformData | undefined)
    : undefined;
  const currentPlatformApps = currentPlatformData?.apps || [];

  // Platform display name
  const getPlatformDisplayName = useCallback(
    (key: string): string => {
      const data = appConfig.platforms[key] as RemnawavePlatformData | undefined;
      if (data?.displayName) {
        const name = getLocalizedText(data.displayName);
        if (name) return name;
      }
      if (appConfig.platformNames?.[key]) {
        return getLocalizedText(appConfig.platformNames[key]);
      }
      const fallback: Record<string, string> = {
        ios: 'iOS',
        android: 'Android',
        windows: 'Windows',
        macos: 'macOS',
        linux: 'Linux',
        androidTV: 'Android TV',
        appleTV: 'Apple TV',
      };
      return fallback[key] || key;
    },
    [appConfig.platforms, appConfig.platformNames, getLocalizedText],
  );

  // Block renderer
  const blockType = appConfig.uiConfig?.installationGuidesBlockType || 'cards';
  const Renderer = RENDERERS[blockType] || RvStepsBlock;

  // For the Happ TV app (Android TV / Apple TV), inject the TV connect widget as
  // customNode so it renders THROUGH the active block style (cards/timeline/
  // accordion/minimal) instead of as separate clashing cards that break it.
  const showTvConnect = Boolean(
    selectedApp && isTvLayout && isHappApp(selectedApp) && appConfig.subscriptionUrl,
  );
  let renderBlocks: RenderBlock[] = selectedApp?.blocks ?? [];
  if (selectedApp && showTvConnect && appConfig.subscriptionUrl) {
    // install → add-subscription → connect: attach to the add step (index 1);
    // fall back to the last block for shorter configs.
    const idx = selectedApp.blocks.length >= 3 ? 1 : Math.max(0, selectedApp.blocks.length - 1);
    const widget = <TvQuickConnect subscriptionUrl={appConfig.subscriptionUrl} isLight={isLight} />;
    renderBlocks = selectedApp.blocks.map((b, i) => (i === idx ? { ...b, customNode: widget } : b));
  }

  return (
    <div className="space-y-6 pb-6">
      {/* Header + platform dropdown. На телефоне список платформ — своей строкой
          во всю ширину: в одном ряду длинное название платформы распирало
          страницу вбок, а кнопки «назад» и QR сжимались с 40 до 22 px. */}
      <div className="flex flex-wrap items-center gap-3">
        {!isTelegramWebApp && (
          <button
            onClick={onGoBack}
            aria-label={t('common.back', 'Back')}
            className="rv-ibtn transition-colors hover:border-dark-600"
          >
            <BackIcon className="h-6 w-6" />
          </button>
        )}
        <h2 className="rv-d min-w-0 flex-1 text-[30px] text-dark-100">
          {getBaseTranslation('installationGuideHeader', 'subscription.connection.title')}
        </h2>
        {appConfig.subscriptionUrl && onOpenQR && (
          <button
            onClick={() => onOpenQR()}
            aria-label={t('subscription.connection.openQr', 'Open QR code')}
            className="rv-ibtn transition-colors hover:border-dark-600"
          >
            <QrCodeIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Платформа — чипами (макет: «Куда подключаем?») */}
      {availablePlatforms.length > 1 && (
        <div>
          <p className="mb-2.5 text-base font-bold text-dark-100">{t('rv.connect.where')}</p>
          <div className="flex flex-wrap gap-2">
            {availablePlatforms.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setActivePlatformKey(p);
                  const data = appConfig.platforms[p] as RemnawavePlatformData | undefined;
                  if (data?.apps?.length) {
                    const app =
                      data.apps.find((a) => a.name === selectedApp?.name) ||
                      data.apps.find((a) => a.featured) ||
                      data.apps[0];
                    if (app) setSelectedApp(app);
                  }
                }}
                className={`min-h-[44px] rounded-[12px] border-2 px-4 text-[15px] font-bold transition-colors ${
                  p === currentPlatformKey
                    ? 'border-accent-500 bg-accent-500 text-[#111]'
                    : 'border-dark-600 bg-transparent text-dark-100 hover:border-dark-400'
                }`}
              >
                {getPlatformDisplayName(p)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* App chips */}
      {currentPlatformApps.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {currentPlatformApps.map((app, idx) => {
            const isSelected = selectedApp?.name === app.name;
            const appIconSvg = getSvgHtml(app.svgIconKey);
            return (
              <button
                key={app.name + idx}
                onClick={() => setSelectedApp(app)}
                className={`relative flex min-h-[44px] min-w-[calc(50%-0.25rem)] items-center gap-2 overflow-hidden rounded-[12px] border-2 px-4 text-[15px] font-bold transition-colors ${
                  isSelected
                    ? 'border-accent-500 bg-[var(--rv-acc-bg)] text-dark-100'
                    : 'border-dark-700 bg-dark-900 text-dark-200 hover:border-dark-600'
                }`}
              >
                {app.featured && <span className="h-2 w-2 shrink-0 rounded-full bg-warning-400" />}
                <span className="relative z-10 truncate">{app.name}</span>
                {appIconSvg && (
                  <div
                    className="ml-auto h-7 w-7 shrink-0 opacity-30 [&>svg]:h-full [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: appIconSvg }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Tutorial button */}
      {appConfig.baseSettings?.isShowTutorialButton && appConfig.baseSettings?.tutorialUrl && (
        <a
          href={appConfig.baseSettings.tutorialUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary w-full justify-center"
        >
          <BookOpenIcon className="h-5 w-5" />
          {getBaseTranslation('tutorial', 'subscription.connection.tutorial')}
        </a>
      )}

      {/* Blocks rendered in the panel's active style. For the Happ Android TV
          app the TV connect widget is injected into a step (customNode), so it
          adapts to that style instead of breaking it. */}
      {selectedApp && (
        <Renderer
          blocks={renderBlocks}
          isMobile={isMobile}
          isLight={isLight}
          getLocalizedText={getLocalizedText}
          getSvgHtml={getSvgHtml}
          renderBlockButtons={renderBlockButtons}
        />
      )}
      {/* Второе устройство по QR + помощь (макет «03 · Подключение») */}
      {appConfig.subscriptionUrl && !appConfig.hideLink && (
        <section className="bento-card flex items-center gap-4 !p-5">
          <div className="shrink-0 rounded-xl bg-white p-2">
            <QRCodeSVG value={appConfig.subscriptionUrl} size={132} level="M" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight text-dark-100">
              {t('rv.connect.qrTitle')}
            </p>
            <p className="mt-1.5 text-sm leading-snug text-dark-400">{t('rv.connect.qrText')}</p>
          </div>
        </section>
      )}
      <p className="flex items-center justify-center gap-2 text-sm text-dark-300">
        {t('rv.connect.stuck')}{' '}
        <Link to="/support" className="link">
          {t('rv.connect.stuckLink')}
        </Link>
      </p>
    </div>
  );
}
