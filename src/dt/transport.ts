import type { IncomingHttpHeaders } from 'node:http';
import { sendHttpRequest, NetworkError } from '../network/http';
export interface DtRequest {
  url: URL; headers: Record<string, string>; body: Buffer;
  rejectUnauthorized: boolean; timeoutMs: number; maxResponseBytes: number;
}
export interface DtResponse { statusCode: number; headers: IncomingHttpHeaders; body: Buffer }
export type DtTransport = (request: DtRequest) => Promise<DtResponse>;
export class DtTransportError extends Error {
  constructor(public readonly retryable: boolean, message: string) { super(message); }
}
// Agent Proxy/CA/client certificates apply; DT requests never redirect and its
// TLS exception remains per request rather than changing process-wide policy.
export const sendDtRequest: DtTransport = async options => {
  try { return await sendHttpRequest({ ...options, method: 'PUT' }); }
  catch (error) {
    if (error instanceof NetworkError) throw new DtTransportError(error.retryable, error.message.replace(/^HTTP/, 'DT'));
    throw new DtTransportError(false, 'DT 網路設定無效。');
  }
};
