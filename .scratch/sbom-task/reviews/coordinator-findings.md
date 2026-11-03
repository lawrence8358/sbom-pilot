# 協調代理追加查核

固定產品 HEAD：8b6969d。與兩軸獨立報告分開記錄。

1. **正式打包 URL 驗證過寬。** scripts/package.mjs 僅以 /^https:\/\// 判斷 repository。用同一 predicate 的無副作用探針證實 `https://`、`https://<public-repository-url>` 均可通過；new URL 會拒絕兩者。`https://user:secret@example.com/project` 也會通過，可能把帳密放進公開 metadata。需驗證實際 HTTPS URL 語法、拒絕內嵌認證與文件佔位值；不假造 Repo 或聲稱能代替實際 Publisher／公開性驗收。
2. **Windows 快取發佈暫時 EPERM。** checkpoint13 保存真實產品 rename 失敗，發生於 staged Node --version 已驗證之後；目的快取不存在、own staging 已清理。未變更程式重跑成功，但沒有 handle/AV trace，原因未知。評估實作有界的 Windows 暫時 rename 重試，保留原子發佈、完整標記、競爭勝出者驗證、永久失敗回報與僅清理自己 staging；不得以無限重試或刪除目的地掩蓋。
