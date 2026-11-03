export type CredentialAlias =
  'token' | 'username' | 'password' | 'passwordBase64' | 'basic' | 'basicBase64';
export type NpmCredential = (
  | { registry: string; token: string; username?: never; password?: never }
  | { registry: string; username: string; password: string; token?: never }
) & { environment?: Record<string, CredentialAlias> };
export class NpmAuthenticationError extends Error {
  /** 以固定診斷區分來源安裝與暫存位置錯誤，不讓帳密或設定原文出現在錯誤內容。 */
  constructor(reason: 'install' | 'temp' = 'install') {
    super(
      reason === 'temp'
        ? 'npm 認證暫存目錄必須位於 Repo／專案外；請檢查 Agent.TempDirectory。'
        : '私有 npm 來源認證／嚴格安裝失敗；請檢查 registry URL（含路徑）、認證權限、專案既有認證設定與鎖檔。未轉印來源或子程序內容。',
    );
  }
}

/** 依明確別名取得 token／帳密及必要編碼，不相容的認證類型直接拒絕。 */
export function credentialValue(credential: NpmCredential, alias: CredentialAlias): string {
  if (alias === 'token' && credential.token !== undefined) {
    return credential.token;
  }
  if (credential.username !== undefined && credential.password !== undefined) {
    if (alias === 'username') {
      return credential.username;
    }
    if (alias === 'password') {
      return credential.password;
    }
    if (alias === 'passwordBase64') {
      return Buffer.from(credential.password).toString('base64');
    }
    if (alias === 'basic') {
      return `${credential.username}:${credential.password}`;
    }
    if (alias === 'basicBase64') {
      return Buffer.from(`${credential.username}:${credential.password}`).toString('base64');
    }
  }

  throw new Error('npmCredentials 的環境變數別名不適用此認證類型。');
}

/** 僅在專案初始化環境加入明確的秘密別名，保留原工具環境供下載與掃描使用。 */
export function projectCredentialEnvironment(
  env: NodeJS.ProcessEnv,
  credentials: NpmCredential[] | undefined,
): NodeJS.ProcessEnv {
  if (!credentials?.some((credential) => Object.keys(credential.environment ?? {}).length)) {
    return env;
  }

  const result = { ...env };

  for (const credential of validateNpmCredentials(credentials ?? [])) {
    for (const [name, alias] of Object.entries(credential.environment ?? {})) {
      for (const key of Object.keys(result)) {
        if (key.toUpperCase() === name) {
          delete result[key];
        }
      }

      result[name] = credentialValue(credential, alias);
    }
  }

  return result;
}

/** 驗證 registry、認證類型與環境別名，拒絕跨來源衝突及保留系統變數覆寫。 */
export function validateNpmCredentials(value: unknown): NpmCredential[] {
  /** 建立固定格式診斷，提醒秘密 JSON 的必要欄位而不洩漏解析內容。 */
  const invalid = () =>
    new Error(
      'npmCredentials 必須是 registry 與 token 或 username/password 的 JSON 清單；請檢查秘密變數格式，認證內容不會轉印。',
    );

  if (!Array.isArray(value) || value.length > 20) {
    throw invalid();
  }

  const seen = new Set<string>();
  const variables = new Set<string>();

  return value.map((entry) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      Object.keys(entry).some(
        (key) => !['registry', 'token', 'username', 'password', 'environment'].includes(key),
      )
    ) {
      throw invalid();
    }

    /** 確認認證文字非空且不含控制分隔字元，避免設定檔與環境被插入額外內容。 */
    const text = (key: string) =>
      typeof entry[key] === 'string' && entry[key].length > 0 && !/[\r\n\0]/.test(entry[key]);

    if (!text('registry')) {
      throw invalid();
    }

    let url: URL;

    try {
      url = new URL(entry.registry);
    } catch {
      throw invalid();
    }

    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw invalid();
    }

    url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;

    const registry = url.href;
    // npm 認證索引不含協定，必須拒絕會競爭同一槽位的來源。
    const scope = `//${url.host}${url.pathname}`;

    if (seen.has(scope)) {
      throw invalid();
    }

    seen.add(scope);

    let credential: NpmCredential;

    if (text('token') && entry.username === undefined && entry.password === undefined) {
      credential = { registry, token: entry.token };
    } else if (
      entry.token === undefined &&
      text('username') &&
      !entry.username.includes(':') &&
      text('password')
    ) {
      credential = { registry, username: entry.username, password: entry.password };
    } else {
      throw invalid();
    }
    if (entry.environment !== undefined) {
      if (
        !entry.environment ||
        typeof entry.environment !== 'object' ||
        Array.isArray(entry.environment) ||
        Object.keys(entry.environment).length > 20
      ) {
        throw invalid();
      }

      const environment: Record<string, CredentialAlias> = {};

      for (const [name, alias] of Object.entries(entry.environment)) {
        const reserved =
          /^(?:INPUT_|SECRET_|AGENT_|SYSTEM_|BUILD_|RELEASE_|NPM_CONFIG_|PNPM_|YARN_|SBOM_PILOT_|DOTNET_|GIT_|SSL_|CURL_|LD_|DYLD_|BASH_|NODE_|XDG_|COREPACK_)/.test(
            name,
          ) && name !== 'NODE_AUTH_TOKEN';

        if (
          !/^[A-Z][A-Z0-9_]{0,127}$/.test(name) ||
          reserved ||
          /^(?:PATH|PATHEXT|HOME|USERPROFILE|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|TMP|TEMP|TMPDIR|COMSPEC|SHELL|ENV|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|CI|CONTINUOUS_INTEGRATION|USER|USERNAME|LOGNAME)$/.test(
            name,
          ) ||
          variables.has(name)
        ) {
          throw invalid();
        }
        if (
          !['token', 'username', 'password', 'passwordBase64', 'basic', 'basicBase64'].includes(
            alias as string,
          )
        ) {
          throw invalid();
        }

        credentialValue(credential, alias as CredentialAlias);
        variables.add(name);
        environment[name] = alias as CredentialAlias;
      }

      credential.environment = environment;
    }

    return credential;
  });
}

/** 限制秘密輸入大小並解析 JSON，將原始 parser 訊息替換為安全格式錯誤。 */
export function parseNpmCredentials(input: string | undefined): NpmCredential[] | undefined {
  if (!input?.trim()) {
    return;
  }

  let value;

  try {
    if (input.length > 128 * 1024) {
      throw new Error();
    }

    value = JSON.parse(input);
  } catch {
    throw new Error('npmCredentials 不是有效的 JSON 清單；認證內容不會轉印。');
  }

  return validateNpmCredentials(value);
}
