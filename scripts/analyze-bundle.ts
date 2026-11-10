#!/usr/bin/env node
// =========================================================================
// analyze-bundle.ts — Bundle Size Budget Gate (CI)
// Objetivo: Fail si el bundle JS inicial supera el budget (170 KB gzipped).
// Uso: `npm run analyze:bundle` en CI.
// =========================================================================

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';

// --- Configuración de Budgets ---
const BUDGETS = {
  main: { gzip: 170 * 1024, brotli: 145 * 1024 }, // bytes
  vendor: { gzip: 30 * 1024, brotli: 25 * 1024 },
  shared: { gzip: 15 * 1024, brotli: 12 * 1024 },
};

// --- Helpers ---
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

function compressBrotli(buffer: Buffer): Buffer {
  // Simulación Brotli (en prod usar compressSync de 'zlib' con brotli)
  return gzipSync(buffer); // fallback gzip para CI
}

function analyzeBundle(distDir: string): {
  passed: boolean;
  results: Array<{ name: string; gzip: number; brotli: number; budget: number; status: string }>;
  totalGzip: number;
  totalBrotli: number;
} {
  const results: Array<{
    name: string;
    gzip: number;
    brotli: number;
    budget: number;
    status: string;
  }> = [];
  let totalGzip = 0;
  let totalBrotli = 0;
  let allPassed = true;

  for (const [name, budget] of Object.entries(BUDGETS)) {
    const filePath = join(distDir, `${name}.js`);
    if (!existsSync(filePath)) {
      results.push({
        name,
        gzip: 0,
        brotli: 0,
        budget: budget.gzip,
        status: 'MISSING',
      });
      allPassed = false;
      continue;
    }

    const raw = readFileSync(filePath);
    const gzip = gzipSync(raw).length;
    const brotli = compressBrotli(raw).length;
    totalGzip += gzip;
    totalBrotli += brotli;

    const status = gzip <= budget.gzip ? 'PASS' : 'FAIL';
    if (status === 'FAIL') allPassed = false;

    results.push({
      name,
      gzip,
      brotli,
      budget: budget.gzip,
      status,
    });
  }

  return { passed: allPassed, results, totalGzip, totalBrotli };
}

// --- Main ---
const distDir = process.argv[2] || './dist';
const report = analyzeBundle(distDir);

// Generar reporte JSON
writeFileSync(
  join(distDir, 'bundle-report.json'),
  JSON.stringify(report, null, 2)
);

// Generar reporte HTML
const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Bundle Size Report</title>
  <style>
    body { font-family: -apple-system, sans-serif; margin: 20px; background: #1a1a2e; color: #e0e0e0; }
    table { border-collapse: collapse; width: 100%; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #333; }
    th { background: #16213e; }
    .PASS { color: #4caf50; font-weight: bold; }
    .FAIL { color: #f44336; font-weight: bold; }
    .MISSING { color: #ff9800; }
    .summary { font-size: 1.2em; margin: 10px 0; }
  </style>
</head>
<body>
  <h1>📦 Bundle Size Report</h1>
  <div class="summary">
    Total Gzip: <strong>${formatBytes(report.totalGzip)}</strong> |
    Total Brotli: <strong>${formatBytes(report.totalBrotli)}</strong> |
    Status: <strong class="${report.passed ? 'PASS' : 'FAIL'}">${report.passed ? '✅ PASS' : '❌ FAIL'}</strong>
  </div>
  <table>
    <tr><th>Bundle</th><th>Gzip</th><th>Brotli</th><th>Budget</th><th>Status</th></tr>
    ${report.results
      .map(
        (r) => `<tr>
          <td>${r.name}</td>
          <td>${formatBytes(r.gzip)}</td>
          <td>${formatBytes(r.brotli)}</td>
          <td>${formatBytes(r.budget)}</td>
          <td class="${r.status}">${r.status}</td>
        </tr>`
      )
      .join('')}
  </table>
</body>
</html>`;

writeFileSync(join(distDir, 'bundle-report.html'), html);

// --- Output ---
console.log('\n📊 Bundle Size Analysis');
console.log('='.repeat(50));
for (const r of report.results) {
  const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
  console.log(
    `${icon} ${r.name.padEnd(10)} Gzip: ${formatBytes(r.gzip).padEnd(8)} / Budget: ${formatBytes(r.budget).padEnd(8)} [${r.status}]`
  );
}
console.log('='.repeat(50));
console.log(`Total Gzip:  ${formatBytes(report.totalGzip)}`);
console.log(`Total Brotli: ${formatBytes(report.totalBrotli)}`);
console.log(`Status: ${report.passed ? '✅ PASS' : '❌ FAIL'}`);

if (!report.passed) {
  console.error('\n❌ Bundle size budget exceeded. Fix before merging.');
  process.exit(1);
} else {
  console.log('\n✅ All bundle budgets met.');
}