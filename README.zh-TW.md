# easy-mysql-mcp

一個輕量的 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server，讓 AI assistant 可以透過安全、結構化的工具介面檢查與查詢 MySQL 資料庫。

本專案使用 Node.js、TypeScript、官方 MCP SDK，以及 `mysql2/promise`。它透過 stdio 執行，因此可以直接被 Claude Desktop 等 MCP client 使用。

## 功能

- 使用 `mysql2/promise` 的 MySQL connection pool
- 用於資料讀取的 read-only query tool
- 用於資料修改的 execute tool
- 批次執行與 CSV 匯入/匯出工具
- tables、views、indexes、triggers 的 schema discovery tools
- 使用 `EXPLAIN` 檢查 query plan
- 檢查目前資料庫使用者與權限

## 需求

- Node.js 18 或更新版本
- npm
- 可連線的 MySQL-compatible database

## 安裝

直接使用 `npx` 執行 server：

```bash
npx -y easy-mysql-mcp
```

本機開發：

```bash
cd easy-mysql-mcp
npm install
npm run build
```

## 設定

你可以透過 MCP client configuration 或本機 `.env` 檔設定環境變數。

| 變數 | 必填 | 預設值 | 說明 |
| --- | --- | --- | --- |
| `MYSQL_HOST` | 是 | - | MySQL host name 或 IP address |
| `MYSQL_PORT` | 否 | `3306` | MySQL port |
| `MYSQL_USER` | 是 | - | MySQL 使用者名稱 |
| `MYSQL_PASSWORD` | 是 | - | MySQL 密碼 |
| `MYSQL_DATABASE` | 是 | - | 預設 database/schema |
| `MYSQL_CONNECTION_LIMIT` | 否 | `10` | pool 最大 active connections |
| `MYSQL_MAX_IDLE` | 否 | `10` | pool 最大 idle connections |
| `MYSQL_IDLE_TIMEOUT` | 否 | `60000` | idle connection timeout，單位毫秒 |
| `MYSQL_QUEUE_LIMIT` | 否 | `0` | 最大 queued connection requests，`0` 代表無限制 |
| `MYSQL_WAIT_FOR_CONNECTIONS` | 否 | `true` | connection 滿時是否等待 |
| `MYSQL_ENABLE_KEEP_ALIVE` | 否 | `true` | 是否啟用 TCP keep-alive |
| `MYSQL_KEEP_ALIVE_INITIAL_DELAY` | 否 | `0` | TCP keep-alive 初始延遲，單位毫秒 |
| `MYSQL_READ_ONLY` | 否 | `false` | 設為 `true` 時啟用唯讀模式，且不註冊 `mysql_execute` |
| `MYSQL_MCP_MODE` | 否 | `readwrite` | MCP policy mode。使用 `readonly` 可停用寫入執行 |
| `MYSQL_MCP_ALLOW_TABLES` | 否 | - | table allowlist，逗號分隔，例如 `users,orders` |
| `MYSQL_MCP_DENY_TABLES` | 否 | - | table denylist，逗號分隔，例如 `payments,secrets` |
| `MYSQL_BATCH_MAX_SIZE` | 否 | `100` | `mysql_batch_execute` 每個內部分批最多處理的參數組數 |
| `MYSQL_LOG_PATH` | 否 | `logs` | batch execution 與 CSV import log files 使用的目錄 |
| `MYSQL_POLICY_HOOK` | 否 | - | 外部 accept/reject/approval policy decision 的 HTTP POST URL |
| `MYSQL_APPROVAL_TTL_SECONDS` | 否 | `300` | pending approval 的有效秒數 |

範例 `.env`：

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=your_database
```

## 使用方式

設定 MCP client，讓它透過 `npx` 啟動 package。

本機開發時，先 build TypeScript source：

```bash
npm run build
```

啟動 MCP server：

```bash
npm start
```

這個 server 使用 stdio 溝通，通常會由 MCP client 啟動，而不是手動直接執行。

## Claude Desktop 範例

```json
{
  "mcpServers": {
    "easy-mysql-mcp": {
      "command": "npx",
      "args": ["-y", "easy-mysql-mcp"],
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "YOUR USERNAME",
        "MYSQL_PASSWORD": "YOUR PASSWORD",
        "MYSQL_DATABASE": "YOUR DB NAME"
      }
    }
  }
}
```

更新設定後，請重新啟動 Claude Desktop。

## Codex config.toml 範例

```toml
[mcp_servers.easy-mysql-mcp]
args = ["-y", "easy-mysql-mcp"]
command = "npx"
enabled = true

[mcp_servers.easy-mysql-mcp.env]
MYSQL_HOST = "localhost"
MYSQL_PORT = "3306"
MYSQL_USER = "YOUR USERNAME"
MYSQL_PASSWORD = "YOUR PASSWORD"
MYSQL_DATABASE = "YOUR DB NAME"
```

## OpenCode opencode.jsonc 範例

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "easy-mysql-mcp": {
      "type": "local",
      "command": ["npx", "-y", "easy-mysql-mcp"],
      "enabled": true,
      "environment": {
        "MYSQL_HOST": "localhost",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "YOUR USERNAME",
        "MYSQL_PASSWORD": "YOUR PASSWORD",
        "MYSQL_DATABASE": "YOUR DB NAME",
      },
    },
  },
}
```

## 可用工具

| 工具 | 說明 |
| --- | --- |
| `mysql_query` | 執行用於資料讀取的 SQL query，例如 `SELECT` |
| `mysql_execute` | 執行資料修改 statement，例如 `INSERT`、`UPDATE`、`DELETE` |
| `mysql_batch_execute` | 使用多組參數重複執行同一個資料修改 statement |
| `mysql_import_csv` | 使用 CSV header row 作為欄位名稱，將 UTF-8 CSV 匯入 table |
| `mysql_export_csv` | 將 table 的所有 rows 匯出為 UTF-8 CSV |
| `explain_query` | 對 SQL query 執行 `EXPLAIN` 並回傳 execution plan |
| `list_tables` | 列出目前 database 的 base tables，包含約略 row count 與 comment |
| `list_views` | 列出目前 database 的 views |
| `describe_table` | 顯示一個或多個 tables 的欄位資訊 |
| `describe_index` | 顯示 table indexes |
| `list_triggers` | 列出目前 database 的 triggers |
| `get_current_privileges` | 顯示目前 MySQL 使用者與 grants |
| `mysql_run_approved_command` | approval 後執行 pending command，只有設定 `MYSQL_POLICY_HOOK` 時註冊 |
| `mysql_list_pending_approvals` | 列出 pending approval requests，只有設定 `MYSQL_POLICY_HOOK` 時註冊 |
| `mysql_cancel_approval` | 取消 pending approval request，只有設定 `MYSQL_POLICY_HOOK` 時註冊 |

當 `MYSQL_READ_ONLY=true` 或 `MYSQL_MCP_MODE=readonly` 時，`mysql_execute`、`mysql_batch_execute`、`mysql_import_csv` 不會被註冊。

### Batch Execute

`mysql_batch_execute` 會使用多組參數重複執行同一個 parameterized write statement。它適合 bulk insert 或 repeated update，而且不需要啟用 multi-statement SQL。

範例輸入：

```json
{
  "sql": "INSERT INTO users (name, email) VALUES (?, ?)",
  "paramsList": [
    ["Alice", "alice@example.com"],
    ["Bob", "bob@example.com"]
  ],
  "transaction": "all"
}
```

`transaction` 控制 transaction scope：

| 值 | 行為 |
| --- | --- |
| `all` | 預設值。所有 rows 包在同一個 transaction |
| `batch` | 每個內部分批各自一個 transaction |
| `each` | 每一組參數各自一個 transaction |
| `none` | 不主動開啟 transaction |

server 會依照 `MYSQL_BATCH_MAX_SIZE` 將 `paramsList` 切成內部分批。例如預設大小 `100` 時，`250` 組參數會切成 `100`、`100`、`50`。

詳細的逐筆執行結果會寫到 `MYSQL_LOG_PATH` 底下具時間戳記的 `.log` 檔，預設目錄是 `logs/`。tool response 只會回傳摘要數字與 log file path。server 啟動時會自動清理超過七天的 log files。

### CSV 匯入與匯出

`mysql_import_csv` 會讀取 UTF-8 CSV file 並插入 table。第一列必須是欄位名稱，每一列資料欄位數都必須相同。內部會建立 parameterized `INSERT` statement，並透過與 `mysql_batch_execute` 相同的 batch execution path 執行。

匯入範例：

```json
{
  "tableName": "users",
  "filePath": "./data/users.csv",
  "transaction": "all"
}
```

`mysql_export_csv` 會將 table 的所有 rows 匯出為 UTF-8 CSV file。即使 table 沒有 rows，也會使用 table 欄位名稱寫出 header row。

匯出範例：

```json
{
  "tableName": "users",
  "filePath": "./exports/users.csv"
}
```

CSV 匯入/匯出使用標準逗號分隔 CSV 與雙引號 escaping。空白 CSV field 會以空字串匯入。

## SQL Policy

server 在執行使用者提供的 SQL 前，會套用輕量 SQL policy：

- `mysql_query` 只允許單一 statement 的 `SELECT`、`SHOW`、`DESCRIBE`、`EXPLAIN` queries。
- `explain_query` 只接受單一 `SELECT` statement，並對它執行 `EXPLAIN`。
- `mysql_execute` 在 write mode 啟用時，只允許單一 statement 的 `INSERT`、`UPDATE`、`DELETE`、`REPLACE`。
- `mysql_batch_execute` 使用與 `mysql_execute` 相同的 SQL policy，並用多組參數重複執行。
- `mysql_import_csv` 使用 table policy，並走與 `mysql_batch_execute` 相同的 batch execution path。
- `mysql_export_csv` 會在匯出 table data 前套用 table policy。
- multi-statement SQL 會被拒絕。
- read-query tools 會拒絕 `SELECT ... INTO` 與 locking reads。
- `MYSQL_MCP_DENY_TABLES` 優先於 `MYSQL_MCP_ALLOW_TABLES`。
- 如果設定 `MYSQL_MCP_ALLOW_TABLES`，每個偵測到的 table 都必須包含在 allowlist 中。

Table policy matching 是基於 SQL parsing 的 best-effort guardrail。你可以使用 `table` 或 `database.table` entries。MySQL grants 仍然是最終安全邊界。

### Policy 優先順序

Policy checks 會依照以下順序執行：

1. 先執行內建 SQL safety checks，例如 single-statement enforcement，以及每個 tool 允許的 statement types。
2. 接著檢查 `MYSQL_MCP_DENY_TABLES`。如果偵測到的 table 命中 denylist，command 會立即被拒絕。
3. 再檢查 `MYSQL_MCP_ALLOW_TABLES`。如果有設定 allowlist，每個偵測到的 table 都必須包含在 allowlist 中。
4. `MYSQL_POLICY_HOOK` 只會在內建 SQL policy 與 table allow/deny policy 都通過後才執行。

如果同時設定 `MYSQL_MCP_ALLOW_TABLES` 與 `MYSQL_MCP_DENY_TABLES`，denylist 優先。例如：

```env
MYSQL_MCP_ALLOW_TABLES=users,orders,payments
MYSQL_MCP_DENY_TABLES=payments
```

在這個設定下，`users` 與 `orders` 允許，`payments` 會被拒絕，其他 tables 也會被拒絕，因為它們不在 allowlist 中。

`MYSQL_POLICY_HOOK` 不能覆蓋內建 policy 的拒絕結果。它只能在 command 已經通過本機 policy 後，決定接下來是 `accept`、`reject`，或 `approval_required`。

## Policy Hook 與 Approval

設定 `MYSQL_POLICY_HOOK` 後，server 會在內建 policy 通過後、command 真正執行前，將每個 tool action POST 到 hook。

Hook request 範例：

```json
{
  "functionName": "mysql_execute",
  "sql": "UPDATE users SET email = ? WHERE id = ?",
  "statementType": "update",
  "tableNames": ["users"],
  "paramsPreview": ["new@example.com", 123],
  "metadata": {
    "database": "app_db",
    "mode": "readwrite",
    "timestamp": "2026-05-20T12:00:00.000Z"
  }
}
```

hook 必須回傳以下其中一種：

```json
{ "status": "accept" }
```

```json
{ "status": "reject", "message": "Writes are blocked outside maintenance windows." }
```

```json
{
  "status": "approval_required",
  "message": "User approval is required before updating users."
}
```

如果回傳 `approval_required`，server 不會執行 command。它會將原始 pending command 存在記憶體中，並回傳包含 server-generated `approvalId` 的 `approval_required` response。hook 不提供 approval id。MCP host 取得使用者同意後，可以使用 `mysql_run_approved_command` 並傳入：

```json
{
  "approvalId": "apv_..."
}
```

Pending approvals 是 one-time use，並會在 `MYSQL_APPROVAL_TTL_SECONDS` 後過期。設定 `MYSQL_POLICY_HOOK` 時，也會提供 `mysql_list_pending_approvals` 與 `mysql_cancel_approval`。

這是一個 approval-friendly protocol。server 無法驗證是否真的有人類批准；MCP host 或外部平台負責將 approval request 呈現給使用者。

## 安全注意事項

- 使用 dedicated MySQL user，並只給 assistant 所需的最小權限。
- 如果只需要 inspection/reporting，建議使用 read-only database credentials。
- 使用 `MYSQL_READ_ONLY=true` 或 `MYSQL_MCP_MODE=readonly`，可以避免 write execution tools 暴露給 MCP clients。
- `MYSQL_MCP_ALLOW_TABLES` 與 `MYSQL_MCP_DENY_TABLES` 是 MCP 層 guardrails，不能取代 MySQL grants。
- 需要外部 policy 或 approval workflow 時，可使用 `MYSQL_POLICY_HOOK`。
- 請小心使用 `mysql_execute`，它可以修改資料。
- 請小心使用 `mysql_import_csv`，它可以插入大量資料。
- batch execution 與 CSV import logs 會包含參數值與逐筆結果。請將 `MYSQL_LOG_PATH` 下的檔案視為敏感資料。
- CSV export 會將 table data 寫到本機 filesystem。請將匯出檔視為敏感資料。
- MySQL client configuration 已停用 multi-statement SQL。
- 不要將 `.env` 或真實 database credentials commit 到 GitHub。
- 對 production data 執行前，請審查 AI 產生的 SQL。

## 開發

```bash
npm run dev
```

這會以 watch mode 執行 TypeScript。

建立 production build：

```bash
npm run build
```

執行 integration test suite 前，請在 `.env` 設定 test database：

```env
TEST_HOST=localhost
TEST_PORT=3306
TEST_USERNAME=test_user
TEST_PASSWORD=test_password
TEST_DB=test_database
```

然後執行：

```bash
npm run test
```

測試會在 `TEST_DB` 建立並刪除暫時 tables、view、trigger。如果缺少 `TEST_*` 變數，integration test 會被 skip。

## 專案結構

```text
src/
  config.ts   由環境變數驅動的 MCP policy configuration
  csv.ts      CSV parsing 與 writing helpers
  csvTools.ts CSV import/export tool implementations
  db.ts       MySQL pool 與 query helpers
  index.ts    MCP server 與 tool registration
  logs.ts     Batch execution log helpers
  policyHook.ts External policy hook client 與 approval response helpers
  sqlPolicy.ts SQL parsing 與 policy enforcement
  toolHandlers.ts Shared tool handler implementations
  approvalStore.ts In-memory pending approval store
```

## 授權

MIT。請參考 [LICENSE.md](LICENSE.md)。
