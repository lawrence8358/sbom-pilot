# 第三方資源

SBOM Pilot 程式碼採 MIT，作者 Lawrence Shen。發佈套件中的第三方依賴保留各套件授權檔案。

`src/schemas/` 的 `bom-1.6.schema.json`、`spdx.schema.json`、`jsf-0.82.schema.json` 直接取自 [CycloneDX specification 1.6 tag](https://github.com/CycloneDX/specification/tree/1.6/schema)，未修改，依 Apache-2.0 提供；完整授權附於 `src/schemas/LICENSE`。CycloneDX 是 OWASP Foundation 的專案。

AJV（MIT）、ajv-formats（MIT）、ajv-formats-draft2019（MIT）、yaml（ISC）、jsonc-parser（MIT）、https-proxy-agent（MIT）及其依賴經 esbuild 打包於 handler，授權告示隨 `dist/licenses/` 提供。Azure Pipelines SDK 與其依賴以原始套件附於 `dist/node_modules/`。`dist/licenses/manifest.json` 記錄實際名稱、版本、宣告授權與告示路徑，包括巢狀版本；建置及套件驗證會檢查告示檔案存在。

truncate-utf8-bytes1.0.2 的 npm 套件遺漏完整告示，已從上游取得與三個 runtime 來源檔案逐位元組相同的版本所附原始 WTFPL 告示，保存於 [third-party](third-party/truncate-utf8-bytes-1.0.2/README.md)，建置時補入套件，保留原始 AUTHORS。

nodejs-file-downloader4.13.0（Azure SDK 的 runtime 依賴）在原始 package.json 宣告 ISC、作者 ibrod83，但 npm 套件與檢查時的上游 repository 未提供完整告示。本專案保留原始 metadata 與來源連結，於 manifest 明列 `upstreamNoticeMissing:true`，未自行補寫授權或著作權文字。此項仍需上游／維護者確認，正式打包目前會拒絕未解決項目；開發 VSIX 不代表已可公開發佈。

cdxgen（Apache-2.0）於執行時自 npm 下載，未包含於 VSIX。
