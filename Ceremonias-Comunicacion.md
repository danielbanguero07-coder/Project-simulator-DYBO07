# Calendario de Ceremonias y Canales de Comunicación

## Scrum Ceremonies Schedule

### Sprint Planning (Cada 2 semanas - Lunes 10:00)
**Duración**: 2 horas  
**Participantes**: Product Owner, Scrum Master, Equipo completo (Devs, Designer, QA)  
**Propósito**: Seleccionar historias del backlog para el próximo sprint y definir el objetivo del sprint

**Agenda:**
1. Revisión del backlog y aclaración de dudas (30 min)
2. Selección de historias para el sprint (60 min)
3. Definición del objetivo del sprint y criterios de éxito (30 min)

**Preparación requerida:**
- Backlog refinado y priorizado (Product Owner)
- Estimaciones actualizadas (Team)
- Definition of Ready cumplido para historias seleccionadas

---

### Daily Standup (Diario - Lunes a Viernes 09:00)
**Duración**: 15 minutos máximo  
**Participantes**: Equipo completo (opcional participación stakeholders)  
**Formato standup remoto (Slack/Discord):**

1. ¿Qué hice ayer que ayudó al equipo a avanzar?
2. ¿Qué voy a hacer hoy para ayudar al equipo a avanzar?
3. ¿Tengo algún bloqueo que me impida avanzar?

**Nota**: Standup no es reporte de estado al PO, es sincronización del equipo.

---

### Sprint Refinement (Semanal - Miércoles 14:00)
**Duración**: 1 hora  
**Participantes**: Product Owner, Team Lead, Game Designer (opcional: representative devs)  
**Propósito**: Mantener el backlog saludable y listo para próximos sprints

**Actividades:**
- Revisar nuevas ideas y sugerencias
- Dividir historias grandes en stories más pequeñas
- Actualizar estimaciones basadas en nuevo conocimiento
- Remover historias que ya no son relevantes
- Asegurar criterios de aceptación claros

**Output:** Backlog prioritizado y refinado, historias listas para sprint planning

---

### Sprint Review (Cada 2 semanas - Viernes 16:00)
**Duración**: 1.5 horas  
**Participantes**: Equipo completo, stakeholders, dirección, clientes beta (opcional)  
**Propósito**: Demostrar lo completado en el sprint y recibir feedback

**Estructura:**
1. Demo del incremento completado (60 min)
2. Feedback y comentarios de stakeholders (30 min)
3. Discusión de qué viene siguiente (30 min)
4. Actualización del roadmap si es necesario (30 min)

**Output:** Incremento demostrado, feedback recopilado, roadmap actualizado

---

### Sprint Retrospective (Cada 2 semanas - Viernes 17:30, después de Review)
**Duración**: 1 hora  
**Participantes**: Equipo completo (seguro espacio sin stakeholders)  
**Propósito**: Inspeccionar y adaptar procesos, mejorar continuamente

**Formato sugerido (4 preguntas):**
1. ¿Qué fue bien este sprint?
2. ¿Qué podría mejorar?
3. ¿Qué aprendimos?
4. ¿Qué acción concreta tomaremos el próximo sprint?

**Output:** Action items concretos, proceso mejorado, mayor team alignment

---

## Canales de Comunicación

### Slack (Principal)
**Canales principales:**
- `#general` - Announcements y discussiones generales
- `#producto` - Discusiones de features, prioritización, roadmap
- `#diseño` - Game designer ↔ team collaboration
- `#desarrollo-backend` - Server architecture, API discussions
- `#desarrollo-frontend` - Client, React/PixiJS implementation
- `#qy-testing` - QA reports, test plans, bug tracking
- `#devops` - Deployment, infrastructure, CI/CD
- `#random` - Social, team building (opcional)

**Notificaciones importantes:**
- Alertas de CI/CD (#devops)
- Bug reports críticos (#qy-testing)
- Release announcements (#general)

### Discord (Comunidad y soporte)
- **Voice channels** para sesiones de emparejamiento/solución de problemas
- **Announcements** para releases y hitos importantes
- **Community feedback** para testing beta y suggestions

### Correo Electrónico
- Communications formales a dirección/stakeholders
- Reportes semanales de estado
- Documentación oficial y decisiones archivadas

### Jira/GitHub Projects
- **Backlog** - Histories y epics con prioritización
- **Board** - Kanban view with columns: Backlog, To Do, In Progress, Review, Done
- **Sprints** - Sprint view con burndown chart
- **Reports** - Velocity, burndown, cumulative flow

---

## Reportes Semanales a Dirección

### Formato de Reporte Semanal
**Entregado**: Cada viernes 17:00  
**Destinatarios**: Dirección, stakeholders clave

**Contenido:**
1. **Velocity & Progress** - Story points completados vs. planificado
2. **Riesgos e Impedimentos** - Status actual, mitigación planes
3. **Quality Metrics** - Bugs abiertos, critical vs. menor, test coverage
4. **Next Sprint Preview** - Objetivo, historias seleccionadas
5. **Decisiones Tomadas** - Trade-offs, scope changes this week
6. **Roadmap Update** - Hitos próximos, cambios de timeline

### Métricas Clave (Semana a Semana)
| Métrica | Objetivo Semanal | Fuente de Datos |
|---------|-----------------|-----------------|
| Velocidad (avg) | ±15% de plan | Jira burndown |
| Histories completadas | ≥80% plan | Jira sprint report |
| Bugs críticos abiertos | 0 | QA report |
| Cycle time avg | Reduciendo | Jira metrics |
| Deploy frequency | ≥1 por sprint | DevOps report |

---

## Equipo y Responsabilidades

### Roles y Puntos de Contacto

| Rol | Nombre | Canal Principal | Responsabilidades Clave |
|-----|--------|-----------------|------------------------|
| Product Owner | Yo (project-manager) | #producto + Slack | Backlog, priorización, stakeholders |
| Scrum Master | (Role) | #general + facilitation | Ceremonies, bloqueos, proceso |
| Game Designer | (Nombre) | #diseño + colaboración | Specs, valor de features, mecánicas |
| Tech Lead (Backend) | (Nombre) | #desarrollo-backend | Arquitectura server, riesgos technical |
| Tech Lead (GameDev/Frontend) | (Nombre) | #desarrollo-frontend | Client architecture, performance |
| DevOps | (Nombre) | #devops + CI/CD | Release pipeline, infraestructura, K8s |
| QA Lead | (Nombre) | #qy-testing | Criterios aceptación, testing plan, calidad |

### Canales de Toma de Decisiones
1. **Diario**: Standup identifica bloqueos immediatos
2. **Semanal**: Refinement decide qué entra al backlog
3. **Sprint**: Planning decide qué se compromete
4. **Por ad-hoc**: PO negocia trade-offs con stakeholders cuando necesario

---

## Protocolos y Normas

### Definition of Ready (DoR) - Histories listos para sprint
- [ ] Criterios de aceptación definidos y testables
- [ ] Estimación completada (story points)
- [ ] Dependencies identificadas y gestionadas
- [ ] Diseño/ específico suficiente para empezar
- [ ] Valor de negocio claro identificado
- [ ] No hay bloqueos desconocidos

### Definition of Done (DoD) - Story completada
- [ ] Código desarrollado y unit-tested
- [ ] Integración en branch principal exitosa
- [ ] Pass all CI/CD pipeline stages
- [ ] Pass QA testing (funcional + regressión)
- [ ] Respondan los criterios de aceptación
- [ ] Documentación actualizada (si aplica)
- [ ] Performance requirements met (FPS, load time, etc.)
- [ ] Responsive en desktop y móvil (breakpoints key)
- [ ] Seguro sin vulnerabilities críticos
- [ ] Deploy a staging environment verificado

### Scope Creep Protection
1. **Cualquier nueva historia debe ser priorizada en refinement**, no añadida mid-sprint
2. **Trade-offs deben ser negociados**: "¿Qué story removemos para acomodar esto?"
3. **PO es el guardián del backlog** - solo PO puede añadir/remover historias del sprint actual
4. **Stakeholders reciben reporte semanal** para ver progress y proponer cambios

### Emergency Protocol
- **Blocker crítico**: Cualquier team member puede escalar a PO inmediatamente
- **Decisión mid-sprint**: PO evalúa si es worth to adjust scope vs. wait Next Sprint
- **Communication**: Todo cambio de scope debe comunicarse al equipo y stakeholders ASAP

## Contactos de Emergencia
- **Producto/Stakeholders**: WhatsApp/SMS para asuntos urgentes
- **Team technical**: Slack @mention or phone tree para blockers technical
- **DevOps/Release**: On-call rota publicada en #devops