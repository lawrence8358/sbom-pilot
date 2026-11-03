export interface DtConfig {
  apiUrl: string;
  projectUuid: string;
  apiKey: string;
  skipTlsCertificateCheck: boolean;
}
export const DEFAULT_DT_URL = 'http://localhost:8081';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 驗證既有 DT 專案 UUID、服務 URL、API Key 與 TLS 選項，拒絕無法安全上傳的設定。 */
export function validateDtConfig(config: DtConfig | undefined): DtConfig {
  if (!config) {
    throw new Error('啟用 DT 時必須提供 DT 連線設定。');
  }

  let url: URL;

  try {
    url = new URL(config.apiUrl);
  } catch {
    throw new Error('DT API URL 必須是有效的 HTTP(S) 服務根網址。');
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('DT API URL 僅接受 HTTP(S) 服務根網址，不可包含認證、查詢或 fragment。');
  }
  if (!UUID.test(config.projectUuid)) {
    throw new Error('DT Project UUID 必須是既有專案的有效 UUID。');
  }
  if (
    typeof config.apiKey !== 'string' ||
    !config.apiKey.trim() ||
    /[\r\n\0]/.test(config.apiKey)
  ) {
    throw new Error('啟用 DT 時必須提供有效的 DT API Key。');
  }
  if (typeof config.skipTlsCertificateCheck !== 'boolean') {
    throw new Error('略過 DT TLS 憑證檢查必須是布林值。');
  }

  return { ...config, apiUrl: url.toString().replace(/\/$/, '') };
}

/** 保留服務根網址的反向代理路徑並附加 BOM API 路徑。 */
export function bomEndpoint(config: DtConfig): URL {
  return new URL(`${config.apiUrl.replace(/\/$/, '')}/api/v1/bom`);
}
