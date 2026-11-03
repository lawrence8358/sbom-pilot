import { readFile } from 'node:fs/promises';
import type { ValidatedSbom } from '../validation';
import { bomEndpoint, validateDtConfig, UUID, type DtConfig } from './config';
import { sendDtRequest, DtTransportError, type DtTransport } from './transport';

export interface DtUploadPolicy {
  timeoutMs: number;
  maxAttempts: number;
  retryDelayMs: number;
}
export interface DtUploadServices {
  transport?: DtTransport;
  policy?: Partial<DtUploadPolicy>;
  wait?: (ms: number) => Promise<void>;
}
const DEFAULT_POLICY: DtUploadPolicy = { timeoutMs: 30_000, maxAttempts: 3, retryDelayMs: 250 };
const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/** 上傳已驗證 SBOM 的相同位元組，依有限政策重試；接受 token 即完成，不等待背景分析。 */
export async function uploadToDependencyTrack(
  sbom: ValidatedSbom,
  input: DtConfig,
  log: (message: string) => void,
  services: DtUploadServices = {},
): Promise<void> {
  const config = validateDtConfig(input);
  const policy = { ...DEFAULT_POLICY, ...services.policy };
  if (
    !Number.isInteger(policy.maxAttempts) ||
    policy.maxAttempts < 1 ||
    policy.maxAttempts > 3 ||
    !Number.isFinite(policy.timeoutMs) ||
    policy.timeoutMs < 1 ||
    policy.timeoutMs > 30_000 ||
    !Number.isFinite(policy.retryDelayMs) ||
    policy.retryDelayMs < 0 ||
    policy.retryDelayMs > 2000
  ) {
    throw new Error('DT 網路政策超出允許界限。');
  }
  const body = Buffer.from(
    JSON.stringify({
      project: config.projectUuid,
      bom: (await readFile(sbom.path)).toString('base64'),
      autoCreate: false,
    }),
  );
  const transport = services.transport ?? sendDtRequest;
  /** 在可注入的重試等待點套用延遲，讓測試無須承受真實等待時間。 */
  const wait = services.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    let retryable = false;
    let failure = 'DT 上傳失敗。';
    try {
      const response = await transport({
        url: bomEndpoint(config),
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(body.length),
          'X-Api-Key': config.apiKey,
          Accept: 'application/json',
        },
        body,
        rejectUnauthorized: !config.skipTlsCertificateCheck,
        timeoutMs: policy.timeoutMs,
        maxResponseBytes: 64 * 1024,
      });
      if ([200, 201, 202].includes(response.statusCode)) {
        let token: unknown;
        try {
          token = JSON.parse(response.body.toString()).token;
        } catch {
          /* 下方使用固定且不含回應內容的診斷。 */
        }
        if (typeof token !== 'string' || !UUID.test(token)) {
          throw new DtTransportError(false, 'DT 回應未提供有效接受 token，無法確認已接受上傳。');
        }
        log('DT 已接受上傳；未等待背景匯入或弱點分析。');
        return;
      }
      retryable = RETRY_STATUSES.has(response.statusCode);
      failure = `DT 上傳收到 HTTP ${response.statusCode}；未顯示可能含秘密的回應內容。`;
    } catch (error) {
      // 只允許本模組已去識別的傳輸診斷；自訂傳輸不能直接轉出 URL、標頭或伺服器回應。
      if (error instanceof DtTransportError) {
        retryable = error.retryable;
        failure = error.message;
      } else {
        retryable = true;
        failure = 'DT 連線或傳輸失敗。';
      }
    }
    if (!retryable || attempt === policy.maxAttempts) {
      throw new Error(failure);
    }
    log(`DT 暫時無法接受上傳；準備重試 ${attempt + 1}/${policy.maxAttempts}。`);
    await wait(Math.min(2000, policy.retryDelayMs * attempt));
  }
}
