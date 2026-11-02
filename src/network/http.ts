import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFile } from 'node:fs/promises';
import { rootCertificates, type ConnectionOptions } from 'node:tls';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { bypassProxy, configuredProxy, networkSettings, type NetworkSettings } from './settings';

export interface HttpRequest {
  url: URL; method: 'GET' | 'PUT'; headers: Record<string, string>; body?: Buffer;
  rejectUnauthorized: boolean; timeoutMs: number; maxResponseBytes: number;
  network?: NetworkSettings;
}
export interface HttpResponse { statusCode: number; headers: IncomingHttpHeaders; body: Buffer }
export class NetworkError extends Error {
  constructor(public readonly retryable: boolean, message: string) { super(message); }
}
export async function sendHttpRequest(options: HttpRequest): Promise<HttpResponse> {
  if (!['http:', 'https:'].includes(options.url.protocol) || options.url.username || options.url.password) throw new NetworkError(false, 'HTTP 目的網址無效。');
  const settings = options.network ?? networkSettings(options.url);
  let tls: ConnectionOptions = { rejectUnauthorized: options.rejectUnauthorized };
  try {
    if (settings.caFile) tls.ca = [...rootCertificates, await readFile(settings.caFile, 'utf8')];
    if (settings.certFile) tls.cert = await readFile(settings.certFile);
    if (settings.keyFile) tls.key = await readFile(settings.keyFile);
    if (settings.pfxFile) tls.pfx = await readFile(settings.pfxFile);
    tls.passphrase = settings.passphrase;
  } catch { throw new NetworkError(false, '無法讀取 Agent TLS 憑證設定。'); }
  const controller = new AbortController();
  const proxy = !bypassProxy(options.url, settings) ? configuredProxy(settings) : undefined;
  // CONNECT is also used for plain HTTP, matching Azure's tool-client behavior.
  // Supply auth through a header callback, keeping credentials out of debug URLs.
  let proxyAuthorization: string | undefined;
  if (proxy?.username || proxy?.password) {
    proxyAuthorization = `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64')}`;
    proxy.username = ''; proxy.password = '';
  }
  const agent = proxy ? new HttpsProxyAgent(proxy, { ...tls, rejectUnauthorized: true, signal: controller.signal,
    headers: () => proxyAuthorization ? { 'Proxy-Authorization': proxyAuthorization } : {} }) : undefined;
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => { clearTimeout(timer); agent?.destroy(); };
    const request = options.url.protocol === 'https:' ? httpsRequest : httpRequest;
    const pending = request(options.url, { method: options.method, headers: options.headers, ...tls, agent, signal: controller.signal }, response => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > options.maxResponseBytes) { cleanup(); reject(new NetworkError(false, 'HTTP 回應超過大小限制。')); controller.abort(); }
        else chunks.push(chunk);
      });
      response.on('end', () => { cleanup(); resolve({ statusCode: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }); });
      response.on('error', () => { cleanup(); reject(new NetworkError(true, 'HTTP 回應傳輸中斷。')); });
    });
    timer = setTimeout(() => { reject(new NetworkError(true, 'HTTP 請求逾時。')); controller.abort(); cleanup(); }, options.timeoutMs);
    pending.on('error', error => {
      cleanup();
      const code = (error as NodeJS.ErrnoException).code ?? '';
      const tlsError = /CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code);
      reject(new NetworkError(!tlsError, tlsError ? 'TLS 憑證驗證失敗。' : 'HTTP 連線失敗。'));
    });
    pending.end(options.body);
  });
}
export async function downloadBytes(address: string): Promise<Buffer> {
  let original: URL;
  try { original = new URL(address); } catch { throw new Error('工具下載網址無效。'); }
  for (let attempt = 0; attempt < 3; attempt++) {
    let url = original;
    try {
      for (let redirect = 0; redirect <= 5; redirect++) {
        const response = await sendHttpRequest({ url, method: 'GET', headers: {}, rejectUnauthorized: true, timeoutMs: 120_000, maxResponseBytes: 256 * 1024 * 1024 });
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          if (!response.headers.location || redirect === 5) throw new NetworkError(false, '工具下載重新導向超出限制。');
          const next = new URL(response.headers.location, url);
          if (url.protocol === 'https:' && next.protocol !== 'https:') throw new NetworkError(false, '拒絕將工具下載降級為非 HTTPS。');
          url = next; continue;
        }
        if (response.statusCode >= 200 && response.statusCode < 300) return response.body;
        throw new NetworkError([408, 429, 500, 502, 503, 504].includes(response.statusCode), '工具來源 HTTP 請求失敗。');
      }
    } catch (error) {
      if (attempt === 2 || error instanceof NetworkError && !error.retryable) throw new Error('工具下載失敗；請檢查 Agent 網路、Proxy 與憑證設定。');
    }
  }
  throw new Error('工具下載失敗。');
}
