import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';

import { lightTheme, darkTheme, derived, semantic } from '../constants/colors';

type Theme = 'dark' | 'light';

/**
 * Token set resolved per theme.
 *
 * The `bg`, `text` and `cyan` legacy names are the historical ThemeContext API
 * consumed by 14+ components; they are kept 1:1 so consumers compile
 * untouched. Their VALUES now derive exclusively from
 * `src/constants/colors.ts` - the single authoritative source (see the
 * header there). Canonical names (background, surface, brand, ...) are
 * available to new code and mirror the CSS variables set on :root.
 */
interface ThemeTokens {
  // legacy surface/text API (unchanged names)
  bg: string;
  bgDeep: string;
  bgNav: string;
  bgCard: string;
  bgCardH: string;
  bgLow: string;
  bgLowest: string;
  bgBright: string;
  bgHigh: string;
  bgInput: string;
  border: string;
  borderMid: string;
  borderW: string;
  borderStrong: string;
  text: string;
  title: string;
  muted: string;
  subtext: string;
  dim: string;
  slate: string;
  faint: string;
  cyan: string;
  cyanDim: string;
  primary: string;
  primaryDim: string;
  secondary: string;
  secondaryDim: string;
  error: string;
  errCont: string;
  green: string;
  white: string;
  glass: string;
  glassCardBg: string;
  headerBg: string;
  heroGradient: string;
  heroBottom: string;
  ctaGradient: string;
  ctaText: string;
  ctaSubtext: string;
  ctaButtonBg: string;
  ctaButtonText: string;
  footerBg: string;
  footerBorder: string;
  modalBg: string;
  modalText: string;
  modalSubtext: string;
  modalInputBg: string;
  modalInputBorder: string;
  shadowSm: string;
  shadowMd: string;
  shadowGlow: string;
  // legacy semantic status API
  success: string;
  successDim: string;
  successBorder: string;
  warning: string;
  warningDim: string;
  warningBorder: string;
  danger: string;
  dangerDim: string;
  dangerBorder: string;
  info: string;
  infoDim: string;
  infoBorder: string;
  purple: string;
  purpleDim: string;
  purpleBorder: string;
  // canonical names (new code should prefer these)
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceDeep: string;
  textInverse: string;
  brand: string;
  brandHover: string;
  brandSoft: string;
  onBrand: string;
  onBrandSoft: string;
  brandTint: string;
  brandTintStrong: string;
  brandTintSolid: string;
  rockTint: string;
  gradient: string;
  brandGradEnd: string;
  successStrong: string;
  successText: string;
  successTint: string;
  warningText: string;
  warningTint: string;
  errorStrong: string;
  errorText: string;
  errorTint: string;
  infoText: string;
  infoTint: string;
  purpleText: string;
  purpleTint: string;
}

const lightTokens: ThemeTokens = {
  ...lightTheme,
  // -- legacy names -> canonical values (light) ------------------
  bg:          lightTheme.background,      // Merino
  bgDeep:      lightTheme.surfaceDeep,
  bgNav:       lightTheme.surface,
  bgCard:      lightTheme.surface,
  bgCardH:     lightTheme.surfaceAlt,
  bgLow:       lightTheme.surfaceAlt,
  bgLowest:    lightTheme.surfaceDeep,
  bgBright:    '#E4D9B4',
  bgHigh:      '#D3C79C',
  bgInput:     lightTheme.surface,         // white form fields
  border:      lightTheme.border,
  borderMid:   lightTheme.borderStrong,
  borderW:     '#EEE5C8',
  text:        lightTheme.text,
  title:       lightTheme.text,
  muted:       lightTheme.muted,
  subtext:     lightTheme.muted,
  dim:         lightTheme.faint,
  slate:       lightTheme.muted,
  faint:       lightTheme.faint,
  cyan:        lightTheme.brand,           // Venice
  cyanDim:     lightTheme.brandTint,
  primary:     lightTheme.brand,
  primaryDim:  lightTheme.brandTint,
  secondary:   lightTheme.muted,
  secondaryDim: 'rgba(22, 55, 70, 0.08)',
  error:       semantic.error,
  errCont:     semantic.errorTint,
  green:       semantic.success,
  white:       derived.ink,                // legacy "strong text on tints" = ink
  glass:       'rgba(255, 255, 255, 0.88)',
  glassCardBg: lightTheme.surface,
  headerBg:    'rgba(255, 255, 255, 0.92)',
  heroGradient: 'linear-gradient(to right, #FFF36D 35%, rgba(255, 243, 109, 0.85) 60%, transparent)',
  heroBottom:  'linear-gradient(to bottom, transparent 55%, #FFF36D)',
  ctaGradient: lightTheme.gradient,
  ctaText:     lightTheme.onBrand,
  ctaSubtext:  lightTheme.muted,
  ctaButtonBg: lightTheme.brand,
  ctaButtonText: lightTheme.onBrand,
  footerBg:    lightTheme.surfaceDeep,
  footerBorder: lightTheme.borderStrong,
  modalBg:     lightTheme.surface,
  modalText:   lightTheme.text,
  modalSubtext: lightTheme.muted,
  modalInputBg: lightTheme.surface,
  modalInputBorder: lightTheme.borderStrong,
  shadowSm:    '0 1px 3px rgba(22, 55, 70, 0.08)',
  shadowMd:    '0 4px 16px rgba(22, 55, 70, 0.10)',
  shadowGlow:  '0 0 20px rgba(13, 59, 102, 0.18)',
  // legacy semantic names
  success:     semantic.success,
  successDim:  semantic.successTint,
  successBorder: semantic.successBorder,
  warning:     semantic.warning,
  warningDim:  semantic.warningTint,
  warningBorder: semantic.warningBorder,
  danger:      semantic.error,
  dangerDim:   semantic.errorTint,
  dangerBorder: semantic.errorBorder,
  info:        semantic.info,
  infoDim:     semantic.infoTint,
  infoBorder:  semantic.infoBorder,
  purple:      semantic.purple,
  purpleDim:   semantic.purpleTint,
  purpleBorder: semantic.purpleBorder,
};

const darkTokens: ThemeTokens = {
  ...darkTheme,
  // -- legacy names -> canonical values (dark) -------------------
  bg:          darkTheme.background,       // Morning Dawn page
  bgDeep:      darkTheme.surfaceDeep,
  bgNav:       darkTheme.surface,
  bgCard:      darkTheme.surface,
  bgCardH:     darkTheme.surfaceAlt,
  bgLow:       darkTheme.surfaceAlt,
  bgLowest:    darkTheme.surfaceDeep,
  bgBright:    darkTheme.surface,         // Morning Dawn paper mode: steps up
  bgHigh:      darkTheme.surfaceAlt,
  bgInput:     darkTheme.surfaceAlt,
  border:      darkTheme.border,
  borderMid:   darkTheme.borderStrong,
  borderW:     'rgba(13, 59, 102, 0.10)',
  text:        darkTheme.text,
  title:       darkTheme.text,
  muted:       darkTheme.muted,
  subtext:     darkTheme.muted,
  dim:         darkTheme.faint,
  slate:       darkTheme.muted,
  faint:       darkTheme.faint,
  cyan:        darkTheme.brand,           // Yale Blue is the accent on chiffon
  cyanDim:     darkTheme.brandTint,
  primary:     darkTheme.brand,
  primaryDim:  darkTheme.brandTint,
  secondary:   darkTheme.muted,
  secondaryDim: 'rgba(13, 59, 102, 0.08)',
  error:       darkTheme.error,
  errCont:     darkTheme.errorTint,
  green:       darkTheme.success,
  white:       darkTheme.text,            // Yale ink on Morning Dawn
  glass:       'rgba(255, 243, 109, 0.85)',
  glassCardBg: 'rgba(255, 252, 242, 0.85)',
  headerBg:    'rgba(255, 243, 109, 0.92)',
  heroGradient: 'linear-gradient(to right, #FFF36D 35%, rgba(255, 243, 109, 0.85) 60%, transparent)',
  heroBottom:  'linear-gradient(to bottom, transparent 55%, #FFF36D)',
  ctaGradient: darkTheme.gradient,
  ctaText:     darkTheme.onBrand,
  ctaSubtext:  darkTheme.muted,
  ctaButtonBg: darkTheme.brand,
  ctaButtonText: darkTheme.onBrand,
  footerBg:    darkTheme.surfaceDeep,
  footerBorder: 'rgba(13, 59, 102, 0.22)',
  modalBg:     darkTheme.surface,
  modalText:   darkTheme.text,
  modalSubtext: darkTheme.muted,
  modalInputBg: darkTheme.surfaceAlt,
  modalInputBorder: darkTheme.borderStrong,
  shadowSm:    '0 1px 3px rgba(13, 59, 102, 0.10)',
  shadowMd:    '0 4px 16px rgba(13, 59, 102, 0.12)',
  shadowGlow:  '0 0 20px rgba(13, 59, 102, 0.18)',
  // legacy semantic names
  success:     darkTheme.success,
  successDim:  darkTheme.successTint,
  successBorder: darkTheme.successBorder,
  warning:     darkTheme.warning,
  warningDim:  darkTheme.warningTint,
  warningBorder: darkTheme.warningBorder,
  danger:      darkTheme.error,
  dangerDim:   darkTheme.errorTint,
  dangerBorder: darkTheme.errorBorder,
  info:        darkTheme.info,
  infoDim:     darkTheme.infoTint,
  infoBorder:  darkTheme.infoBorder,
  purple:      darkTheme.purple,
  purpleDim:   darkTheme.purpleTint,
  purpleBorder: darkTheme.purpleBorder,
};

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  tokens: ThemeTokens;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Apply the full token set of a theme to :root as CSS variables. */
function applyCssVariables(tokens: ThemeTokens, isDark: boolean): void {
  const root = document.documentElement.style;
  const set = (k: string, v: string) => root.setProperty(k, v);

  // -- canonical variables (see index.css @theme / :root) ----------
  set('--color-brand', tokens.brand);
  set('--color-brand-hover', tokens.brandHover);
  set('--color-brand-soft', tokens.brandSoft);
  set('--color-on-brand', tokens.onBrand);
  set('--color-on-brand-soft', tokens.onBrandSoft);
  set('--color-brand-tint', tokens.brandTint);
  set('--color-brand-tint-strong', tokens.brandTintStrong);
  set('--color-brand-tint-solid', tokens.brandTintSolid);
  set('--color-rock-tint', tokens.rockTint);
  set('--color-background', tokens.background);
  set('--color-surface', tokens.surface);
  set('--color-surface-alt', tokens.surfaceAlt);
  set('--color-surface-deep', tokens.surfaceDeep);
  set('--color-text', tokens.text);
  set('--color-text-inverse', tokens.textInverse);
  set('--color-muted', tokens.muted);
  set('--color-faint', tokens.faint);
  set('--color-border', tokens.border);
  set('--color-border-strong', tokens.borderStrong);
  set('--color-gradient', tokens.gradient);
  set('--color-brand-grad-end', tokens.brandGradEnd);
  set('--color-brand-glow', tokens.shadowGlow);
  for (const kind of ['success', 'warning', 'error', 'info', 'purple'] as const) {
    set(`--color-${kind}`, tokens[kind]);
    set(`--color-${kind}-text`, tokens[`${kind}Text` as keyof ThemeTokens] as string);
    set(`--color-${kind}-tint`, tokens[`${kind}Tint` as keyof ThemeTokens] as string);
  }

  // -- legacy variable bridge (components still read these) --------
  set('--bg-primary', tokens.bg);
  set('--bg-secondary', tokens.bgLow);
  set('--bg-surface', tokens.bgCard);
  set('--bg-surface-hover', tokens.surfaceAlt);
  set('--bg-glass', tokens.glass);
  set('--border-color', tokens.border);
  set('--border-glow', tokens.cyanDim);
  set('--accent-primary', tokens.primary);
  set('--accent-primary-hover', tokens.brandHover);
  set('--accent-glow', tokens.shadowGlow);
  set('--accent-cyan', tokens.cyan);
  set('--accent-emerald', tokens.success);
  set('--accent-amber', tokens.warning);
  set('--accent-rose', tokens.error);
  set('--accent-purple', tokens.purple);
  set('--text-main', tokens.text);
  set('--text-muted', tokens.muted);
  set('--text-dim', tokens.dim);
  set('--shadow-sm', tokens.shadowSm);
  set('--shadow-md', tokens.shadowMd);
  set('--shadow-glow', tokens.shadowGlow);
  // theme-invariant tokens that components read from CSS
  set('--color-venice', '#0D3B66');
  set('--color-merino', isDark ? tokens.background : '#FFF36D');
  void isDark;
}

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('nhaav_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'light';
  });

  const isDark = theme === 'dark';

  const tokens = useMemo(() => (isDark ? darkTokens : lightTokens), [isDark]);

  useEffect(() => {
    localStorage.setItem('nhaav_theme', theme);
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
    applyCssVariables(tokens, isDark);
  }, [theme, isDark, tokens]);

  const toggleTheme = () => setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'));
  const setTheme = (t: Theme) => setThemeState(t);

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme, setTheme, tokens }}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * Brand-fixed theme: the Morning Dawn / Yale Blue palette, ALWAYS.
 *
 * The public brand surfaces (landing page, registration) are specified as a
 * fixed palette — chiffon background, deep Yale Blue panels, chiffon artwork —
 * so they must NOT follow the in-app light/dark preference. Wrapping them in
 * this provider hands every `useTheme()` consumer inside the light brand token
 * set (and `isDark === false`, so the theme-conditional branches in those pages
 * take the light path).
 *
 * Critically, this provider does NOT touch global state: unlike ThemeProvider
 * it never writes localStorage and never rewrites the `:root` CSS variables, so
 * signing in and moving into the app still honours the user's saved theme.
 * The `toggleTheme`/`setTheme` members are inert here for the same reason —
 * there is nothing page-local to switch.
 */
export const BrandThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: 'light',
      isDark: false,
      toggleTheme: () => {},
      setTheme: () => {},
      tokens: lightTokens,
    }),
    [],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
};

export type { ThemeTokens };
