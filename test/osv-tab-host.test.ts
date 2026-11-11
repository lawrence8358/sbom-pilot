import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

test('browser entry initializes host themes and reads attachments with Server-compatible authenticated Build requests', async () => {
  const compiled = await build({
    entryPoints: ['src/osv-tab/index.ts'],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    plugins: [
      {
        name: 'fake-host-sdk',
        setup(builder) {
          builder.onResolve({ filter: /^azure-devops-extension-sdk$/ }, () => ({
            path: 'sdk',
            namespace: 'host',
          }));
          builder.onLoad({ filter: /.*/, namespace: 'host' }, () => ({
            contents: `
        export const init = (...args) => globalThis.host.init(...args);
        export const getService = (...args) => globalThis.host.getService(...args);
        export const getAccessToken = async () => 'synthetic-host-token';
        export const notifyLoadSucceeded = () => globalThis.host.loaded();
      `,
          }));
        },
      },
    ],
  });
  const dom = new JSDOM('<main id="osv-report"></main>', {
    runScripts: 'outside-only',
    url: 'https://extension.test/',
  });
  const requests: { url: string; accept: string | null; auth: string | null }[] = [];
  const calls: unknown[] = [];
  let finish!: () => void;
  const loaded = new Promise<void>((resolve) => {
    finish = resolve;
  });
  Object.assign(dom.window, {
    TextDecoder,
    Headers,
    Response,
    host: {
      async init(options: unknown) {
        calls.push(options);
      },
      async getService(id: string) {
        if (id === 'ms.vss-build-web.build-page-data-service')
          return { getBuildPageData: () => ({ build: { id: 35 } }) };
        if (id === 'ms.vss-tfs-web.tfs-page-data-service')
          return { getProject: async () => ({ id: 'project-id' }) };
        if (id === 'ms.vss-features.location-service')
          return { getResourceAreaLocation: async () => 'https://server.test/tfs/collection/' };
        throw new Error(`Unexpected host service: ${id}`);
      },
      async loaded() {
        finish();
      },
    },
    async fetch(url: string, options: RequestInit) {
      const headers = new Headers(options.headers);
      requests.push({ url, accept: headers.get('Accept'), auth: headers.get('Authorization') });
      const attachmentUrl =
        'https://server.test/tfs/collection/project-id/_apis/build/builds/35/timeline-id/record-id/attachments/sbom-pilot.osv-report/report.json';
      if (url.endsWith('/attachments/sbom-pilot.osv-report'))
        return new Response(
          JSON.stringify([{ name: 'report.json', _links: { self: { href: attachmentUrl } } }]),
        );
      assert.equal(url, attachmentUrl);
      return new Response(
        JSON.stringify({
          schemaVersion: 1,
          generatedAt: '2026-11-11T00:00:00Z',
          exceeded: false,
          dtSkipped: false,
          sboms: { product: '產品.json', full: '完整.json' },
          product: { status: 'disabled', findings: [] },
          devExtra: { status: 'disabled', findings: [] },
        }),
      );
    },
  });
  dom.window.eval(compiled.outputFiles[0].text);
  await Promise.race([
    loaded,
    new Promise<void>((_, reject) => {
      const timer = setTimeout(() => reject(new Error('Host never notified of tab load')), 2000);
      timer.unref();
    }),
  ]);
  assert.deepEqual(
    calls.map((value) => JSON.parse(JSON.stringify(value))),
    [{ loaded: false, applyTheme: true }],
  );
  assert.equal(requests.length, 2);
  assert.equal(
    requests[0].url,
    'https://server.test/tfs/collection/project-id/_apis/build/builds/35/attachments/sbom-pilot.osv-report',
  );
  for (const request of requests) {
    assert.match(request.accept!, /api-version=7\.0-preview\.2/);
    assert.equal(request.auth, 'Bearer synthetic-host-token');
  }
  assert.match(requests[1].accept!, /application\/octet-stream/);
  assert.match(dom.window.document.body.textContent!, /本次未執行 OSV 弱點掃描/);
  dom.window.close();
});
