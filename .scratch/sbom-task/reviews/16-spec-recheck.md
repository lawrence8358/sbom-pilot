# 工單16最小增量 Spec／security 複核

範圍：`c4212ef...b231a69`，於整合後 `e6afa3b` 核對；未讀 Standards。

**未發現新增 Spec／security 問題。** `scripts/packaging-state.mjs:8` 的18個來源與原清單逐項一致，快照仍去重排序；fixture僅共用清單並另加 node_modules。五 CLI、private／public／preview、認證與授權 gate 未變。`docs/marketplace.md` 的兩個 Bash export 語法正確，變數名稱與實作相符，沿用替換實際身分的說明。

獨立唯讀 probe 通過：目前來源／dist 建置收據、真實 VSIX payload／連結及新交付目錄109個雜湊；runtime 仍為 `c937caf…`。已核對本輪雙平台 fresh preview、CLI完整性、legacy dev 與雙 Node probes 證據；未重跑116歷史矩陣或下載。實際 Publisher／Repo 與 Azure／Marketplace 外部驗收限制維持。
