# Implementation Plan: Landing Page Redesign

## Overview

This implementation plan converts the landing page redesign requirements and technical design into actionable coding tasks. The redesign modernizes the features section with a two-card layout (Verified Trust and Global Infrastructure), adds three metric cards showcasing platform statistics, applies glass-morphism visual effects, and ensures full responsive behavior with dark mode support. The existing video hero, demo modal, and footer components are preserved without modification.

## Tasks

- [x] 1. Refactor Features Section to Two-Card Layout
  - [x] 1.1 Update features grid from three cards to two-card horizontal layout
    - Modify the features section grid from `gridTemplateColumns: '1fr 1fr'` to explicitly display only two cards side by side
    - Remove the third full-width "Global Infrastructure" card from the two-column grid
    - Update responsive breakpoint to stack cards vertically below 1024px using media query hook
    - Ensure "Verified Trust" card uses glass-morphism styling (already implemented)
    - Ensure "Real-time Logistics" card uses solid card styling (already implemented)
    - _Requirements: 2.1, 2.2, 2.5, 2.6_
  
  - [x] 1.2 Create new standalone Global Infrastructure card with full-width layout
    - Remove existing full-width Global Infrastructure card from the grid
    - Create new separate container for Global Infrastructure card positioned after the two-card grid
    - Apply glass-morphism treatment with `glassCardStyle` and backdrop blur
    - Include `public` Material Symbols icon with Venice Blue background (`C.cyanDim`)
    - Add heading "Global Infrastructure" using Manrope font at 700 weight
    - Include descriptive body text about API connectivity between port authorities and terminal operators
    - Add "View Network Map" button with appropriate styling
    - Include decorative network visualization with animated ping effect (reuse existing pattern)
    - _Requirements: 2.4, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15_
  
  - [ ]* 1.3 Write unit tests for Features Section layout
    - Test that features section renders exactly two cards in desktop viewport (≥1024px)
    - Test that cards stack vertically in mobile viewport (<1024px)
    - Test that Global Infrastructure card renders separately with full-width styling
    - _Requirements: 2.1, 2.2, 2.5, 2.6_

- [x] 2. Implement Three Metric Cards Section
  - [x] 2.1 Create metrics section container between Features and CTA sections
    - Add new `<section>` element after features section and before CTA section
    - Apply 4rem top and bottom padding (`padding: '4rem 0'`)
    - Set background to `C.bg` for theme consistency
    - Create inner container with maxWidth 1200 and horizontal padding
    - _Requirements: 3.1, 3.15_
  
  - [x] 2.2 Implement three Metric Card components with glass-morphism styling
    - Create three inline card components within metrics container
    - Apply glass-morphism treatment using `glassCardStyle` with backdrop blur
    - Set border-radius to 24px and internal padding to 2rem desktop / 1.5rem mobile
    - Display cards horizontally on desktop (≥1024px) using flexbox with equal spacing
    - Stack cards vertically on mobile (<1024px) with 1rem gap
    - Add smooth hover transform scaling to 1.02 with 0.2s ease transition
    - _Requirements: 3.2-3.10, 3.17, 3.18_
  
  - [x] 2.3 Add metric content and typography styling
    - First card: number "1,500+" and label "Verified Providers"
    - Second card: number "89" and label "Countries Served"
    - Third card: number "45M" and label "Annual Transactions"
    - Apply Manrope font at 800 weight for numbers with clamp(48px, 5vw, 72px) font size
    - Apply Inter font at 500 weight for labels with clamp(14px, 2vw, 16px) font size
    - Use `C.title` color for numbers and `C.muted` color for labels
    - Add optional icons above numbers using Material Symbols
    - _Requirements: 3.2-3.14, 3.16_
  
  - [ ]* 2.4 Write unit tests for Metric Cards
    - Test that exactly three metric cards render
    - Test correct numerical values and labels display
    - Test horizontal layout on desktop and vertical on mobile
    - Test hover transform effects apply correctly
    - _Requirements: 3.1, 3.8, 3.9_

- [x] 3. Enhance Responsive Layout and Mobile Breakpoints
  - [x] 3.1 Implement mobile-first responsive padding for features section
    - Update features section padding to scale from 1.5rem on mobile (<640px) to 2.5rem on desktop
    - Update feature card internal padding from 1.5rem mobile to 2.5rem desktop
    - Ensure metric cards display full width minus 1.5rem padding on mobile (<640px)
    - Apply responsive horizontal padding progression: 1.5rem (<640px), 2rem (640-768px), 2.5rem (≥768px)
    - _Requirements: 4.2, 4.3, 4.4, 4.5_
  
  - [x] 3.2 Implement responsive typography scaling with clamp functions
    - Update feature card headings to scale from 1.25rem to 1.5rem using clamp()
    - Ensure hero buttons stack vertically with full width below 768px
    - Scale CTA section padding from 2.5rem mobile to 5rem desktop using clamp()
    - Adjust features section grid-gap from 1rem mobile to 1.25rem desktop
    - _Requirements: 4.6, 4.9, 4.11, 4.13, 4.14_
  
  - [x] 3.3 Verify layout integrity across all viewport widths
    - Test layout from 320px minimum to 2560px maximum viewport width
    - Ensure no horizontal overflow at any breakpoint
    - Verify feature cards stack at 1024px breakpoint
    - Verify metric cards stack at 1024px breakpoint
    - _Requirements: 4.1, 4.7, 4.8, 4.10, 4.12_
  
  - [ ]* 3.4 Write responsive layout integration tests
    - Test features section layout at 320px, 768px, 1024px, and 1920px viewports
    - Test metric cards layout transitions at breakpoints
    - Test no horizontal overflow across viewport range
    - _Requirements: 4.1, 4.10_

- [x] 4. Verify Theme Token Integration and Dark Mode Support
  - [x] 4.1 Audit all components for hardcoded color values
    - Review all inline styles in features section, metric cards, and Global Infrastructure card
    - Replace any remaining hex color values with `C.tokenName` references
    - Ensure all backgrounds use `C.bg`, `C.bgCard`, or `C.glassCardBg`
    - Ensure all text colors use `C.title`, `C.subtext`, or `C.muted`
    - Ensure all borders use `C.border`
    - _Requirements: 5.1, 5.2, 5.16_
  
  - [x] 4.2 Test dark mode rendering and contrast ratios
    - Toggle theme to dark mode and verify all sections render correctly
    - Verify glass cards apply dark-appropriate background values
    - Verify solid cards use `C.bgCard` resolving to dark surface color
    - Verify text colors maintain WCAG AA contrast ratios in dark mode
    - Verify 0.3s background/color transition timing on theme toggle
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.8, 6.11_
  
  - [ ]* 4.3 Write property test for theme token consistency
    - **Property 1: Theme Token Consistency**
    - **Validates: Requirements 5.1, 5.2, 5.16**
    - Render landing page and query all elements with computed styles
    - Assert no hardcoded hex color values exist in rendered output
    - Verify all color values derive from theme tokens
  
  - [ ]* 4.4 Write property test for theme switching idempotence
    - **Property 2: Theme Switching Idempotence**
    - **Validates: Requirements 5.14, 5.15, 6.8**
    - Record initial theme state (light or dark)
    - Toggle theme twice
    - Assert theme returns to original state
    - Assert all component styles update dynamically

- [x] 5. Implement Glass-Morphism Effects and Visual Polish
  - [x] 5.1 Apply glass-morphism to Verified Trust card and metric cards
    - Verify backdrop-filter: blur(20px) and WebkitBackdropFilter applied
    - Ensure light mode uses rgba(255, 255, 255, 0.88) background
    - Ensure dark mode uses rgba(19, 41, 58, 0.85) background
    - Apply box-shadow with appropriate opacity for depth
    - Verify 24px border-radius for rounded corners
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.9_
  
  - [x] 5.2 Implement fallback for browsers without backdrop-filter support
    - Add feature detection for backdrop-filter support
    - Provide solid background fallback using `C.bgCard` when blur not supported
    - Test in browsers without backdrop-filter support
    - _Requirements: 7.6_
  
  - [x] 5.3 Verify WCAG AA contrast compliance for glass cards
    - Test text contrast ratios on glass backgrounds in light mode
    - Test text contrast ratios on glass backgrounds in dark mode
    - Ensure minimum 4.5:1 contrast ratio for all text
    - _Requirements: 7.11, 6.11_
  
  - [ ]* 5.4 Write unit tests for glass-morphism styling
    - Test backdrop-filter property applies to glass cards
    - Test background opacity values in light vs dark mode
    - Test fallback background when backdrop-filter unsupported

- [x] 6. Implement Hover Interactions and Transitions
  - [x] 6.1 Add hover effects to feature cards
    - Implement onMouseEnter handler to apply transform: scale(1.02)
    - Implement onMouseLeave handler to reset transform: scale(1)
    - Set transition duration to 0.2s ease
    - Increase box-shadow intensity by 20% on hover
    - Apply cursor: pointer to indicate interactivity
    - _Requirements: 9.1, 9.2, 9.7, 9.9_
  
  - [x] 6.2 Add hover effects to metric cards
    - Implement onMouseEnter handler to apply transform: translateY(-4px)
    - Implement onMouseLeave handler to reset transform: translateY(0)
    - Set transition duration to 0.2s ease
    - Apply cursor: pointer
    - Ensure no layout shift on adjacent elements
    - _Requirements: 9.3, 9.4, 9.10_
  
  - [x] 6.3 Add hover effects to links and buttons
    - "Learn about Compliance" link: change color to `C.cyan` on hover with 0.15s ease
    - "View Network Map" button: reduce opacity to 0.9 on hover with 0.15s ease
    - Ensure all hover effects exclude touch devices
    - _Requirements: 9.5, 9.6, 9.8_
  
  - [ ]* 6.4 Write property test for hover state reversibility
    - **Property 3: Hover State Reversibility**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
    - Record original style state of interactive element
    - Simulate mouseenter event
    - Simulate mouseleave event
    - Assert element returns to original style state with matching transition timing

- [x] 7. Ensure Accessibility Compliance and Semantic HTML
  - [x] 7.1 Add semantic HTML and ARIA attributes to sections
    - Verify features section uses `<section>` with `id="features"`
    - Verify metric cards section uses semantic `<section>` element
    - Verify feature card headings use `<h3>` for proper hierarchy
    - Add `aria-label` to metric card numbers describing full metric name
    - Add `aria-hidden="true"` to decorative network visualization
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  
  - [x] 7.2 Verify keyboard navigation and focus indicators
    - Test tab navigation flows logically through sections (Hero → Features → Metrics → CTA)
    - Ensure all interactive elements (links, buttons) are keyboard accessible
    - Verify visible focus indicators meet WCAG AA contrast requirements
    - Add focus-visible styles where needed
    - _Requirements: 10.7, 10.8, 10.10_
  
  - [x] 7.3 Add appropriate icon roles and alt text
    - Add role and aria-label to Material Symbols icon elements
    - Ensure decorative elements include alt="" or aria-hidden="true"
    - Verify images have descriptive alt attributes
    - _Requirements: 10.6, 10.11_
  
  - [ ]* 7.4 Run axe DevTools accessibility scan
    - Install and run axe DevTools on landing page
    - Verify zero critical violations
    - Fix any warnings or moderate issues identified
    - Document accessibility test results
    - _Requirements: 10.12_
  
  - [ ]* 7.5 Write property test for accessibility completeness
    - **Property 4: Accessibility Completeness**
    - **Validates: Requirements 10.1, 10.2, 10.6**
    - Query all interactive elements (buttons, links, inputs)
    - Assert each has aria-label, descriptive text, or semantic HTML tag
    - Verify assistive technology can understand element purpose

- [x] 8. Performance Optimization and Code Quality
  - [x] 8.1 Implement useMemo for complex style objects
    - Memoize `glassCardStyle` object with dependencies on `C.glassCardBg`, `C.border`, `isDark`
    - Memoize metric card style objects
    - Extract static font style objects outside component
    - _Requirements: 8.1, 8.3, 8.4_
  
  - [x] 8.2 Implement useCallback for event handlers
    - Memoize card click handlers with `useCallback`
    - Memoize hover handlers where appropriate
    - Optimize re-render performance
    - _Requirements: 8.1_
  
  - [x] 8.3 Verify file size and TypeScript compliance
    - Ensure Landing/index.tsx file size does not exceed 150KB
    - Verify TypeScript strict mode compliance
    - Run ESLint validation and fix any issues
    - _Requirements: 8.12_
  
  - [ ]* 8.4 Write integration tests for component interactions
    - Test features section renders with HeroSection above it
    - Test metrics section renders between features and CTA sections
    - Test demo modal opens and closes correctly
    - Test theme toggle updates all sections simultaneously

- [x] 9. Checkpoint - Verify all core functionality
  - Ensure all tests pass (unit, property, integration)
  - Verify responsive layout works across all breakpoints (320px - 2560px)
  - Test dark mode and light mode rendering
  - Test hover interactions on desktop
  - Verify accessibility with screen reader
  - Test demo modal functionality
  - Ask the user if questions arise

- [x] 10. Final Polish and Documentation
  - [x] 10.1 Test in multiple browsers
    - Test in Chrome, Firefox, Safari, and Edge
    - Verify glass-morphism effects render correctly
    - Test responsive behavior on real mobile devices
    - Verify video playback across browsers
    - _Requirements: 1.7, 7.6_
  
  - [x] 10.2 Run Lighthouse audit
    - Run Lighthouse accessibility audit (target ≥95)
    - Run Lighthouse performance audit
    - Fix any critical issues identified
    - _Requirements: 10.12_
  
  - [x] 10.3 Update component documentation
    - Add JSDoc comments to complex style objects
    - Document responsive breakpoint strategy
    - Document theme token usage patterns
    - _Requirements: 8.1, 8.3, 8.4_

## Notes

- Tasks marked with `*` are optional testing tasks and can be skipped for faster MVP delivery
- Each task references specific requirements from requirements.md for traceability
- The existing video hero component (`HeroSection`), demo booking modal, and footer remain unchanged
- All color values must use theme tokens from `useTheme()` hook - no hardcoded hex values
- Glass-morphism cards require backdrop-filter support with solid color fallback
- Mobile breakpoint for card stacking is 1024px
- All hover effects should exclude touch devices using CSS media queries
- Property-based tests must run minimum 100 iterations to verify universal properties
- Checkpoints ensure incremental validation before moving to next phase

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.1"] },
    { "id": 2, "tasks": ["1.3", "2.3", "3.2", "4.1"] },
    { "id": 3, "tasks": ["2.4", "3.3", "4.2", "5.1"] },
    { "id": 4, "tasks": ["3.4", "4.3", "4.4", "5.2", "6.1"] },
    { "id": 5, "tasks": ["5.3", "5.4", "6.2", "7.1"] },
    { "id": 6, "tasks": ["6.3", "6.4", "7.2", "8.1"] },
    { "id": 7, "tasks": ["7.3", "7.4", "7.5", "8.2"] },
    { "id": 8, "tasks": ["8.3", "8.4", "10.1"] },
    { "id": 9, "tasks": ["10.2", "10.3"] }
  ]
}
```
