// This module MUST be imported before task-lib: the SDK moves nonempty INPUT_*
// values into its vault during module initialization. Capture only in memory;
// never call getInput for secrets, because that method logs their raw values.
export const dtApiKeyInput = process.env.INPUT_DTAPIKEY;
export const agentNetworkCredentials = {
  proxyUsername: process.env.AGENT_PROXYUSERNAME ?? process.env.SECRET_AGENT_PROXYUSERNAME,
  proxyPassword: process.env.AGENT_PROXYPASSWORD ?? process.env.SECRET_AGENT_PROXYPASSWORD,
  clientCertPassword: process.env.AGENT_CLIENTCERTPASSWORD ?? process.env.SECRET_AGENT_CLIENTCERTPASSWORD,
};
// tool-lib reads Agent proxy variables during import. Register their masks first.
const networkMasks = [agentNetworkCredentials.proxyUsername, agentNetworkCredentials.proxyPassword, agentNetworkCredentials.clientCertPassword];
if (agentNetworkCredentials.proxyUsername || agentNetworkCredentials.proxyPassword) networkMasks.push(Buffer.from(`${agentNetworkCredentials.proxyUsername ?? ''}:${agentNetworkCredentials.proxyPassword ?? ''}`).toString('base64'));
for (const address of [process.env.AGENT_PROXYURL, process.env.HTTPS_PROXY, process.env.HTTP_PROXY]) {
  try { const url = new URL(address ?? ''); if (url.username || url.password) networkMasks.push(address); } catch { /* validated later */ }
}
for (const value of networkMasks) if (value) process.stdout.write(`##vso[task.setsecret]${value.replace(/%/g, '%AZP25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}\n`);
