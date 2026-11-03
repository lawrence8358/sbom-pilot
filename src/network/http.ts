import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFile } from 'node:fs/promises';
import { rootCertificates, type ConnectionOptions } from 'node:tls';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { bypassProxy, configuredProxy, networkSettings, type NetworkSettings } from './settings';

export interface HttpRequest {
  url: URL;
  method: 'GET' | 'PUT';
  headers: Record<string, string>;
  body?: Buffer;
  rejectUnauthorized: boolean;
  timeoutMs: number;
  maxResponseBytes: number;
  network?: NetworkSettings;
}
export interface HttpResponse {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}
export class NetworkError extends Error {
  /** 保存安全網路診斷與可重試性，讓上層不用暴露原始連線錯誤。 */
  constructor(
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message);
  }
}

/** 讀取 Agent CA／client certificate 並保留系統根憑證，失敗不轉印敏感檔案內容。 */
async function tlsOptions(
  settings: NetworkSettings,
  rejectUnauthorized: boolean,
): Promise<ConnectionOptions> {
  const tls: ConnectionOptions = { rejectUnauthorized };

  try {
    if (settings.caFile) {
      tls.ca = [...rootCertificates, await readFile(settings.caFile, 'utf8')];
    }
    if (settings.certFile) {
      tls.cert = await readFile(settings.certFile);
    }
    if (settings.keyFile) {
      tls.key = await readFile(settings.keyFile);
    }
    if (settings.pfxFile) {
      tls.pfx = await readFile(settings.pfxFile);
    }

    tls.passphrase = settings.passphrase;
  } catch {
    throw new NetworkError(false, '無法讀取 Agent TLS 憑證設定。');
  }

  return tls;
}

/** 建立遵循 bypass 的 CONNECT 代理，認證只放 callback header，代理 TLS 驗證不被 DT 例外放寬。 */
function proxyAgent(
  url: URL,
  settings: NetworkSettings,
  tls: ConnectionOptions,
  signal: AbortSignal,
): HttpsProxyAgent<string> | undefined {
  const proxy = !bypassProxy(url, settings) ? configuredProxy(settings) : undefined;
  // HTTP 也使用 CONNECT；認證只透過 header callback，避免出現在 debug URL。
  let authorization: string | undefined;

  if (proxy?.username || proxy?.password) {
    authorization = `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64')}`;
    proxy.username = '';
    proxy.password = '';
  }

  return proxy
    ? new HttpsProxyAgent(proxy, {
        ...tls,
        rejectUnauthorized: true,
        signal,

        /** 在代理請求建立時才提供 Basic 認證標頭，使含帳密的 URL 不進入 debug 輸出。 */
        headers: () => (authorization ? { 'Proxy-Authorization': authorization } : {}),
      })
    : undefined;
}

/** 限制回應大小並同步回報結果；超限先判定錯誤再中止請求，保留正確的失敗優先序。 */
function collectResponse(
  response: IncomingMessage,
  maxBytes: number,
  controller: AbortController,
  resolve: (response: HttpResponse) => void,
  reject: (error: NetworkError) => void,
): void {
  const chunks: Buffer[] = [];
  let size = 0;

  response.on('data', (chunk: Buffer) => {
    size += chunk.length;

    if (size > maxBytes) {
      reject(new NetworkError(false, 'HTTP 回應超過大小限制。'));
      controller.abort();
    } else {
      chunks.push(chunk);
    }
  });
  response.on('end', () =>
    resolve({
      statusCode: response.statusCode ?? 0,
      headers: response.headers,
      body: Buffer.concat(chunks),
    }),
  );
  response.on('error', () => reject(new NetworkError(true, 'HTTP 回應傳輸中斷。')));
}

/** 將連線錯誤碼轉成安全診斷，憑證錯誤不可重試，其餘交由有限重試政策處理。 */
function connectionError(error: NodeJS.ErrnoException): NetworkError {
  const tlsError = /CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/.test(error.code ?? '');

  return new NetworkError(!tlsError, tlsError ? 'TLS 憑證驗證失敗。' : 'HTTP 連線失敗。');
}

/** 送出單次有界 HTTP 請求，集中在 finally 清除 timer／代理連線，不改全域 TLS。 */
export async function sendHttpRequest(options: HttpRequest): Promise<HttpResponse> {
  if (
    !['http:', 'https:'].includes(options.url.protocol) ||
    options.url.username ||
    options.url.password
  ) {
    throw new NetworkError(false, 'HTTP 目的網址無效。');
  }

  const settings = options.network ?? networkSettings(options.url);
  const tls = await tlsOptions(settings, options.rejectUnauthorized);
  const controller = new AbortController();
  const agent = proxyAgent(options.url, settings, tls, controller.signal);
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await new Promise<HttpResponse>((resolve, reject) => {
      /** 依目的協定選擇 Node 原生傳輸函式，讓共用生命週期處理 HTTP 與 HTTPS。 */
      const request = options.url.protocol === 'https:' ? httpsRequest : httpRequest;
      const pending = request(
        options.url,
        {
          method: options.method,
          headers: options.headers,
          ...tls,
          agent,
          signal: controller.signal,
        },
        (response) => {
          collectResponse(response, options.maxResponseBytes, controller, resolve, reject);
        },
      );

      timer = setTimeout(() => {
        reject(new NetworkError(true, 'HTTP 請求逾時。'));
        controller.abort();
      }, options.timeoutMs);
      pending.on('error', (error) => reject(connectionError(error)));
      pending.end(options.body);
    });
  } finally {
    clearTimeout(timer);
    agent?.destroy();
  }
}

/** 執行一次下載及最多五次重新導向，禁止 HTTPS 降級並分類可重試 HTTP 狀態。 */
async function downloadAttempt(original: URL, request: typeof sendHttpRequest): Promise<Buffer> {
  let url = original;

  for (let redirect = 0; redirect <= 5; redirect++) {
    const response = await request({
      url,
      method: 'GET',
      headers: {},
      rejectUnauthorized: true,
      timeoutMs: 120_000,
      maxResponseBytes: 256 * 1024 * 1024,
    });

    if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
      if (!response.headers.location || redirect === 5) {
        throw new NetworkError(false, '工具下載重新導向超出限制。');
      }

      const next = new URL(response.headers.location, url);

      if (url.protocol === 'https:' && next.protocol !== 'https:') {
        throw new NetworkError(false, '拒絕將工具下載降級為非 HTTPS。');
      }

      url = next;
      continue;
    }
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return response.body;
    }

    throw new NetworkError(
      [408, 429, 500, 502, 503, 504].includes(response.statusCode),
      '工具來源 HTTP 請求失敗。',
    );
  }

  throw new NetworkError(false, '工具下載重新導向超出限制。');
}

/** 解析工具網址並執行最多三次下載嘗試，最後只回報不含秘密的網路提示。 */
export async function downloadBytes(address: string, request = sendHttpRequest): Promise<Buffer> {
  let original: URL;

  try {
    original = new URL(address);
  } catch {
    throw new Error('工具下載網址無效。');
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await downloadAttempt(original, request);
    } catch (error) {
      if (attempt === 2 || (error instanceof NetworkError && !error.retryable)) {
        throw new Error('工具下載失敗；請檢查 Agent 網路、Proxy 與憑證設定。');
      }
    }
  }

  throw new Error('工具下載失敗。');
}
