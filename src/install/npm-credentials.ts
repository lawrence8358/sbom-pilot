export type CredentialAlias = 'token' | 'username' | 'password' | 'passwordBase64' | 'basic' | 'basicBase64';
export type NpmCredential = ({ registry: string; token: string; username?: never; password?: never } | { registry: string; username: string; password: string; token?: never }) & { environment?: Record<string, CredentialAlias> };

export function credentialValue(credential: NpmCredential, alias: CredentialAlias): string {
  if (alias === 'token' && credential.token !== undefined) return credential.token;
  if (credential.username !== undefined && credential.password !== undefined) {
    if (alias === 'username') return credential.username;
    if (alias === 'password') return credential.password;
    if (alias === 'passwordBase64') return Buffer.from(credential.password).toString('base64');
    if (alias === 'basic') return `${credential.username}:${credential.password}`;
    if (alias === 'basicBase64') return Buffer.from(`${credential.username}:${credential.password}`).toString('base64');
  }
  throw new Error('npmCredentials 的環境變數別名不適用此認證類型。');
}

export function projectCredentialEnvironment(env: NodeJS.ProcessEnv, credentials: NpmCredential[] | undefined): NodeJS.ProcessEnv {
  if (!credentials?.some(credential => Object.keys(credential.environment ?? {}).length)) return env;
  const result = { ...env };
  for (const credential of validateNpmCredentials(credentials ?? [])) for (const [name, alias] of Object.entries(credential.environment ?? {})) {
    for (const key of Object.keys(result)) if (key.toUpperCase() === name) delete result[key];
    result[name] = credentialValue(credential, alias);
  }
  return result;
}

export function validateNpmCredentials(value: unknown): NpmCredential[] {
  const invalid = () => new Error('npmCredentials 必須是 registry 與 token 或 username/password 的 JSON 清單；請檢查秘密變數格式，認證內容不會轉印。');
  if (!Array.isArray(value) || value.length > 20) throw invalid();
  const seen = new Set<string>();
  const variables = new Set<string>();
  return value.map(entry => {
    if (!entry || typeof entry !== 'object' || Object.keys(entry).some(key => !['registry', 'token', 'username', 'password', 'environment'].includes(key))) throw invalid();
    const text = (key: string) => typeof entry[key] === 'string' && entry[key].length > 0 && !/[\r\n\0]/.test(entry[key]);
    if (!text('registry')) throw invalid();
    let url: URL;
    try { url = new URL(entry.registry); } catch { throw invalid(); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw invalid();
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
    const registry = url.href;
    // npm-style auth keys omit the protocol. Do not permit competing entries.
    const scope = `//${url.host}${url.pathname}`;
    if (seen.has(scope)) throw invalid();
    seen.add(scope);
    let credential: NpmCredential;
    if (text('token') && entry.username === undefined && entry.password === undefined) credential = { registry, token: entry.token };
    else if (entry.token === undefined && text('username') && !entry.username.includes(':') && text('password')) credential = { registry, username: entry.username, password: entry.password };
    else throw invalid();
    if (entry.environment !== undefined) {
      if (!entry.environment || typeof entry.environment !== 'object' || Array.isArray(entry.environment) || Object.keys(entry.environment).length > 20) throw invalid();
      const environment: Record<string, CredentialAlias> = {};
      for (const [name, alias] of Object.entries(entry.environment)) {
        const reserved = /^(?:INPUT_|SECRET_|AGENT_|SYSTEM_|BUILD_|RELEASE_|NPM_CONFIG_|PNPM_|YARN_|SBOM_PILOT_|DOTNET_|GIT_|SSL_|CURL_|LD_|DYLD_|BASH_|NODE_)/.test(name) && name !== 'NODE_AUTH_TOKEN';
        if (!/^[A-Z][A-Z0-9_]{0,127}$/.test(name) || reserved || /^(?:PATH|PATHEXT|HOME|USERPROFILE|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|TMP|TEMP|TMPDIR|COMSPEC|SHELL|ENV|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY)$/.test(name) || variables.has(name)) throw invalid();
        if (!['token', 'username', 'password', 'passwordBase64', 'basic', 'basicBase64'].includes(alias as string)) throw invalid();
        credentialValue(credential, alias as CredentialAlias);
        variables.add(name);
        environment[name] = alias as CredentialAlias;
      }
      credential.environment = environment;
    }
    return credential;
  });
}

export function parseNpmCredentials(input: string | undefined): NpmCredential[] | undefined {
  if (!input?.trim()) return;
  let value;
  try { if (input.length > 128 * 1024) throw new Error(); value = JSON.parse(input); }
  catch { throw new Error('npmCredentials 不是有效的 JSON 清單；認證內容不會轉印。'); }
  return validateNpmCredentials(value);
}
