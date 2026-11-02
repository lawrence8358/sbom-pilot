// This module MUST be imported before task-lib: the SDK moves nonempty INPUT_*
// values into its vault during module initialization. Capture only in memory;
// never call getInput for secrets, because that method logs their raw values.
export const dtApiKeyInput = process.env.INPUT_DTAPIKEY;
export const nugetCredentialsInput = process.env.INPUT_NUGETCREDENTIALS;
export const npmCredentialsInput = process.env.INPUT_NPMCREDENTIALS;
export const agentNetworkCredentials = {
  proxyUsername: process.env.AGENT_PROXYUSERNAME ?? process.env.SECRET_AGENT_PROXYUSERNAME,
  proxyPassword: process.env.AGENT_PROXYPASSWORD ?? process.env.SECRET_AGENT_PROXYPASSWORD,
  clientCertPassword: process.env.AGENT_CLIENTCERTPASSWORD ?? process.env.SECRET_AGENT_CLIENTCERTPASSWORD,
};
// tool-lib reads Agent proxy variables during import. Register their masks first.
const networkMasks = [agentNetworkCredentials.proxyUsername, agentNetworkCredentials.proxyPassword, agentNetworkCredentials.clientCertPassword];
// Mask the complete input and useful substrings/encodings before importing the SDK.
// Invalid JSON is reported later through a constant error, never a parser excerpt.
for (const credentialInput of [npmCredentialsInput, nugetCredentialsInput]) if (credentialInput) {
  networkMasks.push(credentialInput);
  try {
    const entries = JSON.parse(credentialInput);
    if (Array.isArray(entries)) for (const entry of entries) {
      for (const value of [entry?.token, entry?.username, entry?.password]) if (typeof value === 'string') networkMasks.push(value);
      if (typeof entry?.password === 'string') networkMasks.push(Buffer.from(entry.password).toString('base64'));
      if (typeof entry?.username === 'string' && typeof entry?.password === 'string') networkMasks.push(`${entry.username}:${entry.password}`, Buffer.from(`${entry.username}:${entry.password}`).toString('base64'));
    }
  } catch { /* safe validation later */ }
}
if (agentNetworkCredentials.proxyUsername || agentNetworkCredentials.proxyPassword) networkMasks.push(Buffer.from(`${agentNetworkCredentials.proxyUsername ?? ''}:${agentNetworkCredentials.proxyPassword ?? ''}`).toString('base64'));
for (const address of [process.env.AGENT_PROXYURL, process.env.HTTPS_PROXY, process.env.HTTP_PROXY]) {
  try { const url = new URL(address ?? ''); if (url.username || url.password) networkMasks.push(address); } catch { /* validated later */ }
}
for (const value of new Set(networkMasks)) if (value) process.stdout.write(`##vso[task.setsecret]${value.replace(/%/g, '%AZP25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}\n`);
