# User Flows: Core Loop

## 1. FTUE (First Time User Experience)
- **Start**: Welcome screen → "Aceptar". Starter resources: Gold 500, Wood 200, Stone 150, Food 100, Energy 50.
- **Step 1**: HUD Reveal (Pointer to Resource Bar) → "Tu ciudad necesita recursos".
- **Step 2**: Open Build Menu (Pointer to Button) → "Construye tu primer aserradero (Woodcutter: 100 Gold + 50 Wood)".
- **Step 3**: Interaction → Drag building to empty tile (Grid 128x128).
- **Step 4**: Construction Logic → "Construyendo (5 min)" → Animation "Pop" → Idle.
- **Step 5**: Harvest → Pointer to "Collect" on Aserradero → Resource Bar +Gold (0.5/tick).
- **Finish**: Congratulations + Goal Tracking (Next: Build Stone Mine).

## 2. Core Loops
- **30s Loop (Harvesting)**: Resource Bar update → Pulse effect on icons. Manual collect cooldown 60s→300s with upgrades.
- **5m Loop (Management)**: Open Building → "Upgrade (Cost: 50 Wood)" → Check affordability → Apply. Queue max 3 buildings.
- **30m Loop (Economy)**: Open Market → Compare resources → Drag slider to set trade amount → Confirm → Success toast. Spread 20%.

## Mermaid Flows

```mermaid
graph TD
    A[Start Game] --> B{FTUE?};
    B -- Yes --> C[Onboarding Flow];
    B -- No --> D[Main HUD Screen];
    C --> E[First Build: Woodcutter];
    E --> F[First Harvest: +Gold];
    F --> D;
    D --> G{Action?};
    G -- Build --> H[Open Build Menu];
    G -- Harvest --> I[Resource Collection];
    G -- Upgrade --> J[Building Detail];
    G -- Trade --> K[Market Panel];
```

## 3. Build/Upgrade Flow Detail
```mermaid
sequenceDiagram
    participant U as User
    participant B as Build Menu
    participant S as Game State
    U->>B: Opens Build Menu
    B->>U: Shows BuildingCards (Woodcutter, Stone Mine, Generator, House)
    U->>B: Selects Woodcutter (100 Gold, 50 Wood)
    B->>S: Validates affordability
    S-->>B: Valid
    B->>U: Places ghost preview on grid
    U->>B: Confirms placement
    B->>S: Deducts resources, starts build (300s)
    S->>U: Shows construction progress bar
```

## 4. Economy/Trade Flow Detail
```mermaid
sequenceDiagram
    participant U as User
    participant M as Market
    participant S as Game State
    U->>M: Opens Market
    M->>U: Shows buy/sell prices (GOLD: buy 0.8, sell 0.6)
    U->>M: Selects WOOD → Sell 50 units
    M->>S: Calculates: 50 * 0.8 * 0.8 = 32 Gold
    S->>U: Confirms trade
    U->>M: Confirms
    M->>S: Deducts WOOD, adds GOLD
    S->>U: Toast "Trade completed: +32 Gold"
```
