import type { CliTool } from '../types'
import type { McpServerConfig } from './mcp'
import { homedir } from 'node:os'
import fs from 'fs-extra'
import { join } from 'pathe'
import { parse, stringify } from 'smol-toml'
import { isWindows } from './platform'

/** 写入结果 */
export interface WriteMcpResult {
  success: boolean
  configPath: string
  message: string
  backedUp?: string
}

/** 目标配置路径 */
const CONFIG_PATHS: Record<CliTool, { path: string; format: 'toml' | 'json'; mcpKey: string }> = {
  codex: { path: '.codex/config.toml', format: 'toml', mcpKey: 'mcp_servers' },
  'gemini-cli': { path: '.gemini/settings.json', format: 'json', mcpKey: 'mcp.servers' },
  opencode: { path: '.opencode.json', format: 'json', mcpKey: 'mcpServers' },
}

/** 获取目标配置文件绝对路径 */
function getConfigAbsPath(tool: CliTool): string {
  return join(homedir(), CONFIG_PATHS[tool].path)
}

/** 获取备份目录 */
function getBackupDir(): string {
  return join(homedir(), '.claude', '.ccg', 'backup')
}

/**
 * dot-notation 路径设置嵌套值
 * 支持 `'mcp.servers'` → `obj.mcp.servers = value`
 */
export function setNestedValue(obj: Record<string, any>, dotPath: string, value: unknown): void {
  const keys = dotPath.split('.')
  let current = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (current[key] === undefined || current[key] === null || typeof current[key] !== 'object') {
      current[key] = {}
    }
    current = current[key]
  }
  current[keys[keys.length - 1]] = value
}

/**
 * dot-notation 路径读取嵌套值
 */
export function getNestedValue(obj: Record<string, any>, dotPath: string): unknown {
  const keys = dotPath.split('.')
  let current: any = obj
  for (const key of keys) {
    if (current === undefined || current === null || typeof current !== 'object') {
      return undefined
    }
    current = current[key]
  }
  return current
}

/**
 * 将 Claude Code MCP 配置转换为目标工具格式
 * - 移除 `startup_timeout_ms`（仅 Claude Code 使用）
 * - Windows 下 npx/uvx/node 包装为 cmd /c
 */
export function convertMcpConfig(
  baseConfig: McpServerConfig,
  _targetTool: CliTool,
): Record<string, unknown> {
  const result: Record<string, unknown> = JSON.parse(JSON.stringify(baseConfig))

  // 剔除 Claude Code 专属字段
  delete result.startup_timeout_ms

  // Windows 命令包装
  if (isWindows() && typeof result.command === 'string') {
    const needsWrapping = ['npx', 'uvx', 'node', 'npm', 'pnpm', 'yarn']
    if (needsWrapping.includes(result.command)) {
      const originalArgs = (result.args as string[]) || []
      result.args = ['/c', result.command, ...originalArgs]
      result.command = 'cmd'
    }
  }

  return result
}

/**
 * 备份外部配置文件
 */
export async function backupExternalConfig(tool: CliTool): Promise<string | null> {
  const configPath = getConfigAbsPath(tool)

  if (!(await fs.pathExists(configPath))) {
    return null
  }

  const backupDir = getBackupDir()
  await fs.ensureDir(backupDir)

  const ext = CONFIG_PATHS[tool].format === 'toml' ? 'toml' : 'json'
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(backupDir, `${tool}-config-${timestamp}.${ext}`)

  await fs.copy(configPath, backupPath)
  return backupPath
}

/**
 * 读取外部配置文件
 */
export async function readExternalConfig(tool: CliTool): Promise<Record<string, any>> {
  const configPath = getConfigAbsPath(tool)
  const { format } = CONFIG_PATHS[tool]

  if (!(await fs.pathExists(configPath))) {
    return {}
  }

  const content = await fs.readFile(configPath, 'utf-8')

  if (format === 'toml') {
    return parse(content) as Record<string, any>
  }
  return JSON.parse(content)
}

/**
 * 原子写入外部配置文件
 * write `.tmp` → rename
 */
export async function writeExternalConfig(tool: CliTool, data: Record<string, any>): Promise<void> {
  const configPath = getConfigAbsPath(tool)
  const { format } = CONFIG_PATHS[tool]

  await fs.ensureDir(join(configPath, '..'))

  const content = format === 'toml'
    ? stringify(data as any)
    : JSON.stringify(data, null, 2)

  const tmpPath = `${configPath}.tmp`
  await fs.writeFile(tmpPath, content, 'utf-8')
  await fs.rename(tmpPath, configPath)
}

/**
 * 写入单个 MCP server 到指定 CLI 工具
 */
export async function writeExternalMcp(
  tool: CliTool,
  serverName: string,
  config: McpServerConfig,
): Promise<WriteMcpResult> {
  const configPath = getConfigAbsPath(tool)
  const { mcpKey } = CONFIG_PATHS[tool]

  try {
    // 读取现有配置
    const data = await readExternalConfig(tool)

    // 备份
    const backedUp = await backupExternalConfig(tool)

    // 转换配置
    const converted = convertMcpConfig(config, tool)

    // 合并 MCP 子树：获取现有 MCP servers，添加/覆盖当前 server
    const existingServers = (getNestedValue(data, mcpKey) as Record<string, any>) || {}
    existingServers[serverName] = converted
    setNestedValue(data, mcpKey, existingServers)

    // 原子写入
    await writeExternalConfig(tool, data)

    return {
      success: true,
      configPath,
      message: `MCP server '${serverName}' written to ${configPath}`,
      backedUp: backedUp || undefined,
    }
  }
  catch (error) {
    return {
      success: false,
      configPath,
      message: `Failed to write MCP: ${error}`,
    }
  }
}

/**
 * 批量同步 MCP servers 到指定工具
 */
export async function syncMcpToTool(
  tool: CliTool,
  servers: Record<string, McpServerConfig>,
): Promise<WriteMcpResult[]> {
  const results: WriteMcpResult[] = []
  for (const [name, config] of Object.entries(servers)) {
    const result = await writeExternalMcp(tool, name, config)
    results.push(result)
  }
  return results
}
