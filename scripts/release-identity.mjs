/** 驗證正式 metadata 的身分與 HTTPS URL；不查網路，也不宣稱已確認 Publisher 權限或公開性。 */
export function validateReleaseIdentity(publisher, repository) {
  const invalid = () => new Error('正式打包需設定實際 SBOM_PILOT_PUBLISHER 及有效、無認證、非佔位的公開 HTTPS SBOM_PILOT_REPOSITORY_URL。');
  if (!publisher || publisher === 'local-dev-placeholder' || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(publisher)) throw invalid();
  let url;
  try {
    if (typeof repository !== 'string' || repository.trim() !== repository || !/^https:\/\//i.test(repository) || /[<>{}]|%3[ce]|%7[bd]|\$\(/i.test(repository)) throw invalid();
    url = new URL(repository);
  } catch { throw invalid(); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash || /^(?:localhost|public-repository-url)$|(?:^|\.)(?:example\.(?:com|org|net)|test|example|invalid)$/i.test(url.hostname)) throw invalid();
  return { publisher, repository: url.href };
}
