import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import addInternationalFormats from 'ajv-formats-draft2019';
import { SUPPORTED_SPEC_VERSIONS } from './tool-options';

export interface ValidatedSbom {
  path: string;
  componentCount: number;
}
export type SbomValidator = (path: string, specVersion: string) => Promise<ValidatedSbom>;
/** 以官方 CycloneDX Schema 與格式驗證 SBOM，只回報安全路徑錯誤並統計有效組件。 */
export const validateSbom: SbomValidator = async (path, specVersion) => {
  if (!SUPPORTED_SPEC_VERSIONS.includes(specVersion as '1.6')) {
    throw new Error('此版本僅提供 CycloneDX 1.6 官方 Schema。');
  }
  let value: any;
  try {
    value = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error('SBOM 不存在或不是可解析 JSON。');
  }
  if (value.bomFormat !== 'CycloneDX' || value.specVersion !== specVersion) {
    throw new Error('SBOM 格式或規格版本不符。');
  }
  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: true });
  addFormats(ajv);
  addInternationalFormats(ajv);
  // RFC 3987 的 ASCII URI-reference 也是有效 IRI-reference。上游 draft2019 誤拒
  // git+https 等未註冊協定，也會接受部分錯誤 ASCII URL；ASCII 改用 URI 語法，
  // 含 Unicode 的參照仍使用國際化格式驗證。
  const syntax = new Ajv({ strict: false });
  addFormats(syntax);
  addInternationalFormats(syntax);
  /** 驗證 ASCII 參照的 URI 語法，補足上游 IRI 格式檢查的誤判。 */
  const uriReference = syntax.compile({ type: 'string', format: 'uri-reference' });
  /** 保留含 Unicode 參照的國際化驗證，不以 ASCII URL 規則誤拒合法內容。 */
  const internationalReference = syntax.compile({ type: 'string', format: 'iri-reference' });
  ajv.addFormat('iri-reference', (reference: string) =>
    /^[\x00-\x7f]*$/.test(reference)
      ? uriReference(reference) === true
      : internationalReference(reference) === true,
  );
  for (const name of ['spdx.schema.json', 'jsf-0.82.schema.json']) {
    ajv.addSchema(JSON.parse(await readFile(join(__dirname, 'schemas', name), 'utf8')));
  }
  const schema = JSON.parse(
    await readFile(join(__dirname, 'schemas', `bom-${specVersion}.schema.json`), 'utf8'),
  );
  /** 以已註冊的官方子 Schema 及格式規則驗證整份 BOM。 */
  const validate = ajv.compile<any>(schema);
  if (!validate(value)) {
    // 只回報 Schema 路徑；組件內容可能包含敏感來源 URL。
    throw new Error(
      `SBOM 未通過 CycloneDX ${specVersion} JSON Schema：${validate.errors
        ?.map((error) => `${error.instancePath} ${error.keyword}`)
        .slice(0, 8)
        .join('; ')}`,
    );
  }
  /** 遞迴計算組件及其巢狀 components，避免只統計最外層清單。 */
  const count = (components: any[]): number =>
    components.reduce((sum, component) => sum + 1 + count(component.components ?? []), 0);
  return { path, componentCount: count(value.components ?? []) };
};
