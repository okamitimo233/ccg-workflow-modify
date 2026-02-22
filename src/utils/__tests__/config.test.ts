import { describe, expect, it } from 'vitest'
import { createDefaultConfig, createDefaultRouting, migrateConfig } from '../config'

function isValidIsoDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value))
}

describe('migrateConfig', () => {
  it('migrates legacy v1.x routing (models/primary) for gemini and codex', () => {
    const config = migrateConfig({
      routing: {
        frontend: { models: ['gemini'], primary: 'gemini' },
        backend: { models: ['codex'], primary: 'codex' },
        mode: 'parallel',
      },
    })

    expect(config.routing.frontend).toMatchObject({
      cli_tool: 'opencode',
      strategy: 'parallel',
    })
    expect(config.routing.backend).toMatchObject({
      cli_tool: 'codex',
      strategy: 'parallel',
    })
    // M4: review no longer contains models field
    expect(config.routing.review).toEqual({ strategy: 'parallel' })
    expect(config.routing.mode).toBe('parallel')
    // M4: deprecated fields should not exist on output
    expect(config.routing.frontend).not.toHaveProperty('models')
    expect(config.routing.frontend).not.toHaveProperty('primary')
    expect(config.routing.backend).not.toHaveProperty('models')
    expect(config.routing.backend).not.toHaveProperty('primary')
    expect(config.routing.review).not.toHaveProperty('models')
  })

  it('downgrades legacy claude model by area', () => {
    const config = migrateConfig({
      routing: {
        frontend: { primary: 'claude' },
        backend: { primary: 'claude' },
      },
    })

    expect(config.routing.frontend.cli_tool).toBe('opencode')
    expect(config.routing.backend.cli_tool).toBe('codex')
  })

  it('prioritizes routing target fields as cli_tool > primary > models[0] > default', () => {
    const fromCliTool = migrateConfig({
      routing: {
        frontend: { cli_tool: 'codex', primary: 'gemini', models: ['gemini'] },
      },
    })
    expect(fromCliTool.routing.frontend.cli_tool).toBe('codex')

    const fromPrimary = migrateConfig({
      routing: {
        backend: { primary: 'gemini', models: ['codex'] },
      },
    })
    expect(fromPrimary.routing.backend.cli_tool).toBe('opencode')

    const fromModels = migrateConfig({
      routing: {
        backend: { models: ['claude'] },
      },
    })
    expect(fromModels.routing.backend.cli_tool).toBe('codex')

    const fromDefault = migrateConfig({
      routing: {
        frontend: { models: ['invalid-model'] },
      },
    })
    expect(fromDefault.routing.frontend.cli_tool).toBe('opencode')
  })

  it('passes through new format with cli_tool (no legacy compat fields on output)', () => {
    const config = migrateConfig({
      routing: {
        frontend: {
          cli_tool: 'codex',
          model_id: 'frontend-id',
          strategy: 'round-robin',
          primary: 'gemini',
          models: ['gemini'],
        },
        backend: {
          cli_tool: 'opencode',
          strategy: 'parallel',
        },
        mode: 'sequential',
      },
    })

    expect(config.routing.frontend).toEqual({
      cli_tool: 'codex',
      model_id: 'frontend-id',
      strategy: 'round-robin',
    })
    expect(config.routing.backend).toEqual({
      cli_tool: 'opencode',
      model_id: '',
      strategy: 'parallel',
    })
    expect(config.routing.mode).toBe('sequential')
  })

  it.each([undefined, null, 0, 'invalid', []])('falls back to defaults for empty input: %p', (input) => {
    const config = migrateConfig(input)

    expect(config.general.language).toBe('zh-CN')
    expect(isValidIsoDate(config.general.createdAt)).toBe(true)
    expect(config.routing.frontend).toEqual({
      cli_tool: 'opencode',
      model_id: 'antigravity/gemini-3-pro-high',
      strategy: 'parallel',
    })
    expect(config.routing.backend).toEqual({
      cli_tool: 'codex',
      model_id: '',
      strategy: 'parallel',
    })
    expect(config.routing.review).toEqual({ strategy: 'parallel' })
    expect(config.routing.mode).toBe('smart')
    expect(config.workflows.installed).toEqual([])
  })

  it('handles mixed format (part new fields, part legacy fields)', () => {
    const config = migrateConfig({
      general: {
        language: 'en',
      },
      routing: {
        frontend: {
          cli_tool: 'gemini-cli',
          model_id: 'custom-frontend',
        },
        backend: {
          primary: 'claude',
        },
        mode: 'smart',
      },
    })

    expect(config.general.language).toBe('en')
    expect(config.routing.frontend).toEqual({
      cli_tool: 'gemini-cli',
      model_id: 'custom-frontend',
      strategy: 'parallel',
    })
    expect(config.routing.backend).toEqual({
      cli_tool: 'codex',
      model_id: '',
      strategy: 'parallel',
    })
  })

  it('merges cli_tools with defaults for missing fields', () => {
    const config = migrateConfig({
      cli_tools: {
        codex: { enabled: false },
        opencode: { instructions_path: '/custom/instructions.md' },
      },
    })

    expect(config.cli_tools.codex).toEqual({
      enabled: false,
      config_path: '~/.codex/config.toml',
      instructions_path: '~/.codex/instructions.md',
      mcp_configured: false,
    })
    expect(config.cli_tools['gemini-cli']).toEqual({
      enabled: true,
      config_path: '~/.gemini/settings.json',
      instructions_path: '~/.gemini/GEMINI.md',
      mcp_configured: false,
    })
    expect(config.cli_tools.opencode).toEqual({
      enabled: true,
      config_path: '~/.opencode.json',
      instructions_path: '/custom/instructions.md',
      mcp_configured: false,
    })
  })

  it('merges cli_tools_mcp and filters non-string servers', () => {
    const config = migrateConfig({
      cli_tools_mcp: {
        codex: { servers: ['alpha', 42, null, 'beta', false] },
        'gemini-cli': { servers: 'invalid-array' },
        opencode: {},
      },
    })

    expect(config.cli_tools_mcp.codex.servers).toEqual(['alpha', 'beta'])
    expect(config.cli_tools_mcp['gemini-cli'].servers).toEqual([])
    expect(config.cli_tools_mcp.opencode.servers).toEqual([])
  })

  it('preserves general.version and general.createdAt when provided', () => {
    const config = migrateConfig({
      general: {
        version: '1.5.0',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    })

    expect(config.general.version).toBe('1.5.0')
    expect(config.general.createdAt).toBe('2025-01-01T00:00:00.000Z')
  })

  it('preserves custom paths when provided', () => {
    const config = migrateConfig({
      paths: {
        commands: '/custom/commands',
        prompts: '/custom/prompts',
        backup: '/custom/backup',
      },
    })

    expect(config.paths.commands).toBe('/custom/commands')
    expect(config.paths.prompts).toBe('/custom/prompts')
    expect(config.paths.backup).toBe('/custom/backup')
  })

  it('preserves custom mcp settings when provided', () => {
    const config = migrateConfig({
      mcp: {
        provider: 'custom-mcp',
        setup_url: 'https://example.com/setup',
      },
    })

    expect(config.mcp.provider).toBe('custom-mcp')
    expect(config.mcp.setup_url).toBe('https://example.com/setup')
  })

  it('filters non-string items from workflows.installed', () => {
    const config = migrateConfig({
      workflows: {
        installed: ['frontend', 42, null, 'review', true, 'backend'],
      },
    })

    expect(config.workflows.installed).toEqual(['frontend', 'review', 'backend'])
  })

  it('preserves performance.liteMode when explicitly set', () => {
    const enabled = migrateConfig({ performance: { liteMode: true } })
    expect(enabled.performance?.liteMode).toBe(true)

    const disabled = migrateConfig({ performance: { liteMode: false } })
    expect(disabled.performance?.liteMode).toBe(false)

    const missing = migrateConfig({ performance: {} })
    expect(missing.performance?.liteMode).toBe(false)
  })

  it('applies boundary fallbacks for invalid strategy, mode, and language', () => {
    const config = migrateConfig({
      general: {
        language: 'fr-FR',
      },
      routing: {
        frontend: {
          cli_tool: 'not-a-tool',
          strategy: 'invalid',
          model_id: 123,
        },
        backend: {
          strategy: 'invalid',
        },
        mode: 'invalid-mode',
      },
    })

    expect(config.general.language).toBe('zh-CN')
    expect(config.routing.frontend.cli_tool).toBe('opencode')
    expect(config.routing.frontend.strategy).toBe('parallel')
    expect(config.routing.frontend.model_id).toContain('gemini')
    expect(config.routing.backend).toEqual({
      cli_tool: 'codex',
      model_id: '',
      strategy: 'parallel',
    })
    expect(config.routing.mode).toBe('smart')
  })

  // M2: 旧配置中的 review.models 不会导致迁移失败
  it('gracefully handles legacy review.models without error', () => {
    const config = migrateConfig({
      routing: {
        frontend: { cli_tool: 'opencode' },
        backend: { cli_tool: 'codex' },
        review: { strategy: 'parallel', models: ['codex', 'gemini'] },
      },
    })

    // review 输出只包含 strategy，不含 models
    expect(config.routing.review).toEqual({ strategy: 'parallel' })
    expect(config.routing.review).not.toHaveProperty('models')
  })
})

describe('createDefaultRouting', () => {
  it('returns expected default routing', () => {
    expect(createDefaultRouting()).toEqual({
      frontend: {
        cli_tool: 'opencode',
        model_id: 'antigravity/gemini-3-pro-high',
        strategy: 'parallel',
      },
      backend: {
        cli_tool: 'codex',
        model_id: '',
        strategy: 'parallel',
      },
      review: {
        strategy: 'parallel',
      },
      mode: 'smart',
    })
  })
})

describe('createDefaultConfig', () => {
  it('creates a full config with explicit options', () => {
    const config = createDefaultConfig({
      language: 'en',
      routing: {
        frontend: { cli_tool: 'opencode', model_id: 'frontend-x', strategy: 'round-robin' },
        backend: { cli_tool: 'codex', model_id: 'backend-x', strategy: 'parallel' },
        review: { strategy: 'parallel' },
        mode: 'sequential',
      },
      installedWorkflows: ['frontend', 'review'],
      mcpProvider: 'custom-provider',
      liteMode: true,
    })

    expect(config.general.language).toBe('en')
    expect(isValidIsoDate(config.general.createdAt)).toBe(true)
    expect(config.routing.frontend).toEqual({
      cli_tool: 'opencode',
      model_id: 'frontend-x',
      strategy: 'round-robin',
    })
    expect(config.routing.backend).toEqual({
      cli_tool: 'codex',
      model_id: 'backend-x',
      strategy: 'parallel',
    })
    expect(config.routing.review).toEqual({ strategy: 'parallel' })
    expect(config.routing.mode).toBe('sequential')
    expect(config.workflows.installed).toEqual(['frontend', 'review'])
    expect(config.mcp.provider).toBe('custom-provider')
    expect(config.performance?.liteMode).toBe(true)
  })

  it('uses default optional values when mcpProvider and liteMode are omitted', () => {
    const config = createDefaultConfig({
      language: 'zh-CN',
      routing: createDefaultRouting(),
      installedWorkflows: [],
    })

    expect(config.mcp.provider).toBe('ace-tool')
    expect(config.performance?.liteMode).toBe(false)
    expect(config.routing.frontend).toEqual({
      cli_tool: 'opencode',
      model_id: 'antigravity/gemini-3-pro-high',
      strategy: 'parallel',
    })
    expect(config.routing.backend).toEqual({
      cli_tool: 'codex',
      model_id: '',
      strategy: 'parallel',
    })
    expect(config.routing.mode).toBe('smart')
  })
})
