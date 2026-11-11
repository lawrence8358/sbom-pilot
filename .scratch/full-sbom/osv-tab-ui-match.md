# 頁籤 UI 依設計稿重做（0.3.4）

使用者核可的設計稿：`.scratch/full-sbom/osv-tab-design.dc.html`（Design canvas 的 `.dc.html`，`<x-dc>` 內是版面與 inline style，`<script data-dc-script>` 內是範例資料與互動邏輯；`{{...}}` 為樣板變數）。線上預覽 https://claude.ai/code/artifact/4263ce3b-d245-4ef6-9121-c902bdbcabb3 。
0.3.3 實機頁籤只有素樸表格，與設計稿差異過大，需重做 `src/osv-tab/render.ts` 與 `src/osv-tab/styles.css` 的呈現，使實際頁籤外觀與結構與設計稿一致。

## 必須一致
1. 不要做設計稿最上方的假建置標題與假頁籤列（`#2741 …`、Summary／Code Coverage／OSV 弱點報告 nav），那是 Azure DevOps 自己的外框。從 `<section>` 卡片開始。
2. 卡片：背景 card 色、1px border、圓角 4px、內距 24px 28px、子元素 gap 22px，最大寬 1360px 置中，頁面外距 24px 32px 48px。
3. 標題列：盾牌勾勾 inline SVG（設計稿同一 path，`aria-hidden`）＋ h1「OSV 弱點報告」26px/600。
4. 判定列（flex wrap，13px）：判定 pill（超標：failBg／failText＋叉叉 SVG「超過失敗門檻「X」…」；未超標：成功色 pill＋勾勾「未超過失敗門檻「X」」；僅警告、OSV 未執行、失敗、產品掃描失敗但完整超標等既有狀態文字沿用目前邏輯，只改外觀），其後「報告產生時間 …（UTC+8）」「OSV Scanner x.y.z」，label 用 muted、值用 text 色；若略過 DT 也放在此列。
5. 總覽表：欄位「範圍｜SBOM｜受影響套件｜弱點｜危急｜高｜中｜低｜無｜未知」，等級表頭帶色點；數字靠右；0 用 zero 色；SBOM 用等寬 code 12px；三列 產品／開發套件額外／完整合計（完整合計 SBOM 空白）。
6. 篩選列：「篩選等級」label＋六顆圓角 16px 的 chip（色點＋等級＋數量），按下狀態 head 背景實線框、取消狀態透明虛線框 opacity .75，`aria-pressed`；最後「全部顯示」為連結色文字按鈕。
7. 兩個區塊：上方 border-top＋padding-top 18px；標題 h2 18px＋SBOM 檔名 code（muted）＋「顯示 N ／ M 筆」；下一行說明文字（產品：「部署到正式環境的套件，請優先處理。」；開發套件額外：「只出現在完整 SBOM（含開發套件）、產品 SBOM 未列的項目；影響建置與開發工具鏈，不隨產品部署。」）；空狀態為虛線框文字。
8. 明細表：class 樣式同設計稿 `.osv-table`（collapse、1px border、padding 8px 12px、表頭 head 背景、整列 hover、min-width 980px 外層 overflow-x auto）；等級欄為色點＋粗體等級；CVSS 靠右一位小數、缺少為「—」；套件兩行（粗體名稱／12px muted 生態系）；建議升級粗體 fix 色；弱點編號每個連結一行，無 CVE 時上方 12px muted「（無 CVE，僅 GHSA）」；排序表頭為無框按鈕＋muted 小箭頭（作用中 ▲／▼，其餘可排序欄 ↕），`aria-sort`。
9. 底部說明：12px muted、border-top、與設計稿同文字，`OSV弱點報告-產品.md`／`OSV弱點報告-完整.md`、OSV Scanner 與 FIRST CVSS 連結（https 白名單需允許這兩個說明連結，或改為純文字；外部資料連結仍只允許 osv.dev、cve.org）。
10. 色點：危急 #e81123、高 #f7630c、中 #ffb900、低 #2b88d8、無 #a19f9d 實心、未知 #a19f9d 空心環。

## 主題
設計稿的 dark／light 調色盤（renderVals 內 `t`）是目標顏色。實作以 CSS 變數 `--page --card --head --hover --border --text --muted --link --fix --failBg --failText --zero`（另加成功 pill 色）定義兩組值；`SDK.init({applyTheme:true})` 後依主機注入的 `--background-color`（或 body 背景）亮度判斷深淺，在根元素設 `data-theme="dark|light"` 切換；判斷不到時以 `prefers-color-scheme` 為準。page 背景可沿用主機 `--background-color` 讓頁籤與外框一致。

## 不變
資料契約、載入流程、篩選／排序／空狀態行為與既有測試語意不變；外部字串仍以文字節點輸出；不使用 innerHTML。
