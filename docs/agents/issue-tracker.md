# Issue 追蹤：本機 Markdown

本 repo 的 issue 與規格以 Markdown 檔案存放在 `.scratch/` 底下。

## 慣例

- 每個功能一個資料夾：`.scratch/<feature-slug>/`
- 規格檔為 `.scratch/<feature-slug>/spec.md`
- 實作 issue 每張工單一個檔案：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，從 `01` 開始編號，不要把所有工單合併成單一檔案
- 分類狀態記錄在每個 issue 檔案頂部附近的 `Status:` 行（狀態字串見 `triage-labels.md`）
- 留言與討論紀錄附加在檔案底部的 `## Comments` 標題下

## 當 skill 要求「發佈到 issue tracker」

在 `.scratch/<feature-slug>/` 底下建立新檔案（資料夾不存在就先建立）。

## 當 skill 要求「取得相關工單」

讀取指定路徑的檔案。使用者通常會直接提供路徑或 issue 編號。

## Wayfinding 操作

供 `/wayfinder` 使用。**map** 是一個檔案，每張工單對應一個 **child** 檔案。

- **Map**：`.scratch/<effort>/map.md`（內容包含 Notes / Decisions-so-far / Fog）。
- **Child 工單**：`.scratch/<effort>/issues/NN-<slug>.md`，從 `01` 開始編號，內文寫問題。`Type:` 行記錄工單類型（`research`/`prototype`/`grilling`/`task`），`Status:` 行記錄 `claimed`/`resolved`。
- **阻擋關係**：頂部附近加一行 `Blocked by: NN, NN`。列出的檔案全部 `resolved` 後，這張工單才算解除阻擋。
- **Frontier**：掃描 `.scratch/<effort>/issues/`，找出尚未結案、未被阻擋、未被認領的檔案，編號最小的優先。
- **認領**：開始任何工作前，先設定 `Status: claimed` 並存檔。
- **結案**：在 `## Answer` 標題下附上答案，設定 `Status: resolved`，再到 `map.md` 的 Decisions-so-far 附加一筆脈絡指引（摘要 + 連結）。
