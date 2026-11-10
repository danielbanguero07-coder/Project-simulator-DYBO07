# Accessibility Audit Checklist - WCAG 2.1 AA

## Global Requirements
- [ ] **Contrast 4.5:1** all text/UI elements against background.
- [ ] **Focus Visible**: All interactive elements have :focus-visible ring (3px, tokens.color.border.focus).
- [ ] **ARIA Labels**: Icon-only buttons have aria-label; live regions for dynamic content.
- [ ] **Reduced Motion**: prefers-reduced-motion disables non-essential animations.
- [ ] **Text Scaling**: rem units, clamp() fluid type, works at 200% zoom.
- [ ] **Color Blindness**: Simulated via Stark; no info conveyed by color alone.

## Per Component

### Button
- [ ] Keyboard: Enter/Space activates.
- [ ] Screen reader: announces role + label + state (disabled).
- [ ] Touch target ≥ 48dp (mobile).

### Card / BuildingCard
- [ ] Role="article" or section with aria-labelledby.
- [ ] Image has alt text (building name + level).
- [ ] Price/cost announced in logical order.

### Modal
- [ ] Role="dialog" aria-modal="true".
- [ ] Focus trap: Tab cycles within modal.
- [ ] Escape key closes; focus returns to trigger.

### Tooltip
- [ ] Role="tooltip", aria-describedby on trigger.
- [ ] Dismiss on Escape, hover out, click outside.
- [ ] No critical info only in tooltip.

### VirtualizedList
- [ ] Keyboard navigation: Arrow keys move focus.
- [ ] Screen reader announces item count + position.
- [ ] Scrollable via keyboard.

### ResourceBar
- [ ] Role="status" aria-live="polite" for updates.
- [ ] Icon + text labels for each resource.
- [ ] Sufficient contrast on icons.

### NotificationToast
- [ ] Role="status" aria-live="polite" (or "assertive" for errors).
- [ ] Auto-dismiss pause on hover/focus.
- [ ] Keyboard dismissible.

### HUD / Build Menu / Market / Building Detail
- [ ] Landmark regions: <nav>, <main>, <aside>.
- [ ] Heading hierarchy h1→h2→h3.
- [ ] All forms have labels, error messages linked via aria-describedby.

## Per Screen
- [ ] **HUD**: ResourceBar live region; Level/XP progress accessible.
- [ ] **Build Menu**: Grid navigation (arrows); BuildingCard affordability announced.
- [ ] **Building Detail**: Stats table with headers; Upgrade button state.
- [ ] **Market**: Slider accessible (aria-valuemin/max/now); Trade confirmation.
- [ ] **Settings/Accessibility**: Toggle for reduced motion, high contrast, text size.

## Testing Tools
- axe-core / WAVE / Lighthouse.
- Screen readers: NVDA (Win), VoiceOver (Mac/iOS), TalkBack (Android).
- Keyboard-only navigation test.
- Zoom 200% + 400%.
- High Contrast mode (Win) / Dark Mode.