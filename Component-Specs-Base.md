# Component Specs - Base & Game Specific

## Base Components

### 1. Button
- **A11y**: Role="button", aria-label (for icon-only), keyboard support (Enter/Space), focus visible ring.
- **Sizes**: md (40px height), lg (48px).
- **Radius**: `tokens.radius.button` (8px).
- **States**: Normal, Hover, Active, Disabled, Focus.

### 2. Card
- **Structure**: Surface, Shadow (md), Radius (lg).
- **A11y**: Semantic container for grouped info.

### 3. Modal
- **Behavior**: Overlay (zIndex 1040), Content (zIndex 1050), Escape key closes.
- **A11y**: `role="dialog"`, `aria-modal="true"`, focus trap within modal.

### 4. Tooltip
- **Behavior**: Hover/Focus trigger, Offset (`tokens.spacing.tooltipOffset`), zIndex 1060.
- **A11y**: `role="tooltip"`, `aria-describedby` linked to trigger.

### 5. VirtualizedList
- **Behavior**: Handle large datasets (inventory/market list).
- **Performance**: Row recycling, standard scrollbar interaction.

## Game Specific Components

### 1. ResourceBar
- **Props**: `resources` (array of type, amount), `compact` (bool).
- **Tokens**: Height: 40px, IconSize: 24px, Gap: 8px.
- **A11y**: `role="status"` or `aria-live="polite"` for resource updates.

### 2. BuildingCard
- **Tokens**: Width: 280px, Height: 160px, ImageRatio: 1.25.
- **Layout**: Image top/left, Info + Action (Build/Upgrade) bottom/right.
- **States**: Normal, Hover (Scale 1.02), Disabled (insufficient resources).
- **A11y**: `role="article"`, semantic building info.

### 3. NotificationToast
- **Behavior**: Auto-dismiss (5s), zIndex 1090.
- **A11y**: `role="status"`, `aria-live="polite"`.
