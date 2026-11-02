export type NpmCredential = { registry: string; token: string; username?: never; password?: never } | { registry: string; username: string; password: string; token?: never };

export function validateNpmCredentials(value: unknown): NpmCredential[] {
  const invalid = () => new Error('npmCredentials 必須是 registry 與 token 或 username/password 的 JSON 清單；請檢查秘密變數格式，認證內容不會轉印。');
  if (!Array.isArray(value) || value.length > 20) throw invalid();
  const seen = new Set<string>();
  return value.map(entry => {
    if (!entry || typeof entry !== 'object' || Object.keys(entry).some(key => !['registry', 'token', 'username', 'password'].includes(key))) throw invalid();
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
    if (text('token') && entry.username === undefined && entry.password === undefined) return { registry, token: entry.token };
    if (entry.token === undefined && text('username') && !entry.username.includes(':') && text('password')) return { registry, username: entry.username, password: entry.password };
    throw invalid();
  });
}

export function parseNpmCredentials(input: string | undefined): NpmCredential[] | undefined {
  if (!input?.trim()) return;
  let value;
  try { if (input.length > 128 * 1024) throw new Error(); value = JSON.parse(input); }
  catch { throw new Error('npmCredentials 不是有效的 JSON 清單；認證內容不會轉印。'); }
  return validateNpmCredentials(value);
}
