# Backlog Inicial - Epics y User Stories

## Epic 1: Sistema de Base y Recursos
**Priority**: MoSCoW: Must have  
**Estimación**: 20 story points

### User Stories:
1. **US-1.1**: Como jugador, puedo ver mis recursos actuales (oro, madera, piedra) en la UI
   - Criterios de aceptación: 
     - Resources display shows current amounts
     - Resources update when gained/lost
     - Resource icons are clear and recognizable

2. **US-1.2**: Como jugador, puedo recolectar recursos básicos cada cierto tiempo
   - Criterios de aceptation:
     - Collect button verfügbar después de cooldown
     - Resource amount increases after collection
     - Visual feedback shows collection animation

3. **US-1.3**: Como jugador, puedo gastar recursos en construcciones
   - Criterios de aceptación:
     - Cost validation prevents overspending
     - Building becomes available after purchase
     - Resources decrease by cost amount

## Epic 2: Interfaz de Usuario y Navegación
**Priority**: MoSCoW: Must have  
**Estimación**: 15 story points

### User Stories:
4. **US-2.1**: Como jugador, la interfaz se adapta a mi dispositivo (desktop/móvil)
   - Criterios de aceptación:
     - Responsive design funciona en width > 768px y < 768px
     - Touch targets son lo suficientemente grandes (>44px)
     - Menú de navegación es accesible en ambos modos

5. **US-2.2**: Como jugador, navego entre las diferentes secciones del juego
   - Criterios de aceptación:
     - Main menu accesible desde cualquier punto
     - Section navigation es intuitiva
     - Retorno a pantalla principal es fácil

6. **US-2.3**: Como jugador, entiendo el estado actual del juego mediante indicadores visuales
   - Criterios de aceptación:
     - Tooltips explican funcionalidades desconocidas
     - Status indicators son claros (recursos, nivel, tiempo)
     - Error messages son útiles y accionables

## Epic 3: Sistema de Progresión y Niveles
**Priority**: MoSCoW: Should have  
**Estimación**: 13 story points

### User Stories:
7. **US-3.1**: Como jugador, gano experiencia al completar acciones y subo de nivel
   - Criterios de aceptación:
     - XP se gana por acciones definidas
     - Level up trigger es claro
     - Nuevo level otorga beneficios (recursos bonus, unlocked features)

8. **US-3.2**: Como jugador, tengo metas a largo plazo a través del sistema de niveles
   - Criterios de aceptación:
     - Level cap o progresión ilimitada está definida
     - Rewards scale con el level
     - Player puede ver su progreso hacia siguiente level

## Epic 4: Sistema de Edificios y Construcción
**Priority**: MoSCoW: Should have  
**Estimación**: 20 story points

### User Stories:
9. **US-4.1**: Como jugador, puedo construir y upgrade edificios en mi base
   - Criterios de aceptación:
     - Building menu muestra todas las opciones disponibles
     - Upgrade cost aumenta con cada nivel
     - Building effects se aplican inmediatamente

10. **US-4.2**: Como jugador, cada edificio tiene una función única que contribuye a mi base
    - Criterios de aceptación:
      - Each building tiene descripción de función clara
      - Building bonuses son cumulativos o tienen sinergias
      - Visual distinction between building types

## Epic 5: Economía y Comercio
**Priority**: MoSCoW: Could have  
**Estimación**: 8 story points

### User Stories:
11. **US-5.1**: Como jugador, puedo comerciar recursos con el mercado NPC
    - Criterios de aceptación:
      - Market interface is accessible
      - Trade ratios are fair and transparent
      - NPC siempre acepta ofertas definidas

12. **US-5.2**: Como jugador, veo precios de mercado fluctuantes o fijos
    - Criterios de aceptación:
      - Market prices are displayed clearly
      - Price stability es configurable

## Epic 6: Sistema de Logros y Recompensas
**Priority**: MoSCoW: Could have  
**Estimación**: 5 story points

### User Stories:
13. **US-6.1**: Como jugador, desbloqueo logros al completar tareas específicas
    - Criterios de aceptación:
      - Achievement list es visible en el perfil
      - Progress tracking es visible (0-100%)
      - Achievement rewards son otorgados inmediatamente

14. **US-6.2**: Como jugador, recibo recompensas por logros desbloqueados
    - Criterios de aceptación:
      - Rewards se añaden al inventario/recursos
      - Achievement status persiste entre sesiones

## Epic 7: Social y Multi-básico
**Priority**: MoSCoW: Won't have (para MVP)  
**Estimación**: 13 story points

### User Stories: (Post-MVP)
15. **US-7.1**: Como jugador, visito la base de amigos
    - (Post-MVP, no es parte del scope inicial)

16. **US-7.2**: Como jugador, veo leaderboards de progresión
    - (Post-MVP, no es parte del scope inicial)

## Epic 8: Monetización (Opcional)
**Priority**: MoSCoW: Won't have (para MVP)  
**Estimación**: 8 story points

### User Stories: (Post-MVP)
17. **US-8.1**: Como jugador, puedo comprar packs cosméticos opcionales
    - (Post-MVP, subject a stakeholder review)

## Epic 9: Testing y QA
**Priority**: MoSCoW: Must have  
**Estimación**: 10 story points

### User Stories:
18. **US-9.1**: Como jugador, el juego funciona sin crashes críticos en browsers principales
    - Criterios de aceptación:
      - Test en Chrome, Safari, Edge, Firefox
      - Test en desktop y móvil (iOS y Android browsers)

19. **US-9.2**: Como jugador, tengo experiencia consistente en diferentes dispositivos
    - Criterios de aceptación:
      - Save file sync funciona entre dispositivos
      - Gameplay experience es comparable

## Epic 10: Despliegue y DevOps
**Priority**: MoSCoW: Must have  
**Estimación**: 5 story points

### User Stories:
20. **US-10.1**: Como equipo, deployamos el juego a entorno de producción
    - Criterios de aceptación:
      - CI/CD pipeline está configurado
      - Deployment a AWS es automático
      - Rollback procedure está documentada

## Resumen de Priorización
| Priority | Count | Story Points | Focus |
|----------|-------|--------------|-------|
| Must have | 10 | 71 | Core gameplay loop |
| Should have | 4 | 46 | Depth y engagement |
| Could have | 4 | 13 | Polish y differentiation |
| Won't have | 2 | 21 | Post-MVP features |

**Total**: 20 user stories, 151 story points