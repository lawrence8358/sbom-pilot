declare module 'ajv-formats-draft2019' {
  import type Ajv from 'ajv';
  /** 宣告 Ajv 的國際化格式擴充型別，讓官方 CycloneDX IRI 驗證可供編譯器檢查。 */
  export default function addInternationalFormats(ajv: Ajv): Ajv;
}
