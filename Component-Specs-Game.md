# Component Specs - Game-Specific

## 1. HUD (Heads-Up Display)
- **Top Bar**: Resources (Gold, Wood, Stone, Food, Energy) + XP/Level.
- **Side Panel**: Construction Queues + Active Quests.
- **Behavior**: Persistent overlay, zIndex 1020, adaptive for safe-areas.
- **Data Mapping**: `ResourceBar` reads from `PlayerResources` component (gold, wood, stone, food, energy).

## 2. Build Menu
- **Components**: Grid of `BuildingCard` (tokens applied: width 280, height 160, imageRatio 1.25).
- **Behavior**: Sidebar (desktop) / Modal (mobile <768px).
- **Data Source**: `balance_tables.csv` → `buildings` table entries.
- **BuildingCard Fields Required** (from ECS `BuildingComponent` + static data):
  - `buildingId`: string (WOODCUTTER, STONE_MINE, GENERATOR, HOUSE)
  - `name`: localized string
  - `icon`: SpriteRef `building/{id}_l1_idle`
  - `costs`: object { gold: number, wood?: number, stone?: number } from `base_cost_*`
  - `produces`: resource type + rate/tick (e.g., "Gold: 0.5/tick")
  - `buildTimeSec`: from `base_build_time_sec`
  - `level`: current level (1+)
  - `state`: idle | active | building | disabled
  - `progress`: 0-1 (construction/upgrade progress)

## 3. Building Detail Panel
- **Components**: Stats section (current prod, next level prod), Action buttons (Upgrade/Demolish), Visual preview.
- **A11y**: Focus on "Upgrade" button after action.
- **Upgrade Cost Formula**: `cost_next = floor(base_cost * upgrade_multiplier ^ level)` (multiplier 1.35/1.45/1.65 per tier).
- **Build Time Formula**: `build_time_sec = base_time * (1 + level * 0.25) * difficulty_factor`.
- **State Transitions**: idle → active (producing) → building (upgrade) → idle.

## 4. Market
- **Components**: `VirtualizedList` for trading, Resource sliders, NPC interaction.
- **Pricing**: `buy_price = base_value * 0.8`, `sell_price = base_value * 0.6` (spread 20%).
- **Resource Base Values**: GOLD=1, WOOD=0.8, STONE=1.2, ENERGY=0.5.
- **Daily Tax**: 0.5% of stored resources.

## 5. Notifications
- **Components**: `NotificationToast` overlay.
- **Context**: "Building completed", "Resources full", "Achievement unlocked", "Upgrade available".
- **Types**: success (green), info (blue), warning (amber), error (red).
