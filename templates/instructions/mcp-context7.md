## Context7 指引

### Core Capability
两步流程查询第三方库文档：`mcp__context7__resolve-library-id`（库名 → libraryId）→ `mcp__context7__query-docs`（libraryId + query → 文档/示例）。适用于框架 API 用法、配置方式、升级迁移指南。

### Anti-patterns
- 本项目代码搜索 → 用 ace-tool / ContextWeaver
- 每问题最多调用 3 次，信息不足时用已有最佳结果
- query 要具体，避免单词查询如 `"auth"` 或 `"hooks"`

### Query Examples
- `"How to set up JWT authentication in Express.js"`
- `"React useEffect cleanup function examples"`
- `"Vite proxy configuration for development"`
