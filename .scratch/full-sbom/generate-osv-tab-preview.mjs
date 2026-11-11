import { readFile, writeFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// 只讀取已核可的本機設計稿資料，轉成既有報告契約。
const design = await readFile('.scratch/full-sbom/osv-tab-design.dc.html', 'utf8');
const samples = runInNewContext(`${design.slice(design.indexOf('var PRODUCT ='), design.indexOf('var COLS ='))}; ({ PRODUCT, DEV })`);
const findings = (rows) => rows.map((row) => ({
  severity: row.sev, score: row.score ?? undefined, name: row.name,
  ecosystem: row.eco, version: row.ver, fixed: row.fix ? [row.fix] : [],
  cves: row.cves, ids: row.ghsa, published: row.pub, modified: row.mod,
}));
const compiled = await build({ entryPoints: ['src/osv-tab/render.ts'], bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'OsvPreview' });
const dom = new JSDOM('<!doctype html><html lang="zh-Hant" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>OSV 弱點報告預覽</title></head><body><main id="osv-report"></main></body></html>', { runScripts: 'outside-only' });
const style = dom.window.document.createElement('style');
style.textContent = await readFile('dist/osv-tab/styles.css', 'utf8');
dom.window.document.head.append(style);
dom.window.eval(`${compiled.outputFiles[0].text}\nglobalThis.OsvPreview = OsvPreview;`);
dom.window.OsvPreview.renderOsvReport(dom.window.document.querySelector('main'), {
  schemaVersion: 1, generatedAt: '2026-11-11T06:30:00Z', scannerVersion: '2.7.1',
  threshold: 'unknown', exceeded: true, dtSkipped: false,
  sboms: { product: 'sbom.cdx.json', full: 'sbom.cdx-full.json' },
  product: { status: 'completed', findings: findings(samples.PRODUCT) },
  developmentExtra: { status: 'completed', findings: findings(samples.DEV) },
});
const note = dom.window.document.createElement('span');
note.className = 'metadata';
note.textContent = '範例資料，非真實弱點';
dom.window.document.querySelector('.verdict').append(note);
const path = 'D:/Project/Git/.sbom-pilot-notes/full-sbom/live/osv-tab-preview.html';
await writeFile(path, dom.serialize());
console.log(`${path}: ${samples.PRODUCT.length} product + ${samples.DEV.length} development; static HTML, embedded dist CSS`);
dom.window.close();
