# 🛫 Simulador de Vuelo A320 - Guía de Inicio Rápido

## 🚀 Cómo iniciar los servidores

### Opción 1: Con el script automático (Recomendado)
Simplemente haz **doble clic** en:
- `start-servers.bat` (en la raíz del proyecto)

Este script:
1. Abre el **Backend NestJS** en el puerto `3000`
2. Abre el **Frontend Vite** en el puerto `5173`
3. Verifica automáticamente que ambos estén respondiendo
4. Muestra un enlace directo para abrir el navegador

### Opción 2: Detener los servidores
Haz **doble clic** en:
- `stop-servers.bat` (en la raíz del proyecto)

Cerrará todos los procesos de NodeJS de manera limpia.

---

## 🌐 URLs de Acceso

- **Frontend (Juego)**: [http://localhost:5173](http://localhost:5173)
- **Backend (API)**: [http://localhost:3000](http://localhost:3000)
- **Healthcheck**: [http://localhost:3000/health](http://localhost:3000/health)

---

## 🔑 Credenciales de Acceso

- **Email**: `admin@simulator.com`
- **Contraseña**: `admin123`

---

## 🎮 Controles de Vuelo (A320)

| Tecla / Control | Acción |
|-----------------|--------|
| **Shift** / Barra Throttle | Aumentar empuje (0 a 100%) |
| **Ctrl** / Barra Throttle | Reducir empuje |
| **W** | Cabeceo abajo (Nose Down) |
| **S** | Cabeceo arriba (Nose Up) - *Rotación en despegue a ~138 kts* |
| **A / D** | Alabeo izquierda / derecha (Roll) |
| **Q / E** | Guiñada / Dirección en tierra (Rudder / Yaw) |
| **F** / Botones Flaps | Desplegar flaps (0, 1, 2, FULL) |
| **G** / Botón Tren | Subir / Bajar tren de aterrizaje |

---

## 📊 Estado Actual de los Servidores
- ✅ **Backend**: `ONLINE` en puerto `3000`
- ✅ **Frontend**: `ONLINE` en puerto `5173`
- ✅ **Físicas**: 100% integradas con el modelo 3D y entorno del aeropuerto
