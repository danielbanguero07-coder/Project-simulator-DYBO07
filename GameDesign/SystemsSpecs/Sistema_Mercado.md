# Sistema de Mercado
**Versión:** v0.1

## Objetivo
Ofrecer sink/source controlado de recursos vía NPC.

## Inputs
- Recursos jugador
- Precios base
- Spread configurado

## Outputs
- Transacción ejecutada
- Recursos cambiados

## Reglas
- Compra: jugador gasta oro → recibe recurso a buy_multiplier
- Venta: jugador entrega recurso → recibe oro a sell_multiplier
- Cooldown por transacción 5s anti-spam

## Edge Cases
- Precio negativo → clamp 0
- Recursos insuficientes
- Manipulación → límite por hora

## Pseudocódigo
```
function trade(player, type, resource, amount):
  price = baseValue * multiplier[type]
  if type=='buy' and player.gold < price*amount: reject
  apply transaction
```

## Determinismo
Transacciones idempotentes con transaction_id.

## Telemetría
market_buy, market_sell, arbitrage_attempt
