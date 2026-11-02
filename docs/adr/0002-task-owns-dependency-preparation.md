# 單一 Task 負責依賴準備，Agent 提供傳統工具鏈

為取代使用者目前需要組合多個 Pipeline Task 的流程，SBOM Task 自行準備一般工具並執行專案依賴 restore／install，取代要求使用者另加 NodeTool、套件安裝與還原步驟的方式；這增加 Task 的工具版本與認證管理責任，但讓使用者以單一步驟完成 SBOM 工作流程。傳統 .NET Framework 所需的 Visual Studio Build Tools、MSBuild 與 workloads 仍由 Agent 預裝，避免在每次掃描中安裝整套工具鏈；此邊界由使用者在 Q6 選擇 A 確認。
