import type { CcgConfig, CliTool } from '../types'
import { homedir } from 'node:os'
import { rename, unlink, writeFile } from 'node:fs/promises'
import fs from 'fs-extra'
import { dirname, join } from 'pathe'
import { fileURLToPath } from 'node:url'
import { version as packageVersion } from '../../package.json'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function findPackageRoot(startDir: string): string {
  let dir = startDir
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(join(dir, 'package.json'))) {
      return dir
    }
    dir = dirname(dir)
  }
  return startDir
}

const PACKAGE_ROOT = findPackageRoot(__dirname)

// ── Task 2.1: CLI tool display name mapping ──

export const CLI_TOOL_DISPLAY_NAMES: Record<CliTool, string> = {
  codex: 'Codex CLI',
  'gemini-cli': 'Gemini CLI',
  opencode: 'opencode',
}

// ── Task 2.4: Atomic write helper ──

/** Error codes that indicate transient file locks (common on Windows) */
const RETRYABLE_ERRORS = new Set(['EPERM', 'EBUSY', 'EACCES', 'EXDEV'])

const RETRY_COUNT = 3
const RETRY_DELAY_MS = 100

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Write file atomically: write to .tmp then rename with retry.
 *
 * Strategy:
 * 1. Write content to `<filePath>.tmp`
 * 2. Attempt `rename(.tmp → target)` up to 3 times (100ms interval)
 *    — retries on EPERM / EBUSY / EACCES / EXDEV
 * 3. If all renames fail → fallback to direct `writeFile(target)`
 * 4. Always cleans up `.tmp` regardless of outcome
 */
async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.tmp`
  try {
    await writeFile(tmpPath, content, 'utf-8')

    // Retry rename for transient OS locks
    let lastError: unknown
    for (let attempt = 0; attempt < RETRY_COUNT; attempt++) {
      try {
        await rename(tmpPath, filePath)
        return // rename succeeded — .tmp no longer exists
      }
      catch (err) {
        lastError = err
        const code = (err as NodeJS.ErrnoException).code
        if (code && RETRYABLE_ERRORS.has(code) && attempt < RETRY_COUNT - 1) {
          await sleep(RETRY_DELAY_MS)
          continue
        }
        break // non-retryable error or final attempt
      }
    }

    // All rename attempts failed — fallback to direct write
    await writeFile(filePath, content, 'utf-8')
  }
  finally {
    // Always clean up .tmp (no-op if rename succeeded since file was moved)
    try { await unlink(tmpPath) }
    catch { /* ignore — file may not exist after successful rename */ }
  }
}

// ── Task 2.2: Build instruction file content ──

export interface BuildResult {
  content: string
  warnings: string[]
}

/**
 * Assemble instruction file content from base template + MCP fragments.
 *
 * 1. Read base.md → replace {{CLI_TOOL_NAME}} with display name
 * 2. Append each configured MCP fragment (skip missing with warning)
 */
export async function buildInstructionsContent(
  cliTool: CliTool,
  configuredMcpServers: string[],
  _options?: Record<string, unknown>,
): Promise<BuildResult> {
  const warnings: string[] = []
  const templateDir = join(PACKAGE_ROOT, 'templates', 'instructions')
  const basePath = join(templateDir, 'base.md')

  let content = await fs.readFile(basePath, 'utf-8')
  content = content.replace(/\{\{CLI_TOOL_NAME\}\}/g, CLI_TOOL_DISPLAY_NAMES[cliTool])

  // Append MCP guidance fragments in order
  for (const server of configuredMcpServers) {
    // Sanitize server name: allow only alphanumeric, hyphens, underscores
    if (!/^[\w-]+$/.test(server)) {
      warnings.push(`Invalid MCP server name skipped: ${server}`)
      continue
    }
    const fragmentPath = join(templateDir, `mcp-${server}.md`)
    if (await fs.pathExists(fragmentPath)) {
      const fragment = await fs.readFile(fragmentPath, 'utf-8')
      const trimmed = fragment.trim()
      // Skip empty / placeholder-only fragments
      if (trimmed && !trimmed.startsWith('<!-- Phase 6')) {
        content += `\n\n${trimmed}`
      }
    }
    else {
      warnings.push(`MCP fragment missing: mcp-${server}.md`)
    }
  }

  return { content, warnings }
}

// ── Task 2.3: Install instruction files ──

/** Target path resolution per CLI tool */
const DEFAULT_INSTRUCTIONS_PATHS: Record<CliTool, string> = {
  codex: '~/.codex/instructions.md',
  'gemini-cli': '~/.gemini/GEMINI.md',
  opencode: '~/.claude/.ccg/instructions/opencode.md',
}

export interface InstallInstructionsResult {
  success: boolean
  written: Array<{ tool: CliTool; path: string }>
  skipped: Array<{ tool: CliTool; reason: string }>
  warnings: string[]
  errors: string[]
}

function expandHome(p: string): string {
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return join(homedir(), p.slice(2))
  }
  return p
}

/**
 * Generate and install instruction files for all enabled CLI tools.
 *
 * - Reads config.cli_tools to determine which tools are enabled
 * - Resolves target path (with opencode fallback)
 * - Builds content via buildInstructionsContent
 * - Writes atomically with AUTO-GENERATED header
 * - Never throws on individual tool failure; continues with remaining tools
 */
export async function installInstructions(
  config: {
    cli_tools?: CcgConfig['cli_tools']
    cli_tools_mcp?: CcgConfig['cli_tools_mcp']
  },
  _options?: Record<string, unknown>,
): Promise<InstallInstructionsResult> {
  const result: InstallInstructionsResult = {
    success: true,
    written: [],
    skipped: [],
    warnings: [],
    errors: [],
  }

  if (!config.cli_tools) {
    return result
  }

  const tools: CliTool[] = ['codex', 'gemini-cli', 'opencode']

  for (const tool of tools) {
    const toolConfig = config.cli_tools[tool]

    if (!toolConfig?.enabled) {
      result.skipped.push({ tool, reason: 'disabled' })
      continue
    }

    try {
      // Resolve target path (|| already handles empty string for all tools)
      const targetPath = expandHome(
        toolConfig.instructions_path?.trim()
        || DEFAULT_INSTRUCTIONS_PATHS[tool],
      )

      // D5: Warn about opencode fallback path
      if (tool === 'opencode' && !toolConfig.instructions_path?.trim()) {
        result.warnings.push(
          `opencode has no global instructions path; using fallback: ${DEFAULT_INSTRUCTIONS_PATHS.opencode}`,
        )
      }

      // Ensure parent directory exists
      await fs.ensureDir(dirname(targetPath))

      // Build content
      const mcpServers = config.cli_tools_mcp?.[tool]?.servers ?? []
      const { content, warnings } = await buildInstructionsContent(tool, mcpServers)
      result.warnings.push(...warnings)

      // Prepend AUTO-GENERATED header
      const header = `<!-- AUTO-GENERATED BY CCG v${packageVersion} - DO NOT EDIT -->\n\n`
      const finalContent = header + content

      // Atomic write
      await atomicWriteFile(targetPath, finalContent)
      result.written.push({ tool, path: targetPath })
    }
    catch (error) {
      const msg = `Failed to install instructions for ${tool}: ${error instanceof Error ? error.message : String(error)}`
      result.errors.push(msg)
      // Non-fatal: continue with other tools
    }
  }

  if (result.errors.length > 0) {
    result.success = false
  }

  return result
}
