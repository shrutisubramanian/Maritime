# UI Color Migration — Nhaav / Nhaav

**Date:** 2026-10-03
**Palette:** approved Nhaav brand — Merino `#F5EEDD` · Rock Blue `#84B3CE` · Venice Blue `#16587B` (exact shades per the provided reference image; verified against its printed HEX/RGB/CMYK values).
**Scope:** color-system migration only. No backend, routing, API, auth, business logic, or payment code touched.
**Companion:** [UI_COLOR_AUDIT.md](UI_COLOR_AUDIT.md) (pre-migration audit).

---

## 1. Token architecture (one authoritative system)

```
src/constants/colors.ts          ← SINGLE SOURCE OF TRUTH
   ├─ brand:    merino #F5EEDD, rock #84B3CE, venice #16587B
   ├─ derived:  ink #163746, muted #4A606D, faint #8FA6B2, borders,
   │            tints, veniceHover #114A67, veniceGradEnd #1E6E96
   ├─ semantic: success/warning/error/info/purple (base + text + tint + border)
   ├─ lightTheme / darkTheme (canonical names)
   └─ statusColors (domain status → semantic map)

Mirrors (kept in sync, enforced by tools/color_contract.py):
   src/index.css @theme           Tailwind v4 tokens (bg-brand, text-muted…)
   src/index.css :root/.light/.dark  legacy CSS-variable bridge
   src/context/ThemeContext.tsx   JS token objects (64-key legacy API kept
                                  for the 14 consumers + canonical names),
                                  sets ALL tokens as runtime CSS variables
                                  (canonical + legacy bridge) on theme switch
```

- **Dead systems removed:** `tailwind.config.js` (ignored by Tailwind v4) left unrevived and unreferenced; `@theme` is the only Tailwind path. shadcn-style aliases (`--color-primary`, `--color-secondary`, `destructive`, `accent`, `ring`…) resolve `src/components/ui/button.tsx` through the live tokens.
- `constants/colors.ts` is now genuinely authoritative (was zero-consumer before).

## 2. The migration

One-shot script `tools/color_sweep.py` (kept for provenance) rewrote raw literals into `var(--…)` semantic tokens with value-exact + context-aware rules; everything it could not confidently map was reported and then fixed manually. On-fill text colors were re-paired deliberately (below).

## 3. Files changed

**Token core (3):** `src/constants/colors.ts` (rewritten, authoritative), `src/context/ThemeContext.tsx` (rewritten, derives 100% from colors.ts), `src/index.css` (rewritten: `@theme` + var bridge + badges).

**Swept to semantic tokens: 54 TSX files** — all shared components (Button, Input, Navbar, HeaderNav, sidebars, modals, forms) and pages: Marketplace (Marketplace, ServiceDetails, ProviderProfile), Financials, ShipDashboard, ShipOwnerDashboard, ProviderDashboard (index, AddService, MyServices, MyQuotations, QuotationDetails, EditCompanyProfile), Admin (index, AdminLogin, ProviderVerification, MarketplaceServices, ProcurementRequests), JobTracking (JobTracking, JobDetails), Documents/Verification, Notifications, Orders, Role/chooserole, Procurement (CreateProcurementRequest, ProcurementOpportunities, RequestDetails, SubmitQuotation, CompareQuotations), Profile (index, CompanyProfile), Landing, Register, Login, Settings, AuthLayout (×2), InactivityProvider, ParsedResultBox, SuccessScreen, ConfirmationModal, ExtractedDataGrid, AnalyticsDashboard, hero-section-5, dashboards.

**New tools (2):** `tools/color_sweep.py` (one-shot migration), `tools/color_contract.py` (CI gate: fails on any old-brand literal in TSX + verifies the `@theme` mirror matches colors.ts).

## 4. Raw colors removed / remaining

| Metric | Before | After |
|---|---|---|
| Raw hex literals in TSX | **922** | **29** |
| Raw rgba() literals in TSX | **751** | **270** |
| Files consuming semantic tokens | 0 | **54** |

**Why the remainder stays (all intentional, contract-enforced categories):**
- **Image-overlay scrims** (~57): `rgba(13,21,29,…)` gradients over Marketplace card photos — must stay literal over images.
- **Shadows/glows** (~60): `rgba(0,0,0,x)`/`rgba(255,255,255,x)` inside `boxShadow` — recolored where brand glows; neutral shadows keep literals.
- **Fixed-dark screens** (AdminLogin, RoleChooser, CompanyProfile hero): always-dark by design; normalized to Nhaav dark values (`#0E2433`, `#13293A`, `#F5EEDD`…) as constants.
- **Dark-theme image panes**: `rgba(25,32,42,0.8)` viewer backgrounds.
- **Dark-scene glass/borders** on dark-only screens: white/black alphas.
- **Token sources**: colors.ts / ThemeContext definitions themselves (28).
- **Cosmetic neutral guards** (`#86efac` barcode bar, `#0a0a0f` pre-styled hero bg, `#000000` radial in fixed-dark page): visual-only, no semantic meaning.

## 5. Old → new mapping (executed)

| Old | New |
|---|---|
| `#0ea5e9` / `#0284c7` / `#38bdf8` (sky brand) | `--color-brand` `#16587B` / `--color-brand-hover` `#114A67` / `--color-brand-grad-end` `#1E6E96` |
| `#2563eb` (secondary blue) | `--color-info` `#0369A1` (+ `-fill` form for white-text fills) |
| `#f5f6f8` `#f9fafb` `#f1f5f9` (muted surfaces) | `--color-surface-alt` `#F7F4EC` |
| `#ffffff` page bg | `--color-background` `#F5EEDD` (Merino); cards stay `--color-surface` `#FFFFFF` |
| `#1a1a2e` / `#0d0d14` (text) | `--color-text` `#163746` |
| `#6b6b7b` / `#4a4a5a` / `#475569` (muted) | `--color-muted` `#4A606D` |
| `#9a9aa8` / `#94a3b8` (failing muted) | `--color-faint` `#8FA6B2` (disabled/decorative only) |
| `#e4e6ea` `#ebedf0` `#d1d5db` (borders) | `--color-border` `#E3DDD0` / `--color-border-strong` `#C9C2B0` |
| greens `#16a34a` `#22c55e` `#34d399` `#10b981` | `--color-success` `#16A34A` (text `#166534`, tint 12%) |
| amber leak `#f59e0b` / warning-as-sky | `--color-warning` `#B45309` (text `#92400E`) — true semantic warning |
| reds `#dc2626` `#ef4444` `#f87171` `#fb7185` | `--color-error` `#DC2626` (text `#B91C1C`) |
| purple `#7c3aed`/`#a855f7`/`#a78bfa` | `--color-purple` `#7C3AED` |
| ink-on-sky primary button | **Venice `#16587B` + white** (spec) |
| white-on-sky gradient CTAs (failing 2.77:1) | Venice/info-fill gradients + `--color-on-brand-fill` white |
| ink-on-fill leftovers from sweep | `--color-on-brand` / `--color-text-inverse` (contrast-corrected) |
| old dark M3 navy screens | Nhaav dark (`#0E2433` bg, `#13293A` surface, Merino text, Rock accents) |

## 6. Contrast results (WCAG 2.x, computed)

| Pair | Ratio | |
|---|---|---|
| White on Venice `#16587B` (primary CTA) | **7.73:1** | AAA |
| White on Venice hover `#114A67` | 9.55:1 | AAA |
| Ink `#163746` on Rock `#84B3CE` (secondary CTA) | **5.58:1** | AA |
| Ink on Merino (body text) | 10.88:1 | AAA |
| Ink on white | 12.58:1 | AAA |
| Venice text on Merino (links/headings) | 6.68:1 | AA |
| Muted `#4A606D` on Merino / white | 5.70 / 6.59:1 | AA |
| Success text `#166534` on Merino/tint | 6.16 / 6.40:1 | AA |
| Warning text `#92400E` on Merino/tint | 6.13 / 6.56:1 | AA |
| Error text `#B91C1C` on Merino/tint | 5.59 / 5.54:1 | AA |
| Info `#0369A1` on Merino | 5.13:1 | AA |
| Dark theme: Merino text on `#0E2433` | 13.77:1 | AAA |
| Dark theme: Rock accent / muted on `#0E2433` | 7.07 / 8.65:1 | AA |

All 10 failing pairs from the audit (white-on-sky CTAs 2.77:1, `#9a9aa8` 2.78:1, amber 2.15:1, placeholders 2.57:1, green badge 2.96:1, …) are eliminated. **White-on-Rock never occurs** for text/buttons, per spec.

## 7. Verification results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npm run build` (production) | ✅ built in ~45s (pre-existing chunk-size warning only) |
| `tools/color_contract.py` | ✅ OK — no old colors in TSX, `@theme` mirror in sync |
| `tools/h9_reference_check.py` | ✅ unchanged baseline (1 known FP: `vite-env.d.ts`) |
| Old-brand grep (`#0ea5e9`, `#2563eb`, …) | ✅ 0 occurrences |
| Backend / API / routes / auth | untouched (0 backend diffs in this pass) |

Area checklist: buttons ✅ (Venice+white / Rock+ink), navbar+sidebars ✅ (gradient active states now AA), marketplace ✅, provider profiles ✅, admin dashboard ✅ (incl. fixed-dark AdminLogin), forms ✅ (white fields, Rock borders), document verification ✅, semantic states ✅ (true amber warning), responsive/mobile ✅ (layout rules untouched; colors theme-driven), dark mode ✅ (Merino-on-deep-Venice night theme).

## 8. Notes & follow-ups

- The one-shot `tools/color_sweep.py` remains for provenance; `tools/color_contract.py` is the ongoing gate — wire it into CI alongside `h9_reference_check.py`.
- Marketplace card images keep their dark overlay scrims (legible white text over photos).
- Dark mode is now a genuine Nhaav night theme (previously generic slate); the toggle is unchanged.
- Payment screens (next phase) will land on: Merino background + white payment card + Venice primary actions + Rock supporting info — exactly the approved hierarchy.
