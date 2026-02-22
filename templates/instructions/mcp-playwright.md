## Playwright 指引

### Core Capability
`mcp__Playwright__browser_*` 系列工具 — 浏览器自动化。核心工具：`browser_snapshot`（获取页面可访问性快照，用于交互）、`browser_click`/`browser_type`（元素操作）、`browser_navigate`（页面导航）、`browser_evaluate`（执行 JS）。适用于 UI 测试验证、表单操作、页面截图。

### Anti-patterns
- 交互操作优先用 `browser_snapshot` 而非 `browser_take_screenshot`（前者返回可操作的元素引用）
- 非浏览器相关任务不使用 Playwright
- 操作元素前必须先 `browser_snapshot` 获取 `ref`

### Query Examples
- `"验证页面渲染结果是否包含预期元素"`
- `"填写登录表单并提交"`
- `"导航到设置页面并检查元素可见性"`
