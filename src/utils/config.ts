import type {
  CcgConfig,
  CliTool,
  CollaborationMode,
  ModelRouting,
  ModelType,
  RoutingStrategy,
  SupportedLang,
} from '../types'
import fs from 'fs-extra'
import { homedir } from 'node:os'
import { join } from 'pathe'
import { parse, stringify } from 'smol-toml'
import { version as packageVersion } from '../../package.json'

// v1.4.0: 配置目录统一到 ~/.claude/.ccg/
const CCG_DIR = join(homedir(), '.claude', '.ccg')
const CONFIG_FILE = join(CCG_DIR, 'config.toml')

const DEFAULT_MCP_PROVIDER = 'ace-tool'
const DEFAULT_MCP_SETUP_URL = 'https://augmentcode.com/'
const DEFAULT_FRONTEND_MODEL_ID = 'antigravity/gemini-3-pro-high'
const DEFAULT_COMMANDS_PATH = join(homedir(), '.claude', 'commands', 'ccg')
const DEFAULT_PROMPTS_PATH = join(CCG_DIR, 'prompts')
const DEFAULT_BACKUP_PATH = join(CCG_DIR, 'backup')

// ── Type guards ──

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isModelType(value: unknown): value is ModelType {
  return value === 'codex' || value === 'gemini' || value === 'claude'
}

function isCliTool(value: unknown): value is CliTool {
  return value === 'codex' || value === 'gemini-cli' || value === 'opencode'
}

function isRoutingStrategy(value: unknown): value is RoutingStrategy {
  return value === 'parallel' || value === 'fallback' || value === 'round-robin'
}

function isCollaborationMode(value: unknown): value is CollaborationMode {
  return value === 'parallel' || value === 'smart' || value === 'sequential'
}

function isSupportedLang(value: unknown): value is SupportedLang {
  return value === 'zh-CN' || value === 'en'
}

function toModelTypeArray(value: unknown): ModelType[] {
  if (!Array.isArray(value)) return []
  return value.filter(isModelType)
}

// ── Migration helpers ──

function mapLegacyModelToCliTool(model: ModelType, area: 'frontend' | 'backend'): CliTool {
  if (model === 'codex') return 'codex'
  if (model === 'gemini') return 'opencode'
  // claude 无直接 CLI 对应，按场景保守降级
  return area === 'backend' ? 'codex' : 'opencode'
}

function cliToolToLegacyModel(cliTool: CliTool): ModelType {
  if (cliTool === 'codex') return 'codex'
  return 'gemini'
}

function migrateRoutingTarget(raw: unknown, area: 'frontend' | 'backend'): ModelRouting['frontend'] {
  const target = isRecord(raw) ? raw : {}
  const defaultCliTool: CliTool = area === 'backend' ? 'codex' : 'opencode'
  const defaultModelId = area === 'frontend' ? DEFAULT_FRONTEND_MODEL_ID : ''

  // 检测旧格式字段
  const legacyModels = toModelTypeArray(target.models)
  const legacyPrimary = isModelType(target.primary) ? target.primary : undefined

  // 优先使用新字段，回退到旧字段映射
  const cli_tool = isCliTool(target.cli_tool)
    ? target.cli_tool
    : legacyPrimary
      ? mapLegacyModelToCliTool(legacyPrimary, area)
      : legacyModels[0]
        ? mapLegacyModelToCliTool(legacyModels[0], area)
        : defaultCliTool

  const model_id = typeof target.model_id === 'string' ? target.model_id : defaultModelId
  const strategy = isRoutingStrategy(target.strategy) ? target.strategy : 'fallback'

  // 保留兼容字段供 installer/update 等旧消费者使用
  const compatModel = cliToolToLegacyModel(cli_tool)

  return { cli_tool, model_id, strategy, models: [compatModel], primary: compatModel }
}

function migrateRouting(raw: unknown): ModelRouting {
  const routing = isRecord(raw) ? raw : {}
  const frontend = migrateRoutingTarget(routing.frontend, 'frontend')
  const backend = migrateRoutingTarget(routing.backend, 'backend')
  const reviewModels: ModelType[] = [...new Set<ModelType>([
    frontend.primary || 'gemini',
    backend.primary || 'codex',
  ])]

  return {
    frontend,
    backend,
    review: { strategy: 'parallel', models: reviewModels },
    mode: isCollaborationMode(routing.mode) ? routing.mode : 'smart',
  }
}

function createDefaultCliTools(): CcgConfig['cli_tools'] {
  return {
    codex: {
      enabled: true,
      config_path: '~/.codex/config.toml',
      instructions_path: '~/.codex/instructions.md',
      mcp_configured: false,
    },
    'gemini-cli': {
      enabled: true,
      config_path: '~/.gemini/settings.json',
      instructions_path: '~/.gemini/GEMINI.md',
      mcp_configured: false,
    },
    opencode: {
      enabled: true,
      config_path: '~/.opencode.json',
      instructions_path: '',
      mcp_configured: false,
    },
  }
}

function createDefaultCliToolsMcp(): CcgConfig['cli_tools_mcp'] {
  return {
    codex: { servers: [] },
    'gemini-cli': { servers: [] },
    opencode: { servers: [] },
  }
}

function mergeCliToolConfig(
  raw: unknown,
  defaults: CcgConfig['cli_tools']['codex'],
): CcgConfig['cli_tools']['codex'] {
  const src = isRecord(raw) ? raw : {}
  return {
    enabled: typeof src.enabled === 'boolean' ? src.enabled : defaults.enabled,
    config_path: typeof src.config_path === 'string' ? src.config_path : defaults.config_path,
    instructions_path: typeof src.instructions_path === 'string' ? src.instructions_path : defaults.instructions_path,
    mcp_configured: typeof src.mcp_configured === 'boolean' ? src.mcp_configured : defaults.mcp_configured,
  }
}

function mergeCliTools(raw: unknown): CcgConfig['cli_tools'] {
  const defaults = createDefaultCliTools()
  const src = isRecord(raw) ? raw : {}
  return {
    codex: mergeCliToolConfig(src.codex, defaults.codex),
    'gemini-cli': mergeCliToolConfig(src['gemini-cli'], defaults['gemini-cli']),
    opencode: mergeCliToolConfig(src.opencode, defaults.opencode),
  }
}

function mergeCliToolsMcp(raw: unknown): CcgConfig['cli_tools_mcp'] {
  const defaults = createDefaultCliToolsMcp()
  const src = isRecord(raw) ? raw : {}

  function mergeSingle(raw: unknown, def: { servers: string[] }): { servers: string[] } {
    const s = isRecord(raw) ? raw : {}
    const servers = Array.isArray(s.servers)
      ? s.servers.filter((v): v is string => typeof v === 'string')
      : def.servers
    return { servers }
  }

  return {
    codex: mergeSingle(src.codex, defaults.codex),
    'gemini-cli': mergeSingle(src['gemini-cli'], defaults['gemini-cli']),
    opencode: mergeSingle(src.opencode, defaults.opencode),
  }
}

// ── Public API ──

export function getCcgDir(): string {
  return CCG_DIR
}

export function getConfigPath(): string {
  return CONFIG_FILE
}

export async function ensureCcgDir(): Promise<void> {
  await fs.ensureDir(CCG_DIR)
}

export function migrateConfig(raw: unknown): CcgConfig {
  const src = isRecord(raw) ? raw : {}
  const general = isRecord(src.general) ? src.general : {}
  const workflows = isRecord(src.workflows) ? src.workflows : {}
  const paths = isRecord(src.paths) ? src.paths : {}
  const mcp = isRecord(src.mcp) ? src.mcp : {}
  const performance = isRecord(src.performance) ? src.performance : {}

  return {
    general: {
      version: typeof general.version === 'string' ? general.version : packageVersion,
      language: isSupportedLang(general.language) ? general.language : 'zh-CN',
      createdAt: typeof general.createdAt === 'string' ? general.createdAt : new Date().toISOString(),
    },
    routing: migrateRouting(src.routing),
    cli_tools: mergeCliTools(src.cli_tools),
    cli_tools_mcp: mergeCliToolsMcp(src.cli_tools_mcp),
    workflows: {
      installed: Array.isArray(workflows.installed)
        ? workflows.installed.filter((v): v is string => typeof v === 'string')
        : [],
    },
    paths: {
      commands: typeof paths.commands === 'string' ? paths.commands : DEFAULT_COMMANDS_PATH,
      prompts: typeof paths.prompts === 'string' ? paths.prompts : DEFAULT_PROMPTS_PATH,
      backup: typeof paths.backup === 'string' ? paths.backup : DEFAULT_BACKUP_PATH,
    },
    mcp: {
      provider: typeof mcp.provider === 'string' ? mcp.provider : DEFAULT_MCP_PROVIDER,
      setup_url: typeof mcp.setup_url === 'string' ? mcp.setup_url : DEFAULT_MCP_SETUP_URL,
    },
    performance: {
      liteMode: typeof performance.liteMode === 'boolean' ? performance.liteMode : false,
    },
  }
}

export async function readCcgConfig(): Promise<CcgConfig | null> {
  try {
    if (await fs.pathExists(CONFIG_FILE)) {
      const content = await fs.readFile(CONFIG_FILE, 'utf-8')
      const parsed = parse(content) as unknown
      return migrateConfig(parsed)
    }
  }
  catch {
    // Config doesn't exist or is invalid
  }
  return null
}

export async function writeCcgConfig(config: CcgConfig): Promise<void> {
  await ensureCcgDir()
  const content = stringify(config as any)
  await fs.writeFile(CONFIG_FILE, content, 'utf-8')
}

export function createDefaultConfig(options: {
  language: SupportedLang
  routing: ModelRouting
  installedWorkflows: string[]
  mcpProvider?: string
  liteMode?: boolean
}): CcgConfig {
  return {
    general: {
      version: packageVersion,
      language: options.language,
      createdAt: new Date().toISOString(),
    },
    routing: migrateRouting(options.routing),
    cli_tools: createDefaultCliTools(),
    cli_tools_mcp: createDefaultCliToolsMcp(),
    workflows: {
      installed: options.installedWorkflows,
    },
    paths: {
      commands: DEFAULT_COMMANDS_PATH,
      prompts: DEFAULT_PROMPTS_PATH,
      backup: DEFAULT_BACKUP_PATH,
    },
    mcp: {
      provider: options.mcpProvider || DEFAULT_MCP_PROVIDER,
      setup_url: DEFAULT_MCP_SETUP_URL,
    },
    performance: {
      liteMode: options.liteMode || false,
    },
  }
}

export function createDefaultRouting(): ModelRouting {
  return {
    frontend: {
      cli_tool: 'opencode',
      model_id: DEFAULT_FRONTEND_MODEL_ID,
      strategy: 'fallback',
    },
    backend: {
      cli_tool: 'codex',
      model_id: '',
      strategy: 'fallback',
    },
    review: {
      strategy: 'parallel',
    },
    mode: 'smart',
  }
}
