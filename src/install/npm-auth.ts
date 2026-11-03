import { access, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse } from 'yaml';
import type { InstallOptions, JavaScriptProject, ManagerCommand } from './contracts';
import {
  NpmAuthenticationError,
  validateNpmCredentials,
  type CredentialAlias,
  type NpmCredential,
} from './npm-credentials';

/** 讀取認證相關環境變數，大小寫重複且值不同時拒絕，以免靜默覆蓋設定。 */
const getEnv = (env: NodeJS.ProcessEnv, key: string) => {
  const matches = Object.entries(env)
    .filter(([name]) => name.toLowerCase() === key.toLowerCase())
    .map(([, value]) => value);
  if (new Set(matches).size > 1) {
    throw new Error('認證相關環境設定含大小寫重複且不同的值；請保留單一設定，避免來源設定被覆蓋。');
  }
  return matches[0];
};
/** 刪除同名的大小寫變體後設定單一子程序變數，避免平台行為不同。 */
function setEnv(env: NodeJS.ProcessEnv, key: string, value: string): void {
  for (const name of Object.keys(env)) {
    if (name.toLowerCase() === key.toLowerCase()) {
      delete env[name];
    }
  }
  env[key] = value;
}
/** 將不存在的認證設定檔視為空白，其餘讀取錯誤保留給安全診斷。 */
async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}
/** 向上定位實體 Git 根目錄，找不到版本庫時使用實體專案根目錄作為暫存限制。 */
async function repositoryBoundary(projectRoot: string): Promise<string> {
  for (let directory = resolve(projectRoot); ; directory = dirname(directory)) {
    try {
      await access(join(directory, '.git'));
      return await realpath(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new NpmAuthenticationError('temp');
      }
    }
    if (dirname(directory) === directory) {
      return realpath(projectRoot);
    }
  }
}
/** 以相對路徑判定是否落在來源內，避免以字串前綴誤判相鄰目錄。 */
const contains = (root: string, path: string) => {
  const value = relative(root, path);
  return value === '' || (!/^\.\.(?:[\\/]|$)/.test(value) && !isAbsolute(value));
};

interface AuthenticationContext {
  project: JavaScriptProject;
  credentials: NpmCredential[];
  mappings: Map<string, NpmCredential>;
  env: NodeJS.ProcessEnv;
}

/** 擷取設定值中的環境佔位名稱，包含 Yarn fallback 語法但不展開秘密。 */
function references(value: string): string[] {
  return [...value.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(?::-|-)[^}]*|\?)?\}/g)].map(
    (match) => match[1],
  );
}

/** 建立固定且不含設定原文的錯誤，指出 registry／認證欄位映射不安全。 */
function invalidMapping(): Error {
  return new Error(
    '專案認證的環境變數映射無法安全對應相同 registry／認證欄位；請明訂 npmCredentials.environment，且只在對應來源的認證設定使用該變數。',
  );
}

/** 將 registry 轉成不含協定的 host／路徑身分，供 npm 認證槽精確比對。 */
function registryIdentity(registry: string): string | undefined {
  try {
    const url = new URL(registry.startsWith('//') ? `https:${registry}` : registry);
    return `//${url.host}${url.pathname.replace(/\/+$/, '')}/`;
  } catch {
    return undefined;
  }
}

/** 驗證佔位只指向同來源的指定認證別名，拒絕混合字串與跨來源秘密引用。 */
function checkMapped(
  value: string,
  registry: string,
  alias: CredentialAlias,
  mappings: AuthenticationContext['mappings'],
  allowFallback = false,
): boolean {
  const variables = references(value),
    supplied = variables.filter((name) => mappings.has(name));
  if (!supplied.length) {
    return false;
  }
  if (
    variables.length !== 1 ||
    (value !== `\${${variables[0]}}` &&
      !(allowFallback && /^\$\{[A-Za-z_][A-Za-z0-9_]*(?::-|-)[^${}]*\}$/.test(value)))
  ) {
    throw invalidMapping();
  }
  const credential = mappings.get(variables[0])!;
  if (
    registryIdentity(registry) !== registryIdentity(credential.registry) ||
    credential.environment?.[variables[0]] !== alias
  ) {
    throw invalidMapping();
  }
  return true;
}

/** 檢查 npmrc 認證優先序與佔位映射，保留原生 pnpm 專用 auth file 的例外。 */
function checkNpmFile(
  contents: string,
  projectFile: boolean,
  context: AuthenticationContext,
): void {
  const { credentials, mappings, project } = context;
  for (const line of contents.split(/\r?\n/)) {
    if (/^\s*[;#]/.test(line)) {
      continue;
    }
    const match = line.match(
      /^\s*["']?(\/\/[^\s"']+\/):(_authToken|_auth|username|_password|tokenHelper)["']?\s*=\s*(.*)$/i,
    );
    if (!match) {
      if (references(line).some((name) => mappings.has(name))) {
        throw invalidMapping();
      }
      continue;
    }
    const target = credentials.some(
      (credential) => registryIdentity(credential.registry) === registryIdentity(match[1]),
    );
    const value = match[3].trim().replace(/^(["'])(.*)\1$/, '$2');
    const aliases: Record<string, CredentialAlias> = {
      _authtoken: 'token',
      _auth: 'basicBase64',
      username: 'username',
      _password: 'passwordBase64',
    };
    const alias = aliases[match[2].toLowerCase()];
    if (alias && checkMapped(value, match[1], alias, mappings)) {
      continue;
    }
    // 專案認證優先於 userconfig；原生 pnpm12 的專用 auth file 才負責其不展開的佔位。
    if (
      projectFile &&
      target &&
      !(
        project.manager === 'pnpm' &&
        Number(project.version.split('.')[0]) >= 11 &&
        value.includes('${')
      )
    ) {
      throw new Error(
        '專案 .npmrc 已包含相同 registry 的認證；npmCredentials 的暫存 userconfig 不能覆寫較高優先的專案認證。請用 environment 映射對應的認證佔位，或將該認證改由 npmCredentials 統一提供，保留 registry/scope 設定。',
      );
    }
  }
}

/** 依既有遠近順序合併 Yarn 認證相關設定與 scope／registry，不變更原始檔。 */
function mergeYarnSettings(files: any[]): any {
  const merged: any = {
    npmRegistryServer: 'https://registry.yarnpkg.com',
    npmScopes: {},
    npmRegistries: {},
  };
  for (const file of files) {
    for (const key of ['npmRegistryServer', 'npmAuthToken', 'npmAuthIdent']) {
      if (file[key] !== undefined) {
        merged[key] = file[key];
      }
    }
    for (const key of ['npmScopes', 'npmRegistries']) {
      for (const [name, value] of Object.entries(file[key] ?? {})) {
        merged[key][name] = { ...merged[key][name], ...(value as object) };
      }
    }
  }
  return merged;
}

/** 檢查 Yarn 認證欄位的必要變數及來源別名，允許既有 fallback 語法。 */
function checkYarnAuthFields(
  settings: any,
  registry: string,
  context: AuthenticationContext,
): void {
  for (const [key, alias] of [
    ['npmAuthToken', 'token'],
    ['npmAuthIdent', 'basic'],
  ] as const) {
    if (typeof settings[key] === 'string') {
      for (const match of settings[key].matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
        if (context.env[match[1]] === undefined) {
          throw new Error(
            'Yarn 認證設定引用未提供的環境變數；請在 npmCredentials.environment 明訂對應別名，保留 Repo 的 registry/scope 設定。',
          );
        }
      }
      checkMapped(settings[key], registry, alias, context.mappings, true);
    }
  }
}

/** 遞迴拒絕在非認證欄位引用 Task 秘密映射，並防止循環設定造成無限巡訪。 */
function checkNonAuthenticationReferences(
  value: unknown,
  mappings: AuthenticationContext['mappings'],
  visited: WeakSet<object>,
): void {
  if (!value || typeof value !== 'object' || visited.has(value)) {
    return;
  }
  visited.add(value);
  for (const [key, setting] of Object.entries(value)) {
    if (
      !['npmAuthToken', 'npmAuthIdent'].includes(key) &&
      typeof setting === 'string' &&
      references(setting).some((name) => mappings.has(name))
    ) {
      throw invalidMapping();
    }
    checkNonAuthenticationReferences(setting, mappings, visited);
  }
}

/** 核對合併後的全域、scope 及 registry 認證，避免來源秘密被全域設定擴散。 */
function checkYarnSettings(files: any[], context: AuthenticationContext): void {
  const merged = mergeYarnSettings(files);
  if (
    ['npmAuthToken', 'npmAuthIdent'].some(
      (key) =>
        typeof merged[key] === 'string' &&
        references(merged[key]).some((name) => context.mappings.has(name)),
    )
  ) {
    throw invalidMapping();
  }
  checkYarnAuthFields(merged, merged.npmRegistryServer, context);
  for (const scope of Object.values(merged.npmScopes)) {
    checkYarnAuthFields(
      scope,
      (scope as any).npmRegistryServer ?? merged.npmRegistryServer,
      context,
    );
  }
  for (const [registry, settings] of Object.entries(merged.npmRegistries)) {
    checkYarnAuthFields(settings, registry, context);
  }
  const visited = new WeakSet<object>();
  for (const file of files) {
    checkNonAuthenticationReferences(file, context.mappings, visited);
  }
}

/** 安全讀取選定的 Yarn 設定層，解析失敗只回報預定診斷而不帶設定內容。 */
async function readYarnSettings(path: string, errorMessage: string): Promise<object | undefined> {
  try {
    const settings = parse(await readOptional(path));
    if (settings && typeof settings === 'object') {
      return settings;
    }
  } catch {
    throw new Error(errorMessage);
  }
}

/** 探索實際專案與使用者設定並套用各管理器的認證預檢，先拒絕優先序及映射衝突。 */
export async function checkProjectAuthentication(
  project: JavaScriptProject,
  env: NodeJS.ProcessEnv,
  options: InstallOptions,
): Promise<void> {
  if (!options.npmCredentials?.length) {
    return;
  }
  const credentials = validateNpmCredentials(options.npmCredentials);
  const mappings = new Map(
    credentials.flatMap((credential) =>
      Object.keys(credential.environment ?? {}).map((name) => [name, credential] as const),
    ),
  );
  const context: AuthenticationContext = { project, env, credentials, mappings };
  const modern = project.manager === 'yarn' && project.yarn?.generation === 'modern';
  const yarnFiles: any[] = [];
  const visitedFiles = new Set<string>();
  for (let directory = resolve(project.root); ; directory = dirname(directory)) {
    if (modern) {
      const path = join(directory, getEnv(env, 'YARN_RC_FILENAME') ?? '.yarnrc.yml');
      visitedFiles.add(path);
      const settings = await readYarnSettings(
        path,
        'Yarn 專案認證設定無法解析；請檢查 .yarnrc.yml，設定內容不會轉印。',
      );
      if (settings) {
        yarnFiles.unshift(settings);
      }
    } else {
      const path = join(directory, '.npmrc');
      visitedFiles.add(path);
      checkNpmFile(await readOptional(path), true, context);
    }
    if (dirname(directory) === directory) {
      break;
    }
  }
  const childHome = getEnv(env, 'HOME') ?? getEnv(env, 'USERPROFILE') ?? homedir();
  if (!modern) {
    const user = resolve(
      project.root,
      getEnv(env, 'npm_config_userconfig') ?? join(childHome, '.npmrc'),
    );
    const auth = getEnv(env, 'PNPM_CONFIG_NPMRC_AUTH_FILE');
    for (const path of [
      user,
      ...(project.manager === 'pnpm' && auth ? [resolve(project.root, auth)] : []),
    ]) {
      if (!visitedFiles.has(path)) {
        checkNpmFile(await readOptional(path), false, context);
      }
    }
    return;
  }
  const homeRc = join(childHome, getEnv(env, 'YARN_RC_FILENAME') ?? '.yarnrc.yml');
  if (!visitedFiles.has(homeRc)) {
    const settings = await readYarnSettings(
      homeRc,
      'Yarn 使用者認證設定無法解析；設定內容不會轉印。',
    );
    if (settings) {
      yarnFiles.unshift(settings);
    }
  }
  checkYarnSettings(yarnFiles, context);
}

// Yarn 的環境設定不能直接描述 registry／scope Map；使用正式 install hook，
// 僅更新記憶體認證，保留設定探索、路由、相對路徑、plugin 及 PnP 政策。
/** 產生僅更新相符 registry／scope 認證 Map 的 Yarn hook，保留設定探索、相對路徑及既有 plugin。 */
function yarnPlugin(variable: string): string {
  return `module.exports = {
  name: '@sbom-pilot/registry-auth',
  factory: () => ({
    hooks: {
      validateProject(project) {
        const credentials = JSON.parse(process.env[${JSON.stringify(variable)}]);
        const configuration = project.configuration;
        const registries = configuration.get('npmRegistries');
        const normalize = (value) => {
          try {
            return new URL(value).href.replace(/\\/+$/, '');
          } catch {
            return undefined;
          }
        };
        for (const credential of credentials) {
          const key = credential.registry.replace(/\\/+$/, '');
          const fields = {
            npmAlwaysAuth: true,
            npmAuthToken: credential.token || null,
            npmAuthIdent: credential.token ? null : credential.username + ':' + credential.password,
          };
          const entry = new Map(
            registries.get(key) || registries.get(key.replace(/^https?:/, '')) || [],
          );
          for (const [name, value] of Object.entries(fields)) entry.set(name, value);
          registries.set(key, entry);
          for (const scope of configuration.get('npmScopes').values()) {
            const server = scope.get('npmRegistryServer') || configuration.get('npmRegistryServer');
            if (normalize(server) === key)
              for (const [name, value] of Object.entries(fields)) scope.set(name, value);
          }
        }
      },
    },
  }),
};
`;
}

/** 只移除暫存設定中同來源的舊認證欄位，保留其他來源及非認證設定。 */
function npmRegistryOverlay(contents: string, credentials: NpmCredential[]): string {
  return contents
    .split(/\r?\n/)
    .filter((line) => {
      const match = line.match(
        /^\s*["']?(\/\/[^\s"']+\/):(?:_authToken|_auth|username|_password|always-auth|tokenHelper)["']?\s*=/i,
      );
      if (!match) {
        return true;
      }
      const target = new URL(`https:${match[1]}`);
      return !credentials.some((credential) => {
        const url = new URL(credential.registry);
        return url.host === target.host && url.pathname === target.pathname;
      });
    })
    .join('\n');
}

/** 同時核對 Git／sourceRoot 與暫存實體路徑，在來源外建立可清理的認證目錄。 */
async function authenticationDirectory(
  projectRoot: string,
  sourceRoot: string | undefined,
  tempDirectory: string | undefined,
): Promise<string> {
  const base = resolve(tempDirectory ?? tmpdir());
  const boundaries = [
    await repositoryBoundary(projectRoot),
    await realpath(sourceRoot ?? projectRoot),
  ];
  if (boundaries.some((boundary) => contains(boundary, base))) {
    throw new NpmAuthenticationError('temp');
  }
  await mkdir(base, { recursive: true });
  const physical = await realpath(base);
  if (boundaries.some((boundary) => contains(boundary, physical))) {
    throw new NpmAuthenticationError('temp');
  }
  return mkdtemp(join(base, 'sbom-npm-auth-'));
}

/** 為專案 install 建立最小認證設定與環境；不改來源檔，任何結果都在 finally 移除暫存。 */
export async function withNpmAuthentication(
  project: JavaScriptProject,
  command: ManagerCommand,
  inheritedEnv: NodeJS.ProcessEnv,
  options: InstallOptions,
  action: (command: ManagerCommand) => Promise<void>,
): Promise<void> {
  if (!options.npmCredentials?.length) {
    await action(command);
    return;
  }
  const credentials = validateNpmCredentials(options.npmCredentials);
  const directory = await authenticationDirectory(
    project.root,
    options.sourceRoot,
    options.tempDirectory,
  );
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
        const url = new URL(credential.registry),
          key = `//${url.host}${url.pathname}`;
        const secret = `${variable}_${index}`;
        env[secret] =
          credential.token ??
          Buffer.from(`${credential.username}:${credential.password}`).toString('base64');
        lines.push(
          `${key}:${credential.token ? '_authToken' : '_auth'}=\${${secret}}`,
          `${key}:always-auth=true`,
        );
      });
      const path = join(directory, 'npmrc');
      await writeFile(path, `${npmRegistryOverlay(original, credentials)}\n${lines.join('\n')}\n`, {
        mode: 0o600,
      });
      setEnv(env, 'NPM_CONFIG_USERCONFIG', path);
      if (project.manager === 'pnpm' && Number(project.version.split('.')[0]) >= 11) {
        const inheritedAuth = getEnv(env, 'PNPM_CONFIG_NPMRC_AUTH_FILE');
        const originalAuth = inheritedAuth
          ? await readOptional(resolve(project.root, inheritedAuth))
          : original;
        const authPath = join(directory, 'pnpm-auth.ini');
        await writeFile(
          authPath,
          `${npmRegistryOverlay(originalAuth, credentials)}\n${lines.join('\n')}\n`,
          { mode: 0o600 },
        );
        setEnv(env, 'PNPM_CONFIG_NPMRC_AUTH_FILE', authPath);
      }
    }
    options.log?.(
      `已為 ${credentials.length} 個 npm registry 準備安裝階段認證（暫存設定，來源路由沿用專案）。`,
    );
    await action({ ...command, env });
  } catch {
    throw new NpmAuthenticationError();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
