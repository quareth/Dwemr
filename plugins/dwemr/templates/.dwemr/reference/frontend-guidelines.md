# Frontend Guidelines

Use this as the reference rulebook for modern, maintainable, well-designed frontend development.

## Component Architecture

- **Single responsibility** — Each component does one thing. Split into smaller, composable components rather than monolithic containers.
- **Props-driven** — Prefer composition over inheritance. Pass behavior and configuration through props, not through class methods or global state.
- **Reusability** — Build components that can be reused across different contexts. Avoid hard-coded strings, colors, or logic specific to one feature.
- **Naming clarity** — Component names should describe what they do, not where they're used. `Button`, `Card`, `Modal` — not `HeaderButton`, `DashboardCard`.

## State Management

- **Minimal state** — Keep state as close as possible to where it's used. Avoid lifting state into global stores when local component state would work.
- **Separation of concerns** — UI state (open/closed) lives in components. Business logic state (data, permissions) lives in a predictable store or context.
- **Immutability** — Treat state as immutable. Mutations should be explicit and tracked, not side effects of render or event handlers.
- **Dependency clarity** — Make it obvious what data a component depends on. Props, context, and stores should all be clear and intentional.

## Responsive & Accessible Design

- **Mobile-first** — Start with mobile layouts, then add breakpoints for larger screens. Not the reverse.
- **Touch-friendly** — Interactive elements (buttons, links) should be at least 44×44 logical pixels. Spacing and targets should favor mobile use.
- **Keyboard navigation** — All interactive elements must be reachable and operable via keyboard. Test with Tab, Enter, Escape.
- **Semantic HTML** — Use correct HTML elements (`<button>`, `<nav>`, `<main>`, `<form>`) rather than `<div>` wrappers for everything.
- **ARIA labels** — When semantic HTML is insufficient, add `aria-label`, `aria-describedby`, or `role` attributes. Don't rely on visual hints alone.
- **Color & contrast** — Text must meet WCAG AA contrast ratios (4.5:1 for normal text, 3:1 for large). Don't use color alone to convey meaning.

## Performance & Loading

- **Code splitting** — Lazy-load feature modules and large components. Don't ship unused code on the initial page load.
- **Bundle size awareness** — Monitor and minimize bundle size. Third-party dependencies should pull their weight.
- **Image optimization** — Use responsive images (`srcset`), modern formats (WebP with fallbacks), and lazy loading for below-fold images.
- **Rendering efficiency** — Avoid unnecessary re-renders. Use memoization sparingly and only when profiling shows it's needed.
- **Critical path** — Prioritize rendering above-the-fold content first. Defer non-critical assets and rendering work.

## Design System Consistency

- **Centralized tokens** — Colors, spacing, typography, shadows, and animations should live in a single source of truth (design tokens, CSS variables, or theme config).
- **Predictable spacing** — Use a consistent scale (e.g., 4px, 8px, 16px, 24px, 32px). Don't use arbitrary values.
- **Typography hierarchy** — Define 3–5 heading levels and 2–3 body text sizes. Use them consistently across the app.
- **Component variants** — Define the allowed states for each component (default, hover, focus, disabled, loading) and implement them consistently.
- **Dark mode readiness** — Design with light and dark themes in mind, even if only one is deployed now. Use semantic color names, not hard-coded hex values.

## Code Quality & Maintainability

- **Clear naming** — Variable, function, and component names should explain intent without needing a comment.
- **Minimal nesting** — Keep template/markup nesting shallow. Deep nesting is hard to read and reason about.
- **DRY principle** — Don't repeat markup or logic. Extract shared patterns into components or utilities.
- **Testability** — Structure code so that logic is easy to test in isolation. Avoid tight coupling to DOM or external APIs.
- **Comments** — Comment *why*, not *what*. The code explains what it does; comments explain why it's done that way.

## Testing Strategy

- **Component unit tests** — Test component behavior, props, state changes, and user interactions. Mock external dependencies.
- **Integration tests** — Test multi-component flows and navigation. Verify that components work together as expected.
- **Snapshot tests** — Use sparingly. Snapshots are useful for catching unintended visual regressions, but they can become noise.
- **Accessibility tests** — Include automated checks for WCAG compliance (e.g., axe-core). Also manual testing with screen readers and keyboard navigation.
- **Visual regression** — If the team values visual consistency, use visual regression testing tools to catch unintended style changes.

## Development Workflow

- **Local environment** — Developer environment should match production as closely as possible. Test real performance, not just dev server speed.
- **Build tooling** — Use modern tooling (Vite, esbuild, etc.) for fast iteration. Minimize build times and hot-reload latency.
- **Linting & formatting** — Use consistent linting (ESLint) and code formatting (Prettier). Run checks in CI/CD, not just locally.
- **Browser compatibility** — Verify support for target browsers. Use polyfills or feature detection where needed, but avoid supporting ancient browsers unless required.
- **Version control** — Keep commits atomic and focused. Use descriptive messages. Review before merging to catch issues early.

## Common Pitfalls to Avoid

- **God components** — Components that do too much. Split them into smaller, focused pieces.
- **Prop drilling** — Passing props through many layers. Use context or a store instead when necessary.
- **Missing error boundaries** — Unhandled errors crash the entire app. Wrap error-prone sections with error boundaries.
- **Hardcoded strings** — Strings scattered throughout components. Extract to constants or localization files.
- **Ignoring performance** — Shipped a large bundle? Unused dependencies? Slow renders? Profile and optimize.
- **Accessibility afterthought** — Accessibility is not a feature; it's a requirement. Test as you build, not at the end.

## Design & Brand Alignment

- **Design system handoff** — If designs exist, use them as the source of truth. Components should match the design system, not deviate for convenience.
- **Consistency across products** — If this is part of a larger product ecosystem, maintain visual and interaction consistency.
- **User expectations** — Follow platform conventions (web, mobile, desktop). Users expect certain patterns to work a certain way.

## Visual Design Quality

The application should look and feel like a modern, well-crafted product from the first screen. Layout and navigation placement should be decided during planning based on the application's purpose, but every frontend should meet these baseline visual standards.

### Whitespace & Breathing Room

- Give content generous padding and margins. Cramped layouts feel unfinished.
- Separate logical sections with clear vertical spacing, not just borders.
- Cards and containers should have enough internal padding that content never touches edges.
- Let the layout breathe — empty space is a design element, not wasted space.

### Depth & Surface

- Use subtle box shadows on elevated elements (cards, modals, dropdowns) to create visual layers.
- Distinguish surfaces from the background — a card on a flat background should feel like it's sitting above it.
- Use border-radius consistently. Sharp corners on one element and rounded on another looks accidental.
- Avoid flat, borderless layouts where everything blends into one plane.

### Color & Contrast

- Use a rich but restrained color palette. A primary color, a secondary/accent color, neutral grays, and semantic colors (success, warning, error) as a minimum.
- Apply the primary color intentionally — key actions, active states, selected items. Not everywhere.
- Use subtle background tints to distinguish sections (e.g., a slightly tinted sidebar, alternating row colors).
- Text should have clear hierarchy through color weight — primary text dark, secondary text muted, disabled text faded.

### Typography & Hierarchy

- Use font weight to create hierarchy. Bold headings, medium labels, regular body text. Not everything the same weight.
- Apply letter-spacing on uppercase labels and small caps. Tight spacing on large headings.
- Line height should be generous for body text (1.5–1.7) and tighter for headings (1.1–1.3).
- Limit to 2–3 font sizes per context. Too many sizes creates visual noise.

### Transitions & Feedback

- Interactive elements should respond visually on hover and focus — color shift, subtle shadow lift, or scale change.
- State changes (loading, success, error) should transition smoothly, not snap between states.
- Use short transitions (150–250ms) on color, background, shadow, and transform properties.
- Buttons should feel pressable — a subtle active state (darker, pressed-in shadow) reinforces the interaction.

### Loading & Empty States

- Show a loading indicator or skeleton placeholder while data is being fetched. Never show a blank screen.
- Empty states should have a clear message and a call to action. Not just "No items" — tell the user what to do next.
- Skeleton loaders should approximate the shape of the content that will appear.

### Layout & Structure

- Give the application a clear visual frame — a header, a content area, and clear boundaries between navigation and content.
- Use consistent alignment. Left-align text by default. Center-align only for short, intentional elements like hero text or empty states.
- Group related actions together. Separate primary actions from destructive ones with space or visual weight.
- Tables and lists should have clear row separation (borders, alternating backgrounds, or spacing) so the eye can track across.

### Form Design

- Labels should be above or clearly associated with their inputs.
- Inputs should have visible borders or backgrounds — not just an underline that disappears on some backgrounds.
- Group related fields together with a heading or visual container.
- Validation errors should appear inline next to the field, styled distinctly (color + icon when possible).
- Submit buttons should look different from cancel/secondary buttons — weight, color, or both.

### Icons & Visual Cues

- Use icons to reinforce meaning alongside text, not replace it. An icon-only button needs a tooltip or aria-label.
- Keep icon style consistent — all outlined or all filled, not mixed.
- Use visual indicators for state: checkmarks for done, spinners for loading, color badges for status.

### Polish Indicators

- A polished UI has consistent spacing, aligned elements, smooth transitions, and thoughtful empty/loading states.
- If removing all text from the screen still shows a visually structured layout with clear regions and hierarchy, the visual design is working.
- Every screen the user can land on should look intentionally designed, including error pages, empty states, and first-run experiences.
