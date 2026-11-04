# 工單15 Spec／security 複核

範圍：`7ddf4a0...f4f859d`；未讀 Standards，不含16。

**原 P2 已解決；未發現新增問題。** `src/command-log.ts:132–136` 將序列化結果中的每個井號改為 JSON `\u0023`，所以任何欄位／位置均不會保留 literal `##vso[` 或 `##[`；JSON.parse 仍還原原值，包括原有反斜線。`src/command-log.ts:173` 仍傳原始 Command；`src/dt/upload.ts:62–79` 只序列化日誌副本，真實 PUT、URL、headers、body 不變。

獨立重跑新增兩項回歸全過，涵蓋實際 console、秘密遮罩、單行、所有顯示欄位及 roundtrip。已核對既有 Windows Node20／24 各116測試、四組 dist／VSIX probes、Linux24 targeted18 成功紀錄；未重跑下載。真實 Azure／公開發布等外部驗收限制維持原狀。
