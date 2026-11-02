export interface NuGetCredential { source: string; url: string; username: string; password: string }
export interface EffectiveNuGetSource { name: string; url: string; enabled: boolean; audit?: boolean }
export interface NuGetRestoreSettings { projectPath: string; configFilePaths?: string[]; sources?: Record<string, unknown> }
export type NuGetSourceReader = (project: NuGetRestoreSettings) => Promise<EffectiveNuGetSource[]>;

const invalid = () => new Error('nugetCredentials 必須是 source、url、username、password 的 JSON 清單；內容不會轉印。來源名稱限英數字、點、底線及連字號，帳號密碼不可含分號或換行。');
export function sourceUrl(value: string): string {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw invalid();
  return url.href;
}
export function validateNuGetCredentials(value: unknown): NuGetCredential[] {
  if (!Array.isArray(value) || value.length > 20) throw invalid();
  const seen = new Set<string>();
  return value.map(entry => {
    if (!entry || typeof entry !== 'object' || Object.keys(entry).some(key => !['source', 'url', 'username', 'password'].includes(key))) throw invalid();
    for (const key of ['source', 'url', 'username', 'password']) if (typeof entry[key] !== 'string' || !entry[key] || /[\r\n\0;]/.test(entry[key])) throw invalid();
    if (!/^[A-Za-z0-9_.-]{1,128}$/.test(entry.source) || entry.username.includes(':') || entry.username.trim() !== entry.username || entry.password.trim() !== entry.password) throw invalid();
    let url: string;
    try { url = sourceUrl(entry.url); } catch { throw invalid(); }
    const key = entry.source.toLowerCase();
    if (seen.has(key)) throw invalid();
    seen.add(key);
    return { source: entry.source, url, username: entry.username, password: entry.password };
  });
}
export function parseNuGetCredentials(input: string | undefined): NuGetCredential[] | undefined {
  if (!input?.trim()) return;
  let value: unknown;
  try { if (input.length > 128 * 1024) throw invalid(); value = JSON.parse(input); }
  catch { throw invalid(); }
  return validateNuGetCredentials(value);
}

/** Name-only NuGet environment credentials are safe only after checking the entire restore closure. */
export async function withNuGetCredentials<T>(credentials: NuGetCredential[] | undefined, projects: NuGetRestoreSettings[], readSources: NuGetSourceReader, original: NodeJS.ProcessEnv, action: (env: NodeJS.ProcessEnv) => Promise<T>): Promise<T> {
  if (!credentials?.length) return action(original);
  const values = validateNuGetCredentials(credentials);
  const matched = new Set<NuGetCredential>();
  for (const project of projects) {
    if (!Array.isArray(project.configFilePaths) || !project.sources || typeof project.sources !== 'object') throw new Error('NuGet 認證：還原圖缺少實際來源／設定路徑，無法安全對應認證。');
    const sources = await readSources(project);
    for (const source of sources.filter(source => source.enabled)) {
      // RestoreSources overrides can remove configured sources. Never invent names for URLs.
      const credential = values.find(entry => entry.source.toLowerCase() === source.name.toLowerCase());
      if (!credential) continue;
      let url: string;
      try { url = sourceUrl(source.url); } catch { throw new Error(`NuGet 認證來源 ${credential.source} 的有效 URL 不受支援。`); }
      if (source.name !== credential.source || url !== credential.url) throw new Error(`NuGet 認證來源 ${credential.source} 與還原圖不一致；同一還原範圍內不可將同名來源對應不同 URL 或大小寫。`);
      if (source.audit || Object.keys(project.sources).some(url => url === source.url)) matched.add(credential);
    }
  }
  // Unused entries are allowed for other independently restored projects in combined products.
  const env = { ...original };
  for (const entry of values) {
    const key = `NuGetPackageSourceCredentials_${entry.source}`;
    for (const name of Object.keys(env)) if (name.toLowerCase() === key.toLowerCase()) delete env[name];
    if (matched.has(entry)) env[key] = `Username=${entry.username};Password=${entry.password};ValidAuthenticationTypes=Basic`;
  }
  try { return await action(env); }
  finally { for (const entry of values) delete env[`NuGetPackageSourceCredentials_${entry.source}`]; }
}
