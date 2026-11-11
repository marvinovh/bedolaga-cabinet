/**
 * Theme-aware glass morphism color tokens.
 * Provides consistent colors for the glassmorphic card components
 * that work on both dark and light backgrounds.
 */
// Цвет текста темы: darkText в тёмной, через ремап .light — lightText в светлой.
const TEXT_VAR = '--color-dark-50';

export function getGlassColors(isDark: boolean) {
  return {
    // Card container
    // RichVPN: карточка #1B1B1B с рамкой #2A2A2A (светлая — белая с чернильной рамкой)
    cardBg: isDark ? '#1B1B1B' : '#FFFFFF',
    cardBorder: isDark ? '#2A2A2A' : '#111111',

    // Inner sections (cards within cards)
    innerBg: isDark ? '#222222' : '#F8F7F2',
    innerBorder: isDark ? '#2A2A2A' : '#E2E0D6',

    // Hover states
    hoverBg: isDark ? '#2A2A2A' : '#E9E7DE',
    hoverBorder: isDark ? '#3D3D3A' : '#111111',

    // Text — из палитры оператора, а не зашитые белый/чёрный: иначе кастомный
    // цвет текста не доходил до дашборда и карточек подписок. Годится только
    // для CSS-свойств: в SVG-атрибутах var() не раскрывается — там передавать
    // через style={{ stroke }}.
    text: `rgb(var(${TEXT_VAR}))`,
    // Вторичный текст — готовые токены палитры, а не доля основного цвета.
    // Доля (0.4 / 0.3 / 0.25) давала контраст 3.4 и ниже: подписи «Трафик»,
    // «104.0 / 1500 ГБ» и дата в карточке подписки читались с трудом. Токены
    // dark-400/500 клампятся по контрасту в applyThemeColors, поэтому остаются
    // читаемыми на любой палитре оператора.
    textSecondary: 'rgb(var(--color-dark-400))',
    textMuted: 'rgb(var(--color-dark-500))',
    textFaint: 'rgb(var(--color-dark-500))',
    textGhost: `rgba(var(${TEXT_VAR}), ${isDark ? 0.08 : 0.06})`,

    // Progress bar track
    trackBg: isDark ? '#2A2A2A' : '#E2E0D6',
    trackBorder: isDark ? '#2A2A2A' : '#111111',

    // Code blocks
    codeBg: isDark ? '#222222' : '#F8F7F2',
    codeBorder: isDark ? '#3D3D3A' : '#111111',

    // Glow effects — reduced in light mode
    glowAlpha: isDark ? '15' : '08',

    // Shadows for light mode depth
    shadow: 'none',
  };
}
