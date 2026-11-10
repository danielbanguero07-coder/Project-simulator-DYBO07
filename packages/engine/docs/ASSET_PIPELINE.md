# Asset Pipeline

## Resumen

```
Source Assets → TexturePacker → KTX2/BasisU → CDN → Runtime Load
```

---

## 1. Formatos Fuente

| Tipo | Formato | Herramienta | Notas |
|------|---------|-------------|-------|
| Sprites 2D | `.aseprite` / `.psd` (layers) | Aseprite / Photoshop | Capas = frames |
| UI/Iconos | `.svg` / `.png` | Figma / Illustrator | Exportar a 128×128 base |
| Partículas | `.aseprite` (frames) | Aseprite | Loopable |
| Tilesets | `.png` + `.json` (Tiled) | Tiled Map Editor | Para terrain futuro |
| 3D (opcional) | `.glb` / `.gltf` | Blender | Solo si híbrido 2.5D |

**Resolución base: 128×128px** (power-of-2, escala 2× para retina, downscale limpio a 64×).

---

## 2. TexturePacker (Atlas Generation)

```bash
# Instalar
npm install -g texturepacker

# CLI para buildings atlas
texturepacker \
  --format pixi \
  --data assets/atlases/buildings.atlas.json \
  --sheet assets/atlases/buildings.png \
  --padding 4 \
  --max-size 2048 \
  --trim-mode None \
  --scale 1 \
  --opt RGBA8888 \
  assets/sprites/buildings/

# Repetir para: resources, ui, vfx, terrain, units
```

**Output:** `atlas.json` (PixiJS Hash format) + `atlas.png`

### Naming Convention (Frame Names)

```
category/object_variant_state

Ejemplos:
building/house_l1_idle
building/house_l1_producing
building/house_l2_idle
building/mine_l3_upgrading
resource/gold
resource/wood_stack
ui/icon_hammer
ui/btn_upgrade_pressed
ui/panel_bg_9slice
vfx/particle_smoke_01
vfx/spark_gold
terrain/grass
terrain/water_shore
unit/villager_walk_01
```

**Regex:** `^(building|resource|ui|vfx|terrain|unit)\/[a-z0-9_]+(_l\d+)?(_(idle|producing|building|upgrading|damaged|hover|pressed|disabled))?$`

---

## 3. Compresión GPU (KTX2 + BasisU)

```bash
# Instalar
npm install -g @webgpu/basisu

# Comprimir atlas PNG a KTX2
basisu \
  -ktx2 \
  -uastc \
  -zstd 3 \
  -max_mipmaps \
  -info \
  assets/atlases/buildings.png \
  -output_path assets/atlases/

# Resultado: buildings.ktx2 (UASTC + Zstd)
# Tamaño típico: 15-25% del PNG original
```

### Formatos Objetivo

| Formato | Uso | Compresión | Browser Support |
|---------|-----|------------|-----------------|
| **KTX2 UASTC** | Calidad alta (UI, buildings) | ~30% PNG | Chrome 91+, Firefox 101+, Safari 15.4+ |
| **KTX2 ETC1S** | Partículas, VFX | ~15% PNG | Universal WebGL2 |
| **WebP Lossless** | Fallback | ~70% PNG | Todos |
| **PNG** | Dev/debug | 100% | Todos |

**Pipeline automático:**
```bash
# build:assets script
for atlas in buildings resources ui vfx; do
  texturepacker ... assets/atlases/$atlas.atlas.json assets/sprites/$atlas/
  basisu -ktx2 -uastc -zstd 3 assets/atlases/$atlas.png -output_path assets/atlases/
  # Generar WebP fallback
  cwebp -lossless assets/atlases/$atlas.png -o assets/atlases/$atlas.webp
done
```

---

## 4. Manifest & Versioning

`assets/manifest.json` (generado en build):

```json
{
  "version": "1.0.42",
  "generated": "2026-11-05T10:30:00Z",
  "atlases": {
    "buildings": {
      "json": "atlases/buildings.atlas.json",
      "ktx2": "atlases/buildings.ktx2",
      "webp": "atlases/buildings.webp",
      "checksum": "sha256:abc123...",
      "frameCount": 156,
      "maxSize": 2048
    },
    "resources": { ... },
    "ui": { ... },
    "vfx": { ... }
  },
  "sprites": {
    "particle_smoke": { "atlas": "vfx", "frame": "vfx/particle_smoke_01" }
  }
}
```

---

## 5. Runtime Loading (PixiJS v8)

```typescript
import { Assets } from 'pixi.js';

// En boot.ts
async function loadAtlases() {
  const manifest = await fetch('/assets/manifest.json').then(r => r.json());
  
  // Registrar alias para cada atlas
  for (const [name, data] of Object.entries(manifest.atlases)) {
    // PixiJS v8 detecta .ktx2 automáticamente
    Assets.add({ alias: name, src: `/assets/${data.ktx2}` });
    // Fallback automático a .webp si KTX2 no soportado
  }
  
  // Cargar todos en paralelo
  await Assets.load(Object.keys(manifest.atlases));
  
  // Acceder a texturas
  const buildingTexture = Assets.get('buildings').get('building/house_l1_idle');
}
```

### SpriteRef → Texture Mapping

```typescript
// En RenderSystem
function getTexture(entity: Entity): Texture {
  const sprite = spriteRef.get(world, entity);
  const atlas = Assets.get(AtlasIndex[sprite.atlas]); // 'buildings', 'resources', etc.
  return atlas.get(sprite.frame);
}
```

---

## 6. CDN Deployment

```
CDN/assets/v{buildNumber}/
├── manifest.json
├── atlases/
│   ├── buildings.atlas.json
│   ├── buildings.ktx2
│   ├── buildings.webp
│   ├── resources.atlas.json
│   └── ...
└── sprites/ (opcional, solo para debugging)
```

**Headers:**
- `Cache-Control: public, max-age=31536000, immutable` (atlases versionados)
- `Cache-Control: public, max-age=3600` (manifest.json)

---

## 7. Development Workflow

```bash
# 1. Añadir/editar sprites en assets/sprites/{category}/
# 2. Ejecutar build
pnpm build:assets

# 3. Verificar output
ls -la assets/atlases/

# 4. Test local
pnpm demo

# 5. Commit (assets/atlases/ y manifest.json van al repo)
git add assets/atlases/ assets/manifest.json
git commit -m "assets: update buildings atlas (house L3)"
```

**CI Pipeline (GitHub Actions):**
```yaml
- name: Build Assets
  run: |
    pnpm install
    pnpm build:assets
    # Verificar tamaños
    node scripts/check-atlas-sizes.js
    
- name: Upload to CDN
  if: github.ref == 'refs/heads/main'
  run: aws s3 sync assets/ s3://cdn-game/assets/v${{ github.sha }}/ --cache-control max-age=31536000
```

---

## 8. Budget & Limits

| Métrica | Límite | Acción si excede |
|---------|--------|------------------|
| Atlas max size | 2048×2048 | Split en múltiples atlases |
| Frames por atlas | ~200 | Nueva categoría/sub-atlas |
| Total VRAM (mobile) | ~100MB | Comprimir más, reducir resolución |
| Load time (3G) | < 3s | Priorizar atlases críticos, lazy-load resto |

**VRAM Estimado:**
- 1 atlas 2048² RGBA8 = 16MB
- KTX2 UASTC = ~5MB
- 4 atlases = ~20MB VRAM (safe para mobile mid-range)

---

## 9. Debugging Assets

```typescript
// En DevTools
window.__ASSET_DEBUG__ = {
  listAtlases: () => Object.keys(Assets.cache).filter(k => k.startsWith('atlases/')),
  inspectAtlas: (name) => Assets.get(name),
  dumpManifest: () => fetch('/assets/manifest.json').then(r => r.json()),
  checkMissing: () => {
    // Scan all SpriteRef components for missing frames
  },
};
```

---

## 10. Checklist Nuevo Asset

- [ ] Source en `assets/sprites/{category}/` (128×128 base, layers nombrados)
- [ ] Frame names siguen `category/object_variant_state`
- [ ] `pnpm build:assets` genera atlas + KTX2 + WebP
- [ ] `manifest.json` actualizado con checksums
- [ ] VRAM total < 100MB
- [ ] Test en mobile Safari/Chrome
- [ ] Commit `assets/atlases/` y `manifest.json`