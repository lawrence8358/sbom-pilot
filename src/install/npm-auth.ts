import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse } from 'yaml';
import type { InstallOptions, JavaScriptProject, ManagerCommand } from './contracts';
import { validateNpmCredentials } from './npm-credentials';

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
  const modern = project.manager === 'yarn' && project.yarn?.generation === 'modern';
  for (let directory = resolve(project.root);; directory = dirname(directory)) {
    if (modern) {
      let settings;
      try { settings = parse(await readOptional(join(directory, getEnv(env, 'YARN_RC_FILENAME') ?? '.yarnrc.yml'))); }
      catch { throw new Error('Yarn 專案認證設定無法解析；請檢查 .yarnrc.yml，設定內容不會轉印。'); }
      const check = (value: unknown): void => {
        if (!value || typeof value !== 'object') return;
        for (const [key, setting] of Object.entries(value)) {
          if (['npmAuthToken', 'npmAuthIdent'].includes(key) && typeof setting === 'string') {
            for (const match of setting.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) if (env[match[1]] === undefined) throw new Error('Yarn 認證設定引用未提供的環境變數；npmCredentials 不會展開 Repo 中的秘密變數佔位。請將認證改由 npmCredentials 統一提供，保留 registry/scope 設定。');
          }
          check(setting);
        }
      };
      check(settings);
    } else {
      const contents = await readOptional(join(directory, '.npmrc'));
      for (const line of contents.split(/\r?\n/)) {
        const match = line.match(/^\s*["']?(\/\/[^\s"']+\/):(?:_authToken|_auth|username|_password|tokenHelper)["']?\s*=\s*(.*)$/i);
        if (!match) continue;
        const target = options.npmCredentials.some(credential => { const url = new URL(credential.registry); return `//${url.host}${url.pathname}`.toLowerCase() === match[1].toLowerCase(); });
        // pnpm12 intentionally ignores project auth values containing env placeholders.
        if (target && !(project.manager === 'pnpm' && Number(project.version.split('.')[0]) >= 11 && match[2].includes('${'))) throw new Error('專案 .npmrc 已包含相同 registry 的認證；npmCredentials 的暫存 userconfig 不能覆寫較高優先的專案認證。請將該認證改由 npmCredentials 統一提供，保留 registry/scope 設定。');
      }
    }
    if (dirname(directory) === directory) break;
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
      const userconfig = (project.manager === 'pnpm' ? getEnv(env, 'PNPM_CONFIG_NPMRC_AUTH_FILE') : undefined) ?? getEnv(env, 'npm_config_userconfig') ?? join(childHome, '.npmrc');
      const original = await readOptional(resolve(project.root, userconfig));
      const lines: string[] = [original, ''];
      credentials.forEach((credential, index) => {
        const url = new URL(credential.registry), key = `//${url.host}${url.pathname}`;
        const secret = `${variable}_${index}`;
        env[secret] = credential.token ?? Buffer.from(`${credential.username}:${credential.password}`).toString('base64');
        lines.push(`${key}:${credential.token ? '_authToken' : '_auth'}=\${${secret}}`, `${key}:always-auth=true`);
      });
      const path = join(directory, 'npmrc');
      await writeFile(path, `${lines.join('\n')}\n`, { mode: 0o600 });
      setEnv(env, 'NPM_CONFIG_USERCONFIG', path);
      if (project.manager === 'pnpm' && Number(project.version.split('.')[0]) >= 11) setEnv(env, 'PNPM_CONFIG_NPMRC_AUTH_FILE', path);
    }
    options.log?.(`已為 ${credentials.length} 個 npm registry 準備安裝階段認證（暫存設定，來源路由沿用專案）。`);
    await action({ ...command, env });
  } catch {
    throw new Error('私有 npm 來源認證／嚴格安裝失敗；請檢查 registry URL（含路徑）、認證權限、專案既有認證設定與鎖檔。未轉印來源或子程序內容。');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
