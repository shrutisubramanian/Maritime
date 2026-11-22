# Landing Page Refactor Requirements

## Overview

Redesign and refactor the Nhaav/Nhaav maritime platform landing page to align with established design system tokens, improve component modularity, and enhance visual consistency across features, metrics, and CTA sections.

## User Story

**As a** frontend developer,  
**I want to** refactor the landing page using a component-based architecture with inline styles,  
**so that** the page is maintainable, visually consistent with the design system, and responsive across all devices.

---

## Requirements

### Requirement 1: Component Structure and Architecture

**User Story:** As a developer, I want a well-organized component structure, so that the landing page is maintainable and scalable.

#### Acceptance Criteria

1.1. WHEN the landing page is rendered THEN the system SHALL compose it from discrete, reusable components (Hero, Features, Metrics, CTA, Footer)

1.2. WHEN a component is modified THEN the system SHALL ensure changes are isolated and do not affect other components

1.3. WHEN components accept props THEN the system SHALL define TypeScript interfaces for all prop types

1.4. WHEN components are created THEN the system SHALL follow React functional component patterns with hooks

---

### Requirement 2: Theme Token Integration

**User Story:** As a developer, I want all visual tokens to derive from the ThemeContext, so that the page respects light/dark themes consistently.

#### Acceptance Criteria

2.1. WHEN the landing page renders THEN the system SHALL consume all color, spacing, and typography tokens exclusively from `useTheme().tokens`

2.2. WHEN theme changes (light ↔ dark) THEN the system SHALL update all component styles dynamically via token references

2.3. WHEN inline styles are defined THEN the system SHALL never include hardcoded color values (e.g., `#F5EEDD`, `rgba(...)`)

2.4. WHEN typography is applied THEN the system SHALL use font family constants (`manrope`, `inter`) from shared style objects

---

### Requirement 3: Glass-morphism and Visual Effects

**User Story:** As a designer, I want glass-morphism effects applied consistently to feature cards, so that the UI conveys depth and modernity.

#### Acceptance Criteria

3.1. WHEN feature cards are rendered THEN the system SHALL apply backdrop blur effects (`blur(20px)`) with semi-transparent backgrounds

3.2. WHEN glass effects are applied THEN the system SHALL include border overlays using `C.border` from theme tokens

3.3. WHEN shadow styles are applied THEN the system SHALL use theme-specific shadow tokens (`C.shadowMd`, `C.shadowGlow`)

3.4. WHEN the theme is dark THEN the system SHALL adjust glass background opacity and shadow colors accordingly

---

### Requirement 4: Layout Grid Specifications

**User Story:** As a designer, I want a responsive grid system for features and metrics, so that content adapts gracefully to screen sizes.

#### Acceptance Criteria

4.1. WHEN the Features section renders THEN the system SHALL use CSS Grid with `gridTemplateColumns: '1fr 1fr'` for desktop layouts

4.2. WHEN viewport width is below 768px THEN the system SHALL collapse grid layouts to single-column (`gridTemplateColumns: '1fr'`)

4.3. WHEN grid gaps are defined THEN the system SHALL use consistent spacing values (e.g., `gap: '1.25rem'`)

4.4. WHEN the global infrastructure card spans full width THEN the system SHALL use `gridColumn: '1 / -1'`

---

### Requirement 5: Hover State Transitions

**User Story:** As a user, I want smooth interactive feedback on hover, so that the interface feels responsive and polished.

#### Acceptance Criteria

5.1. WHEN a user hovers over a feature card THEN the system SHALL apply `transform: 'scale(1.02)'` with `transition: 'all 0.2s ease'`

5.2. WHEN a user hovers over CTA buttons THEN the system SHALL change background opacity or color smoothly over 200ms

5.3. WHEN a user hovers over navigation links THEN the system SHALL transition text color to `C.cyan` or `C.primary`

5.4. WHEN hover states are removed THEN the system SHALL restore original styles with matching transition timing

---

### Requirement 6: Mobile-First Responsive Strategy

**User Story:** As a mobile user, I want the landing page to render optimally on small screens, so that I can access all content without horizontal scrolling.

#### Acceptance Criteria

6.1. WHEN the viewport width is below 640px THEN the system SHALL adjust font sizes using `clamp()` functions (e.g., `clamp(1.8rem, 3.5vw, 2.8rem)`)

6.2. WHEN the Features section renders on mobile THEN the system SHALL switch grid layouts from 2-column to 1-column

6.3. WHEN CTA buttons render on mobile THEN the system SHALL stack vertically with `flexDirection: 'column'`

6.4. WHEN padding is applied on mobile THEN the system SHALL reduce container padding from `2.5rem` to `1.5rem`

6.5. WHEN the demo modal renders on mobile THEN the system SHALL ensure proper sizing with `maxHeight: '90vh'` and `overflowY: 'auto'`

---

### Requirement 7: Integration with Hero and Footer Components

**User Story:** As a developer, I want seamless integration with existing Hero and Footer components, so that the page renders as a cohesive whole.

#### Acceptance Criteria

7.1. WHEN the landing page renders THEN the system SHALL import and render `<HeroSection />` at the top of the layout

7.2. WHEN the landing page renders THEN the system SHALL import and render `<FooterNav />` at the bottom of the layout

7.3. WHEN the Hero component is rendered THEN the system SHALL ensure no vertical spacing conflicts with the Features section

7.4. WHEN the Footer component is rendered THEN the system SHALL apply `background: C.footerBg` and `borderTop: 1px solid C.footerBorder`

---

### Requirement 8: Performance and Accessibility

**User Story:** As an end user, I want the landing page to load quickly and be accessible, so that I have a smooth experience regardless of device or ability.

#### Acceptance Criteria

8.1. WHEN the landing page renders THEN the system SHALL minimize re-renders by memoizing complex inline style objects

8.2. WHEN interactive elements are rendered THEN the system SHALL include accessible ARIA labels and semantic HTML

8.3. WHEN animations are applied THEN the system SHALL respect `prefers-reduced-motion` user preferences

8.4. WHEN images are used THEN the system SHALL include descriptive `alt` attributes

---

### Requirement 9: Demo Booking Modal

**User Story:** As a potential customer, I want a smooth demo booking experience, so that I can schedule a consultation without friction.

#### Acceptance Criteria

9.1. WHEN a user clicks "Schedule a Demo" THEN the system SHALL open a full-screen modal overlay with backdrop blur

9.2. WHEN the modal renders THEN the system SHALL display a calendar, time slots, and form fields (name, email, company)

9.3. WHEN a user submits the form THEN the system SHALL validate required fields and display a success confirmation

9.4. WHEN the modal is closed THEN the system SHALL reset form state and hide the overlay

9.5. WHEN the modal is open THEN the system SHALL prevent scrolling on the underlying page body

---

### Requirement 10: Inline Style Patterns

**User Story:** As a developer, I want consistent inline style patterns, so that the codebase is maintainable and follows React best practices.

#### Acceptance Criteria

10.1. WHEN inline styles are defined THEN the system SHALL use React.CSSProperties type annotations

10.2. WHEN reusable style objects are created THEN the system SHALL define them outside component render functions (e.g., `const manrope: React.CSSProperties = { fontFamily: "'Manrope', sans-serif" }`)

10.3. WHEN complex styles are repeated THEN the system SHALL extract them into named constants (e.g., `glassCardStyle`, `blur()` helper)

10.4. WHEN hover handlers are used THEN the system SHALL use `onMouseEnter`/`onMouseLeave` to dynamically update `currentTarget.style`

---

## Non-Functional Requirements

### Performance

- Page should achieve Lighthouse performance score > 90
- First Contentful Paint (FCP) < 1.5s
- Cumulative Layout Shift (CLS) < 0.1

### Browser Compatibility

- Support latest 2 versions of Chrome, Firefox, Safari, Edge
- Graceful degradation for older browsers (no backdrop-filter fallback)

### Accessibility

- WCAG 2.1 AA compliance
- Keyboard navigation support for all interactive elements
- Screen reader compatible semantic HTML

---

## Constraints

1. **No External CSS Files**: All styles must be inline or CSS-in-JS
2. **Theme Token Dependency**: Must use `useTheme()` for all visual tokens
3. **Existing Component Integration**: Must integrate with `HeroSection` and `FooterNav` without modifications
4. **TypeScript Strict Mode**: All components must pass strict type checking

---

## Out of Scope

- Backend API integration for demo booking (mock-only for now)
- Multi-language support (i18n)
- Advanced animations (e.g., scroll-triggered parallax)
- A/B testing infrastructure

---

## Success Criteria

The landing page refactor will be considered successful when:

1. All acceptance criteria are met and verified
2. Visual consistency matches design system tokens
3. Responsive breakpoints work seamlessly across devices
4. Code passes TypeScript type checking and ESLint validation
5. Lighthouse accessibility score > 95
