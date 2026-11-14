import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { adminSettingsApi, type SettingDefinition } from '../api/adminSettings';
import { themeColorsApi } from '../api/themeColors';
import { useFavoriteSettings } from '../hooks/useFavoriteSettings';
import {
  OTHER_CATEGORIES,
  SETTINGS_TREE,
  findTreeLocation,
  formatSettingKey,
  findSettingsSection,
  getMappedCategoryKeys,
} from '../components/admin';
import { AnalyticsTab } from '../components/admin/AnalyticsTab';
import { BrandingTab } from '../components/admin/BrandingTab';
import { RvAppearance } from '../components/admin/RvAppearance';
import { MenuEditorTab } from '../components/admin/MenuEditorTab';
import { ThemeTab } from '../components/admin/ThemeTab';
import { FavoritesTab } from '../components/admin/FavoritesTab';
import { SettingsTab } from '../components/admin/SettingsTab';
import { SettingsTreeSidebar } from '../components/admin/SettingsTreeSidebar';
import { SettingsMobileTabs } from '../components/admin/SettingsMobileTabs';
import { SettingsSearchMobile, SettingsSearchResults } from '../components/admin/SettingsSearch';
import { ChevronRightIcon } from '@/components/icons';

// Settings that require SALES_MODE=tariffs to be visible
const TARIFF_MODE_SETTINGS = ['MULTI_TARIFF_ENABLED', 'MAX_ACTIVE_SUBSCRIPTIONS'];

export default function AdminSettings() {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();

  // State: `?section=<id>` открывает нужный раздел сразу (ссылки из других разделов админки).
  const [activeSection, setActiveSection] = useState(
    () => findSettingsSection(searchParams.get('section')) ?? 'branding',
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Favorites hook
  const { favorites, toggleFavorite, isFavorite } = useFavoriteSettings();

  // Scroll to top on section change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeSection]);

  // Queries
  const { data: themeColors } = useQuery({
    queryKey: ['theme-colors'],
    queryFn: themeColorsApi.getColors,
  });

  const { data: allSettings } = useQuery({
    queryKey: ['admin-settings', i18n.language],
    queryFn: () => adminSettingsApi.getSettings(),
  });

  // Find active tree info (group + child for tree sub-items)
  // No useMemo needed — SETTINGS_TREE is a static constant, iteration is trivial
  let activeTreeInfo: {
    group: (typeof SETTINGS_TREE.groups)[number];
    child: (typeof SETTINGS_TREE.groups)[number]['children'][number];
  } | null = null;
  for (const group of SETTINGS_TREE.groups) {
    const child = group.children.find((c) => c.id === activeSection);
    if (child) {
      activeTreeInfo = { group, child };
      break;
    }
  }

  // Check if tariffs mode is active
  const isTariffsMode = useMemo(() => {
    if (!allSettings || !Array.isArray(allSettings)) return false;
    const salesMode = allSettings.find((s: SettingDefinition) => s.key === 'SALES_MODE');
    return salesMode?.current === 'tariffs';
  }, [allSettings]);

  // Get categories for current sub-item
  const currentCategories = useMemo(() => {
    if (!activeTreeInfo || !allSettings || !Array.isArray(allSettings)) return [];

    const categoryKeys = activeTreeInfo.child.categories;
    // Пункт-сборник показывает всё, чему не нашлось места в дереве: категории на
    // бэкенде выводятся из имени ключа, поэтому новая настройка легко создаёт
    // категорию, которой здесь нет — раньше такие настройки просто исчезали.
    const isOtherSection = categoryKeys.includes(OTHER_CATEGORIES);
    const mappedCategories = isOtherSection ? getMappedCategoryKeys() : null;
    const categoryMap = new Map<string, SettingDefinition[]>();

    for (const setting of allSettings) {
      const belongsHere = mappedCategories
        ? !mappedCategories.has(setting.category.key)
        : categoryKeys.includes(setting.category.key);
      if (belongsHere) {
        // Hide tariff-dependent settings when not in tariffs mode
        if (!isTariffsMode && TARIFF_MODE_SETTINGS.includes(setting.key)) continue;

        if (!categoryMap.has(setting.category.key)) {
          categoryMap.set(setting.category.key, []);
        }
        categoryMap.get(setting.category.key)!.push(setting);
      }
    }

    return Array.from(categoryMap.entries()).map(([key, settings]) => ({
      key,
      label: t(`admin.settings.categories.${key}`, key),
      settings,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeTreeInfo derived from activeSection
  }, [activeSection, allSettings, isTariffsMode, t]);

  // Filter settings for search - GLOBAL search across all settings
  const filteredSettings = useMemo(() => {
    if (!allSettings || !Array.isArray(allSettings) || !searchQuery) return [];

    const q = searchQuery.toLowerCase().trim();
    if (!q) return [];

    return allSettings.filter((s: SettingDefinition) => {
      // Hide tariff-dependent settings when not in tariffs mode
      if (!isTariffsMode && TARIFF_MODE_SETTINGS.includes(s.key)) return false;

      if (s.key.toLowerCase().includes(q)) return true;
      if (s.name?.toLowerCase().includes(q)) return true;
      const formattedKey = formatSettingKey(s.name || s.key);
      const translatedName = t(`admin.settings.settingNames.${formattedKey}`, formattedKey);
      if (translatedName.toLowerCase().includes(q)) return true;
      if (s.hint?.description?.toLowerCase().includes(q)) return true;
      const categoryLabel = t(`admin.settings.categories.${s.category.key}`, s.category.key);
      if (categoryLabel.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [allSettings, searchQuery, isTariffsMode, t]);

  // Favorite settings
  const favoriteSettings = useMemo(() => {
    if (!allSettings || !Array.isArray(allSettings)) return [];
    return allSettings.filter((s: SettingDefinition) => favorites.includes(s.key));
  }, [allSettings, favorites]);

  // Count of modified settings
  const modifiedCount = useMemo(() => {
    if (!allSettings || !Array.isArray(allSettings)) return 0;
    return allSettings.filter((s: SettingDefinition) => s.has_override).length;
  }, [allSettings]);

  // Handle setting selection from autocomplete
  const handleSelectSetting = useCallback(
    (setting: SettingDefinition) => {
      const location = findTreeLocation(setting.category.key);
      if (location) {
        setActiveSection(location.subItemId);
      }
      setSearchQuery(setting.key);
    },
    [setActiveSection, setSearchQuery],
  );

  // Get the display title for the current section
  const sectionTitle = useMemo(() => {
    // Special items
    const specialItem = SETTINGS_TREE.specialItems.find((item) => item.id === activeSection);
    if (specialItem) return t(`admin.settings.${specialItem.id}`);

    // Tree sub-items
    if (activeTreeInfo) return t(`admin.settings.tree.${activeTreeInfo.child.id}`);

    return t('admin.settings.title');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeTreeInfo derived from activeSection
  }, [activeSection, t]);

  // Render content based on active section
  const renderContent = () => {
    // If searching, always show search results regardless of active section
    if (searchQuery.trim()) {
      return (
        <SettingsTab
          categories={[]}
          searchQuery={searchQuery}
          filteredSettings={filteredSettings}
          isFavorite={isFavorite}
          toggleFavorite={toggleFavorite}
        />
      );
    }

    switch (activeSection) {
      case 'analytics':
        return <AnalyticsTab />;
      case 'branding':
        return (
          <div className="space-y-5">
            <RvAppearance />
            <BrandingTab accentColor={themeColors?.accent} hideIdentity />
          </div>
        );
      case 'theme':
        return <ThemeTab />;
      case 'buttons':
        return <MenuEditorTab />;
      case 'favorites':
        return (
          <FavoritesTab
            settings={favoriteSettings}
            isFavorite={isFavorite}
            toggleFavorite={toggleFavorite}
          />
        );
      default:
        if (activeTreeInfo) {
          return (
            <SettingsTab
              categories={currentCategories}
              searchQuery={searchQuery}
              filteredSettings={filteredSettings}
              isFavorite={isFavorite}
              toggleFavorite={toggleFavorite}
            />
          );
        }
        // Unknown section — fallback to branding
        setActiveSection('branding');
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-dark-400">{t('rv.st.crumb')}</p>
          <h1 className="rv-d mt-1 text-[44px] text-dark-100 lg:text-[56px]">{t('rv.st.title')}</h1>
        </div>
        <div className="w-full lg:w-[300px]">
          <SettingsSearchMobile
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            allSettings={allSettings}
            onSelectSetting={handleSelectSetting}
          />
        </div>
      </div>

      {/* Телефон: разделы лентой */}
      <div className="lg:hidden">
        <SettingsMobileTabs
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          favoritesCount={favorites.length}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="bento-card hidden !p-2.5 lg:sticky lg:top-6 lg:block">
          <SettingsTreeSidebar
            activeSection={activeSection}
            onSectionChange={(id) => {
              setSearchQuery('');
              setActiveSection(id);
            }}
            favoritesCount={favorites.length}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            allSettings={allSettings}
            onSelectSetting={handleSelectSetting}
            hideSearch
          />
        </aside>

        <div className="min-w-0">
          {activeSection !== 'branding' || searchQuery.trim() ? (
            <div className="mb-4 flex flex-wrap items-center gap-3">
              {activeTreeInfo && !searchQuery.trim() && (
                <span className="text-xs text-dark-400">
                  {t(`admin.settings.groups.${activeTreeInfo.group.id}`)}
                  <ChevronRightIcon className="mx-1 inline h-3 w-3" />
                </span>
              )}
              <h2 className="rv-d text-[32px] text-dark-100">{sectionTitle}</h2>
              {modifiedCount > 0 && !searchQuery.trim() && activeTreeInfo && (
                <span className="badge-warning">
                  {t('admin.settings.modifiedCount', { count: modifiedCount })}
                </span>
              )}
            </div>
          ) : null}
          <SettingsSearchResults searchQuery={searchQuery} resultsCount={filteredSettings.length} />
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
