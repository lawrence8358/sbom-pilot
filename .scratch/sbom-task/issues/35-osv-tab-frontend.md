# 35: 「OSV 弱點報告」頁籤前端（依資料契約）

Type: task
Status: ready-for-agent
Blocked by: None (can start immediately)

## 規格

[完整 SBOM 規格](../../full-sbom/spec.md)，使用者故事 16–17、20–21、23–28、31、33、39 的頁籤端；版面依預覽 https://claude.ai/artifact/9CVRQ5fCGwx7teFMnwA3Lv。

## 要建立的行為

SBOM Pilot 擴充套件新增建置結果頁籤「OSV 弱點報告」，只在執行過 SBOM Pilot 的建置出現。頁籤讀取本建置類型為 `sbom-pilot.osv-report` 的附件（下方資料契約），顯示判定行與「一、產品 SBOM 弱點」「二、開發套件額外弱點」兩個區塊的 8 欄表格；表格有框線與內距並跟隨 Azure DevOps 主題。本張以契約 fixture 開發與測試，不改 Task 端（Task 上傳附件由 32 負責）。

## 資料契約（schemaVersion 1，Task 與頁籤共用，由本張定義成共用型別）

```ts
type OsvSeverity = 'critical' | 'high' | 'medium' | 'low' | 'none' | 'unknown';
type OsvThreshold = Exclude<OsvSeverity, 'none'> | 'warnOnly'; // 沿用 osvFailOn 值
interface OsvTabFinding {
  severity: OsvSeverity; score?: number;          // CVSS 0–10，缺少為未知
  ecosystem: string; name: string; version: string;
  fixed: string[];                                // 建議升級；空陣列顯示「未提供」
  ids: string[]; cves: string[];                  // ids 為 OSV／GHSA；cves 為空時顯示「（無 CVE，僅 GHSA）」
  published?: string; modified?: string;          // UTC 日期 YYYY-MM-DD
}
interface OsvTabSection { status: 'completed' | 'failed' | 'disabled'; findings: OsvTabFinding[] }
interface OsvTabReport {
  schemaVersion: 1;
  generatedAt: string;                            // ISO 8601 含時區；頁籤以 UTC+8 顯示
  scannerVersion?: string;
  threshold?: OsvThreshold; exceeded: boolean; dtSkipped: boolean;
  sboms: { product: string; full: string };       // 檔名
  product: OsvTabSection;                         // 產品 SBOM 弱點
  developmentExtra: OsvTabSection;                // 完整 SBOM 扣除產品 SBOM 的弱點；任一次 OSV 失敗即 failed
}
```

## 驗收

- [ ] 共用型別定義資料契約，Task 端（32）可直接引用。
- [ ] `vss-extension.json` 新增建置結果頁籤元件（`supportsTasks` 為 SBOM Pilot Task ID）與 `vso.build` scope；頁籤以 azure-devops-extension-sdk／api 讀取本建置 `sbom-pilot.osv-report` 附件，不使用 React；打包進 VSIX 並通過既有封裝檢查。
- [ ] 判定行：是否超過門檻與門檻名稱、報告產生時間（UTC+8）、OSV Scanner 版本。
- [ ] 明細 8 欄：等級、CVSS、套件（名稱與生態系兩行）、目前版本、建議升級、弱點編號（CVE 與 OSV／GHSA ID 同欄各自連結）、發佈日期、最後修改；無 CVE 顯示「（無 CVE，僅 GHSA）」；缺漏顯示「未提供」。
- [ ] 表格框線、內距、整列 hover；顏色使用 Azure DevOps 主題變數，深色／淺色皆清楚；中文無亂碼。
- [ ] 外部字串以文字節點輸出；連結只允許 `https://osv.dev/`、`https://www.cve.org/`；惡意套件名稱不被當成 HTML。
- [ ] DOM 測試（例如 jsdom）以契約 fixture 驗證兩個區塊、無 CVE 標示、跳脫與門檻判定行；封裝測試驗證 tab 元件與 scopes。
- [ ] 總覽表、篩選、排序與空狀態不在本張（33）。

## Comments
