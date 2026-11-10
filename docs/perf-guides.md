# Guía 1: Cómo perfilar un frame en PixiJS

1. **Herramientas**: Chrome DevTools (Performance tab).
2. **Setup**: Abre la app en Chrome, abre DevTools, ve a pestaña "Performance".
3. **Grabación**:
   - Pulsa "Record" (círculo).
   - Realiza la acción que sospechas (e.g. movimiento de cámara, spawn masivo).
   - Stop.
4. **Análisis**:
   - **Flame Chart**: Busca bloques largos en `Main` (Scripting) o `Raster` (GPU).
   - **PixiJS**: Busca `PIXI.Renderer.render`. Si el tiempo > 16ms, revisa `updateTransform`, `calculateBounds` o `upload` de texturas a GPU.
   - **Checklist**:
     - ¿Demasiados `drawCalls`? (Target < 35).
     - ¿GC pauses frecuentes? (Busca barras rojas en el timeline).
     - ¿Texturas no comprimidas?

# Guía 2: Cómo detectar memory leak en PixiJS

1. **Heap Snapshots**:
   - Abre "Memory" tab en DevTools.
   - Toma un snapshot al iniciar (A).
   - Juega 5-10 min, entra/sale de screens, destruye edificios.
   - Toma otro snapshot (B).
   - Filtra por "Objects allocated between Snapshot A and B".
2. **Culpables comunes**:
   - Texturas de Pixi no destruidas (`texture.destroy(true)`).
   - Event listeners en `window` o `document` que referencian al componente.
   - Timers (`setInterval`) no limpiados.
   - Objetos en un pool que nunca vuelven al pool (leak lógico).

# Guía 3: Checklist Optimización Asset

- [ ] **Texturas**: ¿Están en KTX2? ¿Potencia de 2? (Max 2048x2048).
- [ ] **Atlas**: ¿Usaste `TexturePacker`? (Minimizar cambio de estado GPU).
- [ ] **GLTF**: ¿Pasaste `gltf-transform` con `draco` y `meshopt`?
- [ ] **Red**: ¿Cache-Control configurado en CDN (max-age 1 year)?
- [ ] **UI**: ¿La UI estática es un `RenderTexture` cacheado?
