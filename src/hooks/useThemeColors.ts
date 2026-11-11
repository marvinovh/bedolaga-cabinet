import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { themeColorsQueryOptions } from '../api/themeColors';
import {
  type ThemeColors,
  DEFAULT_THEME_COLORS,
  SHADE_LEVELS,
  type ColorPalette,
  type ShadeLevel,
} from '../types/theme';
import { hexToRgb, hexToHsl, hslToRgb } from '../utils/colorConversion';
import { writeThemeColorsHint } from '../utils/themeColorsHint';

// Convert RGB to string format for CSS variable
function rgbToString(r: number, g: number, b: number): string {
  return `${r}, ${g}, ${b}`;
}

// Опорная светлота шейдов для базового цвета с L = 50 %. Для реального базового
// цвета лестница масштабируется: 500 — ровно выбранный цвет, светлые шейды
// растягиваются от него к 97 (шейд 50), тёмные — к 10 (шейд 950).
const LIGHTNESS_LADDER: Record<ShadeLevel, number> = {
  50: 97,
  100: 94,
  200: 86,
  300: 76,
  400: 64,
  500: 50,
  600: 42,
  700: 34,
  800: 26,
  900: 18,
  950: 10,
};
const LADDER_TOP = LIGHTNESS_LADDER[50];
const LADDER_MID = LIGHTNESS_LADDER[500];
const LADDER_BOTTOM = LIGHTNESS_LADDER[950];

function shadeLightness(shade: ShadeLevel, baseLightness: number): number {
  const target = LIGHTNESS_LADDER[shade];
  if (target > LADDER_MID) {
    const share = (target - LADDER_MID) / (LADDER_TOP - LADDER_MID);
    return Math.max(baseLightness, baseLightness + share * (LADDER_TOP - baseLightness));
  }
  const share = (LADDER_MID - target) / (LADDER_MID - LADDER_BOTTOM);
  return Math.min(baseLightness, baseLightness - share * (baseLightness - LADDER_BOTTOM));
}

// RichVPN design-system neutrals (см. UI-кит: ink #111, card #1B1B1B, bone #F2F0E8).
export const RICHVPN_DEFAULT_ACCENT = '#CDFB24';
const RICHVPN_FIXED_COLORS = {
  darkBackground: '#111111',
  darkSurface: '#1B1B1B',
  darkText: '#F2F0E8',
  darkTextSecondary: '#9C9B93',
  lightBackground: '#F2F0E8',
  lightSurface: '#FFFFFF',
  lightText: '#111111',
  lightTextSecondary: '#64645E',
  warning: '#FFB020',
  error: '#FF6B5E',
} satisfies Partial<ThemeColors>;
const RICHVPN_DARK_VARS: Record<string, string> = {
  '--color-dark-50': '255, 255, 255',
  '--color-dark-100': '242, 240, 232',
  '--color-dark-200': '222, 220, 212',
  '--color-dark-300': '201, 200, 192',
  '--color-dark-400': '156, 155, 147',
  '--color-dark-500': '142, 141, 134',
  '--color-dark-600': '74, 74, 70',
  '--color-dark-700': '42, 42, 42',
  '--color-dark-800': '34, 34, 34',
  '--color-dark-850': '31, 31, 31',
  '--color-dark-900': '27, 27, 27',
  '--color-dark-950': '17, 17, 17',
};
const RICHVPN_LIGHT_VARS: Record<string, string> = {
  '--color-champagne-50': '248, 247, 242',
  '--color-champagne-100': '255, 255, 255',
  '--color-champagne-200': '242, 240, 232',
  '--color-champagne-300': '214, 212, 202',
  '--color-champagne-400': '156, 155, 147',
  '--color-champagne-500': '100, 100, 94',
  '--color-champagne-600': '85, 85, 79',
  '--color-champagne-700': '63, 63, 59',
  '--color-champagne-800': '42, 42, 40',
  '--color-champagne-900': '17, 17, 17',
  '--color-champagne-950': '17, 17, 17',
};

// Generate color palette from base color (returns RGB strings).
// Шейд 500 — сам выбранный цвет. Раньше он принудительно получал L = 50 %:
// оператор выбирал один цвет, а кнопки красились другим (пастель становилась
// насыщенной, дефолтный #3b82f6 уезжал в 11,100,244 против статики globals.css).
function generatePalette(baseHex: string): ColorPalette {
  const base = hexToRgb(baseHex);
  const { h, s, l } = hexToHsl(baseHex);
  const palette: Partial<ColorPalette> = {};

  for (const shade of SHADE_LEVELS) {
    if (shade === 500) {
      palette[shade] = rgbToString(base.r, base.g, base.b);
      continue;
    }
    // Adjust saturation slightly for very light/dark shades
    const adjustedS = shade <= 100 ? s * 0.7 : shade >= 900 ? s * 0.8 : s;
    const { r, g, b } = hslToRgb(h, adjustedS, shadeLightness(shade, l));
    palette[shade] = rgbToString(r, g, b);
  }

  return palette as ColorPalette;
}

type Rgb = { r: number; g: number; b: number };

function mixRgb(rgb1: Rgb, rgb2: Rgb, factor: number): Rgb {
  return {
    r: Math.round(rgb1.r + (rgb2.r - rgb1.r) * factor),
    g: Math.round(rgb1.g + (rgb2.g - rgb1.g) * factor),
    b: Math.round(rgb1.b + (rgb2.b - rgb1.b) * factor),
  };
}

// WCAG relative luminance
function relativeLuminance({ r, g, b }: Rgb): number {
  const srgb = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}

// WCAG contrast ratio between two colors
function contrastRatio(a: Rgb, b: Rgb): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * Guarantee a minimum contrast for a TEXT color against its background.
 *
 * Operators pick arbitrary palette colors in the theme editor, and several
 * tokens are additionally blended toward the surface (dark-500 = secondary
 * text mixed 40% into the card color). Without a floor, hint/meta text
 * regularly lands at a 1.5-2.5 contrast ratio and becomes unreadable.
 * When the color already passes, it is returned untouched, so well-tuned
 * palettes render byte-for-byte the same as before.
 */
function ensureReadable(fg: Rgb, towards: Rgb, bg: Rgb, minRatio: number): Rgb {
  if (contrastRatio(fg, bg) >= minRatio) return fg;
  for (let t = 0.1; t <= 1; t += 0.1) {
    const mixed = mixRgb(fg, towards, t);
    if (contrastRatio(mixed, bg) >= minRatio) return mixed;
  }
  return towards;
}

function parseTriplet(triplet: string): Rgb {
  const [r, g, b] = triplet.split(',').map((x) => Number(x.trim()));
  return { r, g, b };
}

function tripletOf({ r, g, b }: Rgb): string {
  return rgbToString(r, g, b);
}

// Надпись на заливке — это текст, и ему нужен AA 4.5, а не 3:1 для нетекстовых
// элементов. Порог 3 оставлял белый на средних по светлоте заливках, где тёмный
// текст читается вдвое лучше: синий #3b82f6 (белый 3.68 против тёмного 4.85),
// розовый #ec4899 (3.4 против 5.2). Теперь белый держится, только пока сам даёт
// AA; иначе берётся сторона с лучшим контрастом. Плата за это — тёмная надпись
// на первичных кнопках дефолтной синей палитры.
const ON_COLOR_WHITE_MIN_RATIO = 4.5;

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const INK: Rgb = { r: 15, g: 23, b: 42 };

/**
 * Подтянуть заливку так, чтобы надпись на ней читалась.
 *
 * Бывают акценты, на которых ни белый, ни тёмный текст не дают AA: фиолетовый
 * #8b5cf6 отдаёт 4.23 обеим сторонам. Сдвигаем сам цвет на минимум — в ту
 * сторону, где норма достигается быстрее. На практике хватает 5 %, глаз такой
 * сдвиг не замечает, а надпись кнопки перестаёт быть на грани.
 */
function ensureFillCarriesText(bg: Rgb): Rgb {
  const best = (c: Rgb) => Math.max(contrastRatio(WHITE, c), contrastRatio(INK, c));
  if (best(bg) >= ON_COLOR_WHITE_MIN_RATIO) return bg;

  for (let step = 1; step <= 40; step += 1) {
    const k = step / 100;
    // Check the actual 8-bit color. Fractional channels can pass 4.5 while
    // their rendered, rounded value falls below it (e.g. a plum accent).
    const darker: Rgb = {
      r: Math.round(bg.r * (1 - k)),
      g: Math.round(bg.g * (1 - k)),
      b: Math.round(bg.b * (1 - k)),
    };
    if (contrastRatio(WHITE, darker) >= ON_COLOR_WHITE_MIN_RATIO) return darker;
    const lighter: Rgb = {
      r: Math.round(bg.r + (255 - bg.r) * k),
      g: Math.round(bg.g + (255 - bg.g) * k),
      b: Math.round(bg.b + (255 - bg.b) * k),
    };
    if (contrastRatio(INK, lighter) >= ON_COLOR_WHITE_MIN_RATIO) return lighter;
  }
  return bg;
}

function prefersWhiteText(bg: Rgb): boolean {
  const whiteRatio = contrastRatio(WHITE, bg);
  if (whiteRatio >= ON_COLOR_WHITE_MIN_RATIO) return true;
  return whiteRatio >= contrastRatio(INK, bg);
}

// Black-or-white text for a given button/badge background.
function onColorFor(bgTriplet: string): string {
  return prefersWhiteText(parseTriplet(bgTriplet)) ? '255, 255, 255' : '15, 23, 42';
}

/** Тот же выбор белый/тёмный для hex-заливки — для иконок, рисуемых вне CSS. */
export function readableTextOnHex(hex: string): string {
  return prefersWhiteText(hexToRgb(hex)) ? '#ffffff' : '#0f172a';
}

type ThemeSurfaces = { surface: Rgb; text: Rgb };
const TEXT_SHADE_MIN_RATIO = 4.5;
// Светлой теме нужен запас: тот же текст встречается на подкрашенной плашке
// (бейдж «Активна» на bg-success-400/10), и AA ровно по поверхности там уже
// не выполняется — замер давал 3.39 на неоновом акценте, а с порогом 5.0 всё
// ещё 4.27. Подкраска съедает около 15 % контраста, отсюда 5.5.
const LIGHT_TEXT_SHADE_MIN_RATIO = 5.5;

// Текстовые шейды статусных палитр: 300/400 — текст в тёмной теме (ссылки,
// суммы, бейджи), 700/800 — их замена в светлой (.light ремапит *-300/400 -> *-800).
// Лестница привязана к базовому цвету, поэтому у тёмного акцента светлые шейды
// сжимаются, у светлого — тёмные; здесь им гарантируется AA на поверхности
// своей темы. Палитры, которые и так читаются, остаются нетронутыми.
function withReadableTextShades(
  palette: ColorPalette,
  dark: ThemeSurfaces,
  light: ThemeSurfaces,
): ColorPalette {
  const readable = (shade: ShadeLevel, towards: Rgb, bg: Rgb, min: number) =>
    tripletOf(ensureReadable(parseTriplet(palette[shade]), towards, bg, min));
  return {
    ...palette,
    500: tripletOf(ensureFillCarriesText(parseTriplet(palette[500]))),
    300: readable(300, dark.text, dark.surface, TEXT_SHADE_MIN_RATIO),
    400: readable(400, dark.text, dark.surface, TEXT_SHADE_MIN_RATIO),
    700: readable(700, light.text, light.surface, LIGHT_TEXT_SHADE_MIN_RATIO),
    800: readable(800, light.text, light.surface, LIGHT_TEXT_SHADE_MIN_RATIO),
  };
}

/**
 * CSS-переменные палитры для :root (RGB-триплеты — ради Tailwind-прозрачности).
 * Чистая функция: результат и ставится на документ, и уходит в подсказку первой
 * отрисовки, которую инлайн-скрипт index.html применит до загрузки приложения.
 */
export function computeThemeCssVars(themeColors: ThemeColors): Record<string, string> {
  // Частичный/битый ответ /branding/colors раньше ронял ВСЁ приложение в
  // ErrorBoundary (hexToRgb(undefined)). Недостающие поля добиваем дефолтами.
  // RichVPN: нейтрали и статусы фиксированы дизайн-системой (ink/bone), из
  // админки настраивается только акцент.
  const colors: ThemeColors = {
    ...DEFAULT_THEME_COLORS,
    ...themeColors,
    ...RICHVPN_FIXED_COLORS,
  };
  if (!themeColors?.accent) colors.accent = RICHVPN_DEFAULT_ACCENT;
  colors.success = colors.accent;

  // Generate palettes from status colors
  const accentPalette = generatePalette(colors.accent);
  const successPalette = generatePalette(colors.success);
  const warningPalette = generatePalette(colors.warning);
  const errorPalette = generatePalette(colors.error);

  const darkSurfaceRgb = hexToRgb(colors.darkSurface);
  const darkTextRgb = hexToRgb(colors.darkText);

  const darkVars = RICHVPN_DARK_VARS;

  const lightSurfaceRgb = hexToRgb(colors.lightSurface);
  const lightTextRgb = hexToRgb(colors.lightText);

  const lightVars = RICHVPN_LIGHT_VARS;

  const darkSurfaces: ThemeSurfaces = { surface: darkSurfaceRgb, text: darkTextRgb };
  const lightSurfaces: ThemeSurfaces = { surface: lightSurfaceRgb, text: lightTextRgb };
  const accent = withReadableTextShades(accentPalette, darkSurfaces, lightSurfaces);
  const success = withReadableTextShades(successPalette, darkSurfaces, lightSurfaces);
  const warning = withReadableTextShades(warningPalette, darkSurfaces, lightSurfaces);
  const error = withReadableTextShades(errorPalette, darkSurfaces, lightSurfaces);

  const statusVars = Object.fromEntries(
    SHADE_LEVELS.flatMap((shade) => [
      [`--color-accent-${shade}`, accent[shade]],
      [`--color-success-${shade}`, success[shade]],
      [`--color-warning-${shade}`, warning[shade]],
      [`--color-error-${shade}`, error[shade]],
    ]),
  );

  // Readable text color on top of each status color (buttons, filled badges).
  // Hardcoded white breaks the moment an operator picks a light accent.
  const onColorVars = {
    '--color-on-accent': onColorFor(accent[500]),
    '--color-on-success': onColorFor(success[500]),
    '--color-on-warning': onColorFor(warning[500]),
    '--color-on-error': onColorFor(error[500]),
  };

  // Semantic colors (hex for direct use)
  const semanticVars = {
    '--color-dark-bg': colors.darkBackground,
    '--color-dark-surface': colors.darkSurface,
    '--color-dark-text': colors.darkText,
    '--color-dark-text-secondary': colors.darkTextSecondary,
    '--color-light-bg': colors.lightBackground,
    '--color-light-surface': colors.lightSurface,
    '--color-light-text': colors.lightText,
    '--color-light-text-secondary': colors.lightTextSecondary,
  };

  return { ...darkVars, ...lightVars, ...statusVars, ...onColorVars, ...semanticVars };
}

// Apply theme colors as CSS variables on :root and remember them for the next first paint.
export function applyThemeColors(themeColors: ThemeColors): void {
  const colors: ThemeColors = { ...DEFAULT_THEME_COLORS, ...themeColors };
  const vars = computeThemeCssVars(colors);
  const root = document.documentElement;
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
  // Следующая загрузка стартует с этой палитры, а не с дефолтной: инлайн-скрипт
  // index.html ставит переменные из подсказки до загрузки приложения.
  writeThemeColorsHint({ colors, vars });
}

export function useThemeColors() {
  const queryClient = useQueryClient();

  const { data: colors, isLoading, error } = useQuery(themeColorsQueryOptions());

  // Apply colors when loaded or changed
  useEffect(() => {
    const colorsToApply = colors || DEFAULT_THEME_COLORS;
    applyThemeColors(colorsToApply);
  }, [colors]);

  const invalidateColors = () => {
    queryClient.invalidateQueries({ queryKey: ['theme-colors'] });
  };

  return {
    colors: colors || DEFAULT_THEME_COLORS,
    isLoading,
    error,
    invalidateColors,
  };
}
