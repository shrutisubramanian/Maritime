# UI Color Audit — Nhaav / Nhaav Frontend

**Date:** 2026-10-03
**Scope:** Read-only visual-system inventory of `nhaav-frontend`. **No changes applied** — functionality, routes, API calls, auth, and backend behavior untouched. Zero tracked files modified.
**Next step:** choose the palette; only then apply.

---

## 1. How the current system actually works (structural finding)

The frontend has **five parallel color systems**, only some of which are alive:

| # | System | Location | Status |
|---|--------|----------|--------|
| 1 | Tailwind v4 `@theme` tokens (M3-style: `primary`, `surface-container`, `on-surface`…) | [index.css](nhaav-frontend/src/index.css) `@theme` block | **LIVE** but barely used (~22 class occurrences: `bg-primary` ×7, `bg-surface` ×5, …) |
| 2 | Tailwind JS config (full dark M3 palette, Material tokens) | [tailwind.config.js](nhaav-frontend/tailwind.config.js) | **DEAD.** Tailwind is v4.3.3 and there is no `@config` directive, so this file is ignored entirely |
| 3 | CSS custom properties (`--bg-*`, `--text-*`, `--accent-*`, glass/dark system) | index.css `:root`/`.light` | **LIVE** — ~150 inline `var(--…)` uses in components (Input, Button, Card, Navbar, sidebars) |
| 4 | JS theme token objects (`darkTokens`/`lightTokens`, 89 hexes) applied via `setProperty` | [ThemeContext.tsx](nhaav-frontend/src/context/ThemeContext.tsx) | **LIVE — the real theme engine.** Overrides layer 3 at runtime; default theme is **light** |
| 5 | Per-file ad-hoc palettes (`const C = {…}`) and raw hex inline styles | ~20 files with `const C = {`, plus raw styles everywhere | **LIVE — dominant.** Admin pages, modals, dashboards |

**Scale of hardcoding:** **922 hex** + **751 rgba()** color literals across **54 TSX files**. Tailwind's default palette is used **zero** times. The intended token file [constants/colors.ts](nhaav-frontend/src/constants/colors.ts) has **zero real consumers** (its only "import" match is its own doc comment) — it is a dead aspiration. Its comments also drifted: they call `#0ea5e9` "gold" (stale pre-rebrand comment) and map **warning → the same sky blue as the brand accent**.

**Practical consequence:** the rendered UI is controlled mostly by hardcoded hex inline styles, which the palette change must sweep file-by-file — or better, first consolidate into one token source and then re-point components.

---

## 2. Live color inventory, grouped by semantic purpose

Counts are literal occurrences (hex, case-normalized) in `src/**/*.{ts,tsx}`.

### Brand / accent
| Color | Count | Used as |
|-------|-------|---------|
| `#0ea5e9` (sky-500) | **82** | Brand accent everywhere: links, icons, primary buttons, gradients, logo, focus |
| `#0284c7` (sky-600) | hover variant | Accent hover |
| `#38bdf8` (sky-400) | 10 | Gradient partner (`#0ea5e9 → #38bdf8` is the recurring brand gradient) |
| `#2563eb` (blue-600) | **61** | Secondary blue: `info`/`open`/`quoted` badges, filled CTAs, gradients |
| `#0369a1` (sky-700) | badge text | Badge-blue text on sky tint (the accessible form of the brand hue) |

### Backgrounds & surfaces (light)
| Color | Count | Used as |
|-------|-------|---------|
| `#ffffff` | **105** | Page bg, cards, inputs, text-on-color |
| `#f5f6f8` | **63** | Muted surface: input fills, hover, secondary panels |
| `#f9fafb` (gray-50) | 26 | Alt muted surface (duplicate of the above role) |
| `#f1f5f9` (slate-100) | 11 | Alt muted surface (third duplicate) |
| `#ebedf0` | 28 | Stronger surface/divider tint |
| `#e0f2fe` (sky-100) | 30 | Sky tint surfaces (primary-soft backgrounds) |
| `#f0f9ff` (sky-50) | gradients | Landing gradient stops |

### Text
| Color | Count | Used as |
|-------|-------|---------|
| `#1a1a2e` | **78** | Dominant near-black body text |
| `#0d0d14` | 36 | Second near-black (headings, on-sky button ink, dark-theme bg) |
| `#6b6b7b` | **60** | Dominant muted/secondary text |
| `#9a9aa8` | 47 | Lighter muted (placeholders, captions) — **fails contrast** |
| `#475569` (slate-600) | 26 | Body text variant |
| `#94a3b8` (slate-400) | 10 | Muted variant — **fails contrast** |

### Borders
| Color | Count | Used as |
|-------|-------|---------|
| `rgba(0,0,0,0.08)` / `#e4e6ea` / `#ebedf0` / `#d1d5db` | mixed | Four different "default border" grays |
| `rgba(14,165,233,0.25–0.3)` | many | Accent borders/focus |

### Status
| Semantic | Colors in play | Counts |
|----------|----------------|--------|
| Success | `#16a34a` (10), `#22c55e` (8), `#34d399` (20), `rgba(16,185,129,…)` (Marketplace "verified" chips) | **4 greens** |
| Error | `#dc2626` (30), `#ef4444` (8), `#f87171` (8), `#93000a`-family in dead config | **3 reds** |
| Warning | Token system says sky `#0ea5e9`; but **real amber `#f59e0b` leaks in 5 files** (InactivityProvider, ParsedResultBox, Documents/Verification, Landing, Marketplace/ServiceDetails) | split personality |
| Info / open | `#2563eb` (+ `#bfdbfe`, `#e0f2fe` tints) | consistent-ish |
| Purple / special | `#7c3aed`/`#8b5cf6`/`#a78bfa` (tokens + ThemeContext; `#a78bfa` in dark) | 2 purples (light/dark pair) |
| Dark theme | `#0d0d14` bg, `#1e1e28` surface, `#f0f0f4` text, `#9494a4`/`#6a6a7a` muted | cohesive internally |

### Area-by-area current treatment
- **Buttons** ([Button.tsx](nhaav-frontend/src/components/Button.tsx)): primary = sky bg + `#0d0d14` ink text (**6.99:1, passes**); secondary = surface + border; danger = `--accent-rose` + white; ghost/outline variants on CSS vars.
- **Nav** (Navbar/HeaderNav/Sidebars): glass backgrounds (`rgba(255,255,255,0.95)` light / `rgba(30,30,40,0.75)` dark), brand-gradient logo tile (sky→sky-400), active items sky→blue gradient **with white text (`#ffffff` on sky — fails contrast**; AdminSidebar line ~239)).
- **Marketplace cards** ([Marketplace.tsx](nhaav-frontend/src/pages/Marketplace/Marketplace.tsx)): white cards, sky-tint gradients, emerald `rgba(16,185,129,0.85–0.9)` verified chips with white text, `T.primary`/`rgba(37,99,235,0.08)` CTA rows.
- **Admin screens** (`Admin/*.tsx`): per-file `C = {…}` palettes (each file defines its own hexes), white cards, tinted status badges, red reject buttons.
- **Badges** (index.css `.badge-*`): `badge-blue` ≡ `badge-amber` (identical sky values — the warning collision made literal), green/purple variants present.
- **Forms** ([Input.tsx](nhaav-frontend/src/components/Input.tsx)): `--bg-surface` fills, `--border-color` borders, error = `--accent-rose`.
- **Document verification** ([Verification/index.tsx](nhaav-frontend/src/pages/Documents/Verification/index.tsx)): sky-tint info panels, green verified, red rejected, **amber leak** for pending.
- **Responsive states**: colors do not change at breakpoints (layout-only mobile rules); dark theme via `.dark` class from ThemeContext (default light).

---

## 3. Duplicates & inconsistencies (what one palette fixes)

1. **Three muted surfaces** for one role: `#f5f6f8` / `#f9fafb` / `#f1f5f9`.
2. **Two near-black text colors**: `#1a1a2e` vs `#0d0d14` (both "primary text", neither canonical).
3. **Two muted-text colors**: `#6b6b7b` vs `#9a9aa8` (the latter fails WCAG on white).
4. **Four border grays**: `rgba(0,0,0,0.08)`, `#e4e6ea`, `#ebedf0`, `#d1d5db`.
5. **Four success greens**: `#16a34a`, `#22c55e`, `#34d399`, emerald rgba chips.
6. **Three error reds**: `#dc2626`, `#ef4444`, `#f87171`.
7. **Warning identity crisis**: tokens map warning→brand sky (so "pending" is indistinguishable from "accent"), while five files hardcode real amber.
8. **Dead systems invite drift**: `tailwind.config.js` (ignored), `colors.ts` (unused), and per-file `C={…}` palettes each encode a different idea of "the" brand.
9. **White-on-sky CTAs** (AdminSidebar, gradient active nav) fail contrast while `Button.tsx` already does it right (ink on sky) — the same role is rendered two different, contradictory ways.

---

## 4. Contrast audit (WCAG 2.x, computed)

### Current failures (light theme)
| Pair | Ratio | Verdict |
|------|-------|---------|
| muted `#9a9aa8` on white | 2.78:1 | **FAIL** (AA needs 4.5; UI needs 3.0) |
| `#94a3b8` on white | 2.56:1 | **FAIL** |
| white on sky `#0ea5e9` (gradient CTAs/active nav) | 2.77:1 | **FAIL** |
| brand sky as text/link on white | 2.77:1 | **FAIL** (ok for ≥3:1 non-text only — it isn't) |
| amber leak `#f59e0b` on white | 2.15:1 | **FAIL** |
| placeholder `#9a9aa8` on `#f5f6f8` | 2.57:1 | **FAIL** |
| badge-green `#16a34a` on green tint | 2.96:1 | **FAIL** |
| badge-error `#dc2626` on red tint | 4.13:1 | Fails AA text (passes 3:1 UI) |
| success `#16a34a` as small text on white | 3.30:1 | Fails AA text |
| dark-theme dim `#6a6a7a` on `#0d0d14` | 3.65:1 | Fails AA text (passes UI) |

### Current passes worth keeping
`#1a1a2e`/white 17.1 · `#0d0d14`/white 19.4 · `#6b6b7b`/white 5.2 · `#6b6b7b`/`#f5f6f8` 4.8 · ink `#0d0d14` on sky 7.0 · white on `#2563eb` 5.2 · `#dc2626`/white 4.8 · badge-blue `#0369a1` on sky tint 5.4 · badge-purple 4.9 · dark text 17.0 · dark muted 6.5.

---

## 5. Proposed Nhaav palette (v1 — for your approval)

Anchored on the existing brand (sky `#0ea5e9`) for **zero brand change**, light-first (matches ThemeContext default), every role AA-checked. Dark theme keeps its existing cohesive values.

### Core roles
| Role | Proposed | Current state | Rationale |
|------|----------|---------------|-----------|
| **primary** | `#0EA5E9` (sky-500) | same, 82 uses | Brand, links, icons, focus. **Rule: never white text on it — use ink `#0D0D14` (7.0:1)** |
| **primary-strong** (filled CTA / gradient end with white text) | `#0369A1` (sky-700) | implicit in badge-blue | White text passes (5.9:1); replaces failing white-on-sky CTAs |
| **secondary** | `#2563EB` (blue-600) | same, 61 uses | Filled actions with white text (5.2:1), informational fills |
| **background** | `#FFFFFF` | same (105 uses) | — |
| **surface / card** | `#FFFFFF`, muted variant `#F5F6F8` | same | Collapses `#f9fafb`, `#f1f5f9` into one muted surface |
| **text** | `#1A1A2E` | same (dominant) | Canonical near-black; `#0D0D14` reserved as on-sky ink + dark bg |
| **muted text** | `#6B6B7B` (5.2:1) | same (dominant) | `#9a9aa8`/`#94a3b8` demoted to disabled/decorative only |
| **border** | `#E4E6EA`; strong `#D3D7DE` | mixed 4 grays | One default border + one strong |
| **success** | `#16A34A` (badge/icon), **text form `#15803D`** (5.0:1 on white), tint `rgba(22,163,74,0.10)` with text `#166534` (6.4:1) | 4 greens | One green; darker text variants where it's read as text |
| **warning** | **`#B45309` (amber-700)** text/icon (5.0:1), tint `rgba(245,158,11,0.12)` with text `#92400E` (6.5:1) | sky-as-warning + amber leaks | A real, distinct warning. **See open question 1** |
| **error** | `#DC2626` (4.8:1 on white), **tint text `#B91C1C`** (5.5:1), hover `#EF4444` | 3 reds | One red; dark text form for tinted badges |
| **info** | `#2563EB` + tint `rgba(37,99,235,0.08)` | same | Keep as-is (5.2:1) — distinguishes from primary sky |

### Supporting tokens
| Role | Proposed |
|------|----------|
| Hover of primary | `#0284C7` (as today) |
| Brand gradient | `#0EA5E9 → #2563EB` (existing pair) with **ink or `#0369A1`-based fills** wherever white text sits on it |
| Purple / special | `#7C3AED` light / `#A78BFA` dark (unchanged, now actually tokenized) |
| Sky tint surface | `#E0F2FE` (canonical; keep) |
| Dark theme | unchanged: bg `#0D0D14`, surface `#1E1E28`, hover `#282834`, text `#F0F0F4`, muted `#9494A4`, dim `#6A6A7A`, borders `rgba(255,255,255,0.08)` |
| Disabled/decorative only | `#9A9AA8`, `#94A3B8` (never for meaningful text) |

### Verified contrast for the new pairs
warning `#B45309`/white **5.02** · warning-on-tint `#92400E` **6.46** · success-text `#15803D`/white **5.02** · success-on-tint `#166534` **6.40** · error-on-tint `#B91C1C` **5.54** · white on `#0369A1` **5.93** · white on `#2563EB` **5.17** · ink on sky **6.99**. All AA-pass.

---

## 6. Exact current → proposed mapping (application pass)

| Current | Proposed | Where |
|---------|----------|-------|
| `#0ea5e9` | `primary` (unchanged value) | everywhere |
| `#38bdf8` | keep, gradient-only | gradients |
| `#2563eb` | `secondary`/`info` (unchanged) | badges, fills |
| `#0284c7` | `primary-hover` (unchanged) | hover states |
| white text on sky/gradient fills | ink `#0D0D14` **or** fill → `#0369A1`/`#2563EB` | AdminSidebar active items, gradient CTAs |
| `#f9fafb`, `#f1f5f9` | `#F5F6F8` | all muted surfaces |
| `#0d0d14` (as light-theme text) | `#1A1A2E` | headings/body in light theme (keep `#0d0d14` as on-sky ink + dark bg) |
| `#9a9aa8`, `#94a3b8` (meaningful text) | `#6B6B7B` | placeholders, captions (keep light values for disabled) |
| `#475569` | `#6B6B7B` | body text variant (collapses slate-600 into muted) |
| `rgba(0,0,0,0.08)`/`#ebedf0`/`#d1d5db` borders | `#E4E6EA` (strong: `#D3D7DE`) | all default borders |
| `#22c55e`, `#34d399`, `rgba(16,185,129,…)` | `#16A34A` family (icon/badge); tint text `#166534` | success everywhere |
| `#16a34a` as small text | `#15803D` | success text on white |
| `#ef4444` | hover only | error hover |
| `#f87171` | dark-theme error text | dark mode |
| `#dc2626` on red tint | `#B91C1C` | badge/alert text on tint |
| `#f59e0b` (leaks) | `#B45309` (text) / tint text `#92400E` | 5 files' warning UI |
| warning-as-sky (tokens, `badge-amber`) | **pending open question 1** | tokens/badges |
| `.badge-blue`/`.badge-amber` (identical) | split: blue = `#0369A1` text; amber per warning decision | index.css |

## 7. Files that would change (application pass, after approval)

- **Token sources (first):** [index.css](nhaav-frontend/src/index.css) (`@theme` + `:root`/`.light` vars + `.badge-*`), [ThemeContext.tsx](nhaav-frontend/src/context/ThemeContext.tsx) (`darkTokens`/`lightTokens`), [constants/colors.ts](nhaav-frontend/src/constants/colors.ts) (become the real single source), [tailwind.config.js](nhaav-frontend/tailwind.config.js) (delete or reduce to non-color config).
- **Shared components:** Button, Card, Input, FormInputField, Navbar, HeaderNav, AdminSidebar, ClientSidebar, ProviderSidebar, Sidebar, FooterNav, AuthLayout, ConfirmationModal, ExtractedDataGrid, ParsedResultBox, SuccessScreen, InactivityProvider, dashboard/marketplace/map/form/ui subfolders.
- **Pages (heaviest hex concentration):** Marketplace (Marketplace.tsx 35, ServiceDetails), Financials (34), ShipDashboard (32), Admin (ProviderVerification 28, ProcurementRequests, MarketplaceServices, index), ProviderDashboard (AddService, MyServices, QuotationDetails, EditCompanyProfile, MyQuotations), JobTracking (JobDetails, JobTracking), Documents/Verification (19), Notifications, OrdersPage, chooserole, Procurement/RequestDetails — **54 TSX files total contain hex literals**.
- **Untouched:** routing, API services, auth, context logic, backend.

---

## 8. Open decisions for you (the only subjective calls)

1. **Warning color.** Today warning is deliberately mapped to the brand sky in tokens (pending/under_review look like accent). I propose a true amber `#B45309` so "pending" is distinguishable from "primary CTA" — but if the sky-mapping was an intentional product decision (e.g., from the honesty pass), I keep warning = sky and only fix the 5 amber leaks into sky. **Default if unspecified: introduce amber.**
2. **Filled-CTA style.** Two AA-passing options already coexist: ink-on-sky (Button today) vs white-on-blue `#2563EB`. Proposal keeps both (primary=sky+ink, secondary=blue+white) — say the word if you want a single filled style.
3. **Sweep depth.** Option A: tokenize + re-point components, sweep the 20 worst files, leave exotic one-offs. Option B: full 54-file sweep to zero raw hex (enforced by a new lint/grep contract test, like the backend's). B costs more but is verifiable. **Default if unspecified: B**, with a grep contract test pinning "no raw hex outside token files".

---

## 9. What was NOT done (by design)

No palette applied, no file modified, no functionality touched. This document + the terminal analysis were the only outputs. Frontend checks (`tsc`, build, reference check) were not re-run since nothing changed.
