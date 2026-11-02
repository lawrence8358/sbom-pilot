import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as httpServer, type Server, type RequestListener } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { connect, type Socket } from 'node:net';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sendHttpRequest, downloadBytes } from '../src/network/http';
import { networkSettings, bypassProxy, childNetworkEnvironment } from '../src/network/settings';

const certFile = resolve('test/fixtures/localhost.cert.pem');
async function listen(server: Server, action: (url: string) => Promise<void>, secure = false) {
  const sockets = new Set<Socket>();
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try { await action(`${secure ? 'https' : 'http'}://127.0.0.1:${address.port}`); }
  finally { sockets.forEach(socket => socket.destroy()); await new Promise<void>(resolve => server.close(() => resolve())); }
}
const get = (url: string, network = {}, rejectUnauthorized = true) => sendHttpRequest({ url: new URL(url), method: 'GET', headers: {}, rejectUnauthorized, timeoutMs: 500, maxResponseBytes: 1024, network });
test('native HTTP CONNECT proxy carries auth only to proxy; regex and NO_PROXY bypass work', async () => {
  let tunnels = 0;
  const proxy = httpServer();
  proxy.on('connect', (request, client, head) => {
    tunnels++;
    assert.equal(request.headers['proxy-authorization'], `Basic ${Buffer.from('user:synthetic-password').toString('base64')}`);
    const address = new URL(`http://${request.url}`);
    const upstream = connect(Number(address.port), address.hostname, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      client.pipe(upstream); upstream.pipe(client);
    });
    upstream.on('error', () => client.destroy()); client.on('close', () => upstream.destroy());
  });
  const handler: RequestListener = (request, response) => { assert.equal(request.headers['proxy-authorization'], undefined); response.end('download'); };
  await listen(httpServer(handler), async target => listen(proxy, async proxyUrl => {
    const settings = { proxyUrl, proxyUsername: 'user', proxyPassword: 'synthetic-password' };
    assert.equal((await get(target, settings)).body.toString(), 'download');
    assert.equal(tunnels, 1);
    await get(target, { ...settings, bypassPatterns: ['^http://127\\.0\\.0\\.1:'] });
    await get(target, { ...settings, noProxy: 'localhost,127.0.0.1' });
    assert.equal(tunnels, 1);
  }));
});
test('native custom CA validates HTTPS directly and through proxy without global TLS changes', async () => {
  const cert = await readFile(certFile); const key = await readFile('test/fixtures/localhost.key.pem');
  const proxy = httpServer();
  proxy.on('connect', (request, client, head) => {
    const address = new URL(`http://${request.url}`);
    const upstream = connect(Number(address.port), address.hostname, () => { client.write('HTTP/1.1 200 OK\r\n\r\n'); if (head.length) upstream.write(head); client.pipe(upstream); upstream.pipe(client); });
    upstream.on('error', () => client.destroy()); client.on('close', () => upstream.destroy());
  });
  const before = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  await listen(httpsServer({ key, cert }, (_request, response) => response.end('trusted')), async target => {
    await assert.rejects(get(target), /TLS 憑證/);
    assert.equal((await get(target, { caFile: certFile })).body.toString(), 'trusted');
    await listen(proxy, async proxyUrl => {
      assert.equal((await get(target, { proxyUrl, caFile: certFile })).body.toString(), 'trusted');
      await assert.rejects(get(target, { proxyUrl }), /TLS 憑證/);
      assert.equal((await get(target, { proxyUrl }, false)).body.toString(), 'trusted');
    });
    const secureProxy = httpsServer({ key, cert });
    await listen(secureProxy, async proxyUrl => {
      // A DT target exception must never disable TLS verification of the proxy.
      await assert.rejects(get(target, { proxyUrl }, false), /TLS 憑證/);
    }, true);
    await assert.rejects(get(target), /TLS 憑證/);
  }, true);
  assert.equal(process.env.NODE_TLS_REJECT_UNAUTHORIZED, before);
});
test('proxy CONNECT stall is aborted by the total request timer', async () => {
  const proxy = httpServer(); proxy.on('connect', () => {});
  const start = Date.now();
  await listen(proxy, async proxyUrl => {
    await assert.rejects(sendHttpRequest({ url: new URL('https://127.0.0.1:1'), method: 'GET', headers: {}, rejectUnauthorized: true, timeoutMs: 40, maxResponseBytes: 1024, network: { proxyUrl } }), /逾時/);
  });
  assert.ok(Date.now() - start < 1500);
});
test('download redirects are bounded and HTTPS downgrade is refused', async () => {
  let loops = 0;
  await listen(httpServer((request, response) => {
    if (request.url === '/redirect') response.writeHead(302, { Location: '/file' }).end();
    else if (request.url === '/loop') { loops++; response.writeHead(302, { Location: '/loop' }).end(); }
    else response.end('artifact');
  }), async url => {
    assert.equal((await downloadBytes(`${url}/redirect`)).toString(), 'artifact');
    await assert.rejects(downloadBytes(`${url}/loop`), /下載失敗/);
  });
  assert.equal(loops, 6);
  await assert.rejects(downloadBytes('https://example.invalid', async () => ({ statusCode: 302, headers: { location: 'http://example.invalid' }, body: Buffer.alloc(0) })), /下載失敗/);
});
test('child proxy and CA environment preserves tool settings and never sets global TLS skip', async () => {
  const root = await mkdtemp(join(tmpdir(), 'network-env-'));
  try {
    const input = { AGENT_PROXYURL: 'http://proxy.invalid:3128', AGENT_PROXYUSERNAME: 'user', AGENT_PROXYPASSWORD: 'p@ss?', AGENT_CAINFO: certFile, NO_PROXY: 'localhost', npm_config_registry: 'https://registry.invalid', SSL_CERT_FILE: 'existing-ca.pem' };
    const output = await childNetworkEnvironment(input, root);
    const proxy = new URL(output.https_proxy!);
    assert.equal(decodeURIComponent(proxy.password), 'p@ss?');
    assert.equal(output.NO_PROXY, 'localhost'); assert.equal(output.npm_config_registry, input.npm_config_registry);
    assert.equal(output.SSL_CERT_FILE, 'existing-ca.pem'); assert.equal(output.NODE_TLS_REJECT_UNAUTHORIZED, undefined);
    assert.ok((await readFile(output.NODE_EXTRA_CA_CERTS!, 'utf8')).includes((await readFile(certFile, 'utf8')).trim()));
    assert.equal(input.SSL_CERT_FILE, 'existing-ca.pem');
  } finally { await rm(root, { recursive: true, force: true }); }
  assert.equal(bypassProxy(new URL('https://registry.example.invalid'), { noProxy: '.example.invalid' }), true);
  assert.throws(() => networkSettings(new URL('https://host'), { AGENT_PROXYBYPASSLIST: 'invalid' }), /bypass/);
});
