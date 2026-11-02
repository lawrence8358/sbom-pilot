import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';

export interface DtRequest {
  url: URL;
  headers: Record<string, string>;
  body: Buffer;
  rejectUnauthorized: boolean;
  timeoutMs: number;
  maxResponseBytes: number;
}
export interface DtResponse { statusCode: number; headers: IncomingHttpHeaders; body: Buffer }
export type DtTransport = (request: DtRequest) => Promise<DtResponse>;
export class DtTransportError extends Error {
  constructor(public readonly retryable: boolean, message: string) { super(message); }
}

// No redirects, global TLS mutation, request logging or untrusted exception text.
// Proxy/CA support may inject a transport using the same bounded contract.
export const sendDtRequest: DtTransport = options => new Promise((resolve, reject) => {
  const request = options.url.protocol === 'https:' ? httpsRequest : httpRequest;
  let timer: ReturnType<typeof setTimeout>;
  const pending = request(options.url, { method: 'PUT', headers: options.headers, rejectUnauthorized: options.rejectUnauthorized }, response => {
    const chunks: Buffer[] = [];
    let size = 0;
    response.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > options.maxResponseBytes) {
        clearTimeout(timer);
        reject(new DtTransportError(false, 'DT 回應超過大小限制。'));
        pending.destroy();
      } else chunks.push(chunk);
    });
    response.on('end', () => {
      clearTimeout(timer);
      resolve({ statusCode: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) });
    });
    response.on('error', () => {
      clearTimeout(timer);
      reject(new DtTransportError(true, 'DT 回應傳輸中斷。'));
    });
  });
  timer = setTimeout(() => pending.destroy(new DtTransportError(true, 'DT 請求逾時。')), options.timeoutMs);
  pending.on('error', error => {
    clearTimeout(timer);
    if (error instanceof DtTransportError) reject(error);
    else {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      const tlsError = /CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code);
      reject(new DtTransportError(!tlsError, tlsError ? 'DT TLS 憑證驗證失敗。' : 'DT 連線失敗。'));
    }
  });
  pending.end(options.body);
});
