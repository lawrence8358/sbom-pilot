# 第三方資源

SBOM Pilot 程式碼採 MIT，作者 Lawrence Shen。發佈套件中的第三方依賴保留各套件授權檔案。

`src/schemas/` 的 `bom-1.6.schema.json`、`spdx.schema.json`、`jsf-0.82.schema.json` 直接取自 [CycloneDX specification 1.6 tag](https://github.com/CycloneDX/specification/tree/1.6/schema)，未修改，依 Apache-2.0 提供；完整授權附於 `src/schemas/LICENSE`。CycloneDX 是 OWASP Foundation 的專案。

AJV（MIT）、ajv-formats（MIT）、ajv-formats-draft2019（MIT）與其依賴經 esbuild 打包於 handler，完整授權隨 `dist/licenses/` 提供。Azure Pipelines SDK 與其依賴以原始套件及其授權檔案附於 `dist/node_modules/`。cdxgen（Apache-2.0）於執行時自 npm 下載，未包含於 VSIX。
