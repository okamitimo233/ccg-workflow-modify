import * as i18next from 'i18next';

interface CliOptions {
    lang?: SupportedLang;
    force?: boolean;
    skipPrompt?: boolean;
    skipMcp?: boolean;
    frontend?: string;
    backend?: string;
    mode?: CollaborationMode;
    workflows?: string;
    installDir?: string;
}

type SupportedLang = 'zh-CN' | 'en';
/** @deprecated 使用 CliTool 替代 */
type ModelType = 'codex' | 'gemini' | 'claude';
type CliTool = 'codex' | 'gemini-cli' | 'opencode';
type CollaborationMode = 'parallel' | 'smart' | 'sequential';
type RoutingStrategy = 'parallel' | 'fallback' | 'round-robin';
interface RoutingTarget {
    cli_tool?: CliTool;
    model_id?: string;
    strategy: RoutingStrategy;
    /** @deprecated 使用 cli_tool 替代 */
    models?: ModelType[];
    /** @deprecated 使用 cli_tool 替代 */
    primary?: ModelType;
}
interface ReviewRouting {
    strategy: 'parallel';
    /** @deprecated 保留向后兼容 */
    models?: ModelType[];
}
interface CliToolConfig {
    enabled: boolean;
    config_path: string;
    instructions_path: string;
    mcp_configured: boolean;
}
interface CliToolMcpConfig {
    servers: string[];
}
interface ModelRouting {
    frontend: RoutingTarget;
    backend: RoutingTarget;
    review: ReviewRouting;
    mode: CollaborationMode;
}
interface CcgConfig {
    general: {
        version: string;
        language: SupportedLang;
        createdAt: string;
    };
    routing: ModelRouting;
    cli_tools: {
        codex: CliToolConfig;
        'gemini-cli': CliToolConfig;
        opencode: CliToolConfig;
    };
    cli_tools_mcp: {
        codex: CliToolMcpConfig;
        'gemini-cli': CliToolMcpConfig;
        opencode: CliToolMcpConfig;
    };
    workflows: {
        installed: string[];
    };
    paths: {
        commands: string;
        prompts: string;
        backup: string;
    };
    mcp: {
        provider: string;
        setup_url: string;
    };
    performance?: {
        liteMode?: boolean;
    };
}
interface WorkflowConfig {
    id: string;
    name: string;
    nameEn: string;
    category: string;
    commands: string[];
    defaultSelected: boolean;
    order: number;
    description?: string;
    descriptionEn?: string;
}
interface InitOptions {
    lang?: SupportedLang;
    skipPrompt?: boolean;
    skipMcp?: boolean;
    force?: boolean;
    frontend?: string;
    backend?: string;
    mode?: CollaborationMode;
    workflows?: string;
    installDir?: string;
}
interface InstallResult {
    success: boolean;
    installedCommands: string[];
    installedPrompts: string[];
    errors: string[];
    configPath: string;
    binPath?: string;
    binInstalled?: boolean;
}
interface AceToolConfig {
    baseUrl: string;
    token: string;
}

declare function init(options?: InitOptions): Promise<void>;

declare function showMainMenu(): Promise<void>;

/**
 * Main update command - checks for updates and installs if available
 */
declare function update(): Promise<void>;

declare const i18n: i18next.i18n;
declare function initI18n(lang?: SupportedLang): Promise<void>;
declare function changeLanguage(lang: SupportedLang): Promise<void>;

declare function getCcgDir(): string;
declare function getConfigPath(): string;
declare function migrateConfig(raw: unknown): CcgConfig;
declare function readCcgConfig(): Promise<CcgConfig | null>;
declare function writeCcgConfig(config: CcgConfig): Promise<void>;
declare function createDefaultConfig(options: {
    language: SupportedLang;
    routing: ModelRouting;
    installedWorkflows: string[];
    mcpProvider?: string;
    liteMode?: boolean;
}): CcgConfig;
declare function createDefaultRouting(): ModelRouting;

declare function getWorkflowConfigs(): WorkflowConfig[];
declare function getWorkflowById(id: string): WorkflowConfig | undefined;
declare function installWorkflows(workflowIds: string[], installDir: string, force?: boolean, config?: {
    routing?: {
        mode?: string;
        frontend?: {
            models?: string[];
            primary?: string;
        };
        backend?: {
            models?: string[];
            primary?: string;
        };
        review?: {
            models?: string[];
        };
    };
    liteMode?: boolean;
    mcpProvider?: string;
}): Promise<InstallResult>;
/**
 * Install and configure ace-tool MCP for Claude Code
 * Writes to ~/.claude.json (the correct config file for Claude Code CLI)
 */
interface UninstallResult {
    success: boolean;
    removedCommands: string[];
    removedPrompts: string[];
    removedAgents: string[];
    removedSkills: string[];
    removedBin: boolean;
    errors: string[];
}
/**
 * Uninstall workflows by removing their command files
 */
declare function uninstallWorkflows(installDir: string): Promise<UninstallResult>;
/**
 * Uninstall ace-tool MCP configuration from ~/.claude.json
 */
declare function uninstallAceTool(): Promise<{
    success: boolean;
    message: string;
}>;
declare function installAceTool(config: AceToolConfig): Promise<{
    success: boolean;
    message: string;
    configPath?: string;
}>;
/**
 * Install and configure ace-tool-rs MCP for Claude Code
 * ace-tool-rs is a Rust implementation of ace-tool, more lightweight and faster
 */
declare function installAceToolRs(config: AceToolConfig): Promise<{
    success: boolean;
    message: string;
    configPath?: string;
}>;

/**
 * Migration utilities for v1.4.0
 * Handles automatic migration from old directory structure to new one
 */
interface MigrationResult {
    success: boolean;
    migratedFiles: string[];
    errors: string[];
    skipped: string[];
}
/**
 * Migrate from v1.3.x to v1.4.0
 *
 * Changes:
 * 1. ~/.ccg/ → ~/.claude/.ccg/
 * 2. ~/.claude/prompts/ccg/ → ~/.claude/.ccg/prompts/
 */
declare function migrateToV1_4_0(): Promise<MigrationResult>;
/**
 * Check if migration is needed
 */
declare function needsMigration(): Promise<boolean>;

/**
 * Get current installed version from package.json
 */
declare function getCurrentVersion(): Promise<string>;
/**
 * Get latest version from npm registry
 */
declare function getLatestVersion(packageName?: string): Promise<string | null>;
/**
 * Compare two semantic versions
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
declare function compareVersions(v1: string, v2: string): number;
/**
 * Check if update is available
 */
declare function checkForUpdates(): Promise<{
    hasUpdate: boolean;
    currentVersion: string;
    latestVersion: string | null;
}>;

export { changeLanguage, checkForUpdates, compareVersions, createDefaultConfig, createDefaultRouting, getCcgDir, getConfigPath, getCurrentVersion, getLatestVersion, getWorkflowById, getWorkflowConfigs, i18n, init, initI18n, installAceTool, installAceToolRs, installWorkflows, migrateConfig, migrateToV1_4_0, needsMigration, readCcgConfig, showMainMenu, uninstallAceTool, uninstallWorkflows, update, writeCcgConfig };
export type { AceToolConfig, CcgConfig, CliOptions, CliTool, CliToolConfig, CliToolMcpConfig, CollaborationMode, InitOptions, InstallResult, ModelRouting, ModelType, ReviewRouting, RoutingStrategy, RoutingTarget, SupportedLang, WorkflowConfig };
