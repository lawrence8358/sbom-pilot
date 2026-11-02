import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { rootCertificates } from 'node:tls';
import { agentNetworkCredentials } from '../azure-secret-inputs';

export interface NetworkSettings {
  proxyUrl?: string;
  proxyUsername?: string;
  proxyPassword?: string;
  bypassPatterns?: string[];
  noProxy?: string;
  caFile?: string;
  certFile?: string;
  keyFile?: string;
  pfxFile?: string;
  passphrase?: string;
}
export function networkSettings(url: URL, env: NodeJS.ProcessEnv = process.env): NetworkSettings {
  let bypassPatterns: string[] = [];
  try {
    bypassPatterns = JSON.parse(env.AGENT_PROXYBYPASSLIST || '[]');
    if (!Array.isArray(bypassPatterns) || bypassPatterns.some(value => typeof value !== 'string')) throw new Error();
    bypassPatterns.forEach(pattern => new RegExp(pattern, 'i'));
  } catch { throw new Error('Agent Proxy bypass 設定格式無效。'); }
  const agentProxy = env.AGENT_PROXYURL;
  return {
    proxyUrl: agentProxy || (url.protocol === 'https:' ? env.https_proxy || env.HTTPS_PROXY : undefined) || env.http_proxy || env.HTTP_PROXY,
    proxyUsername: agentProxy ? env.AGENT_PROXYUSERNAME ?? agentNetworkCredentials.proxyUsername : undefined,
    proxyPassword: agentProxy ? env.AGENT_PROXYPASSWORD ?? agentNetworkCredentials.proxyPassword : undefined,
    bypassPatterns: agentProxy ? bypassPatterns : [], noProxy: env.no_proxy ?? env.NO_PROXY,
    caFile: env.AGENT_CAINFO, certFile: env.AGENT_CLIENTCERT, keyFile: env.AGENT_CLIENTCERTKEY,
    pfxFile: env.AGENT_CLIENTCERTARCHIVE,
    passphrase: env.AGENT_CLIENTCERTPASSWORD ?? agentNetworkCredentials.clientCertPassword,
  };
}
export function bypassProxy(url: URL, settings: NetworkSettings): boolean {
  if (settings.bypassPatterns?.some(pattern => new RegExp(pattern, 'i').test(url.href))) return true;
  return (settings.noProxy || '').split(',').some(item => {
    const entry = item.trim().toLowerCase();
    if (!entry) return false;
    if (entry === '*') return true;
    const [host, port] = entry.replace(/^\*?\./, '').split(':');
    const targetPort = url.port || (url.protocol === 'https:' ? '443' : '80');
    return (!port || port === targetPort) && (url.hostname.toLowerCase() === host || url.hostname.toLowerCase().endsWith(`.${host}`));
  });
}
export function configuredProxy(settings: NetworkSettings): URL | undefined {
  if (!settings.proxyUrl) return;
  let proxy: URL;
  try { proxy = new URL(settings.proxyUrl); } catch { throw new Error('Proxy URL 設定無效。'); }
  if (!['http:', 'https:'].includes(proxy.protocol) || proxy.search || proxy.hash) throw new Error('Proxy 僅接受 HTTP(S) 網址。');
  if (settings.proxyUsername !== undefined) proxy.username = settings.proxyUsername;
  if (settings.proxyPassword !== undefined) proxy.password = settings.proxyPassword;
  return proxy;
}
export async function childNetworkEnvironment(env: NodeJS.ProcessEnv, tempDirectory: string): Promise<NodeJS.ProcessEnv> {
  const settings = networkSettings(new URL('https://registry.npmjs.org'), env);
  const output = { ...env };
  const proxy = configuredProxy(settings);
  if (env.AGENT_PROXYURL && proxy) {
    if (!output.https_proxy && !output.HTTPS_PROXY) output.https_proxy = proxy.href;
    if (!output.http_proxy && !output.HTTP_PROXY) output.http_proxy = proxy.href;
  }
  if (settings.caFile) {
    try {
      const certificates = [...rootCertificates, await readFile(settings.caFile, 'utf8')];
      if (env.NODE_EXTRA_CA_CERTS && env.NODE_EXTRA_CA_CERTS !== settings.caFile) certificates.push(await readFile(env.NODE_EXTRA_CA_CERTS, 'utf8'));
      const bundle = join(tempDirectory, 'network-ca.pem');
      await writeFile(bundle, certificates.join('\n'));
      output.NODE_EXTRA_CA_CERTS = bundle;
      output.SSL_CERT_FILE ||= bundle;
      output.CURL_CA_BUNDLE ||= bundle;
    } catch { throw new Error('無法準備 Agent 自訂 CA 憑證。'); }
  }
  return output;
}
