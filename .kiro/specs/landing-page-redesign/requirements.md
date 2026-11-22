# Requirements Document

## Introduction

This specification defines the redesign of the Nhaav maritime platform landing page to implement a new visual identity while preserving the existing video hero element. The redesign modernizes the features section with a two-card layout highlighting Verified Trust and Global Infrastructure, introduces three metric cards positioned before the call-to-action section, and establishes a balanced visual style combining glass-morphism effects with solid card elements. The design system leverages the custom Venice Blue (#16587B), Merino (#F5EEDD), and Rock Blue (#84B3CE) theme palette with comprehensive dark mode support and mobile-first responsive behavior.

## Glossary

- **Landing_Page**: The primary public-facing TypeScript React component at `src/pages/Landing/index.tsx` that serves as the entry point for unauthenticated visitors
- **Hero_Section**: The full-viewport opening section containing the background video, navigation header, and primary headline with call-to-action buttons, implemented in `src/components/blocks/hero-section-5.tsx`
- **Video_Element**: The HTML5 `<video>` element configured with autoPlay, loop, muted, and playsInline attributes displaying `/hero-video.mp4`
- **Features_Section**: The section immediately following the Hero displaying service capabilities and infrastructure details
- **Feature_Card**: A visual container component with defined border-radius, padding, background treatment, and content hierarchy
- **Glass_Card**: A Feature_Card variant applying backdrop-filter blur effects, semi-transparent backgrounds, and subtle border treatments
- **Solid_Card**: A Feature_Card variant using opaque background colors without blur effects
- **Metric_Card**: A compact card component displaying a numerical statistic with label and optional icon
- **CTA_Section**: The call-to-action section containing demo booking and account creation prompts
- **Theme_System**: The centralized color token management system defined in `src/constants/colors.ts` and `src/context/ThemeContext.tsx`
- **Venice_Blue**: Primary brand color (#16587B) used for headings, CTAs, and navigation
- **Merino**: Warm cream background color (#F5EEDD) used as the default light theme surface
- **Rock_Blue**: Soft blue accent color (#84B3CE) used for secondary surfaces and highlights
- **Dark_Mode**: The alternative theme variant using deep Venice backgrounds with Merino text and Rock Blue accents
- **Light_Mode**: The default theme variant using Merino backgrounds with Venice Blue brand elements
- **Responsive_Breakpoint**: CSS media query threshold points at 640px (sm), 768px (md), 1024px (lg), and 1280px (xl)
- **Mobile_First**: Design and implementation approach where base styles target mobile viewports with progressive enhancement for larger screens
- **Theme_Context**: React Context provider managing theme state, token resolution, and CSS variable application
- **WCAG_AA**: Web Content Accessibility Guidelines Level AA compliance requiring minimum 4.5:1 contrast ratio for normal text

## Requirements

### Requirement 1

**User Story:** As a platform visitor, I want the landing page to preserve the existing video hero with smooth playback and overlays, so that the immersive brand experience remains intact during the redesign.

#### Acceptance Criteria

1. THE Landing_Page SHALL preserve the existing Hero_Section component without modifications to its video playback logic
2. THE Video_Element SHALL maintain autoPlay, loop, muted, and playsInline attributes
3. THE Video_Element SHALL source from `/hero-video.mp4` without path changes
4. THE Hero_Section SHALL retain the existing gradient overlay with transparency progression from left to right
5. THE Hero_Section SHALL preserve all navigation elements including logo, menu items, login, and sign-up buttons
6. THE Hero_Section SHALL maintain the existing responsive padding values of 48px on desktop and 24px on mobile
7. WHEN the page loads, THE Video_Element SHALL begin playback automatically without user interaction
8. THE Hero_Section SHALL continue to occupy full viewport height with `min-h-screen` utility class

### Requirement 2

**User Story:** As a platform visitor, I want to see a modernized features section with two prominent cards describing Verified Trust and Global Infrastructure, so that I can quickly understand the platform's core value propositions.

#### Acceptance Criteria

1. THE Features_Section SHALL replace the existing three-card grid layout with a new two-card horizontal layout
2. THE Features_Section SHALL contain exactly two Feature_Card components arranged side by side on desktop viewports
3. THE Feature_Card for Verified Trust SHALL use the Glass_Card visual treatment
4. THE Feature_Card for Global Infrastructure SHALL use the Solid_Card visual treatment
5. WHEN viewport width is 1024px or greater, THE Features_Section SHALL display both cards in a single row with equal flex distribution
6. WHEN viewport width is less than 1024px, THE Features_Section SHALL stack both cards vertically with full width
7. THE Verified Trust card SHALL include an icon using `verified_user` from Material Symbols with Venice_Blue coloring
8. THE Verified Trust card SHALL contain a heading reading "Verified Trust" with Manrope font at 700 weight
9. THE Verified Trust card SHALL include body text describing the 12-point authentication process and maritime compliance standards
10. THE Verified Trust card SHALL include a clickable link reading "Learn about Compliance" with arrow icon
11. THE Global Infrastructure card SHALL include an icon using `monitoring` from Material Symbols
12. THE Global Infrastructure card SHALL contain a heading reading "Global Infrastructure" with Manrope font at 700 weight
13. THE Global Infrastructure card SHALL include body text describing API connectivity between port authorities and terminal operators
14. THE Global Infrastructure card SHALL include a button labeled "View Network Map"
15. THE Global Infrastructure card SHALL include a decorative network visualization element with animated ping effect
16. THE Features_Section SHALL maintain 6rem top and bottom padding on desktop viewports
17. THE Features_Section SHALL apply 4rem top and bottom padding on mobile viewports below 768px

### Requirement 3

**User Story:** As a platform visitor, I want to see three metric cards displaying key platform statistics before the CTA section, so that I can assess the platform's scale and adoption.

#### Acceptance Criteria

1. THE Landing_Page SHALL render three Metric_Card components positioned between the Features_Section and CTA_Section
2. THE first Metric_Card SHALL display the number "1,500+"
3. THE first Metric_Card SHALL display the label "Verified Providers"
4. THE second Metric_Card SHALL display the number "89"
5. THE second Metric_Card SHALL display the label "Countries Served"
6. THE third Metric_Card SHALL display the number "45M"
7. THE third Metric_Card SHALL display the label "Annual Transactions"
8. WHEN viewport width is 1024px or greater, THE Metric_Card components SHALL arrange horizontally in a single row with equal spacing
9. WHEN viewport width is less than 1024px, THE Metric_Card components SHALL stack vertically with full width
10. THE Metric_Card SHALL apply Glass_Card visual treatment with backdrop blur
11. THE Metric_Card SHALL use Manrope font family at 800 weight for the numerical value
12. THE Metric_Card SHALL apply 48px to 72px font size for the number using clamp() function
13. THE Metric_Card SHALL use Inter font family at 500 weight for the label text
14. THE Metric_Card SHALL apply 14px to 16px font size for the label using clamp() function
15. THE metrics container section SHALL apply 4rem top and bottom padding
16. THE Metric_Card SHALL include an optional icon positioned above the number
17. THE Metric_Card SHALL maintain 2rem internal padding on desktop and 1.5rem on mobile
18. THE Metric_Card SHALL apply smooth hover transform scaling to 1.02 with 0.2s ease transition

### Requirement 4

**User Story:** As a platform visitor viewing on a mobile device, I want all landing page sections to adapt fluidly to my screen size, so that I can access information comfortably without horizontal scrolling or layout breaks.

#### Acceptance Criteria

1. THE Landing_Page SHALL implement mobile-first CSS with base styles targeting 320px minimum viewport width
2. WHEN viewport width is less than 640px, THE Features_Section SHALL apply 1.5rem horizontal padding
3. WHEN viewport width is less than 640px, THE Feature_Card SHALL apply 1.5rem internal padding
4. WHEN viewport width is less than 640px, THE Metric_Card SHALL display at full container width minus 1.5rem padding
5. WHEN viewport width is between 640px and 768px, THE Features_Section SHALL increase horizontal padding to 2rem
6. WHEN viewport width is 768px or greater, THE Feature_Card heading SHALL increase from 1.25rem to 1.5rem font size
7. WHEN viewport width is less than 1024px, THE two-card Features_Section layout SHALL change from horizontal to vertical stacking
8. WHEN viewport width is less than 1024px, THE Metric_Card components SHALL stack vertically with 1rem gap between cards
9. THE Landing_Page SHALL use clamp() CSS functions for all typography to ensure smooth scaling between breakpoints
10. THE Landing_Page SHALL prevent horizontal overflow at all viewport widths from 320px to 2560px
11. WHEN viewport width is less than 768px, THE Hero_Section buttons SHALL stack vertically with full width
12. WHEN viewport width is less than 768px, THE navigation menu SHALL collapse into a hamburger menu with overlay
13. THE Features_Section grid-gap SHALL scale from 1rem on mobile to 1.25rem on desktop using responsive utilities
14. THE CTA_Section internal padding SHALL scale from 2.5rem on mobile to 5rem on desktop using clamp()

### Requirement 5

**User Story:** As a platform visitor, I want the landing page to apply consistent Venice Blue, Merino, and Rock Blue brand colors from the theme system, so that visual identity remains cohesive with the rest of the application.

#### Acceptance Criteria

1. THE Landing_Page SHALL import and use tokens exclusively from Theme_Context without hardcoded color values
2. THE Landing_Page SHALL access colors via the `useTheme()` hook returning `tokens` object
3. THE Feature_Card heading text SHALL apply `tokens.title` color value
4. THE Feature_Card body text SHALL apply `tokens.subtext` color value
5. THE Glass_Card background SHALL apply `tokens.glassCardBg` value
6. THE Solid_Card background SHALL apply `tokens.bgCard` value
7. THE Glass_Card border SHALL apply `tokens.border` value with 1px width
8. THE icon backgrounds in Feature_Card SHALL apply `tokens.cyanDim` for Venice-themed icons
9. THE icon backgrounds in Feature_Card SHALL apply `tokens.primaryDim` for Rock-themed icons
10. THE Metric_Card background SHALL apply `tokens.glassCardBg` value
11. THE Metric_Card number text SHALL apply `tokens.title` color value
12. THE Metric_Card label text SHALL apply `tokens.muted` color value
13. THE Features_Section background SHALL apply `tokens.bg` value
14. WHEN Theme_Context isDark is true, THE Landing_Page SHALL reflect dark theme token values automatically
15. WHEN Theme_Context isDark is false, THE Landing_Page SHALL reflect light theme token values automatically
16. THE Landing_Page SHALL NOT contain any hex color values in inline styles or className strings
17. THE call-to-action buttons SHALL apply `tokens.cyan` for primary actions
18. THE hover states SHALL apply `tokens.brandHover` for interactive elements

### Requirement 6

**User Story:** As a platform visitor using dark mode, I want the landing page to render with appropriate contrast and visual hierarchy in the dark theme, so that content remains readable and aesthetically pleasing.

#### Acceptance Criteria

1. WHEN isDark is true, THE Landing_Page background SHALL transition to `tokens.bg` resolving to deep Venice (#0E2433)
2. WHEN isDark is true, THE Glass_Card SHALL apply backdrop-filter blur with `tokens.glassCardBg` background value
3. WHEN isDark is true, THE Solid_Card SHALL apply `tokens.bgCard` resolving to dark surface color (#13293A)
4. WHEN isDark is true, THE Feature_Card text SHALL apply `tokens.text` resolving to Merino (#F5EEDD)
5. WHEN isDark is true, THE Metric_Card background SHALL apply dark glass treatment with reduced opacity
6. WHEN isDark is true, THE icon backgrounds SHALL adjust to dark-appropriate tint values
7. WHEN isDark is true, THE border colors SHALL update to `tokens.border` with rgba white values
8. WHEN theme toggles from light to dark, THE Landing_Page SHALL transition background and text colors over 0.3s duration
9. WHEN isDark is true, THE box-shadow values SHALL increase opacity for visibility against dark backgrounds
10. WHEN isDark is true, THE hover effects SHALL apply lighter color values for sufficient contrast
11. THE Landing_Page SHALL maintain WCAG_AA contrast ratios for all text elements in dark mode
12. WHEN isDark is true, THE Features_Section decorative gradient blur SHALL adjust to dark-appropriate tint

### Requirement 7

**User Story:** As a platform visitor, I want glass-morphism effects applied to specific cards to create visual depth, so that the interface feels modern and layered.

#### Acceptance Criteria

1. THE Glass_Card SHALL apply CSS backdrop-filter property with blur value of 20px
2. THE Glass_Card SHALL apply WebkitBackdropFilter property with blur value of 20px for Safari compatibility
3. WHEN isDark is false, THE Glass_Card background SHALL use `rgba(255, 255, 255, 0.88)` with 88% opacity
4. WHEN isDark is true, THE Glass_Card background SHALL use `rgba(19, 41, 58, 0.85)` with 85% opacity
5. THE Glass_Card SHALL apply box-shadow with 0 20px 40px spread and low opacity for depth
6. WHEN browser does not support backdrop-filter, THE Glass_Card SHALL fallback to solid background color
7. THE Metric_Card SHALL inherit Glass_Card blur treatment with backdrop-filter: blur(20px)
8. THE Glass_Card border SHALL use 1px solid with semi-transparent color value
9. THE Glass_Card SHALL apply border-radius of 24px for rounded corners
10. THE glass effect SHALL NOT apply to the Solid_Card representing Global Infrastructure
11. THE Glass_Card SHALL maintain visual clarity with text contrast ratio meeting WCAG_AA standards

### Requirement 8

**User Story:** As a platform administrator maintaining the codebase, I want the landing page to follow the existing TypeScript React patterns and component structure, so that code remains maintainable and consistent with project conventions.

#### Acceptance Criteria

1. THE Landing_Page SHALL remain a default exported functional component using React.FC typing
2. THE Landing_Page SHALL use the existing `useTheme()`, `useNavigate()`, and `useAuth()` hooks
3. THE Landing_Page SHALL maintain the existing Manrope font family for headings via inline style object
4. THE Landing_Page SHALL maintain the existing Inter font family for body text via inline style object
5. THE Feature_Card components SHALL be implemented as inline JSX within the Features_Section
6. THE Metric_Card components SHALL be implemented as inline JSX within a new metrics section container
7. THE Landing_Page SHALL preserve the existing theme toggle button with floating position and animation
8. THE Landing_Page SHALL preserve the existing demo booking modal with all form controls and state management
9. THE Landing_Page SHALL preserve the existing footer section without layout or content changes
10. THE Landing_Page SHALL use Material Symbols Outlined icon font for all icon elements
11. THE Landing_Page SHALL apply responsive utilities using inline media query style patterns
12. THE Landing_Page file size SHALL NOT exceed 150KB after implementing changes

### Requirement 9

**User Story:** As a platform visitor, I want smooth hover interactions on cards and buttons, so that the interface feels responsive and polished.

#### Acceptance Criteria

1. WHEN pointer hovers over a Feature_Card, THE card SHALL apply CSS transform: scale(1.02) over 0.2s ease duration
2. WHEN pointer leaves a Feature_Card, THE card SHALL return to transform: scale(1) over 0.2s ease duration
3. WHEN pointer hovers over a Metric_Card, THE card SHALL apply transform: translateY(-4px) over 0.2s ease duration
4. WHEN pointer leaves a Metric_Card, THE card SHALL return to transform: translateY(0) over 0.2s ease duration
5. WHEN pointer hovers over "Learn about Compliance" link, THE text color SHALL change to `tokens.cyan` over 0.15s ease
6. WHEN pointer hovers over "View Network Map" button, THE background opacity SHALL reduce to 0.9 over 0.15s ease
7. THE hover transition effects SHALL apply cursor: pointer to indicate interactivity
8. THE hover effects SHALL NOT apply on touch devices where hover is not supported
9. WHEN pointer hovers over card, THE box-shadow intensity SHALL increase by 20% over 0.2s ease duration
10. THE hover state changes SHALL NOT cause layout shift or reflow of adjacent elements

### Requirement 10

**User Story:** As a platform visitor using assistive technology, I want the landing page to follow semantic HTML and ARIA practices, so that I can navigate and understand content effectively.

#### Acceptance Criteria

1. THE Features_Section SHALL use semantic `<section>` element with `id="features"` attribute
2. THE Feature_Card heading SHALL use semantic `<h3>` element for proper heading hierarchy
3. THE Metric_Card number SHALL use `<div>` with `aria-label` describing the full metric name
4. THE decorative network visualization SHALL include `aria-hidden="true"` attribute
5. THE clickable "Learn about Compliance" link SHALL use semantic `<a>` or `<button>` element
6. THE icon elements SHALL include appropriate Material Symbols role and aria-label attributes
7. THE Features_Section SHALL follow the existing Hero_Section in DOM order for logical tab navigation
8. THE Metric_Card components SHALL appear in DOM order before the CTA_Section
9. THE Landing_Page SHALL maintain a logical heading hierarchy from h1 (hero) to h2 (section) to h3 (card)
10. THE interactive elements SHALL provide visible focus indicators meeting WCAG_AA contrast requirements
11. THE Feature_Card images or decorative elements SHALL include alt="" for screen reader skipping
12. THE Landing_Page SHALL pass axe DevTools accessibility scan with zero critical violations
