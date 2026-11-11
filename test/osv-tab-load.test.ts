import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadOsvTab, type OsvTabServices } from '../src/osv-tab/load';

const timeline = '11111111-1111-1111-1111-111111111111';
const record = '22222222-2222-2222-2222-222222222222';
const type = 'sbom-pilot.osv-report';
const name = 'OSV弱點報告.json';
const attachment = {
  name,
  _links: {
    self: {
      href: `https://server.test/tfs/collection/專案/_apis/build/builds/35/${timeline}/${record}/attachments/${type}/${encodeURIComponent(name)}`,
    },
  },
};
const report = {
  schemaVersion: 1,
  generatedAt: '2026-11-11T00:00:00+08:00',
  scannerVersion: '2.7.1',
  threshold: 'high',
  exceeded: false,
  dtSkipped: false,
  sboms: { product: 'sbom.cdx.json', full: 'sbom.cdx-full.json' },
  product: { status: 'completed', findings: [] },
  developmentExtra: { status: 'completed', findings: [] },
};

test('tab reads this build attachment through the Build client and decodes UTF-8', async () => {
  const root = new JSDOM('<main></main>').window.document.querySelector('main')!;
  const calls: unknown[] = [];
  const services: OsvTabServices = {
    async initialize() {
      return { project: '專案', buildId: 35 };
    },
    async loaded() {
      calls.push('loaded');
    },
    client: {
      async getAttachments(...args) {
        calls.push(args);
        return [attachment];
      },
      async getAttachment(...args) {
        calls.push(args);
        return new TextEncoder().encode(JSON.stringify(report)).buffer;
      },
    },
  };
  await loadOsvTab(root, services);
  assert.deepEqual(calls, [
    ['專案', 35, type],
    ['專案', 35, timeline, record, type, name],
    'loaded',
  ]);
  assert.match(root.textContent!, /OSV 弱點報告.*未超過失敗門檻.*高/);
  assert.match(root.textContent!, /一、產品 SBOM 弱點/);
  assert.match(root.textContent!, /二、開發套件額外弱點/);
  assert.doesNotMatch(root.textContent!, /�/);
});

test('missing attachments, permissions, malformed data and wrong-build links show actionable errors', async () => {
  for (const scenario of ['missing', 'forbidden', 'json', 'utf8', 'wrong-build', 'context']) {
    const root = new JSDOM('<main></main>').window.document.querySelector('main')!;
    let loaded = false;
    let downloads = 0;
    await loadOsvTab(root, {
      async initialize() {
        return { project: '專案', buildId: scenario === 'context' ? 0 : 35 };
      },
      async loaded() {
        loaded = true;
      },
      client: {
        async getAttachments() {
          if (scenario === 'forbidden') throw new Error('403 <img src=x> secret response');
          return scenario === 'missing'
            ? []
            : [
                {
                  ...attachment,
                  _links: {
                    self: {
                      href: attachment._links.self.href.replace(
                        '/35/',
                        scenario === 'wrong-build' ? '/999/' : '/35/',
                      ),
                    },
                  },
                },
              ];
        },
        async getAttachment() {
          downloads++;
          return scenario === 'utf8'
            ? new Uint8Array([0xff]).buffer
            : new TextEncoder().encode('{broken').buffer;
        },
      },
    });
    assert.equal(loaded, true, scenario);
    assert.match(
      root.querySelector('[role="alert"]')?.textContent ?? '',
      /找不到.*附件|無法讀取|無法載入|格式不正確|建置資訊/,
    );
    assert.equal(root.querySelector('img'), null);
    assert.equal(root.querySelector('table'), null);
    assert.doesNotMatch(root.textContent!, /secret response|未達到|未超過失敗門檻/);
    if (scenario === 'wrong-build' || scenario === 'context') assert.equal(downloads, 0);
  }
});

test('multiple task attachments remain visible even when one report cannot be decoded', async () => {
  const root = new JSDOM('<main></main>').window.document.querySelector('main')!;
  const second = {
    name: 'second.json',
    _links: {
      self: { href: attachment._links.self.href.replace(encodeURIComponent(name), 'second.json') },
    },
  };
  await loadOsvTab(root, {
    async initialize() {
      return { project: '專案', buildId: 35 };
    },
    async loaded() {},
    client: {
      async getAttachments() {
        return [attachment, second];
      },
      async getAttachment(_project, _build, _timeline, _record, _type, attachmentName) {
        return new TextEncoder().encode(
          attachmentName === name ? '{broken' : JSON.stringify(report),
        ).buffer;
      },
    },
  });
  assert.equal(root.querySelectorAll('article').length, 2);
  assert.equal(root.querySelectorAll('[role="alert"]').length, 1);
  assert.match(root.textContent!, /未超過失敗門檻.*高/);
});
