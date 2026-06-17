# easy-mysql-mcp Manual

`easy-mysql-mcp` 是一個用來操作 MySQL 的 MCP server，提供查詢、寫入、批次執行、CSV 匯入，以及 schema / 權限檢查工具。

## Overview

適合用在：
- 讀取資料
- 新增、更新、刪除資料
- 批次執行 SQL
- CSV 匯入與匯出
- 需要查看 schema、index、trigger、權限與 query plan 的場景

不適合用在：
- 多語句 SQL
- 未驗證字串直接拼接 SQL
- 繞過 denylist / allowlist / policy hook

## When to Consult This Manual

如果你遇到以下情況，先看這份手冊：
- 不確定 `mysql_query`、`mysql_execute`、`mysql_batch_execute` 要怎麼用
- SQL 被拒絕或回傳錯誤
- 不確定 `?` 參數要怎麼綁定
- 不確定哪些 SQL 寫法是安全且允許的
- 不確定應該先查 schema 還是直接執行

## Modes

- `readonly`: 只提供讀取相關工具
- `readwrite`: 預設模式，允許一般讀寫，但不包含 DDL
- `advanced`: 允許 schema / DDL 類工具

## Tools

- `mysql_query`: 讀取資料
- `mysql_execute`: 執行單一寫入或變更 SQL
- `mysql_batch_execute`: 以多組參數批次執行同一段 SQL
- `mysql_import_csv`: 匯入 UTF-8 CSV
- `mysql_export_csv`: 匯出表格為 UTF-8 CSV
- `mysql_schema_execute`: 執行 schema / DDL 變更，僅 advanced 模式可用
- `mysql_list_pending_approvals`: 列出待審核命令
- `mysql_run_approved_command`: 執行已核准命令
- `mysql_cancel_approval`: 取消審核
- `explain_query`: 檢查 query plan
- `list_tables`, `list_views`, `describe_table`, `describe_index`, `list_triggers`
- `get_current_privileges`

## Execute Usage

`mysql_execute` 只應使用單一 SQL 指令。適合：
- `INSERT`
- `UPDATE`
- `DELETE`

`mysql_batch_execute` 適合：
- 同一個 SQL 搭配多組參數重複執行
- 大量資料寫入

不要這樣用：
- 多語句連寫
- 把使用者輸入直接拼到 SQL 字串裡

參數寫法以 `mysql2` 的 binding 方式為準：
- 位置型參數使用 `?`
- 批次執行時，`paramsList` 裡每一組參數都會依序對應 SQL 中的 `?`
- 建議不要手動拼接字串值，改用參數綁定

## SQL Algebra / Composition Rules

MySQL 查詢可視為一個由上而下組裝的代數式：

1. 先決定資料來源：`FROM`
2. 再加條件：`WHERE`
3. 需要關聯時使用 `JOIN ... ON`
4. 有聚合時使用 `GROUP BY`
5. 聚合後條件放在 `HAVING`
6. 排序使用 `ORDER BY`
7. 最後限制筆數：`LIMIT` / `OFFSET`

常見正確組合：
- 單表查詢：`SELECT ... FROM ... WHERE ...`
- 聚合查詢：`SELECT ... COUNT(*) ... GROUP BY ... HAVING ...`
- 多表查詢：`SELECT ... FROM a JOIN b ON ... WHERE ...`

值與欄位的規則：
- 欄位名稱必要時用反引號包住
- 字串值使用單引號
- 數值不要加引號
- 日期與時間要用正確的 SQL 字面值
- 不要把未驗證內容直接串進條件式

## Safety Rules

- 不支援 multi-statement
- 不支援 `SELECT ... INTO`
- 不支援 locking reads
- 不支援 `CREATE TABLE ... AS SELECT`
- 寫入前先確認 schema
- deny tables 的優先級高於 allow tables

## Examples

- 查詢單一使用者：
  - `SELECT id, name FROM users WHERE id = ?`
- 聚合統計：
  - `SELECT status, COUNT(*) FROM orders GROUP BY status`
- join 查詢：
  - `SELECT o.id, u.name FROM orders o JOIN users u ON o.user_id = u.id`
- 更新資料：
  - `UPDATE users SET name = ? WHERE id = ?`
- 分頁查詢：
  - `SELECT * FROM posts ORDER BY created_at DESC LIMIT 20 OFFSET 0`

## Troubleshooting

- 查不到欄位時，先用 `describe_table`
- SQL 被拒絕時，先檢查是否是多語句或受限語法
- 結果不如預期時，先確認 `WHERE` 與 `JOIN ON`
- 效能不好時，先看 `explain_query`
