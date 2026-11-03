import type { IncomingHttpHeaders } from 'node:http';
import { sendHttpRequest, NetworkError } from '../network/http';
export interface DtRequest {
  url: URL;
  headers: Record<string, string>;
  body: Buffer;
  rejectUnauthorized: boolean;
  timeoutMs: number;
  maxResponseBytes: number;
}
export interface DtResponse {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}
export type DtTransport = (request: DtRequest) => Promise<DtResponse>;
export class DtTransportError extends Error {
  /** 保存已去識別的 DT 傳輸錯誤與可重試性，避免原始回應進入使用者日誌。 */
  constructor(
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message);
  }
}

// 沿用 Agent Proxy／CA／client certificate；DT 不跟隨重新導向，TLS 例外僅限該請求。
/** 透過共用 Agent Proxy／CA 傳送一次 DT PUT，TLS 例外只限本請求且不跟隨重新導向。 */
export const sendDtRequest: DtTransport = async (options) => {
  try {
    return await sendHttpRequest({ ...options, method: 'PUT' });
  } catch (error) {
    if (error instanceof NetworkError) {
      throw new DtTransportError(error.retryable, error.message.replace(/^HTTP/, 'DT'));
    }

    throw new DtTransportError(false, 'DT 網路設定無效。');
  }
};
