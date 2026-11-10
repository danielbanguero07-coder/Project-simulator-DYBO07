# Roadmap Inicial

## Hito 1: Prototipo (8 semanas)
**Objeto**: Validar concepto core y mecánicas fundamentales

### Epics Principales:
1. **Sistema de base** - Recursos básicos, construcción, gestión
2. **Interfaz de usuario básica** - Controles de escritorio y móvil
3. **Loop de juego básico** - Ciclo de acción-recompensa
4. **Sistema de guardado/load** - Local storage básico

### Critérios de Aceptación:
- [ ] Jugador puede iniciar/nueva partida
- [ ] Recursos se incrementan y decrementan correctamente
- [ ] Interfaz responsive mínima funciona en móvil
- [ ] Partida se puede guardar y cargar

### Definición de Done:
- Prototype jugable en navegador
- Código base en repositorio
- Documentación de arquitectura inicial

---

## Hito 2: Vertical Slice (12 semanas)
**Objeto**: Demostración jugable completa de un segmento funcional

### Epics Principales:
1. **Sistema de progresión** - Niveles, experiencia, desbloqueables
2. **Sistema de edificios** - Variedad de estructuras con upgrades
3. **Sistema de economía** - Compra/venta, mercado, rarezas
4. **Animaciones y efectos visuales** - PixiJS implementación
5. **Sistema de logros** - Metas y recompensas

### Critérios de Aceptación:
- [ ] Al menos 3 tipos de edificios disponibles
- [ ] Sistema de experiencia y nivelación funcionando
- [ ] Economía con al menos 3 recursos diferentes
- [ ] Interfaz completa y responsive
- [ ] Performance acceptable (>30 FPS en móvil)

### Definición de Done:
- Vertical slice jugable de principio a fin
- Demo para stakeholders y testing
- Feedback collected y priorizado

---

## Hito 3: MVP (16 semanas)
**Objeto**: Producto lanzable con valor core para usuarios

### Epics Principales:
1. **Contenido completo** - Sistema de quests, eventos dinámicos
2. **Sistema social** - Visita amigos, leaderboards, cooperación básica
3. **Sistema de monetización** - Opcional, cosméticos, packs
4. **Panel de administración** - CMS para contenido
5. **Optimización y performance** - Load time, memory management
6. **Testing y QA** - Bugs críticos, compatibilidad browsers
7. **Deployment y CI/CD** - Pipeline automático, releases

### Critérios de Aceptación:
- [ ] Juego completo jugable desde tutorial hasta "end game" básico
- [ ] Funciona en Chrome, Safari, Edge, Mobile browsers
- [ ] Sistema de monetización opcional implementado y testado
- [ ] No crashes críticos en testing
- [ ] Deployment a entorno de producción

### Definición de Done:
- MVP lanzable en AWS
- Documentación de usuario básica
- Plan de roadmap posterior (Phase 4+)

## Timeline Resumido
| Hito | Duración | Entregable Clave |
|------|----------|------------------|
| Prototipo | 8 semanas | Concepto validado, código base |
| Vertical Slice | 12 semanas | Demo jugable completa |
| MVP | 16 semanas | Producto lanzable |