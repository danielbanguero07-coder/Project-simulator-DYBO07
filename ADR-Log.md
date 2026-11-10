# ADR Log - UX Decisions

## ADR-001: Design Token Format & Distribution
**Date**: 2026-11-05
**Status**: Accepted
**Context**: Need shared tokens across Figma, Storybook, and Tailwind.
**Decision**: Style Dictionary v4 as source of truth. Output JSON, CSS vars, TS types. Published as `@sim/design-tokens` workspace package.
**Consequences**: Single source, versioned via semver. Frontend consumes via workspace:*.

## ADR-002: Component Architecture
**Date**: 2026-11-05
**Status**: Accepted
**Context**: Base + Game-specific components needed.
**Decision**: Split into `Base` (Button, Card, Modal, etc.) and `Game` (ResourceBar, BuildingCard, etc.). Each has Figma variant set + Storybook story + A11y annotations.

## ADR-003: Breakpoint Strategy
**Date**: 2026-11-05
**Status**: Accepted
**Context**: Desktop + Mobile.
**Decision**: 4 breakpoints: 375 (mobile), 768 (tablet), 1024 (desktop), 1440 (wide). Mobile-first CSS. Build Menu = Sidebar (desktop) / Modal (mobile).

## ADR-004: Sprite & Atlas Conventions
**Date**: 2026-11-05
**Status**: Accepted
**Context**: Game-dev defined SpriteRef ECS component.
**Decision**: Base sprite 128x128, max atlas 2048x2048, TexturePacker JSON + KTX2/BasisU. Naming: `category/object_lN_state`. UI icons in `ui` atlas.

## ADR-005: Onboarding Progressive Disclosure
**Date**: 2026-11-05
**Status**: Proposed
**Context**: FTUE must teach core loops without overwhelm.
**Decision**: Step-by-step contextual tooltips with actionable targets. Each step completes one micro-action (Build → Harvest → Upgrade → Trade). Skip button available.

## ADR-006: Reduced Motion Defaults
**Date**: 2026-11-05
**Status**: Proposed
**Context**: WCAG 2.1 AA requires prefers-reduced-motion support.
**Decision**: All non-essential animations (pulse, pop, slide) disabled when prefers-reduced-motion: reduce. Essential feedback (toast appear, focus ring) kept.

## ADR-007: Live Regions for Game State
**Date**: 2026-11-05
**Status**: Proposed
**Context**: Screen readers need async updates (resource changes, building complete).
**Decision**: ResourceBar = aria-live="polite"; Notifications = polite/assertive; Critical errors = assertive.

---
**Template for new ADRs:**
## ADR-XXX: [Title]
**Date**: YYYY-MM-DD
**Status**: Proposed | Accepted | Superseded
**Context**: [Why this decision is needed]
**Decision**: [What we decided]
**Consequences**: [Trade-offs, follow-up work]