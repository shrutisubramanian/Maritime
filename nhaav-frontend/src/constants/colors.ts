/**
 * Nhaav / Nhaav — Authoritative Design Tokens
 *
 * This file is the SINGLE SOURCE OF TRUTH for colors in the frontend.
 * Everything else derives from here:
 *   - src/index.css @theme (Tailwind v4) mirrors these values.
 *   - src/index.css :root/.light/.dark CSS variables mirror these values.
 *   - src/context/ThemeContext.tsx builds its JS token objects from these
 *     exports (no independent hex values of its own).
 *
 * The palette is the approved Nhaav brand:
 *   MORNING DAWN #FFF36D  vivid yellow — main background / warm sections
 *   MOONSTONE     #4C9DB0  soft teal   — secondary surfaces, highlights, borders
 *   YALE BLUE     #0D3B66  deep navy   — primary brand, CTAs, nav, headings
 *
 * Accessibility contract (WCAG 2.x AA):
 *   white on Yale              11.45:1 ✓       Yale ink on Morning Dawn  9.97:1 ✓
 *   yale-muted on Morning Dawn 6.07:1 ✓       Morning Dawn on Yale      9.97:1 ✓
 *   Moonstone is DARKER than the former Rock Blue: white on Moonstone is
 *   only 3.11:1, so Moonstone fills ALWAYS take dark (ink) text, never white.
 *
 * TEXT INK BY BACKGROUND SHADE:
 *   light surfaces (Morning Dawn / Moonstone washes) → YALE BLUE (#0D3B66)
 *   dark fills (Yale buttons, nav bars)               → MORNING DAWN (#FFF36D)
 * `text`, `muted` and `faint` follow that rule in both themes; semantic
 * status colors and on-brand fill text keep their own contrast pairs.
 *
 * The dark theme is a MORNING DAWN paper mode: Morning Dawn (#FFF36D) is
 * the surface in most places with Yale Blue ink, stepped through the yellow
 * scale so cards, insets and footers stay distinguishable without foreign
 * greys. It is the same yellow/blue pair as the reference swatch:
 * Yale Blue #0D3B66 · Morning Dawn #FFF36D.
 */

// ── Brand primitives ───────────────────────────────────────────────
export const brand = {
  merino:  '#FFF36D', // Morning Dawn — vivid yellow background
  rock:    '#4C9DB0', // Moonstone — soft muted teal
  venice:  '#0D3B66', // Yale Blue — deep maritime navy
} as const;

// Derived tones (computed for AA contrast against the brand surfaces)
export const derived = {
  veniceHover:      '#0A2F52', // darker Yale for hovers (white 13:1)
  veniceGradient:   '#17527E', // lighter Yale — white text on gradient end 9.9:1
  veniceGradEnd:    '#17527E', // gradient light end (alias, exposed as --color-brand-grad-end)
  // Body ink for the light theme: Moonstone is now the surface family, and
  // #0B2430 is the AA-checked ink on it (5.16:1). On Morning Dawn it is even
  // stronger than Yale Blue, so the same ink serves both grounds.
  ink:              '#0B2430', // dark ink for Morning Dawn and Moonstone surfaces
  onRock:           '#0B2430', // dark text for Moonstone fills (5.16:1, AA)
  // STRICT PAIRING: secondary text on the Morning Dawn ground is Yale Blue too.
  // The earlier "Yale 60%" navy (#2E5C8A) read as a washed-out blue against the
  // yellow page, so `muted`/`subtext`/`slate` all resolve to Yale here; visual
  // hierarchy is carried by size and weight instead of by tinting the ink.
  muted:            '#0D3B66', // Yale Blue — 10.0:1 on Morning Dawn
  // Legibility floor: components DO use `faint` for small labels, so each theme
  // needs a tone that is AA on its own ground while staying weaker than
  // `muted`: #4C7290 is 5.0:1 on the cream card yet clearly lighter than Yale.
  faint:            '#4C7290', // dark theme (yellow/cream ground) faint ink
  faintOnTeal:      '#11323E', // light theme — 5.1:1 on teal and its tinted steps
  border:           '#E4D9B4', // warm tan border on Morning Dawn
  borderStrong:     '#CDBE92', // emphasized dividers
  // Moonstone-derived surface steps (used instead of plain white so every panel
  // reads as brand teal rather than a cold grey against Morning Dawn).
  // Moonstone at full strength is the surface family. Note the steps go
  // LIGHTER, not darker: Moonstone is a mid tone, so ink #0B2430 keeps its AA
  // ratio (5.16:1 on the base) only if hover/inset steps move up, not down.
  // Moonstone, lightened ~10% for large fills (the #4C9DB0 swatch stays the
  // brand accent). Steps still climb LIGHTER so ink #0B2430 gains contrast.
  surface:          '#62A9BA', // Moonstone-light — default card/panel surface
  surfaceAlt:       '#6CB1C1', // +1 step — hover / zebra / insets
  surfaceDeep:      '#78B9C8', // +2 steps — footers, strong tints
  rockTint:         'rgba(76, 157, 176, 0.16)',   // soft Moonstone wash
  veniceTint:       'rgba(13, 59, 102, 0.10)',    // Yale wash
  veniceTintSolid:  '#E7EBF0',                    // precomputed Yale 10% on white
  brandGlow:        'rgba(13, 59, 102, 0.18)',    // focus/glow shadows
} as const;

// ── Semantic status colors (distinct from brand, AA-checked) ──────
export const semantic = {
  // success: icon/badge #16A34A (3.3:1 white-on-fill = large/UI only);
  // text forms are the darker variants (5.0–7.1:1).
  success:       '#16A34A',
  successStrong: '#15803D', // solid chips with white text (5.02:1)
  successText:   '#166534', // text on white/Morning Dawn/tints (6.2–7.1:1)
  // Tints are OPAQUE light washes, not translucent: a 12% green over the teal
  // surface leaves green text at ~2.8:1. These keep status text above 6:1.
  successTint:   '#E7F3EA',
  successBorder: 'rgba(22, 163, 74, 0.30)',

  warning:       '#B45309',
  warningStrong: '#B45309',
  warningText:   '#92400E', // (6.1–7.1:1)
  warningTint:   '#FBF1E0',
  warningBorder: 'rgba(245, 158, 11, 0.35)',

  error:         '#DC2626',
  errorStrong:   '#DC2626', // white on fill 4.83:1 ✓
  errorText:     '#B91C1C', // (5.6–6.5:1)
  errorTint:     '#FBE9E9',
  errorBorder:   'rgba(220, 38, 38, 0.28)',

  info:          '#0369A1', // visibly distinct from Yale (5.1–5.9:1)
  infoText:      '#0369A1',
  infoTint:      '#E6F1F7',
  infoBorder:    'rgba(3, 105, 161, 0.28)',

  purple:        '#7C3AED', // special/premium badges
  purpleText:    '#6D28D9',
  purpleTint:    '#F0EAFB',
  purpleBorder:  'rgba(124, 58, 237, 0.25)',
} as const;

// ── Light theme (default) ──────────────────────────────────────────
export const lightTheme = {
  background:    brand.merino,
  surface:       derived.surface,
  surfaceAlt:    derived.surfaceAlt,
  surfaceDeep:   derived.surfaceDeep,
  // Moonstone surfaces take the AA-checked ink (5.16:1). Yale Blue (#0D3B66)
  // would only reach 3.68:1 on them, so the light theme's body ink is ink-on-
  // Moonstone; the dark (Morning Dawn) theme keeps Yale Blue below.
  text:          derived.onRock,
  textInverse:   '#FFFFFF',
  muted:         derived.onRock,
  faint:         derived.faintOnTeal, // AA on the teal surfaces (5.1:1)
  border:        derived.border,
  borderStrong:  derived.borderStrong,
  brand:         brand.venice,
  brandHover:    derived.veniceHover,
  brandSoft:     brand.rock,
  // Ink on Yale Blue fills is MORNING DAWN (the strict brand pairing), never
  // plain white: every "on brand" button, chip and badge inherits this.
  onBrand:       brand.merino,
  onBrandSoft:   derived.onRock,
  brandTint:     derived.veniceTint,
  brandTintStrong: 'rgba(13, 59, 102, 0.22)',
  brandTintSolid: derived.veniceTintSolid,
  rockTint:      derived.rockTint,
  gradient:      `linear-gradient(135deg, ${brand.venice}, ${derived.veniceGradient})`,
  brandGradEnd:  derived.veniceGradEnd,
  ...semantic,
} as const;

// ── Dark theme (Morning Dawn "paper" mode) ──────────────────────
// MORNING DAWN (#FFF36D) is the surface in most places and YALE BLUE
// (#0D3B66) is the ink. Surfaces step through the yellow scale (page → card
// → inset) so panels and hovers stay distinguishable; borders are navy
// hairlines rather than tan so they read against the yellow. Semantic
// statuses reuse the light values, which are the AA-checked ones on light
// surfaces.
export const darkTheme = {
  background:    brand.merino, // Morning Dawn page (Yale ink 10.0:1)
  surface:       '#FFFCF2', // cards sit a step lighter than the page
  surfaceAlt:    '#F2E5B8', // hover / zebra / inset
  surfaceDeep:   '#EDDCA6', // footers, deepest step
  text:          derived.ink, // Yale Blue on Morning Dawn
  textInverse:   '#FFFFFF',
  muted:         derived.muted, // 6.1:1 on the Morning Dawn page
  faint:         derived.faint, // disabled/decorative ONLY
  border:        'rgba(13, 59, 102, 0.18)',
  borderStrong:  'rgba(13, 59, 102, 0.30)',
  brand:         brand.venice,
  brandHover:    derived.veniceHover,
  brandSoft:     brand.rock,
  onBrand:       brand.merino, // Morning Dawn ink on Yale fills
  onBrandSoft:   derived.onRock,
  brandTint:     derived.veniceTint,
  brandTintStrong: 'rgba(13, 59, 102, 0.22)',
  brandTintSolid: '#F2EBC4',
  rockTint:      derived.rockTint,
  gradient:      `linear-gradient(135deg, ${brand.venice}, ${derived.veniceGradient})`,
  brandGradEnd:  derived.veniceGradEnd,
  ...semantic,
} as const;

// ── Status → semantic mapping (badges, chips) ─────────────────────
// Consumers should use the semantic tokens above; this map pins domain
// statuses (request/quote/verification/risk) to them.
export const statusColors = {
  // Request statuses
  open:       { primary: semantic.info, subtle: semantic.infoTint, border: semantic.infoBorder },
  quoted:     { primary: semantic.info, subtle: semantic.infoTint, border: semantic.infoBorder },
  assigned:   { primary: semantic.warning, subtle: semantic.warningTint, border: semantic.warningBorder },
  awarded:    { primary: semantic.success, subtle: semantic.successTint, border: semantic.successBorder },
  completed:  { primary: semantic.success, subtle: semantic.successTint, border: semantic.successBorder },
  cancelled:  { primary: semantic.error, subtle: semantic.errorTint, border: semantic.errorBorder },

  // Quote statuses
  submitted:  { primary: semantic.info, subtle: semantic.infoTint, border: semantic.infoBorder },
  accepted:   { primary: semantic.success, subtle: semantic.successTint, border: semantic.successBorder },

  // Shared statuses
  rejected:   { primary: semantic.error, subtle: semantic.errorTint, border: semantic.errorBorder },

  // Verification statuses
  verified:       { primary: semantic.success, subtle: semantic.successTint, border: semantic.successBorder },
  pending:        { primary: semantic.warning, subtle: semantic.warningTint, border: semantic.warningBorder },
  under_review:   { primary: semantic.warning, subtle: semantic.warningTint, border: semantic.warningBorder },

  // Risk levels
  low:    { primary: semantic.success, subtle: semantic.successTint, border: semantic.successBorder },
  medium: { primary: semantic.warning, subtle: semantic.warningTint, border: semantic.warningBorder },
  high:   { primary: semantic.error, subtle: semantic.errorTint, border: semantic.errorBorder },
} as const;

/** Full resolved token set for a theme ('light' | 'dark'). */
export const themeTokens = {
  light: lightTheme,
  dark: darkTheme,
} as const;

export const colors = lightTheme;
