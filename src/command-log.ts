import { agentNetworkCredentials } from './azure-secret-inputs';
import type { TaskConfig } from './config';
import type { ProcessRunner } from './process';

/** 收集已知帳密及常見傳輸編碼，只供記憶體內遮罩，不列印環境內容。 */
function secretVariants(values: string[]): string[] {
  const variants = new Set<string>();

  for (const value of values.filter(Boolean)) {
    variants.add(value);
    variants.add(Buffer.from(value).toString('base64'));

    for (const encode of [encodeURIComponent, encodeURI]) {
      try {
        const encoded = encode(value);

        variants.add(encoded);
        variants.add(encoded.replace(/%[\dA-F]{2}/g, (part) => part.toLowerCase()));
        variants.add(encode(encoded));
      } catch {
        // 不合法的 Unicode 仍以原值遮罩，不能讓診斷影響工具執行。
      }
    }
  }

  return [...variants].filter(Boolean).sort((left, right) => right.length - left.length);
}

/** 從秘密環境欄位及代理 userinfo 取得遮罩值；不保留或顯示整份環境。 */
function environmentSecrets(env: NodeJS.ProcessEnv): string[] {
  const values: string[] = [];

  for (const [name, value] of Object.entries(env)) {
    if (!value) continue;
    if (
      /(?:TOKEN|PASSWORD|PASSWD|API_?KEY|CLIENTSECRET|CLIENT_SECRET|^INPUT_(?:DTAPIKEY|NPMCREDENTIALS|NUGETCREDENTIALS)$)/i.test(
        name,
      )
    ) {
      values.push(value);
    }
    if (/^NuGetPackageSourceCredentials_/i.test(name)) {
      values.push(value);

      for (const field of value.split(';')) {
        if (/^(?:Username|Password)=/i.test(field))
          values.push(field.slice(field.indexOf('=') + 1));
      }
    }
    if (/proxy/i.test(name)) {
      try {
        const url = new URL(value);
        const username = decodeURIComponent(url.username),
          password = decodeURIComponent(url.password);

        values.push(username, password);

        if (username || password) values.push(`${username}:${password}`);
      } catch {
        // 代理網址格式由網路模組驗證，診斷不輸出解析錯誤內容。
      }
    }
  }

  return values;
}

/** 建立 Task 本身的遮罩器，涵蓋設定、代理及子程序認證，不依賴 Agent 後處理。 */
export function commandRedactor(
  config: Pick<TaskConfig, 'dt' | 'npmCredentials' | 'nugetCredentials'>,
): (value: string, env?: NodeJS.ProcessEnv) => string {
  const values = [
    config.dt?.apiKey ?? '',
    ...Object.values(agentNetworkCredentials).filter(
      (value): value is string => typeof value === 'string',
    ),
  ];

  for (const credential of [...(config.npmCredentials ?? []), ...(config.nugetCredentials ?? [])]) {
    values.push(
      credential.username ?? '',
      credential.password ?? '',
      'token' in credential ? (credential.token ?? '') : '',
    );

    if (credential.username !== undefined && credential.password !== undefined)
      values.push(`${credential.username}:${credential.password}`);
  }

  const known = secretVariants([...values, ...environmentSecrets(process.env)]);

  /** 先移除 URL／旗標認證，再替換已知值；保留非秘密參數供使用者核對。 */
  return (value, env) => {
    let safe = value
      .replace(/(https?:\/\/)[^\s/]*@/gi, '$1***@')
      .replace(/([?&](?:api[_-]?key|access[_-]?token|token|password|secret)=)[^&#\s]*/gi, '$1***')
      .replace(
        /((?:authorization|proxy-authorization)\s*[:=]\s*(?:Basic|Bearer)\s+)[^\s"']+/gi,
        '$1***',
      )
      .replace(
        /((?:--?|\/)(?:api[-_]?key|password|passwd|token|access[-_]?token|client[-_]?secret|_authToken|_auth)[:=])[^\s]*/gi,
        '$1***',
      );

    for (const secret of [...known, ...secretVariants(environmentSecrets(env ?? {}))].sort(
      (a, b) => b.length - a.length,
    ))
      safe = safe.split(secret).join('***');

    return safe;
  };
}

/** 以 JSON 保留參數邊界並跳脫所有控制字元，避免單行日誌被注入額外命令。 */
export function diagnosticJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[\u007f-\u009f\u2028\u2029]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

/** 在工具執行前記錄安全副本，原始 Command／argv／env 原封不動交給既有 runner。 */
export function withCommandLogging(
  run: ProcessRunner,
  log: (message: string) => void,
  redact: ReturnType<typeof commandRedactor>,
): ProcessRunner {
  return (command) => {
    let hideNext = false;
    const args = command.args.map((argument) => {
      const hidden = hideNext;

      hideNext =
        /^(?:--?|\/)(?:api[-_]?key|password|passwd|token|access[-_]?token|client[-_]?secret|_authToken|_auth)$/i.test(
          argument,
        );

      if (hidden) return '***';

      const assignment = argument.match(
        /^((?:--?|\/)?(?:api[-_]?key|password|passwd|token|access[-_]?token|client[-_]?secret|_authToken|_auth)[:=])/i,
      );

      return assignment ? `${assignment[1]}***` : redact(argument, command.env);
    });
    const scan = command.env && {
      FETCH_LICENSE:
        command.env.FETCH_LICENSE === undefined
          ? undefined
          : redact(command.env.FETCH_LICENSE, command.env),
      CDXGEN_NO_CACHE:
        command.env.CDXGEN_NO_CACHE === undefined
          ? undefined
          : redact(command.env.CDXGEN_NO_CACHE, command.env),
    };

    log(
      `[command] ${diagnosticJson({ executable: redact(command.executable, command.env), argv: args, cwd: redact(command.cwd, command.env), ...(scan && Object.values(scan).some((value) => value !== undefined) ? { scan } : {}) })}`,
    );

    return run(command);
  };
}
