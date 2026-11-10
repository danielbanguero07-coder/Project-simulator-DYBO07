# Streaming de texturas 4K (estilo GTA V)

Prototipo implementado en las escenas `?scene=2` y `?scene=3`.

## Objetivo

Poder tener materiales de 4K sin cargar todos los recursos de golpe ni reventar
los 4 GB de VRAM de una GTX 1650.

El sistema no decide "cargo 4K porque sí": calcula cuántos píxeles ocupa una
repetición de la textura en pantalla y sube de nivel solo cuando el nivel
inferior se queda corto.

## Piezas

| Archivo | Responsabilidad |
|---|---|
| `apps/frontend/src/scenes/textureStreaming.ts` | Residencia, presupuesto de VRAM, prioridad, subida/bajada de mip y métricas |
| `apps/frontend/src/scenes/airportTextures.ts` | Generadores de texturas a resolución arbitraria (256 → 4096) |
| `apps/frontend/src/scenes/qualityDemo.ts` | Registro de superficies y conexión con los materiales |
| `apps/frontend/src/components/QualityDemo.tsx` | Selector Auto/1K/2K/4K y panel de VRAM/estado |

## Regla de resolución

Para cada superficie:

```
píxelesPorMetro = alturaViewport / (2 · tan(fov/2) · distancia)
píxelesPorTile  = metrosPorTile · píxelesPorMetro
needed          = píxelesPorTile · 1.15
```

Se elige el mip más pequeño cuyo tamaño en texels cubra `needed`, limitado por
el presupuesto y por el tope de calidad elegido.

- `Auto`: modo dinámico. Cerca de la cámara sube a 2K/4K; al alejarse vuelve a
  1K/512 y libera VRAM.
- `1K / 2K / 4K`: fijan esa resolución para comparar calidad y coste.

Cada cambio sube **un nivel por vez** (512 → 1K → 2K → 4K). Eso evita el pico de
VRAM de saltar directo al máximo y produce el efecto de "pop-in" progresivo de
los juegos de mundo abierto.

## Presupuesto de VRAM

| GPU detectada | Presupuesto | Cargas paralelas |
|---|---|---|
| Integrada (Intel/AMD/Apple) | 384 MB | 1 |
| Dedicada | 1.5 GB | 2 |

El presupuesto es **autoimpuesto**, no un límite del driver. Sirve para que la
suma de texturas + mips + render targets quepa cómodamente en una GPU de 4 GB
(o en la memoria compartida de una integrada). Se puede subir/bajar en
`TextureStreamerOptions.budgetBytes`.

Cada 4K RGBA8 con cadena completa de mips ocupa ~85 MB. Con cuatro superficies
a 4K el total ronda los **280–340 MB**, muy por debajo de los 4 GB.

Si una subida no cabe, el streamer degrada primero las superficies
sobre-residentes y luego las más lejanas, y libera la textura anterior con
`texture.dispose()`.

## Mips, anisotropía y color

- `LinearMipmapLinearFilter` + `generateMipmaps: true`.
- Anisotropía 8 (el tarmac y las pistas se ven mucho mejor en ángulo rasante).
- `SRGBColorSpace` en los mapas de color.
- `RepetitionWrapping` con el `repeat` de cada material.

## Cómo probarlo

1. Abrir `http://localhost:5173/?scene=3`.
2. Acercarse con la rueda hasta la plataforma.
3. Pulsar `1K`, `2K`, `4K` en el panel derecho.
4. Observar `VRAM texturas`, el tamaño actual de cada superficie y el contador
   de cargas/evicciones.

En `Auto` se puede orbitar y ver cómo las texturas bajan de resolución al
alejarse y vuelven a subir al acercarse.

## GPU dedicada vs integrada (Acer Nitro AN515-54)

El equipo es un portátil **Optimus**: la pantalla interna está cableada a la
Intel UHD 630 y la GTX 1650 solo renderiza cuando la aplicación lo pide. Por eso
`nvidia-smi` mostraba `display_active = Disabled`, que es lo normal.

El navegador del juego no es Chrome ni Edge: es el **Electron de OpenCode**
(`OpenCode.exe --type=gpu-process`). Windows estaba renderizando con la Intel
porque no existía una preferencia de GPU para ese ejecutable. Basta con
registrarla:

```powershell
$exe = "$env:LOCALAPPDATA\Programs\ai.opencode.desktop\OpenCode.exe"
New-ItemProperty `
  -Path 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences' `
  -Name $exe -Value 'GpuPreference=2;' -PropertyType String -Force
```

`GpuPreference=2` significa *alto rendimiento*; `1` es *ahorro de energía* y `0`
deja decidir a Windows. El cambio **no afecta a un proceso ya arrancado**: hay
que reiniciar el proceso GPU (Chromium lo relanza solo) o cerrar y abrir
OpenCode. El panel del juego debe pasar a `GPU: NVIDIA GTX 1650` y
`Escala render: 100 %`.

Con la GTX 1650 activa el presupuesto de texturas sube a 1.5 GB y se habilitan
MSAA 4x, bloom a resolución completa y anisotropía 8.

## Optimizaciones de GPU integrada

Si la escena vuelve a caer en la Intel, existe un perfil automático para que
aguante 60 FPS:

- **Resolución dinámica:** la integrada arranca al 72 % y sube/baja según el FPS
  (zona muerta 45–58 FPS). El objetivo es no bajar de 60.
- **Shadow map congelado:** la luz y la geometría son estáticas, así que la
  sombra se renderiza una vez y se reutiliza. Se refresca al cargar el A320.
- **MSAA 2x y bloom a media resolución** en integrada (4x y resolución completa
  en dedicada).
- **Anisotropía 4** en integrada (8 en dedicada).
- **Menos nubes y charcos transparentes**, que son puro coste de fill rate.
- El pixel ratio máximo se limita a 1 en integrada y 1.5 en dedicada.

El panel muestra la GPU activa, la escala de render y un aviso si la GTX 1650
está inactiva.

## Resultados medidos (1144×837)

| GPU / modo | VRAM texturas | Escala | FPS Nivel 2 | FPS Nivel 3 |
|---|---|---|---|---|
| Intel UHD 630 · Auto | 17 MB | 72–84 % | 60 | 60 |
| Intel UHD 630 · 4K fijo | 277 MB | 72–84 % | 60 | 60 |
| GTX 1650 · Auto | 9 MB | 100 % | 60 | 60 |
| GTX 1650 · 4K fijo | 277 MB | 100 % | 60 | 60 |

En la Intel, antes de las optimizaciones el 4K fijo daba 58 FPS en Nivel 2 y
42–48 FPS en Nivel 3. Ahora ambos quedan clavados en el límite de vsync
(60 FPS) y la utilización de la GPU integrada bajó de ~100 % a ~68 %.

Con la GTX 1650 el render va a resolución nativa (100 %) con MSAA 4x y bloom
completo, y `nvidia-smi` confirma 339 MiB residentes en la tarjeta y ~25 % de
utilización en la escena en reposo.

Tiempos de generación medidos en el prototipo: hierba 41 ms, plataforma 64 ms,
pista 76 ms, fachada 8 ms (2K). En la GTX 1650 el render será más rápido; el
coste de generación es de CPU y será similar.

## Limitaciones del prototipo

- Las texturas se generan con canvas en el hilo principal. En producción se
  sustituirían por archivos **KTX2/Basis** descargados bajo demanda y decodificados
  en un **Web Worker** (`createImageBitmap` + transferencia), eliminando el
  bloqueo de 40–100 ms.
- El A320 gratuito solo incluye una textura de 1K; el streamer ya está listo
  para recibir sus variantes 2K/4K cuando exista el asset.
- No hay prefetch predictivo por dirección de cámara; se puede añadir un
  `requestIdleCallback` que precargue el siguiente nivel de la superficie que
  está entrando en pantalla.
- El presupuesto es estático según GPU detectada; lo ideal es ajustarlo con
  `EXT_disjoint_timer_query` o telemetría de frame time.

## Camino a producción

1. Exportar cada material en `1K`, `2K`, `4K` como KTX2 (BC7/ASTC según GPU).
2. Servir los niveles desde CDN con `Content-Encoding: br` y cache inmutable.
3. Generar mips en el build (no en runtime) y validar el contenido con
   `ktxinfo`.
4. Decodificar en worker y transferir `ImageBitmap` al hilo de render.
5. Sustituir el presupuesto fijo por un controlador adaptativo que baje de
   nivel si el frame time supera 20 ms durante N frames.
6. Añadir telemetría: MB residentes, misses, tiempo medio de subida y picos.

## Atribución

El modelo A320 es de `amvlab/aircraft-models`, licencia **CC BY 4.0**. El
crédito aparece en la UI y debe mantenerse en los créditos del juego.
