// 本模組必須先於 task-lib 匯入：SDK 初始化會將非空 INPUT_* 移入 vault。
// 秘密只保留於記憶體，不能用會記錄原值的 getInput 讀取。
export const dtApiKeyInput = process.env.INPUT_DTAPIKEY;
export const nugetCredentialsInput = process.env.INPUT_NUGETCREDENTIALS;
export const npmCredentialsInput = process.env.INPUT_NPMCREDENTIALS;
export const agentNetworkCredentials = {
  proxyUsername: process.env.AGENT_PROXYUSERNAME ?? process.env.SECRET_AGENT_PROXYUSERNAME,
  proxyPassword: process.env.AGENT_PROXYPASSWORD ?? process.env.SECRET_AGENT_PROXYPASSWORD,
  clientCertPassword:
    process.env.AGENT_CLIENTCERTPASSWORD ?? process.env.SECRET_AGENT_CLIENTCERTPASSWORD,
};
// 在任何工具／SDK 匯入或讀取代理設定之前，先登錄 Agent 網路認證遮罩。
const networkMasks = [
  agentNetworkCredentials.proxyUsername,
  agentNetworkCredentials.proxyPassword,
  agentNetworkCredentials.clientCertPassword,
];
// SDK 匯入前先遮罩完整輸入、必要子字串與編碼。
// JSON 無效時稍後只回報固定診斷，不輸出 parser 的原文片段。
for (const credentialInput of [npmCredentialsInput, nugetCredentialsInput]) {
  if (credentialInput) {
    networkMasks.push(credentialInput);

    try {
      const entries = JSON.parse(credentialInput);

      if (Array.isArray(entries)) {
        for (const entry of entries) {
          for (const value of [entry?.token, entry?.username, entry?.password]) {
            if (typeof value === 'string') {
              networkMasks.push(value);
            }
          }

          if (typeof entry?.password === 'string') {
            networkMasks.push(Buffer.from(entry.password).toString('base64'));
          }
          if (typeof entry?.username === 'string' && typeof entry?.password === 'string') {
            networkMasks.push(
              `${entry.username}:${entry.password}`,
              Buffer.from(`${entry.username}:${entry.password}`).toString('base64'),
            );
          }
        }
      }
    } catch {
      /* 稍後透過安全格式檢查回報。 */
    }
  }
}
if (agentNetworkCredentials.proxyUsername || agentNetworkCredentials.proxyPassword) {
  networkMasks.push(
    Buffer.from(
      `${agentNetworkCredentials.proxyUsername ?? ''}:${agentNetworkCredentials.proxyPassword ?? ''}`,
    ).toString('base64'),
  );
}
for (const address of [
  process.env.AGENT_PROXYURL,
  process.env.HTTPS_PROXY,
  process.env.HTTP_PROXY,
]) {
  try {
    const url = new URL(address ?? '');

    if (url.username || url.password) {
      networkMasks.push(address);
    }
  } catch {
    /* 網址格式稍後驗證。 */
  }
}
for (const value of new Set(networkMasks)) {
  if (value) {
    process.stdout.write(
      `##vso[task.setsecret]${value.replace(/%/g, '%AZP25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}\n`,
    );
  }
}
