import type { CliTool } from '../types'
import ansis from 'ansis'
import inquirer from 'inquirer'

/** CLI 工具默认显示名和 model_id */
export const CLI_TOOL_DEFAULTS: Record<CliTool, { displayName: string; defaultModelId: string }> = {
  codex: { displayName: 'Codex CLI', defaultModelId: '' },
  'gemini-cli': { displayName: 'Gemini CLI', defaultModelId: 'gemini-2.5-pro' },
  opencode: { displayName: 'opencode', defaultModelId: 'antigravity/gemini-3-pro-high' },
}

/** 路由选择结果 */
export interface RoutingPromptResult {
  frontend: { cli_tool: CliTool; model_id: string }
  backend: { cli_tool: CliTool; model_id: string }
}

const CLI_TOOL_CHOICES: Array<{ name: string; value: CliTool }> = [
  { name: `codex ${ansis.gray('- Codex CLI')}`, value: 'codex' },
  { name: `gemini-cli ${ansis.gray('- Gemini CLI')}`, value: 'gemini-cli' },
  { name: `opencode ${ansis.gray('- opencode (Gemini)')}`, value: 'opencode' },
]

/**
 * 交互式 CLI 工具选择
 * @param defaults 当前默认值（用于显示 current 提示）
 */
export async function promptRoutingConfig(
  defaults?: Partial<RoutingPromptResult>,
): Promise<RoutingPromptResult> {
  const defaultFrontend = defaults?.frontend?.cli_tool || 'opencode'
  const defaultBackend = defaults?.backend?.cli_tool || 'codex'

  // 前端 CLI 工具
  const { frontendTool } = await inquirer.prompt([{
    type: 'list',
    name: 'frontendTool',
    message: `前端 CLI 工具`,
    choices: CLI_TOOL_CHOICES,
    default: defaultFrontend,
  }])

  // 前端 model_id — 工具切换时使用新工具的默认值，未切换时复用旧值
  const frontendToolChanged = defaults?.frontend?.cli_tool !== (frontendTool as CliTool)
  const frontendDefault = frontendToolChanged
    ? CLI_TOOL_DEFAULTS[frontendTool as CliTool].defaultModelId
    : (defaults?.frontend?.model_id ?? CLI_TOOL_DEFAULTS[frontendTool as CliTool].defaultModelId)
  const { frontendModelId } = await inquirer.prompt([{
    type: 'input',
    name: 'frontendModelId',
    message: `前端 Model ID ${ansis.gray('(留空使用默认)')}`,
    default: frontendDefault,
  }])

  // 后端 CLI 工具
  const { backendTool } = await inquirer.prompt([{
    type: 'list',
    name: 'backendTool',
    message: `后端 CLI 工具`,
    choices: CLI_TOOL_CHOICES,
    default: defaultBackend,
  }])

  // 后端 model_id — 工具切换时使用新工具的默认值，未切换时复用旧值
  const backendToolChanged = defaults?.backend?.cli_tool !== (backendTool as CliTool)
  const backendDefault = backendToolChanged
    ? CLI_TOOL_DEFAULTS[backendTool as CliTool].defaultModelId
    : (defaults?.backend?.model_id ?? CLI_TOOL_DEFAULTS[backendTool as CliTool].defaultModelId)
  const { backendModelId } = await inquirer.prompt([{
    type: 'input',
    name: 'backendModelId',
    message: `后端 Model ID ${ansis.gray('(留空使用默认)')}`,
    default: backendDefault,
  }])

  return {
    frontend: { cli_tool: frontendTool as CliTool, model_id: frontendModelId },
    backend: { cli_tool: backendTool as CliTool, model_id: backendModelId },
  }
}
