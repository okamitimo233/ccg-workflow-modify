// 支持的语言
export type SupportedLang = 'zh-CN' | 'en'

// 模型类型（已废弃，保留向后兼容）
/** @deprecated 使用 CliTool 替代 */
export type ModelType = 'codex' | 'gemini' | 'claude'

// CLI 工具类型
export type CliTool = 'codex' | 'gemini-cli' | 'opencode'

// 协作模式
export type CollaborationMode = 'parallel' | 'smart' | 'sequential'

// 路由策略
export type RoutingStrategy = 'parallel' | 'fallback' | 'round-robin'

// 路由目标配置（前端/后端）
export interface RoutingTarget {
  cli_tool?: CliTool
  model_id?: string
  strategy: RoutingStrategy
  /** @deprecated 使用 cli_tool 替代 */
  models?: ModelType[]
  /** @deprecated 使用 cli_tool 替代 */
  primary?: ModelType
}

// Review 路由配置
export interface ReviewRouting {
  strategy: 'parallel'
  /** @deprecated 保留向后兼容 */
  models?: ModelType[]
}

// CLI 工具配置
export interface CliToolConfig {
  enabled: boolean
  config_path: string
  instructions_path: string
  mcp_configured: boolean
}

// CLI 工具 MCP 配置
export interface CliToolMcpConfig {
  servers: string[]
}

// 模型路由配置
export interface ModelRouting {
  frontend: RoutingTarget
  backend: RoutingTarget
  review: ReviewRouting
  mode: CollaborationMode
}

// CCG 配置
export interface CcgConfig {
  general: {
    version: string
    language: SupportedLang
    createdAt: string
  }
  routing: ModelRouting
  cli_tools: {
    codex: CliToolConfig
    'gemini-cli': CliToolConfig
    opencode: CliToolConfig
  }
  cli_tools_mcp: {
    codex: CliToolMcpConfig
    'gemini-cli': CliToolMcpConfig
    opencode: CliToolMcpConfig
  }
  workflows: {
    installed: string[]
  }
  paths: {
    commands: string
    prompts: string
    backup: string
  }
  mcp: {
    provider: string
    setup_url: string
  }
  performance?: {
    liteMode?: boolean // 轻量模式：禁用 Web UI，更快响应
  }
}

// 工作流定义
export interface WorkflowConfig {
  id: string
  name: string
  nameEn: string
  category: string
  commands: string[]
  defaultSelected: boolean
  order: number
  description?: string
  descriptionEn?: string
}

// 初始化选项
export interface InitOptions {
  lang?: SupportedLang
  skipPrompt?: boolean
  skipMcp?: boolean // 更新时跳过 MCP 配置
  force?: boolean
  // 非交互模式参数
  frontend?: string
  backend?: string
  mode?: CollaborationMode
  workflows?: string
  installDir?: string
}

// 安装结果
export interface InstallResult {
  success: boolean
  installedCommands: string[]
  installedPrompts: string[]
  errors: string[]
  configPath: string
  binPath?: string
  binInstalled?: boolean
}

// ace-tool 配置
export interface AceToolConfig {
  baseUrl: string
  token: string
}

// Re-export CLI types
export * from './cli'
