# 28: OSV 工具快取在 Windows 並行寫入時不再讓 Task 失敗

Type: task
Status: ready-for-agent
Blocked by: 27

## 背景

既有測試 `concurrent population only leaves a verified usable cache` 在 Windows 偶發失敗（EPERM rename）。快取寫入分兩步：先改名執行檔、再改名 `.json` 身分檔。兩個工作同時以相同版本冷啟動時，落後者改名執行檔會在 Windows 得到 EPERM；錯誤處理只檢查一次勝出快取，若勝出者尚未改名 `.json`，即判定無效並讓 Task 失敗。實際情境：同一台機器多個 Agent 共用 `AGENT_TOOLSDIRECTORY`、且快取尚未建立。

## 要建立的行為

並行建立同一版本快取時，落後者不因暫時性檔案系統錯誤而失敗：
- 改名遇到 EPERM／EACCES／EBUSY 時，以短暫退避重試（總等待約 2 秒內），每次先檢查勝出者快取是否已完整有效，有效即直接使用。
- 重試後仍無有效快取時，本次執行改用自己已通過 SHA-256 與版本驗證的執行檔（複製到本次工作暫存目錄，不寫入共用快取），並記錄一行說明 log。
- 其他錯誤（非暫時性）維持原本行為，明確失敗。
- 安全性不變：只使用已驗證 SHA-256 與實際版本的執行檔；不刪除對方快取。

## 驗收

- [ ] 測試可注入改名行為，確定性重現「勝出者已改名執行檔、尚未改名 `.json`」與「持續 EPERM」兩種情境，不依賴實際競爭時序。
- [ ] 前者：落後者等待後重用勝出快取，不重新下載寫入；後者：落後者使用暫存複本完成，log 說明未寫入快取，回傳的執行檔可執行且通過驗證。
- [ ] 非暫時性錯誤（例如 ENOSPC）仍讓取得工具失敗。
- [ ] 原 `concurrent population` 測試在 Windows 連跑多次皆通過（記錄次數）。
- [ ] typecheck、test、format:check、check:source-comments、test:smoke:osv 通過；release notes 0.3.0 補一行修正說明。

## Comments
