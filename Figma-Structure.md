# Figma Structure Map: SIM-Design-System

## 00-Tokens
- **Overview**: Token documentation and usage guidelines.
- **Library**: Style Dictionary-generated tokens synchronized with Figma Variables/Styles.

## 01-Foundations
- **Color Palette**: Primitive (raw values) → Semantic (purpose-based).
- **Typography**: Scale, Weight, Family (Inter/JetBrains Mono).
- **Spacing & Layout**: Grid System (8px/128px), Breakpoints (375/768/1024/1440).
- **Effects**: Shadows, Blur, Motion Profiles.

## 02-Components
- **Base Components**: Button, Card, Modal, Tooltip, Slider, Select, VirtualizedList, ResourceBar, BuildingCard, NotificationToast.
- **States**: Default, Hover, Active, Disabled, Focus, Error, Loading.

## 03-Patterns
- **Empty States**: Graphics + Action calls.
- **Loading Skeletons**: Standardized shimmer animations.
- **Onboarding Flow**: Contextual tooltips, step indicators.
- **Error States**: Toast logic, actionable alerts.

## 04-Screens
- **HUD (Desktop/Mobile)**: Minimalistic resource/status bars, construction queues.
- **Main View**: Game canvas area + peripheral UI overlays.
- **Building Detail Panel**: Upgrade stats, function info, production control.
- **Market/Economy**: Trade interface, price history charts.
- **Settings/Accessibility**: Accessibility toggle, performance settings.

## 05-Prototypes
- **User Flows**: FTUE, Core Loop (Build/Harvest/Upgrade), Economy/Trade.
- **Interactions**: Drag/drop feel, camera panning, button haptics.

## 06-Design-System-Docs
- **ADR Log**: Architecture Decision Records for UX choices.
- **Accessibility Guidelines**: WCAG Checklist, screen reader behavior.
- **Contribution Guide**: How to add tokens or components.
