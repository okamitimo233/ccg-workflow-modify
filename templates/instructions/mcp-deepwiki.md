## DeepWiki 指引

### Core Capability
`mcp__mcp-deepwiki__deepwiki_fetch` — 获取 GitHub 仓库架构文档。输入：URL、`owner/repo`、`"owner repo"` 或库关键词。`maxDepth: 0` 单页概览，`maxDepth: 1` 多页详情。返回 Markdown 格式，适用于评估技术选型、理解开源项目架构设计。

### Anti-patterns
- 查询 API 用法 → 用 Context7
- 查找本项目代码 → 用 ace-tool / ContextWeaver
- 不适合获取实时更新的文档（有缓存延迟）

### Query Examples
- `"vercel/ai"` — 了解 Vercel AI SDK 架构
- `"How is the module system designed in facebook/react?"`
