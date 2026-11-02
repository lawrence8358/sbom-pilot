# 08: 將 SBOM 上傳至指定 DT 專案

Status: ready-for-agent
Blocked by: 01

**What to build:** 使用者啟用 DT 開關並提供既有 DT 專案資料後，同一 Task 上傳剛產生的 SBOM。DT 接受請求即完成；上傳失敗仍保留可下載的有效 SBOM，並以失敗結果結束 Task。

## Acceptance criteria

- [ ] DT 啟用時顯示並驗證 API URL、Project UUID、API Key；URL 預設為原需求指定的 localhost 8081 服務位置，其餘兩項無預設。說明 localhost 指執行 Task 的 Agent。
- [ ] DT 關閉時不驗證、不使用 DT 欄位，也不隱藏或停用掃描路徑、排除規則與 Spec Version；仍可產生並發佈有效 SBOM。
- [ ] 上傳與成品中的 SBOM 檔案內容一致，目標為指定的既有 Project UUID；不自動建立專案或改以名稱推定其他 DT 專案。
- [ ] API 接受上傳即算上傳完成，日誌顯示「已接受上傳」，不等待背景匯入或弱點分析，也不把 token 已不在處理中當作匯入成功的證據。
- [ ] TLS 預設驗證，進階略過檢查選項預設關閉；作用範圍限 DT 連線，不改變其他工具或套件來源的 TLS 行為。
- [ ] API Key 可由 Secret Pipeline Variable 傳入，成功、錯誤、重試及例外輸出均不洩漏其內容；網路操作使用明確、有界的逾時及重試。
- [ ] 連線、認證或 HTTP 上傳失敗時，仍嘗試發佈已驗證有效的 SBOM 成品，最後 Task 失敗；成品發佈失敗亦不得宣告整個 Task 成功。
- [ ] 提供接受上傳、關閉 DT、缺少必填欄位、認證失敗、逾時、TLS 及失敗後成品仍可取得的驗證；README 更新設定、成功邊界、失敗行為與範例。

## Comments

- 使用者已核可本工單及其阻擋關係；第一版不提供弱點門檻阻擋建置。
