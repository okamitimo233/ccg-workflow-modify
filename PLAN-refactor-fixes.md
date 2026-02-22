# Refactor 分支修复计划

> **创建时间**: 2026-02-22 10:04
> **基线分支**: `refactor`（基于 `main`）
> **目标**: 解决代码审查发现的所有 Critical / Major / Minor 问题
> **状态**: ✅ 全部完成 (2026-02-22)

---

## 架构决策表

| 决策点 | 选项 | 选定 | 理由 |
|--------|------|------|------|
| update 命令适配 | A) 按安装源分流 B) 统一回 npm | A | 已决定 GitHub 直装，update 需适配 |
| strategy 默认值 | A) 恢复 parallel B) 保留 fallback + 声明 Breaking | A | 保持与旧版一致，避免迁移时值变化引发混淆；该字段当前无运行时消费者 |
| deprecated 字段清理 | A) 核心接口移除 B) 保留现状 | A | migrateConfig 已在边界处理 |
| semver 解析 | A) 引入 semver 库 B) 自行实现 | A | 标准库可靠性高，体积小 |

---

## Critical — 必须修复

### C1. update 命令在 GitHub 直装模式下不可用 ✅

- **文件**: `src/utils/version.ts`, `src/commands/update.ts`
- **修复方案**:
  - [x] 1.1 `src/utils/version.ts` — `getLatestVersion()` 增加 GitHub API 分支：通过 gh CLI 或 curl 读取远程 `package.json` 获取版本
  - [x] 1.2 `src/utils/version.ts` — 新增 `detectInstallSource(): 'npm' | 'github'` 函数，根据 _resolved / _from / 路径特征判断来源
  - [x] 1.3 `src/commands/update.ts` — `performUpdate()` 按安装源分流：GitHub 来源使用 `npx github:okamitimo233/ccg-workflow-modify#<branch>`
  - [x] 1.4 `src/commands/update.ts` — init --force 路径同步适配
  - [x] 1.5 `src/commands/update.ts` — 错误提示区分 GitHub 不可达 vs npm 未发布
  - [x] 1.6 新增测试用例覆盖 `detectInstallSource` 和 `compareVersions`

### C2. createDefaultRouting() strategy 默认值变更未声明 ✅

- **文件**: `src/utils/config.ts:294-307`
- **修复方案**:
  - [x] 2.1 `src/utils/config.ts` — `createDefaultRouting()` frontend.strategy 恢复为 `'parallel'`
  - [x] 2.2 `src/utils/config.ts` — `createDefaultRouting()` backend.strategy 恢复为 `'parallel'`
  - [x] 2.3 `src/utils/config.ts` — `migrateRoutingTarget()` 默认 strategy 回退值从 `'fallback'` 恢复为 `'parallel'`
  - [x] 2.4 `src/commands/init.ts` — init 中 frontend/backend strategy 恢复为 `'parallel'`
  - [x] 2.5 更新 `config.test.ts` 中所有期望 `strategy: 'fallback'` 的默认值断言为 `'parallel'`

---

## Major — 强烈建议修复

### M1. 版本比较函数不支持 prerelease 语义 ✅

- **文件**: `src/utils/version.ts`
- **修复方案**:
  - [x] 3.1 `package.json` — 添加 `semver` 依赖
  - [x] 3.2 `src/utils/version.ts` — 用 `semver.compare()` 替换自定义 `compareVersions()`
  - [x] 3.3 新增测试：`2.0.0-alpha.1 < 2.0.0`、`2.0.0-alpha.2 > 2.0.0-alpha.1`、`1.7.61 < 2.0.0-alpha.1`

### M2. 配置迁移丢失 review.models 用户自定义 ✅

- **文件**: `src/utils/config.ts`
- **修复方案**:
  - [x] 4.1 通过 M4 架构决策自然解决：review 不再包含 models 字段，迁移时忽略旧值
  - [x] 4.2 新增测试：旧配置 `review.models` 不会导致迁移失败

### M3. init.ts 仍构建旧格式对象 ✅

- **文件**: `src/commands/init.ts`
- **修复方案**:
  - [x] 5.1 重构 `init.ts` 路由构建逻辑，直接产出 `{ cli_tool, model_id, strategy }` 新格式
  - [x] 5.2 移除对 `models` / `primary` 旧字段的构建
  - [x] 5.3 确保 `createDefaultConfig` 接收新格式时 `migrateRouting` 为透传

### M4. 核心接口保留 @deprecated 字段造成类型污染 ✅

- **文件**: `src/types/index.ts`
- **修复方案**:
  - [x] 6.1 `src/types/index.ts` — 从 `RoutingTarget` 移除 `models` 和 `primary` 字段
  - [x] 6.2 `src/types/index.ts` — 从 `ReviewRouting` 移除 `models` 字段
  - [x] 6.3 `src/types/index.ts` — 新增 `LegacyRoutingTarget` / `LegacyReviewRouting`（仅在 migration 逻辑内使用）
  - [x] 6.4 `src/commands/update.ts` — 移除 `models?.` 相关可选链，直接使用 `cli_tool`
  - [x] 6.5 `src/utils/installer.ts` — 更新 `installWorkflows` 参数类型和 `injectConfigVariables` 类型，从 cli_tool 推导模板变量
  - [x] 6.6 `pnpm typecheck` 通过

---

## Minor — 建议修复

### m1. 测试覆盖缺口 ✅

- **修复方案**:
  - [x] 7.1 新增 `compareVersions` prerelease 语义测试（version.test.ts, 6 tests）
  - [x] 7.2 新增 `migrateRouting` review.models 保留策略测试（config.test.ts, 1 test）
  - [x] 7.3 新增 `detectInstallSource` 测试（version.test.ts, 2 tests）

### m2. dist/ 纳入 git 跟踪缺乏防护 ✅

- **修复方案**:
  - [x] 8.1 添加 `.gitattributes` 固定 `dist/` 行尾格式（`dist/** -diff linguist-generated`）

### m3. update.ts 可选链冗余 ✅

- **修复方案**:
  - [x] 9.1 随 M4 完成后，简化 `askReconfigureRouting()` 中的显示逻辑，移除 `|| models?.[0]` 备用逻辑

---

## 验证清单

- [x] `pnpm typecheck` 通过
- [x] `pnpm test` 全部通过（30 tests, 2 test files）
- [x] `pnpm build` 成功
- [x] 手动验证：旧格式 config.toml 经 `readCcgConfig` 正确迁移
- [x] 手动验证：`update` 命令在 GitHub 安装源下可用
- [x] CHANGELOG.md 已更新（含 Breaking Change 声明，如适用）
