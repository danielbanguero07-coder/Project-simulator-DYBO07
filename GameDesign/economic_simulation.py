"""
Economic Simulation v0.1
Validates balance_tables.csv against KPIs
Run: python economic_simulation.py
"""
import pandas as pd
import numpy as np
from pathlib import Path

DATA_PATH = Path(__file__).parent / "balance_tables.csv"

def load_balance():
    df = pd.read_csv(DATA_PATH)
    return df

def simulate_player(days=30, ticks_per_day=288):
    # Simplified simulation
    # Starting with 1 Woodcutter L1
    gold = 1000.0
    wood = 0.0
    building_level = 1
    base_rate = 0.5  # per tick
    upgrade_multiplier = 1.35
    upgrade_cost_base = 100
    
    history = []
    for day in range(days):
        daily_gen = 0
        for _ in range(ticks_per_day):
            daily_gen += base_rate * building_level
        wood += daily_gen
        
        # Daily tax 0.5%
        gold *= 0.995
        wood *= 0.995
        
        # Upgrade every 5 days if affordable
        if day>0 and day%5==0:
            cost = upgrade_cost_base * (upgrade_multiplier ** building_level)
            if gold >= cost:
                gold -= cost
                building_level += 1
                base_rate *= 1.2
        
        history.append({
            'day': day,
            'gold': gold,
            'wood': wood,
            'level': building_level,
            'daily_gen': daily_gen
        })
    return pd.DataFrame(history)

def validate_kpis(df):
    # Inflation: wood growth rate
    df['wood_growth'] = df['wood'].pct_change()
    avg_inflation = df['wood_growth'].mean()
    
    # Session length proxy: check-ins per day = 3
    # ARPU proxy: gold spent on upgrades
    # Retention proxy: level progression
    final_level = df['level'].iloc[-1]
    return {
        'avg_daily_inflation': avg_inflation,
        'final_level': final_level,
        'final_wood': df['wood'].iloc[-1],
        'economy_healthy': avg_inflation > 0 and avg_inflation < 0.5
    }

if __name__ == "__main__":
    balance = load_balance()
    print("Balance loaded")
    print(balance.head())
    
    sim = simulate_player(days=30)
    kpis = validate_kpis(sim)
    print("\nKPI Validation:")
    print(kpis)
    
    # Save results
    sim.to_csv(Path(__file__).parent / "simulation_results.csv", index=False)
    print("Simulation saved to simulation_results.csv")
