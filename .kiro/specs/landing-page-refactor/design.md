# Landing Page Refactor - Technical Design Specification

## Overview

This document provides the technical architecture for refactoring the Nhaav/Nhaav maritime platform landing page. The redesign focuses on componentization, theme token integration, glass-morphism visual effects, responsive layouts, and accessibility compliance.

## Technology Stack

- **Framework**: React 18+ with TypeScript
- **Styling**: Inline styles with React.CSSProperties
- **State Management**: React hooks (useState, useMemo, useEffect)
- **Theme System**: Custom ThemeContext with light/dark modes
- **Navigation**: React Router v6
- **Typography**: Manrope (headings), Inter (body)
- **Icons**: Material Symbols (Outlined)

---

## Architecture

### Component Hierarchy

```
LandingPage (page component)
├── HeroSection (imported from components/blocks)
├── FeaturesSection
│   ├── FeatureCard (glass-morphism)
│   ├── FeatureCard (standard)
│   └── GlobalInfrastructureCard (full-width)
├── CTASection
│   └── CTAButtons
├── DemoBookingModal
│   ├── Calendar
│   ├── TimeSlotSelector
│   └── BookingForm
└── FooterNav (imported from components)
```

### File Structure

```
src/
├── pages/
│   └── Landing/
│       ├── index.tsx                    # Main landing page
│       ├── components/
│       │   ├── FeaturesSection.tsx
│       │   ├── FeatureCard.tsx
│       │   ├── CTASection.tsx
│       │   └── DemoBookingModal.tsx
│       └── styles/
│           └── constants.ts             # Shared style constants
├── components/
│   ├── blocks/
│   │   └── hero-section-5.tsx          # Existing Hero
│   └── FooterNav.tsx                   # Existing Footer
├── context/
│   └── ThemeContext.tsx                # Theme provider
└── constants/
    └── colors.ts                       # Design tokens
```

---

## Component Specifications

### 1. FeaturesSection Component

#### Purpose
Renders a responsive grid of feature cards highlighting platform capabilities (Verified Trust, Real-time Logistics, Global Infrastructure).

#### Props Interface

```typescript
interface FeaturesSectionProps {
  // No props - reads from theme context
}
```

#### Inline Style Objects

```typescript
const containerStyle: React.CSSProperties = {
  background: C.bg,
  padding: '6rem 0',
  position: 'relative',
  overflow: 'hidden',
  transition: 'background 0.3s ease',
};

const contentWrapperStyle: React.CSSProperties = {
  maxWidth: 1200,
  margin: '0 auto',
  padding: '0 2.5rem',
  position: 'relative',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '1.25rem',
};

// Mobile override via media query hook
const mobileGridStyle: React.CSSProperties = {
  gridTemplateColumns: '1fr',
};
```

#### Responsive Strategy

```typescript
const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = React.useState(
    () => window.matchMedia(query).matches
  );
  
  React.useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);
  
  return matches;
};

// Usage
const isMobile = useMediaQuery('(max-width: 768px)');
const gridLayout = isMobile ? mobileGridStyle : gridStyle;
```

---

### 2. FeatureCard Component

#### Purpose
Reusable card component with glass-morphism effects, icon, title, description, and optional CTA link.

#### Props Interface

```typescript
interface FeatureCardProps {
  icon: string;                // Material Symbols icon name
  iconFilled?: boolean;        // Use filled variant
  title: string;
  description: string;
  linkText?: string;
  linkHref?: string;
  variant?: 'glass' | 'solid'; // Visual style variant
  fullWidth?: boolean;         // Span full grid width
  customContent?: React.ReactNode; // Optional custom bottom content
}
```

#### Inline Style Objects

```typescript
// Glass-morphism variant
const glassCardStyle: React.CSSProperties = {
  background: C.glassCardBg,
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  boxShadow: isDark 
    ? '0 20px 40px rgba(14,165,233,0.07)' 
    : '0 10px 30px rgba(0,0,0,0.05)',
  border: `1px solid ${C.border}`,
  borderRadius: 24,
  padding: '2.5rem',
  transition: 'all 0.2s ease',
  cursor: 'pointer',
};

// Solid variant
const solidCardStyle: React.CSSProperties = {
  background: C.bgCard,
  borderRadius: 24,
  padding: '2.5rem',
  border: `1px solid ${C.border}`,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  transition: 'all 0.2s ease',
};

// Icon container
const iconContainerStyle: React.CSSProperties = {
  display: 'inline-flex',
  padding: '0.75rem',
  borderRadius: 14,
  background: C.cyanDim,
  marginBottom: '1.5rem',
};
```

#### Hover Interactions

```typescript
const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
  e.currentTarget.style.transform = 'scale(1.02)';
};

const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
  e.currentTarget.style.transform = 'scale(1)';
};
```

---

### 3. CTASection Component

#### Purpose
Full-width call-to-action section with gradient background, heading, subtext, and action buttons.

#### Props Interface

```typescript
interface CTASectionProps {
  heading: string;
  subheading: string;
  primaryCTA: {
    text: string;
    onClick: () => void;
  };
  secondaryCTA?: {
    text: string;
    onClick: () => void;
  };
}
```

#### Inline Style Objects

```typescript
const ctaContainerStyle: React.CSSProperties = {
  background: C.bgLow,
  padding: '5rem 0',
  overflow: 'hidden',
  transition: 'background 0.3s ease',
};

const ctaInnerStyle: React.CSSProperties = {
  background: C.ctaGradient,
  borderRadius: 40,
  padding: 'clamp(2.5rem, 5vw, 5rem)',
  position: 'relative',
  overflow: 'hidden',
  border: `1px solid ${C.border}`,
};

const buttonGroupStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  flexWrap: 'wrap',
};

// Mobile override
const mobileButtonGroupStyle: React.CSSProperties = {
  flexDirection: 'column',
};
```

---

### 4. DemoBookingModal Component

#### Purpose
Full-screen overlay modal with calendar, time slot selection, and booking form with validation.

#### Props Interface

```typescript
interface DemoBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface BookingFormData {
  name: string;
  email: string;
  company: string;
  selectedDate: number;
  selectedTime: string;
}
```

#### State Management

```typescript
const [formData, setFormData] = React.useState<BookingFormData>({
  name: '',
  email: '',
  company: '',
  selectedDate: 18,
  selectedTime: '10:30 AM',
});

const [isBooked, setIsBooked] = React.useState(false);

const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  if (!formData.email || !formData.name) {
    // Validation handled by HTML5 required attribute
    return;
  }
  setIsBooked(true);
};

const resetModal = () => {
  setFormData({
    name: '',
    email: '',
    company: '',
    selectedDate: 18,
    selectedTime: '10:30 AM',
  });
  setIsBooked(false);
  onClose();
};
```

#### Inline Style Objects

```typescript
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  background: isDark 
    ? 'rgba(8, 15, 24, 0.78)' 
    : 'rgba(15, 23, 42, 0.55)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1.5rem',
};

const modalContentStyle: React.CSSProperties = {
  background: C.modalBg,
  color: C.modalText,
  borderRadius: 24,
  width: '100%',
  maxWidth: 780,
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
  position: 'relative',
  padding: '2.5rem',
  border: `1px solid ${C.border}`,
};
```

#### Scroll Lock

```typescript
React.useEffect(() => {
  if (isOpen) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
  
  return () => {
    document.body.style.overflow = '';
  };
}, [isOpen]);
```

---

## Theme Token Integration

### Token Consumption Pattern

All components must consume design tokens exclusively from the `useTheme()` hook:

```typescript
import { useTheme } from '../../context/ThemeContext';

const MyComponent: React.FC = () => {
  const { tokens: C, isDark } = useTheme();
  
  const style: React.CSSProperties = {
    background: C.bg,           // ✓ Correct
    color: C.text,              // ✓ Correct
    border: `1px solid ${C.border}`, // ✓ Correct
    // background: '#F5EEDD',   // ✗ NEVER hardcode colors
  };
  
  return <div style={style}>...</div>;
};
```

### Theme-Aware Conditional Styling

```typescript
const boxShadow = isDark 
  ? '0 20px 40px rgba(14,165,233,0.07)' 
  : '0 10px 30px rgba(0,0,0,0.05)';
```

### Available Token Categories

| Category | Token Examples |
|----------|---------------|
| **Backgrounds** | `C.bg`, `C.bgCard`, `C.bgLow`, `C.surface` |
| **Text** | `C.text`, `C.muted`, `C.faint`, `C.title` |
| **Borders** | `C.border`, `C.borderStrong` |
| **Brand** | `C.cyan`, `C.primary`, `C.cyanDim` |
| **Semantic** | `C.success`, `C.error`, `C.warning` |
| **Shadows** | `C.shadowSm`, `C.shadowMd`, `C.shadowGlow` |
| **Glass** | `C.glass`, `C.glassCardBg` |

---

## Glass-Morphism Implementation

### Core CSS Properties

```typescript
const blur = (px = 20): React.CSSProperties => ({
  backdropFilter: `blur(${px}px)`,
  WebkitBackdropFilter: `blur(${px}px)`,
});

const glassEffect: React.CSSProperties = {
  ...blur(20),
  background: C.glassCardBg,
  border: `1px solid ${C.border}`,
  boxShadow: C.shadowMd,
};
```

### Theme-Specific Adjustments

```typescript
// Light theme
glassCardBg: lightTheme.surface,              // Semi-opaque white
glass: 'rgba(255, 255, 255, 0.88)',

// Dark theme
glassCardBg: 'rgba(19, 41, 58, 0.85)',        // Semi-opaque dark blue
glass: 'rgba(14, 36, 51, 0.72)',
```

---

## Responsive Layout Grid

### Desktop Grid (≥768px)

```typescript
const desktopGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '1.25rem',
};

// Full-width spanning card
const fullWidthCard: React.CSSProperties = {
  gridColumn: '1 / -1',
};
```

### Mobile Grid (<768px)

```typescript
const mobileGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: '1.25rem',
};
```

### Responsive Typography

```typescript
const headingStyle: React.CSSProperties = {
  fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)',
  fontWeight: 900,
  letterSpacing: '-0.03em',
};
```

---

## Hover State Transitions

### Standard Hover Pattern

```typescript
const interactiveStyle: React.CSSProperties = {
  transition: 'all 0.2s ease',
  cursor: 'pointer',
};

const handleHover = {
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.transform = 'scale(1.02)';
  },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.transform = 'scale(1)';
  },
};
```

### Link Color Transitions

```typescript
const linkHoverHandlers = {
  onMouseEnter: (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.color = C.cyan;
  },
  onMouseLeave: (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.color = C.muted;
  },
};
```

### Button Opacity Transitions

```typescript
const buttonHoverHandlers = {
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.opacity = '0.9';
  },
  onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.opacity = '1';
  },
};
```

---

## Mobile-First Breakpoint Strategy

### Breakpoint Definitions

| Breakpoint | Width | Usage |
|------------|-------|-------|
| **Mobile** | < 640px | Single column, stacked buttons |
| **Tablet** | 640px - 768px | Adaptive grid, larger touch targets |
| **Desktop** | ≥ 768px | Two-column grid, hover states |
| **Large Desktop** | ≥ 1200px | Max width 1200px container |

### Responsive Patterns

```typescript
// 1. Media query hook
const isMobile = useMediaQuery('(max-width: 768px)');

// 2. Conditional styles
const layoutStyle = isMobile ? mobileLayout : desktopLayout;

// 3. Responsive padding
const containerPadding = isMobile ? '1.5rem' : '2.5rem';

// 4. Responsive font sizes
fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)',
```

---

## Integration Points

### Hero Component Integration

```typescript
import { HeroSection } from '../../components/blocks/hero-section-5';

// In LandingPage component
<div style={{ background: C.bg, minHeight: '100vh' }}>
  <HeroSection />
  {/* No paddingTop needed - Hero handles spacing */}
  <main style={{ paddingTop: 0 }}>
    <FeaturesSection />
    <CTASection />
  </main>
  <FooterNav />
</div>
```

### Footer Component Integration

```typescript
import { FooterNav } from '../../components/FooterNav';

// FooterNav already consumes theme tokens internally
<FooterNav />
```

---

## Performance Optimizations

### Memoization Strategy

```typescript
// Memoize complex style objects
const glassCardStyle = React.useMemo<React.CSSProperties>(() => ({
  background: C.glassCardBg,
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  boxShadow: isDark 
    ? '0 20px 40px rgba(14,165,233,0.07)' 
    : '0 10px 30px rgba(0,0,0,0.05)',
  border: `1px solid ${C.border}`,
  borderRadius: 24,
  padding: '2.5rem',
}), [C.glassCardBg, C.border, isDark]);

// Memoize callbacks
const handleCardClick = React.useCallback(() => {
  navigate('/marketplace');
}, [navigate]);
```

### Extract Static Styles

```typescript
// Define outside component (only created once)
const manrope: React.CSSProperties = { 
  fontFamily: "'Manrope', sans-serif" 
};

const inter: React.CSSProperties = { 
  fontFamily: "'Inter', sans-serif" 
};

// Reuse across components
<h1 style={{ ...manrope, fontSize: '2rem' }}>Heading</h1>
```

---

## Accessibility Implementation

### Semantic HTML

```typescript
// Use semantic tags
<header>...</header>
<main>...</main>
<nav>...</nav>
<section>...</section>
<footer>...</footer>

// Not just divs everywhere
```

### ARIA Labels

```typescript
<button 
  onClick={toggleTheme}
  aria-label={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
  title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
>
  <span className="material-symbols-outlined">
    {isDark ? 'light_mode' : 'dark_mode'}
  </span>
</button>
```

### Keyboard Navigation

```typescript
// Ensure focusable elements have visible focus states
const linkStyle: React.CSSProperties = {
  outline: 'none',
  // Focus visible will be handled by :focus-visible CSS
};

// Modal trap focus
const modalRef = React.useRef<HTMLDivElement>(null);

React.useEffect(() => {
  if (isOpen && modalRef.current) {
    const focusable = modalRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length) {
      (focusable[0] as HTMLElement).focus();
    }
  }
}, [isOpen]);
```

### Reduced Motion Support

```typescript
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

const transitionStyle: React.CSSProperties = {
  transition: prefersReducedMotion ? 'none' : 'all 0.2s ease',
};
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Theme Token Consistency

*For any* component that renders visual styles, all color, border, and shadow values SHALL derive from `useTheme().tokens`, ensuring no hardcoded color values exist in the rendered output.

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 2: Theme Switching Idempotence

*For any* theme toggle operation (light ↔ dark), toggling twice SHALL return the theme to its original state, and all component styles SHALL update dynamically via token references.

**Validates: Requirements 2.2**

### Property 3: Hover State Reversibility

*For any* interactive element with hover effects, hovering then removing hover SHALL restore the element to its original style state with matching transition timing.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

### Property 4: Accessibility Completeness

*For any* interactive element (buttons, links, inputs), the element SHALL include either an accessible ARIA label, descriptive text content, or semantic HTML tag that communicates its purpose to assistive technologies.

**Validates: Requirements 8.2**

### Property 5: Reduced Motion Respect

*For any* animated or transitioned element, when the user's `prefers-reduced-motion` preference is set to `reduce`, all transition and animation durations SHALL be set to `0` or `none`.

**Validates: Requirements 8.3**

### Property 6: Image Accessibility

*For any* `<img>` element rendered in the landing page, the element SHALL include a non-empty `alt` attribute providing a descriptive text alternative.

**Validates: Requirements 8.4**

### Property 7: Form Validation Consistency

*For any* form submission attempt in the demo booking modal, the system SHALL validate all required fields and prevent submission if validation fails, displaying appropriate feedback.

**Validates: Requirements 9.3**

### Property 8: Modal State Reset

*For any* modal open-close cycle, closing the modal SHALL reset all form fields to their initial values and hide the overlay, regardless of user interactions during the open state.

**Validates: Requirements 9.4**

---

## Data Models

### Feature Card Data

```typescript
interface Feature {
  id: string;
  icon: string;
  iconFilled?: boolean;
  title: string;
  description: string;
  linkText?: string;
  linkHref?: string;
  variant: 'glass' | 'solid';
  customContent?: React.ReactNode;
}

const features: Feature[] = [
  {
    id: 'verified-trust',
    icon: 'verified_user',
    iconFilled: true,
    title: 'Verified Trust',
    description: 'Every provider in our network undergoes a rigorous 12-point authentication process...',
    linkText: 'Learn about Compliance',
    linkHref: '/dashboard',
    variant: 'glass',
  },
  {
    id: 'real-time-logistics',
    icon: 'monitoring',
    title: 'Real-time Logistics',
    description: 'Live telemetry syncing from vessel AIS to ground operations...',
    variant: 'solid',
    customContent: <AvatarStack />,
  },
  {
    id: 'global-infrastructure',
    icon: 'public',
    title: 'Global Infrastructure',
    description: 'Deploy resources across continents...',
    linkText: 'View Network Map',
    variant: 'glass',
  },
];
```

---

## Error Handling

### Component Error Boundaries

```typescript
class FeatureCardErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', color: 'var(--color-error)' }}>
          Unable to load feature card
        </div>
      );
    }
    return this.props.children;
  }
}
```

### Form Validation

```typescript
const validateEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  
  if (!formData.name.trim()) {
    // Error handled by HTML5 required attribute
    return;
  }
  
  if (!validateEmail(formData.email)) {
    // Could show inline error message
    return;
  }
  
  setIsBooked(true);
};
```

---

## Testing Strategy

### Unit Tests

1. **Component Rendering**
   - Verify FeaturesSection renders correct number of cards
   - Verify CTASection renders buttons with correct text
   - Verify DemoBookingModal conditionally renders based on `isOpen` prop

2. **Theme Integration**
   - Verify components read from `useTheme()` hook
   - Verify theme toggle updates component styles

3. **Event Handlers**
   - Verify hover handlers modify styles correctly
   - Verify form submission triggers validation
   - Verify modal close resets state

### Property-Based Tests

All property tests must run **minimum 100 iterations** to verify universal properties across randomized inputs.

1. **Property 1: Theme Token Consistency**
   ```typescript
   test('all rendered styles use theme tokens', () => {
     // Generate random theme (light/dark)
     // Render component
     // Assert no hardcoded hex colors in computed styles
   });
   ```
   **Tag**: `Feature: landing-page-refactor, Property 1: Theme Token Consistency`

2. **Property 2: Theme Switching Idempotence**
   ```typescript
   test('theme toggle is idempotent', () => {
     // Generate random initial theme
     // Toggle twice
     // Assert returns to original theme
   });
   ```
   **Tag**: `Feature: landing-page-refactor, Property 2: Theme Switching Idempotence`

3. **Property 3: Hover State Reversibility**
   ```typescript
   test('hover then unhover restores original state', () => {
     // Generate random feature card
     // Record original style
     // Trigger hover, then unhover
     // Assert style matches original
   });
   ```
   **Tag**: `Feature: landing-page-refactor, Property 3: Hover State Reversibility`

4. **Property 4: Accessibility Completeness**
   ```typescript
   test('all interactive elements have accessibility attributes', () => {
     // Render landing page
     // Query all interactive elements (buttons, links, inputs)
     // Assert each has aria-label or semantic HTML
   });
   ```
   **Tag**: `Feature: landing-page-refactor, Property 4: Accessibility Completeness`

5. **Property 5: Reduced Motion Respect**
   ```typescript
   test('animations respect prefers-reduced-motion', () => {
     // Set prefers-reduced-motion: reduce
     // Render component with animations
     // Assert transition durations are 0 or none
   });
   ```
   **Tag**: `Feature: landing-page-refactor, Property 5: Reduced Motion Respect`

6. **Property 6: Image Accessibility**
   ```typescript
   test('all images have descriptive alt text', () => {
     // Render landing page
     // Query all img elements
     // Assert each has non-empty alt attribute
   });
   ```
   **Tag**: `Feature: landing-page-refactor, Property 6: Image Accessibility`

7. **Property 7: Form Validation Consistency**
   ```typescript
   test('form validation prevents invalid submissions', () => {
     // Generate random invalid form data (empty required fields)
     // Attempt submission
     // Assert submission is prevented
   });
   ```
   **Tag**: `Feature: landing-page-refactor, Property 7: Form Validation Consistency`

8. **Property 8: Modal State Reset**
   ```typescript
   test('closing modal resets all form state', () => {
     // Generate random form data
     // Open modal, fill form
     // Close modal
     // Assert form fields are reset to initial values
   });
   ```
   **Tag**: `Feature: landing-page-refactor, Property 8: Modal State Reset`

### Integration Tests

1. **Hero Integration**
   - Verify HeroSection renders at top of page
   - Verify no spacing conflicts with Features section

2. **Footer Integration**
   - Verify FooterNav renders at bottom of page
   - Verify theme-based styling is applied

3. **Navigation Flow**
   - Verify CTA buttons navigate to correct routes
   - Verify modal open/close interaction

---

## Implementation Checklist

- [ ] Create `FeaturesSection.tsx` component
- [ ] Create `FeatureCard.tsx` component
- [ ] Create `CTASection.tsx` component
- [ ] Create `DemoBookingModal.tsx` component
- [ ] Extract shared style constants to `constants.ts`
- [ ] Implement `useMediaQuery` hook for responsive layouts
- [ ] Integrate `HeroSection` and `FooterNav` components
- [ ] Add ARIA labels to all interactive elements
- [ ] Implement reduced motion support
- [ ] Add memoization for performance optimization
- [ ] Write unit tests for all components
- [ ] Write property-based tests (100+ iterations each)
- [ ] Write integration tests
- [ ] Run Lighthouse accessibility audit (target > 95)
- [ ] Test responsive breakpoints on real devices
- [ ] Validate TypeScript strict mode compliance
- [ ] Run ESLint validation

---

## Future Enhancements

1. **Animation Library Integration**
   - Replace inline transitions with Framer Motion for advanced animations
   - Add scroll-triggered reveal animations

2. **Content Management**
   - Extract feature data to JSON config file
   - Create admin interface for content updates

3. **A/B Testing**
   - Add analytics tracking for CTA button clicks
   - Implement variant testing framework

4. **Internationalization**
   - Add i18n support for multi-language content
   - Localize date/time formats in booking modal

5. **Backend Integration**
   - Connect demo booking form to CRM API
   - Add email confirmation service
   - Implement calendar availability checking

---

## References

- **Design Tokens**: `src/constants/colors.ts`
- **Theme Context**: `src/context/ThemeContext.tsx`
- **Hero Component**: `src/components/blocks/hero-section-5.tsx`
- **Footer Component**: `src/components/FooterNav.tsx`
- **Material Symbols**: https://fonts.google.com/icons
- **WCAG 2.1 Guidelines**: https://www.w3.org/WAI/WCAG21/quickref/

---

## Approval & Sign-off

This design specification should be reviewed and approved before implementation begins. Key stakeholders:

- [ ] Frontend Lead Engineer
- [ ] UX/UI Designer
- [ ] Product Manager
- [ ] QA Lead

---

**Document Version**: 1.0  
**Last Updated**: 2026-10-04  
**Author**: AI Development Assistant  
**Status**: Ready for Review
