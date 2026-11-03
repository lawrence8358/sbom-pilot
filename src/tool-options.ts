import { intersects, major, prerelease, valid, validRange, satisfies } from 'semver';

export const CDXGEN_VERSION = '13.6.0';
export const SUPPORTED_SPEC_VERSIONS = ['1.6'] as const;

/** 在下載前驗證 Node 範圍與 cdxgen 精確版本，限制已支援的穩定版主版本。 */
export function validateToolOptions(nodeRange: string, cdxgenVersion: string): void {
  if (!validRange(nodeRange) || !intersects(nodeRange, '>=24')) {
    throw new Error('Node.js 版本必須是與 >=24 相容的 semver 範圍。');
  }
  if (
    valid(cdxgenVersion) !== cdxgenVersion ||
    major(cdxgenVersion) !== 13 ||
    prerelease(cdxgenVersion)
  ) {
    throw new Error(
      '此版本僅支援 @cdxgen/cdxgen 13.x 的穩定精確版本覆寫，例如 13.6.0；不支援舊套件名稱或其他 major。',
    );
  }
}

/** 核對實際套件版本與 Node engines，拒絕安裝後版本或執行環境不相容。 */
export function validateCdxgenPackage(
  pkg: { version?: unknown; engines?: { node?: unknown } },
  expected: string,
  nodeVersion: string,
): void {
  const range = pkg.engines?.node;

  if (
    pkg.version !== expected ||
    typeof range !== 'string' ||
    !validRange(range) ||
    !satisfies(nodeVersion, range)
  ) {
    throw new Error('cdxgen 套件實際版本或 Node.js engines 不相容。');
  }
}

/** 從實際 CLI 回應取得版本，無法辨識時明確失敗而不猜測。 */
export function parseCdxgenVersion(output: string): string | undefined {
  const text = output.replace(/\u001b\[[0-9;]*m/g, '').trim();
  const version = text.match(
    /^(?:CycloneDX Generator\s+)?(\d+\.\d+\.\d+(?:-[\w.-]+)?)(?:\r?\n|$)/,
  )?.[1];

  return version && valid(version) ? version : undefined;
}

/** 確認安裝的 CLI 提供必要掃描開關，避免版本覆寫後靜默改變行為。 */
export function validateCdxgenHelp(help: string): void {
  for (const option of [
    '--required-only',
    '--install-deps',
    '--spec-version',
    '--exclude',
    '--recurse',
    '--type',
    '--output',
  ]) {
    if (!new RegExp(`${option}(?=[\\s,=]|$)`).test(help)) {
      throw new Error(`cdxgen CLI 不相容：缺少 ${option} 選項。`);
    }
  }
}
