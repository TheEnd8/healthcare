# 全球生技醫療產業即時情報

- `index.html`：即時情報主頁；`analysis.html`：每日綜合分析；`admin.html`：標的清單管理
- `tickers.json`：標的清單（可用 admin.html 編輯）
- `scripts/update.mjs`、`.github/workflows/update.yml`：每日 3 次更新情報資料（輸出 `data/report.json`）
- `scripts/analyze.mjs`、`.github/workflows/analyze.yml`：每日綜合分析（輸出 `analysis/`）
- 必要設定：Secrets 內的 `GEMINI_KEY`；Actions 的 Workflow permissions 設為 Read and write；啟用 Pages
- 選用：變數 `INBOX_REPO` 與 Secret `INBOX_TOKEN`（私有收件匣 repo）
