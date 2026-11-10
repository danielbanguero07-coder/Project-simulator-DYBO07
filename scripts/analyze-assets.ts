#!/usr/bin/env node
// =========================================================================
// analyze-assets.ts — Asset Pipeline Budget Gate (CI)
// Objetivo: Validar que los assets (texturas, atlas, models) cumplan con los
// límites de compresión y formatos modernos (KTX2, WebP, Draco).
// Uso: `npm run analyze:assets` en CI.
// =========================================================================

import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';

// --- Configuración de Budgets ---
const BUDGETS = {
  textures: { maxBytes: 450 * 1024, allowedFormats: ['.ktx2', '.webp', '.png'] },
  models: { maxBytes: 200 * 1024, allowedFormats: ['.gltf', '.glb'] },
  audio: { maxBytes: 100 * 1024, allowedFormats: ['.mp3', '.ogg', '.wav'] },
  fonts: { maxBytes: 40 * 1024, allowedFormats: ['.woff2', '.ttf'] },
};

const TOTAL_BUDGET = 850 * 1024; // 850 KB total inicial

// --- Helpers ---
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

function categorize(filePath: string): keyof typeof BUDGETS | null {
  const ext = extname(filePath).toLowerCase();
  if (['.ktx2', '.webp', '.png', '.jpg', '.jpeg', '.avif'].includes(ext)) return 'textures';
  if (['.gltf', '.glb', '.gltf-bin'].includes(ext)) return 'models';
  if (['.mp3', '.ogg', '.wav', '.m4a'].includes(ext)) return 'audio';
  if (['.woff2', '.woff', '.ttf', '.otf'].includes(ext)) return 'fonts';
  return null;
}

function analyzeAssets(assetsDir: string): {
  passed: boolean;
  results: Array<{
    file: string;
    category: string;
    size: number;
    format: string;
    status: string;
  }>;
  totalSize: number;
  warnings: string[];
} {
  const results: Array<{
    file: string;
    category: string;
    size: number;
    format: string;
    status: string;
  }> = [];
  const warnings: string[] = [];
  let totalSize = 0;
  let allPassed = true;

  function scan(dir: string) {
    const entries = existsSync(dir) ? require('fs').readdirSync(dir, { withFileTypes: true }) : [];
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.isFile()) {
        const category = categorize(fullPath);
        if (!category) continue;

        const budget = BUDGETS[category];
        const size = statSync(fullPath).size;
        const ext = extname(fullPath).toLowerCase();
        totalSize += size;

        let status = 'PASS';
        if (!budget.allowedFormats.includes(ext)) {
          status = 'WARN_FORMAT';
          warnings.push(`${entry.name}: formato ${ext} no recomendado. Use ${budget.allowedFormats.join(', ')}.`);
        }
        if (size > budget.maxBytes) {
          status = 'FAIL_SIZE';
          allPassed = false;
        }

        results.push({
          file: fullPath.replace(assetsDir, '').replace(/^\//, ''),
          category,
          size,
          format: ext,
          status,
        });
      }
    }
  }

  scan(assetsDir);

  // Total budget check
  if (totalSize > TOTAL_BUDGET) {
    allPassed = false;
    warnings.push(`Total assets size ${formatBytes(totalSize)} exceeds budget ${formatBytes(TOTAL_BUDGET)}.`);
  }

  return { passed: allPassed, results, totalSize, warnings };
}

// --- Main ---
const assetsDir = process.argv[2] || './public/assets';
const report = analyzeAssets(assetsDir);

// Generar reporte JSON
writeFileSync(
  join(assetsDir, '..', 'asset-report.json'),
  JSON.stringify(report, null, 2)
);

// --- Output ---
console.log('\n🖼️ Asset Pipeline Analysis');
console.log('='.repeat(60));
console.log(`Total Assets Size: ${formatBytes(report.totalSize)} / Budget: ${formatBytes(TOTAL_BUDGET)}`);
console.log('='.repeat(60));

for (const r of report.results) {
  const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL_SIZE' ? '❌' : '⚠️';
  console.log(
    `${icon} ${r.file.padEnd(50)} ${formatBytes(r.size).padEnd(8)} [${r.category}] ${r.format} ${r.status}`
  );
}

if (report.warnings.length > 0) {
  console.log('\n⚠️  Warnings:');
  for (const w of report.warnings) {
    console.log(`   - ${w}`);
  }
}

console.log('='.repeat(60));
console.log(`Status: ${report.passed ? '✅ PASS' : '❌ FAIL'}`);

if (!report.passed) {
  console.error('\n❌ Asset budget exceeded. Optimize before merging.');
  process.exit(1);
} else {
  console.log('\n✅ All asset budgets met.');
}