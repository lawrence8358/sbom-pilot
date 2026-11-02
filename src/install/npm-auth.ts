import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse } from 'yaml';
import type { InstallOptions, JavaScriptProject, ManagerCommand } from './contracts';
import { NpmAuthenticationError, validateNpmCredentials, type CredentialAlias } from './npm-credentials';

const getEnv = (env: NodeJS.ProcessEnv, key: string) => Object.entries(env).find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1];
function setEnv(env: NodeJS.ProcessEnv, key: string, value: string): void {
  for (const name of Object.keys(env)) if (name.toLowerCase() === key.toLowerCase()) delete env[name];
  env[key] = value;
}
async function readOptional(path: string): Promise<string> {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw error; }
}

/** Existing higher-priority credentials cannot be silently replaced by a user RC. */
export async function checkProjectAuthentication(project: JavaScriptProject, env: NodeJS.ProcessEnv, options: InstallOptions): Promise<void> {
  if (!options.npmCredentials?.length) return;
  const credentials = validateNpmCredentials(options.npmCredentials);
  const mappings = new Map(credentials.flatMap(credential => Object.keys(credential.environment ?? {}).map(name => [name, credential] as const)));
  const refs = (value: string) => [...value.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map(match => match[1]);
  const invalidMapping = () => new Error('專案認證的環境變數映射無法安全對應相同 registry／認證欄位；請明訂 npmCredentials.environment，且只在對應來源的認證設定使用該變數。');
  const identity = (registry: string) => { try { const url = new URL(registry.startsWith('//') ? `https:${registry}` : registry); return `//${url.host}${url.pathname.replace(/\/+$/, '')}/`; } catch { return undefined; } };
  const checkMapped = (value: string, registry: string, alias: CredentialAlias): boolean => {
    const variables = refs(value), supplied = variables.filter(name => mappings.has(name));
    if (!supplied.length) return false;
    if (variables.length !== 1 || value !== `\${${variables[0]}}`) throw invalidMapping();
    const credential = mappings.get(variables[0])!;
    if (identity(registry) !== identity(credential.registry) || credential.environment?.[variables[0]] !== alias) throw invalidMapping();
    return true;
  };
  const modern = project.manager === 'yarn' && project.yarn?.generation === 'modern';
  const yarnFiles: any[] = [];
  for (let directory = resolve(project.root);; directory = dirname(directory)) {
    if (modern) {
      let settings;
      try { settings = parse(await readOptional(join(directory, getEnv(env, 'YARN_RC_FILENAME') ?? '.yarnrc.yml'))); }
      catch { throw new Error('Yarn 專案認證設定無法解析；請檢查 .yarnrc.yml，設定內容不會轉印。'); }
      if (settings && typeof settings === 'object') yarnFiles.unshift(settings);
    } else {
      const contents = await readOptional(join(directory, '.npmrc'));
      for (const line of contents.split(/\r?\n/)) {
        if (/^\s*[;#]/.test(line)) continue;
        const match = line.match(/^\s*["']?(\/\/[^\s"']+\/):(_authToken|_auth|username|_password|tokenHelper)["']?\s*=\s*(.*)$/i);
        if (!match) { if (refs(line).some(name => mappings.has(name))) throw invalidMapping(); continue; }
        const target = credentials.some(credential => identity(credential.registry) === identity(match[1]));
        const value = match[3].trim().replace(/^(["'])(.*)\1$/, '$2');
        const aliases: Record<string, CredentialAlias> = { _authtoken: 'token', _auth: 'basicBase64', username: 'username', _password: 'passwordBase64' };
        const alias = aliases[match[2].toLowerCase()];
        if (alias && checkMapped(value, match[1], alias)) continue;
        // pnpm12 intentionally ignores project auth values containing env placeholders.
        if (target && !(project.manager === 'pnpm' && Number(project.version.split('.')[0]) >= 11 && value.includes('${'))) throw new Error('專案 .npmrc 已包含相同 registry 的認證；npmCredentials 的暫存 userconfig 不能覆寫較高優先的專案認證。請用 environment 映射對應的認證佔位，或將該認證改由 npmCredentials 統一提供，保留 registry/scope 設定。');
      }
    }
    if (dirname(directory) === directory) break;
  }
  if (modern) {
    const merged: any = { npmRegistryServer: 'https://registry.yarnpkg.com', npmScopes: {}, npmRegistries: {} };
    for (const file of yarnFiles) {
      for (const key of ['npmRegistryServer', 'npmAuthToken', 'npmAuthIdent']) if (file[key] !== undefined) merged[key] = file[key];
      for (const key of ['npmScopes', 'npmRegistries']) for (const [name, value] of Object.entries(file[key] ?? {})) merged[key][name] = { ...merged[key][name], ...(value as object) };
    }
    const checkAuth = (settings: any, registry: string) => {
      for (const [key, alias] of [['npmAuthToken', 'token'], ['npmAuthIdent', 'basic']] as const) if (typeof settings[key] === 'string') {
        for (const name of refs(settings[key])) if (env[name] === undefined) throw new Error('Yarn 認證設定引用未提供的環境變數；請在 npmCredentials.environment 明訂對應別名，保留 Repo 的 registry/scope 設定。');
        checkMapped(settings[key], registry, alias);
      }
    };
    if (['npmAuthToken', 'npmAuthIdent'].some(key => typeof merged[key] === 'string' && refs(merged[key]).some(name => mappings.has(name)))) throw invalidMapping();
    checkAuth(merged, merged.npmRegistryServer);
    for (const scope of Object.values(merged.npmScopes)) checkAuth(scope, (scope as any).npmRegistryServer ?? merged.npmRegistryServer);
    for (const [registry, settings] of Object.entries(merged.npmRegistries)) checkAuth(settings, registry);
    const visited = new WeakSet<object>();
    const checkOther = (value: unknown): void => {
      if (!value || typeof value !== 'object' || visited.has(value)) return;
      visited.add(value);
      for (const [key, setting] of Object.entries(value)) {
        if (!['npmAuthToken', 'npmAuthIdent'].includes(key) && typeof setting === 'string' && refs(setting).some(name => mappings.has(name))) throw invalidMapping();
        checkOther(setting);
      }
    };
    for (const file of yarnFiles) checkOther(file);
  }
}

// Yarn supports scalar env settings, but not npmRegistries/npmScopes objects.
// Its official install hook can update auth Maps without replacing RC discovery,
// routing, source-relative paths, plugins, PnP settings or project files.
function yarnPlugin(variable: string): string {
  return `module.exports = { name: '@sbom-pilot/registry-auth', factory: () => ({ hooks: { validateProject(project) {
    const credentials = JSON.parse(process.env[${JSON.stringify(variable)}]);
    const configuration = project.configuration;
    const registries = configuration.get('npmRegistries');
    const normalize = value => { try { return new URL(value).href.replace(/\\/+$/, ''); } catch { return undefined; } };
    for (const credential of credentials) {
      const key = credential.registry.replace(/\\/+$/, '');
      const fields = { npmAlwaysAuth: true, npmAuthToken: credential.token || null, npmAuthIdent: credential.token ? null : credential.username + ':' + credential.password };
      const entry = new Map(registries.get(key) || registries.get(key.replace(/^https?:/, '')) || []);
      for (const [name, value] of Object.entries(fields)) entry.set(name, value);
      registries.set(key, entry);
      for (const scope of configuration.get('npmScopes').values()) {
        const server = scope.get('npmRegistryServer') || configuration.get('npmRegistryServer');
        if (normalize(server) === key) for (const [name, value] of Object.entries(fields)) scope.set(name, value);
      }
    }
  } } }) };\n`;
}

/** Project-install credentials never reach manager provisioning or scan/DT tools. */
export async function withNpmAuthentication(project: JavaScriptProject, command: ManagerCommand, inheritedEnv: NodeJS.ProcessEnv, options: InstallOptions, action: (command: ManagerCommand) => Promise<void>): Promise<void> {
  if (!options.npmCredentials?.length) { await action(command); return; }
  const credentials = validateNpmCredentials(options.npmCredentials);
  const base = resolve(options.tempDirectory ?? tmpdir());
  const inside = relative(resolve(project.root), base);
  if (inside === '' || (!/^\.\.(?:[\\/]|$)/.test(inside) && !isAbsolute(inside))) throw new Error('npm 認證暫存目錄必須位於專案外。');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'sbom-npm-auth-'));
  try {
    const env = { ...(command.env ?? inheritedEnv) };
    const variable = `SBOM_PILOT_NPM_${randomUUID().replaceAll('-', '')}`;
    if (project.manager === 'yarn' && project.yarn?.generation === 'modern') {
      const plugin = join(directory, 'registry-auth.cjs');
      await writeFile(plugin, yarnPlugin(variable), { mode: 0o600 });
      env[variable] = JSON.stringify(credentials);
      setEnv(env, 'YARN_PLUGINS', [getEnv(env, 'YARN_PLUGINS'), plugin].filter(Boolean).join(';'));
    } else {
      const childHome = getEnv(env, 'HOME') ?? getEnv(env, 'USERPROFILE') ?? homedir();
      const userconfig = getEnv(env, 'npm_config_userconfig') ?? join(childHome, '.npmrc');
      const original = await readOptional(resolve(project.root, userconfig));
      const lines: string[] = [];
      credentials.forEach((credential, index) => {
        const url = new URL(credential.registry), key = `//${url.host}${url.pathname}`;
        const secret = `${variable}_${index}`;
        env[secret] = credential.token ?? Buffer.from(`${credential.username}:${credential.password}`).toString('base64');
        lines.push(`${key}:${credential.token ? '_authToken' : '_auth'}=\${${secret}}`, `${key}:always-auth=true`);
      });
      const path = join(directory, 'npmrc');
      await writeFile(path, `${original}\n${lines.join('\n')}\n`, { mode: 0o600 });
      setEnv(env, 'NPM_CONFIG_USERCONFIG', path);
      if (project.manager === 'pnpm' && Number(project.version.split('.')[0]) >= 11) {
        const inheritedAuth = getEnv(env, 'PNPM_CONFIG_NPMRC_AUTH_FILE');
        const originalAuth = inheritedAuth ? await readOptional(resolve(project.root, inheritedAuth)) : original;
        const authPath = join(directory, 'pnpm-auth.ini');
        await writeFile(authPath, `${originalAuth}\n${lines.join('\n')}\n`, { mode: 0o600 });
        setEnv(env, 'PNPM_CONFIG_NPMRC_AUTH_FILE', authPath);
      }
    }
    options.log?.(`已為 ${credentials.length} 個 npm registry 準備安裝階段認證（暫存設定，來源路由沿用專案）。`);
    await action({ ...command, env });
  } catch {
    throw new NpmAuthenticationError();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
