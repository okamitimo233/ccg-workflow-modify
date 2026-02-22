## ace-tool (Augment Code) 指引

### Core Capability
`mcp__ace-tool__search_context` — 语义代码检索引擎。参数：`project_root_path`（项目绝对路径）+ `query`（自然语言描述）。生成代码前必须调用，用于查找函数定义、调用链、架构模式。支持多目标语义查询，如 `"Provider interface, ProviderManager registration, ProviderSetting sealed class"`。

### Anti-patterns
- 已知标识符的全量搜索 → 用 Grep
- 已知路径文件查看 → 用 Read
- 第三方库 API 文档 → 用 Context7
- 禁止基于假设回答，信息不足时递归检索

### Query Examples
- `"Where is user authentication handled?"`
- `"How does the template injection system work?"`
- `"Provider interface and ProviderManager registration flow"`
