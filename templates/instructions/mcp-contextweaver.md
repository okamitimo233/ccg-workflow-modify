## ContextWeaver 指引

### Core Capability
`mcp__contextweaver__codebase-retrieval` — 本地混合搜索 + Rerank 代码检索。参数：`information_request`（自然语言描述）。实时索引代码库，返回最相关的代码片段。适用于不确定文件位置时的语义发现。

### Anti-patterns
- 第三方库文档查询 → 用 Context7
- 已知文件路径查看 → 用 Read
- 已知标识符精确搜索 → 用 Grep
- 开源仓库架构理解 → 用 DeepWiki

### Query Examples
- `"How does the template injection system work?"`
- `"Find error handling patterns in CLI commands"`
- `"What is the config loading and validation flow?"`
