import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import extension from '../vss-extension.json';
import task from '../src/task.json';
import { OSV_TAB_CONTRIBUTION_ID } from '../src/shared/osv-tab-contract';

test('extension exposes the OSV tab only for the SBOM Pilot task and requests build read access', () => {
  const manifest = JSON.parse(JSON.stringify(extension));
  const tab = manifest.contributions.find(
    (item: { id: string }) => item.id === OSV_TAB_CONTRIBUTION_ID,
  );
  assert.ok(tab, 'OSV report tab contribution is required');
  assert.equal(tab.type, 'ms.vss-build-web.build-results-tab');
  assert.deepEqual(tab.targets, ['ms.vss-build-web.build-results-view']);
  assert.equal(tab.properties.name, 'OSV 弱點報告');
  assert.deepEqual(tab.properties.supportsTasks, [task.id]);
  assert.equal(tab.properties.uri, 'dist/osv-tab/index.html');
  assert.deepEqual(manifest.scopes, ['vso.build']);
  assert.ok(
    manifest.files.some(
      (file: { path: string; addressable?: boolean }) =>
        file.path === 'dist/osv-tab' && file.addressable,
    ),
  );
});

test('tab HTML uses UTF-8, local assets and host theme variables with table focus and hover affordances', () => {
  const document = new JSDOM(readFileSync('src/osv-tab/index.html', 'utf8')).window.document;
  assert.equal(document.documentElement.lang, 'zh-Hant');
  assert.equal(document.querySelector('meta[charset]')?.getAttribute('charset'), 'utf-8');
  assert.ok(document.querySelector('main#osv-report'));
  assert.equal(document.querySelector('script')?.getAttribute('src'), 'index.js');
  assert.equal(
    document.querySelector('link[rel="stylesheet"]')?.getAttribute('href'),
    'styles.css',
  );
  const css = readFileSync('src/osv-tab/styles.css', 'utf8');
  assert.match(css, /var\(--background-color,\s*[^)]+\)/);
  assert.match(css, /var\(--text-primary-color,\s*[^)]+\)/);
  assert.match(css, /tbody tr:hover/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /border-collapse:\s*collapse/);
});
