import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import addInternationalFormats from 'ajv-formats-draft2019';
import { SUPPORTED_SPEC_VERSIONS } from './tool-options';

export interface ValidatedSbom { path: string; componentCount: number }
export type SbomValidator = (path: string, specVersion: string) => Promise<ValidatedSbom>;
export const validateSbom: SbomValidator = async (path, specVersion) => {
  if (!SUPPORTED_SPEC_VERSIONS.includes(specVersion as '1.6')) throw new Error('此版本僅提供 CycloneDX 1.6 官方 Schema。');
  let value: any;
  try { value = JSON.parse(await readFile(path, 'utf8')); }
  catch { throw new Error('SBOM 不存在或不是可解析 JSON。'); }
  if (value.bomFormat !== 'CycloneDX' || value.specVersion !== specVersion) throw new Error('SBOM 格式或規格版本不符。');
  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: true });
  addFormats(ajv);
  addInternationalFormats(ajv);
  for (const name of ['spdx.schema.json', 'jsf-0.82.schema.json']) {
    ajv.addSchema(JSON.parse(await readFile(join(__dirname, 'schemas', name), 'utf8')));
  }
  const schema = JSON.parse(await readFile(join(__dirname, 'schemas', `bom-${specVersion}.schema.json`), 'utf8'));
  const validate = ajv.compile<any>(schema);
  if (!validate(value)) {
    // Report schema paths only; component contents can contain sensitive source URLs.
    throw new Error(`SBOM 未通過 CycloneDX ${specVersion} JSON Schema：${validate.errors?.map(error => `${error.instancePath} ${error.keyword}`).slice(0, 8).join('; ')}`);
  }
  const count = (components: any[]): number => components.reduce((sum, component) => sum + 1 + count(component.components ?? []), 0);
  return { path, componentCount: count(value.components ?? []) };
};
