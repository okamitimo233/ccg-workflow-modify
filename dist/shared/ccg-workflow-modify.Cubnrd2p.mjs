import ansis from 'ansis';
import inquirer from 'inquirer';
import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'pathe';
import fs from 'fs-extra';
import i18next from 'i18next';
import ora from 'ora';
import { parse, stringify } from 'smol-toml';
import semver from 'semver';

const version = "2.0.0-alpha.1";

function isWindows() {
  return process.platform === "win32";
}
function getMcpCommand(command) {
  const needsWrapping = ["npx", "uvx", "node", "npm", "pnpm", "yarn"];
  if (isWindows() && needsWrapping.includes(command)) {
    return ["cmd", "/c", command];
  }
  return [command];
}

function getClaudeCodeConfigPath() {
  return join(homedir(), ".claude.json");
}
async function readClaudeCodeConfig() {
  const configPath = getClaudeCodeConfigPath();
  try {
    if (!await fs.pathExists(configPath)) {
      return null;
    }
    const content = await fs.readFile(configPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error("Failed to read Claude Code config:", error);
    return null;
  }
}
async function writeClaudeCodeConfig(config) {
  const configPath = getClaudeCodeConfigPath();
  try {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
  } catch (error) {
    throw new Error(`Failed to write Claude Code config: ${error}`);
  }
}
function applyPlatformCommand(config) {
  if (isWindows() && config.command) {
    if (config.command === "cmd") {
      return;
    }
    const mcpCmd = getMcpCommand(config.command);
    if (mcpCmd[0] === "cmd") {
      const originalArgs = config.args || [];
      config.command = mcpCmd[0];
      config.args = [...mcpCmd.slice(1), ...originalArgs];
    }
  }
}
function buildMcpServerConfig(baseConfig, apiKey, placeholder = "YOUR_API_KEY", envVarName) {
  const config = JSON.parse(JSON.stringify(baseConfig));
  applyPlatformCommand(config);
  {
    return config;
  }
}
function repairCorruptedMcpArgs(config) {
  if (!isWindows() || config.command !== "cmd" || !config.args) {
    return false;
  }
  const args = config.args;
  let repaired = false;
  if (args[0] === "cmd") {
    args.shift();
    repaired = true;
  }
  if (args[0] !== "/c") {
    return repaired;
  }
  if (args.length >= 3 && args[1] === args[2]) {
    args.splice(2, 1);
    repaired = true;
  }
  return repaired;
}
function fixWindowsMcpConfig(config) {
  if (!isWindows() || !config.mcpServers) {
    return config;
  }
  const fixed = JSON.parse(JSON.stringify(config));
  for (const [serverName, serverConfig] of Object.entries(fixed.mcpServers || {})) {
    if (serverConfig && typeof serverConfig === "object" && "command" in serverConfig) {
      const mcpConfig = serverConfig;
      repairCorruptedMcpArgs(mcpConfig);
      applyPlatformCommand(mcpConfig);
    }
  }
  return fixed;
}
function mergeMcpServers(existing, newServers) {
  const config = existing || { mcpServers: {} };
  if (!config.mcpServers) {
    config.mcpServers = {};
  }
  Object.assign(config.mcpServers, newServers);
  return config;
}
async function backupClaudeCodeConfig() {
  const configPath = getClaudeCodeConfigPath();
  try {
    if (!await fs.pathExists(configPath)) {
      return null;
    }
    const backupDir = join(homedir(), ".claude", "backup");
    await fs.ensureDir(backupDir);
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const backupPath = join(backupDir, `claude-config-${timestamp}.json`);
    await fs.copy(configPath, backupPath);
    return backupPath;
  } catch (error) {
    console.error("Failed to backup Claude Code config:", error);
    return null;
  }
}
async function diagnoseMcpConfig() {
  const issues = [];
  const configPath = getClaudeCodeConfigPath();
  if (!await fs.pathExists(configPath)) {
    issues.push("\u274C ~/.claude.json does not exist");
    return issues;
  }
  const config = await readClaudeCodeConfig();
  if (!config) {
    issues.push("\u274C Failed to parse ~/.claude.json");
    return issues;
  }
  if (!config.mcpServers || Object.keys(config.mcpServers).length === 0) {
    issues.push("\u26A0\uFE0F  No MCP servers configured");
    return issues;
  }
  if (isWindows()) {
    for (const [name, server] of Object.entries(config.mcpServers)) {
      if (server.command && ["npx", "uvx", "node"].includes(server.command)) {
        if (server.command !== "cmd") {
          issues.push(`\u274C ${name}: Command not properly wrapped for Windows (should use cmd /c)`);
        }
      }
    }
  }
  if (issues.length === 0) {
    issues.push("\u2705 MCP configuration looks good");
  }
  return issues;
}

const __filename$2 = fileURLToPath(import.meta.url);
const __dirname$2 = dirname(__filename$2);
function findPackageRoot$1(startDir) {
  let dir = startDir;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(join(dir, "package.json"))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return startDir;
}
const PACKAGE_ROOT$1 = findPackageRoot$1(__dirname$2);
const WORKFLOW_CONFIGS = [
  {
    id: "workflow",
    name: "\u5B8C\u6574\u5F00\u53D1\u5DE5\u4F5C\u6D41",
    nameEn: "Full Development Workflow",
    category: "development",
    commands: ["workflow"],
    defaultSelected: true,
    order: 1,
    description: "\u5B8C\u65746\u9636\u6BB5\u5F00\u53D1\u5DE5\u4F5C\u6D41\uFF08\u7814\u7A76\u2192\u6784\u601D\u2192\u8BA1\u5212\u2192\u6267\u884C\u2192\u4F18\u5316\u2192\u8BC4\u5BA1\uFF09",
    descriptionEn: "Full 6-phase development workflow"
  },
  {
    id: "plan",
    name: "\u591A\u6A21\u578B\u534F\u4F5C\u89C4\u5212",
    nameEn: "Multi-Model Planning",
    category: "development",
    commands: ["plan"],
    defaultSelected: true,
    order: 1.5,
    description: "\u4E0A\u4E0B\u6587\u68C0\u7D22 + \u53CC\u6A21\u578B\u5206\u6790 \u2192 \u751F\u6210 Step-by-step \u5B9E\u65BD\u8BA1\u5212",
    descriptionEn: "Context retrieval + dual-model analysis \u2192 Step-by-step plan"
  },
  {
    id: "execute",
    name: "\u591A\u6A21\u578B\u534F\u4F5C\u6267\u884C",
    nameEn: "Multi-Model Execution",
    category: "development",
    commands: ["execute"],
    defaultSelected: true,
    order: 1.6,
    description: "\u6839\u636E\u8BA1\u5212\u83B7\u53D6\u539F\u578B \u2192 Claude \u91CD\u6784\u5B9E\u65BD \u2192 \u591A\u6A21\u578B\u5BA1\u8BA1\u4EA4\u4ED8",
    descriptionEn: "Get prototype from plan \u2192 Claude refactor \u2192 Multi-model audit"
  },
  {
    id: "frontend",
    name: "\u524D\u7AEF\u4E13\u9879",
    nameEn: "Frontend Tasks",
    category: "development",
    commands: ["frontend"],
    defaultSelected: true,
    order: 2,
    description: "\u524D\u7AEF\u4E13\u9879\u4EFB\u52A1\uFF08Gemini\u4E3B\u5BFC\uFF0C\u66F4\u5FEB\u66F4\u7CBE\u51C6\uFF09",
    descriptionEn: "Frontend tasks (Gemini-led, faster)"
  },
  {
    id: "backend",
    name: "\u540E\u7AEF\u4E13\u9879",
    nameEn: "Backend Tasks",
    category: "development",
    commands: ["backend"],
    defaultSelected: true,
    order: 3,
    description: "\u540E\u7AEF\u4E13\u9879\u4EFB\u52A1\uFF08Codex\u4E3B\u5BFC\uFF0C\u66F4\u5FEB\u66F4\u7CBE\u51C6\uFF09",
    descriptionEn: "Backend tasks (Codex-led, faster)"
  },
  {
    id: "feat",
    name: "\u667A\u80FD\u529F\u80FD\u5F00\u53D1",
    nameEn: "Smart Feature Development",
    category: "development",
    commands: ["feat"],
    defaultSelected: true,
    order: 4,
    description: "\u667A\u80FD\u529F\u80FD\u5F00\u53D1 - \u81EA\u52A8\u89C4\u5212\u3001\u8BBE\u8BA1\u3001\u5B9E\u65BD",
    descriptionEn: "Smart feature development - auto plan, design, implement"
  },
  {
    id: "analyze",
    name: "\u6280\u672F\u5206\u6790",
    nameEn: "Technical Analysis",
    category: "development",
    commands: ["analyze"],
    defaultSelected: true,
    order: 5,
    description: "\u53CC\u6A21\u578B\u6280\u672F\u5206\u6790\uFF0C\u4EC5\u5206\u6790\u4E0D\u4FEE\u6539\u4EE3\u7801",
    descriptionEn: "Dual-model technical analysis, analysis only"
  },
  {
    id: "debug",
    name: "\u95EE\u9898\u8BCA\u65AD",
    nameEn: "Debug",
    category: "development",
    commands: ["debug"],
    defaultSelected: true,
    order: 6,
    description: "\u591A\u6A21\u578B\u8BCA\u65AD + \u4FEE\u590D",
    descriptionEn: "Multi-model diagnosis + fix"
  },
  {
    id: "optimize",
    name: "\u6027\u80FD\u4F18\u5316",
    nameEn: "Performance Optimization",
    category: "development",
    commands: ["optimize"],
    defaultSelected: true,
    order: 7,
    description: "\u591A\u6A21\u578B\u6027\u80FD\u4F18\u5316",
    descriptionEn: "Multi-model performance optimization"
  },
  {
    id: "test",
    name: "\u6D4B\u8BD5\u751F\u6210",
    nameEn: "Test Generation",
    category: "development",
    commands: ["test"],
    defaultSelected: true,
    order: 8,
    description: "\u667A\u80FD\u8DEF\u7531\u6D4B\u8BD5\u751F\u6210",
    descriptionEn: "Smart routing test generation"
  },
  {
    id: "review",
    name: "\u4EE3\u7801\u5BA1\u67E5",
    nameEn: "Code Review",
    category: "development",
    commands: ["review"],
    defaultSelected: true,
    order: 9,
    description: "\u53CC\u6A21\u578B\u4EE3\u7801\u5BA1\u67E5\uFF0C\u65E0\u53C2\u6570\u65F6\u81EA\u52A8\u5BA1\u67E5 git diff",
    descriptionEn: "Dual-model code review, auto-review git diff when no args"
  },
  {
    id: "enhance",
    name: "Prompt \u589E\u5F3A",
    nameEn: "Prompt Enhancement",
    category: "development",
    commands: ["enhance"],
    defaultSelected: true,
    order: 9.5,
    description: "ace-tool Prompt \u589E\u5F3A\u5DE5\u5177",
    descriptionEn: "ace-tool prompt enhancement"
  },
  {
    id: "init-project",
    name: "\u9879\u76EE\u521D\u59CB\u5316",
    nameEn: "Project Init",
    category: "init",
    commands: ["init"],
    defaultSelected: true,
    order: 10,
    description: "\u521D\u59CB\u5316\u9879\u76EE AI \u4E0A\u4E0B\u6587\uFF0C\u751F\u6210 CLAUDE.md",
    descriptionEn: "Initialize project AI context, generate CLAUDE.md"
  },
  {
    id: "commit",
    name: "Git \u63D0\u4EA4",
    nameEn: "Git Commit",
    category: "git",
    commands: ["commit"],
    defaultSelected: true,
    order: 20,
    description: "\u667A\u80FD\u751F\u6210 conventional commit \u4FE1\u606F",
    descriptionEn: "Smart conventional commit message generation"
  },
  {
    id: "rollback",
    name: "Git \u56DE\u6EDA",
    nameEn: "Git Rollback",
    category: "git",
    commands: ["rollback"],
    defaultSelected: true,
    order: 21,
    description: "\u4EA4\u4E92\u5F0F\u56DE\u6EDA\u5206\u652F\u5230\u5386\u53F2\u7248\u672C",
    descriptionEn: "Interactive rollback to historical version"
  },
  {
    id: "clean-branches",
    name: "Git \u6E05\u7406\u5206\u652F",
    nameEn: "Git Clean Branches",
    category: "git",
    commands: ["clean-branches"],
    defaultSelected: true,
    order: 22,
    description: "\u5B89\u5168\u6E05\u7406\u5DF2\u5408\u5E76\u6216\u8FC7\u671F\u5206\u652F",
    descriptionEn: "Safely clean merged or stale branches"
  },
  {
    id: "worktree",
    name: "Git Worktree",
    nameEn: "Git Worktree",
    category: "git",
    commands: ["worktree"],
    defaultSelected: true,
    order: 23,
    description: "\u7BA1\u7406 Git worktree",
    descriptionEn: "Manage Git worktree"
  },
  {
    id: "spec-init",
    name: "OpenSpec \u521D\u59CB\u5316",
    nameEn: "OpenSpec Init",
    category: "spec",
    commands: ["spec-init"],
    defaultSelected: true,
    order: 30,
    description: "\u521D\u59CB\u5316 OpenSpec \u73AF\u5883 + \u9A8C\u8BC1\u591A\u6A21\u578B MCP \u5DE5\u5177",
    descriptionEn: "Initialize OpenSpec environment with multi-model MCP validation"
  },
  {
    id: "spec-research",
    name: "\u9700\u6C42\u7814\u7A76",
    nameEn: "Spec Research",
    category: "spec",
    commands: ["spec-research"],
    defaultSelected: true,
    order: 31,
    description: "\u9700\u6C42 \u2192 \u7EA6\u675F\u96C6\uFF08\u5E76\u884C\u63A2\u7D22 + OpenSpec \u63D0\u6848\uFF09",
    descriptionEn: "Transform requirements into constraint sets via parallel exploration"
  },
  {
    id: "spec-plan",
    name: "\u96F6\u51B3\u7B56\u89C4\u5212",
    nameEn: "Spec Plan",
    category: "spec",
    commands: ["spec-plan"],
    defaultSelected: true,
    order: 32,
    description: "\u591A\u6A21\u578B\u5206\u6790 \u2192 \u6D88\u9664\u6B67\u4E49 \u2192 \u96F6\u51B3\u7B56\u53EF\u6267\u884C\u8BA1\u5212",
    descriptionEn: "Refine proposals into zero-decision executable plans"
  },
  {
    id: "spec-impl",
    name: "\u89C4\u8303\u9A71\u52A8\u5B9E\u73B0",
    nameEn: "Spec Implementation",
    category: "spec",
    commands: ["spec-impl"],
    defaultSelected: true,
    order: 33,
    description: "\u6309\u89C4\u8303\u6267\u884C + \u591A\u6A21\u578B\u534F\u4F5C + \u5F52\u6863",
    descriptionEn: "Execute changes via multi-model collaboration with spec compliance"
  },
  {
    id: "spec-review",
    name: "\u5F52\u6863\u524D\u5BA1\u67E5",
    nameEn: "Spec Review",
    category: "spec",
    commands: ["spec-review"],
    defaultSelected: true,
    order: 34,
    description: "\u53CC\u6A21\u578B\u4EA4\u53C9\u5BA1\u67E5 \u2192 Critical \u5FC5\u987B\u4FEE\u590D \u2192 \u5141\u8BB8\u5F52\u6863",
    descriptionEn: "Multi-model compliance review before archiving"
  },
  {
    id: "team-research",
    name: "Agent Teams \u9700\u6C42\u7814\u7A76",
    nameEn: "Agent Teams Research",
    category: "development",
    commands: ["team-research"],
    defaultSelected: true,
    order: 1.8,
    description: "\u5E76\u884C\u63A2\u7D22\u4EE3\u7801\u5E93\uFF0C\u4EA7\u51FA\u7EA6\u675F\u96C6 + \u53EF\u9A8C\u8BC1\u6210\u529F\u5224\u636E",
    descriptionEn: "Parallel codebase exploration, produces constraint sets + success criteria"
  },
  {
    id: "team-plan",
    name: "Agent Teams \u89C4\u5212",
    nameEn: "Agent Teams Planning",
    category: "development",
    commands: ["team-plan"],
    defaultSelected: true,
    order: 2,
    description: "Lead \u8C03\u7528 Codex/Gemini \u5E76\u884C\u5206\u6790\uFF0C\u4EA7\u51FA\u96F6\u51B3\u7B56\u5E76\u884C\u5B9E\u65BD\u8BA1\u5212",
    descriptionEn: "Lead orchestrates Codex/Gemini analysis, produces zero-decision parallel plan"
  },
  {
    id: "team-exec",
    name: "Agent Teams \u5E76\u884C\u5B9E\u65BD",
    nameEn: "Agent Teams Parallel Execution",
    category: "development",
    commands: ["team-exec"],
    defaultSelected: true,
    order: 2.5,
    description: "\u8BFB\u53D6\u8BA1\u5212\u6587\u4EF6\uFF0Cspawn Builder teammates \u5E76\u884C\u5199\u4EE3\u7801\uFF0C\u9700\u542F\u7528 Agent Teams",
    descriptionEn: "Read plan file, spawn Builder teammates for parallel implementation"
  },
  {
    id: "team-review",
    name: "Agent Teams \u5BA1\u67E5",
    nameEn: "Agent Teams Review",
    category: "development",
    commands: ["team-review"],
    defaultSelected: true,
    order: 3,
    description: "\u53CC\u6A21\u578B\u4EA4\u53C9\u5BA1\u67E5\u5E76\u884C\u5B9E\u65BD\u4EA7\u51FA\uFF0C\u5206\u7EA7\u5904\u7406 Critical/Warning/Info",
    descriptionEn: "Dual-model cross-review with severity classification"
  }
];
function getWorkflowConfigs() {
  return WORKFLOW_CONFIGS.sort((a, b) => a.order - b.order);
}
function getWorkflowById(id) {
  return WORKFLOW_CONFIGS.find((w) => w.id === id);
}
function getAllCommandIds() {
  return WORKFLOW_CONFIGS.map((w) => w.id);
}
({
  full: {
    workflows: WORKFLOW_CONFIGS.map((w) => w.id)
  }
});
function injectConfigVariables(content, config) {
  let processed = content;
  const routing = config.routing || {};
  const frontendCliTool = routing.frontend?.cli_tool || "opencode";
  const frontendPrimary = frontendCliTool === "codex" ? "codex" : "gemini";
  const frontendModels = [frontendPrimary];
  processed = processed.replace(/\{\{FRONTEND_MODELS\}\}/g, JSON.stringify(frontendModels));
  processed = processed.replace(/\{\{FRONTEND_PRIMARY\}\}/g, frontendPrimary);
  const backendCliTool = routing.backend?.cli_tool || "codex";
  const backendPrimary = backendCliTool === "codex" ? "codex" : "gemini";
  const backendModels = [backendPrimary];
  processed = processed.replace(/\{\{BACKEND_MODELS\}\}/g, JSON.stringify(backendModels));
  processed = processed.replace(/\{\{BACKEND_PRIMARY\}\}/g, backendPrimary);
  const reviewModels = [.../* @__PURE__ */ new Set([frontendPrimary, backendPrimary])];
  processed = processed.replace(/\{\{REVIEW_MODELS\}\}/g, JSON.stringify(reviewModels));
  const routingMode = routing.mode || "smart";
  processed = processed.replace(/\{\{ROUTING_MODE\}\}/g, routingMode);
  const liteModeFlag = config.liteMode ? "--lite " : "";
  processed = processed.replace(/\{\{LITE_MODE_FLAG\}\}/g, liteModeFlag);
  const mcpProvider = config.mcpProvider || "ace-tool";
  if (mcpProvider === "contextweaver") {
    processed = processed.replace(/\{\{MCP_SEARCH_TOOL\}\}/g, "mcp__contextweaver__codebase-retrieval");
    processed = processed.replace(/\{\{MCP_SEARCH_PARAM\}\}/g, "information_request");
  } else {
    processed = processed.replace(/\{\{MCP_SEARCH_TOOL\}\}/g, "mcp__ace-tool__search_context");
    processed = processed.replace(/\{\{MCP_SEARCH_PARAM\}\}/g, "query");
  }
  return processed;
}
function replaceHomePathsInTemplate(content, installDir) {
  const userHome = homedir();
  const ccgDir = join(installDir, ".ccg");
  const binDir = join(installDir, "bin");
  const claudeDir = installDir;
  const normalizePath2 = (path) => path.replace(/\\/g, "/");
  let processed = content;
  processed = processed.replace(/~\/\.claude\/\.ccg/g, normalizePath2(ccgDir));
  const wrapperName = isWindows() ? "codeagent-wrapper.exe" : "codeagent-wrapper";
  const wrapperPath = `${normalizePath2(binDir)}/${wrapperName}`;
  processed = processed.replace(/~\/\.claude\/bin\/codeagent-wrapper/g, wrapperPath);
  processed = processed.replace(/~\/\.claude\/bin/g, normalizePath2(binDir));
  processed = processed.replace(/~\/\.claude/g, normalizePath2(claudeDir));
  processed = processed.replace(/~\//g, `${normalizePath2(userHome)}/`);
  return processed;
}
async function installWorkflows(workflowIds, installDir, force = false, config) {
  const installConfig = {
    routing: config?.routing || {
      mode: "smart",
      frontend: { cli_tool: "opencode", model_id: "antigravity/gemini-3-pro-high", strategy: "parallel" },
      backend: { cli_tool: "codex", model_id: "", strategy: "parallel" },
      review: { strategy: "parallel" }
    },
    liteMode: config?.liteMode || false,
    mcpProvider: config?.mcpProvider || "ace-tool"
  };
  const result = {
    success: true,
    installedCommands: [],
    installedPrompts: [],
    errors: [],
    configPath: ""
  };
  const commandsDir = join(installDir, "commands", "ccg");
  const ccgConfigDir = join(installDir, ".ccg");
  const promptsDir = join(ccgConfigDir, "prompts");
  await fs.ensureDir(commandsDir);
  await fs.ensureDir(ccgConfigDir);
  await fs.ensureDir(promptsDir);
  const templateDir = join(PACKAGE_ROOT$1, "templates");
  for (const workflowId of workflowIds) {
    const workflow = getWorkflowById(workflowId);
    if (!workflow) {
      result.errors.push(`Unknown workflow: ${workflowId}`);
      continue;
    }
    for (const cmd of workflow.commands) {
      const srcFile = join(templateDir, "commands", `${cmd}.md`);
      const destFile = join(commandsDir, `${cmd}.md`);
      try {
        if (await fs.pathExists(srcFile)) {
          if (force || !await fs.pathExists(destFile)) {
            let templateContent = await fs.readFile(srcFile, "utf-8");
            templateContent = injectConfigVariables(templateContent, installConfig);
            const processedContent = replaceHomePathsInTemplate(templateContent, installDir);
            await fs.writeFile(destFile, processedContent, "utf-8");
            result.installedCommands.push(cmd);
          }
        } else {
          const placeholder = `---
description: "${workflow.descriptionEn}"
---

# /ccg:${cmd}

${workflow.description}

> This command is part of CCG multi-model collaboration system.
`;
          await fs.writeFile(destFile, placeholder, "utf-8");
          result.installedCommands.push(cmd);
        }
      } catch (error) {
        result.errors.push(`Failed to install ${cmd}: ${error}`);
        result.success = false;
      }
    }
  }
  const agentsSrcDir = join(templateDir, "commands", "agents");
  const agentsDestDir = join(installDir, "agents", "ccg");
  if (await fs.pathExists(agentsSrcDir)) {
    try {
      await fs.ensureDir(agentsDestDir);
      const agentFiles = await fs.readdir(agentsSrcDir);
      for (const file of agentFiles) {
        if (file.endsWith(".md")) {
          const srcFile = join(agentsSrcDir, file);
          const destFile = join(agentsDestDir, file);
          if (force || !await fs.pathExists(destFile)) {
            let templateContent = await fs.readFile(srcFile, "utf-8");
            templateContent = injectConfigVariables(templateContent, installConfig);
            const processedContent = replaceHomePathsInTemplate(templateContent, installDir);
            await fs.writeFile(destFile, processedContent, "utf-8");
          }
        }
      }
    } catch (error) {
      result.errors.push(`Failed to install agents: ${error}`);
      result.success = false;
    }
  }
  const promptsTemplateDir = join(templateDir, "prompts");
  if (await fs.pathExists(promptsTemplateDir)) {
    const modelDirs = ["codex", "gemini", "claude"];
    for (const model of modelDirs) {
      const srcModelDir = join(promptsTemplateDir, model);
      const destModelDir = join(promptsDir, model);
      if (await fs.pathExists(srcModelDir)) {
        try {
          await fs.ensureDir(destModelDir);
          const files = await fs.readdir(srcModelDir);
          for (const file of files) {
            if (file.endsWith(".md")) {
              const srcFile = join(srcModelDir, file);
              const destFile = join(destModelDir, file);
              if (force || !await fs.pathExists(destFile)) {
                const templateContent = await fs.readFile(srcFile, "utf-8");
                const processedContent = replaceHomePathsInTemplate(templateContent, installDir);
                await fs.writeFile(destFile, processedContent, "utf-8");
                result.installedPrompts.push(`${model}/${file.replace(".md", "")}`);
              }
            }
          }
        } catch (error) {
          result.errors.push(`Failed to install ${model} prompts: ${error}`);
          result.success = false;
        }
      }
    }
  }
  const skillsTemplateDir = join(templateDir, "skills");
  const skillsDestDir = join(installDir, "skills");
  if (await fs.pathExists(skillsTemplateDir)) {
    try {
      const skillDirs = await fs.readdir(skillsTemplateDir);
      for (const skillName of skillDirs) {
        const srcSkillDir = join(skillsTemplateDir, skillName);
        const destSkillDir = join(skillsDestDir, skillName);
        const stat = await fs.stat(srcSkillDir);
        if (stat.isDirectory()) {
          await fs.ensureDir(destSkillDir);
          const files = await fs.readdir(srcSkillDir);
          for (const file of files) {
            const srcFile = join(srcSkillDir, file);
            const destFile = join(destSkillDir, file);
            if (force || !await fs.pathExists(destFile)) {
              const templateContent = await fs.readFile(srcFile, "utf-8");
              const processedContent = replaceHomePathsInTemplate(templateContent, installDir);
              await fs.writeFile(destFile, processedContent, "utf-8");
            }
          }
        }
      }
    } catch (error) {
      result.errors.push(`Failed to install skills: ${error}`);
      result.success = false;
    }
  }
  try {
    const binDir = join(installDir, "bin");
    await fs.ensureDir(binDir);
    const platform = process.platform;
    const arch = process.arch;
    let binaryName;
    if (platform === "darwin") {
      binaryName = arch === "arm64" ? "codeagent-wrapper-darwin-arm64" : "codeagent-wrapper-darwin-amd64";
    } else if (platform === "linux") {
      binaryName = arch === "arm64" ? "codeagent-wrapper-linux-arm64" : "codeagent-wrapper-linux-amd64";
    } else if (platform === "win32") {
      binaryName = arch === "arm64" ? "codeagent-wrapper-windows-arm64.exe" : "codeagent-wrapper-windows-amd64.exe";
    } else {
      result.errors.push(`Unsupported platform: ${platform}`);
      result.success = false;
      result.configPath = commandsDir;
      return result;
    }
    const srcBinary = join(PACKAGE_ROOT$1, "bin", binaryName);
    const destBinary = join(binDir, platform === "win32" ? "codeagent-wrapper.exe" : "codeagent-wrapper");
    if (await fs.pathExists(srcBinary)) {
      await fs.copy(srcBinary, destBinary);
      if (platform !== "win32") {
        await fs.chmod(destBinary, 493);
      }
      try {
        const { execSync } = await import('node:child_process');
        execSync(`"${destBinary}" --version`, { stdio: "pipe" });
        result.binPath = binDir;
        result.binInstalled = true;
      } catch (verifyError) {
        result.errors.push(`Binary verification failed: ${verifyError}`);
        result.success = false;
      }
    } else {
      result.errors.push(`Binary not found in package: ${binaryName}`);
      result.success = false;
    }
  } catch (error) {
    result.errors.push(`Failed to install codeagent-wrapper: ${error}`);
    result.success = false;
  }
  result.configPath = commandsDir;
  return result;
}
async function uninstallWorkflows(installDir) {
  const result = {
    success: true,
    removedCommands: [],
    removedPrompts: [],
    removedAgents: [],
    removedSkills: [],
    removedBin: false,
    errors: []
  };
  const commandsDir = join(installDir, "commands", "ccg");
  join(installDir, ".ccg", "prompts");
  const agentsDir = join(installDir, "agents", "ccg");
  const skillsDir = join(installDir, "skills", "multi-model-collaboration");
  const binDir = join(installDir, "bin");
  const ccgConfigDir = join(installDir, ".ccg");
  if (await fs.pathExists(commandsDir)) {
    try {
      const files = await fs.readdir(commandsDir);
      for (const file of files) {
        if (file.endsWith(".md")) {
          result.removedCommands.push(file.replace(".md", ""));
        }
      }
      await fs.remove(commandsDir);
    } catch (error) {
      result.errors.push(`Failed to remove commands directory: ${error}`);
      result.success = false;
    }
  }
  if (await fs.pathExists(agentsDir)) {
    try {
      const files = await fs.readdir(agentsDir);
      for (const file of files) {
        result.removedAgents.push(file.replace(".md", ""));
      }
      await fs.remove(agentsDir);
    } catch (error) {
      result.errors.push(`Failed to remove agents directory: ${error}`);
      result.success = false;
    }
  }
  if (await fs.pathExists(skillsDir)) {
    try {
      const files = await fs.readdir(skillsDir);
      for (const file of files) {
        result.removedSkills.push(file);
      }
      await fs.remove(skillsDir);
    } catch (error) {
      result.errors.push(`Failed to remove skills: ${error}`);
      result.success = false;
    }
  }
  if (await fs.pathExists(binDir)) {
    try {
      const wrapperName = process.platform === "win32" ? "codeagent-wrapper.exe" : "codeagent-wrapper";
      const wrapperPath = join(binDir, wrapperName);
      if (await fs.pathExists(wrapperPath)) {
        await fs.remove(wrapperPath);
        result.removedBin = true;
      }
    } catch (error) {
      result.errors.push(`Failed to remove binary: ${error}`);
      result.success = false;
    }
  }
  if (await fs.pathExists(ccgConfigDir)) {
    try {
      await fs.remove(ccgConfigDir);
      result.removedPrompts.push("ALL_PROMPTS_AND_CONFIGS");
    } catch (error) {
      result.errors.push(`Failed to remove .ccg directory: ${error}`);
    }
  }
  return result;
}
async function uninstallAceTool() {
  try {
    const existingConfig = await readClaudeCodeConfig();
    if (!existingConfig) {
      return {
        success: true,
        message: "No ~/.claude.json found, nothing to remove"
      };
    }
    if (!existingConfig.mcpServers || !existingConfig.mcpServers["ace-tool"]) {
      return {
        success: true,
        message: "ace-tool MCP not found in config"
      };
    }
    await backupClaudeCodeConfig();
    delete existingConfig.mcpServers["ace-tool"];
    await writeClaudeCodeConfig(existingConfig);
    return {
      success: true,
      message: "ace-tool MCP removed from ~/.claude.json"
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to uninstall ace-tool: ${error}`
    };
  }
}
async function installAceTool(config) {
  const { baseUrl, token } = config;
  try {
    let existingConfig = await readClaudeCodeConfig();
    if (!existingConfig) {
      existingConfig = { mcpServers: {} };
    }
    if (existingConfig.mcpServers && Object.keys(existingConfig.mcpServers).length > 0) {
      const backupPath = await backupClaudeCodeConfig();
      if (backupPath) {
        console.log(`  \u2713 Backup created: ${backupPath}`);
      }
    }
    const args = ["-y", "ace-tool@latest"];
    if (baseUrl) {
      args.push("--base-url", baseUrl);
    }
    if (token) {
      args.push("--token", token);
    }
    const aceToolConfig = buildMcpServerConfig({
      type: "stdio",
      command: "npx",
      args
    });
    let mergedConfig = mergeMcpServers(existingConfig, {
      "ace-tool": aceToolConfig
    });
    if (isWindows()) {
      mergedConfig = fixWindowsMcpConfig(mergedConfig);
      console.log("  \u2713 Applied Windows MCP configuration fixes");
    }
    await writeClaudeCodeConfig(mergedConfig);
    return {
      success: true,
      message: isWindows() ? "ace-tool MCP configured successfully with Windows compatibility" : "ace-tool MCP configured successfully",
      configPath: join(homedir(), ".claude.json")
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to configure ace-tool: ${error}`
    };
  }
}
async function installAceToolRs(config) {
  const { baseUrl, token } = config;
  try {
    let existingConfig = await readClaudeCodeConfig();
    if (!existingConfig) {
      existingConfig = { mcpServers: {} };
    }
    if (existingConfig.mcpServers && Object.keys(existingConfig.mcpServers).length > 0) {
      const backupPath = await backupClaudeCodeConfig();
      if (backupPath) {
        console.log(`  \u2713 Backup created: ${backupPath}`);
      }
    }
    const args = ["ace-tool-rs"];
    if (baseUrl) {
      args.push("--base-url", baseUrl);
    }
    if (token) {
      args.push("--token", token);
    }
    const aceToolRsConfig = buildMcpServerConfig({
      type: "stdio",
      command: "npx",
      args,
      env: {
        RUST_LOG: "info"
      }
    });
    let mergedConfig = mergeMcpServers(existingConfig, {
      "ace-tool": aceToolRsConfig
    });
    if (isWindows()) {
      mergedConfig = fixWindowsMcpConfig(mergedConfig);
      console.log("  \u2713 Applied Windows MCP configuration fixes");
    }
    await writeClaudeCodeConfig(mergedConfig);
    return {
      success: true,
      message: isWindows() ? "ace-tool-rs MCP configured successfully with Windows compatibility" : "ace-tool-rs MCP configured successfully",
      configPath: join(homedir(), ".claude.json")
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to configure ace-tool-rs: ${error}`
    };
  }
}
async function installContextWeaver(config) {
  const { siliconflowApiKey } = config;
  try {
    console.log("  \u23F3 \u6B63\u5728\u5B89\u88C5 ContextWeaver CLI...");
    const { execSync } = await import('node:child_process');
    try {
      execSync("npm install -g @hsingjui/contextweaver", { stdio: "pipe" });
      console.log("  \u2713 ContextWeaver CLI \u5B89\u88C5\u6210\u529F");
    } catch {
      if (process.platform !== "win32") {
        try {
          execSync("sudo npm install -g @hsingjui/contextweaver", { stdio: "pipe" });
          console.log("  \u2713 ContextWeaver CLI \u5B89\u88C5\u6210\u529F (sudo)");
        } catch {
          console.log("  \u26A0 ContextWeaver CLI \u5B89\u88C5\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u8FD0\u884C: npm install -g @hsingjui/contextweaver");
        }
      } else {
        console.log("  \u26A0 ContextWeaver CLI \u5B89\u88C5\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u8FD0\u884C: npm install -g @hsingjui/contextweaver");
      }
    }
    const contextWeaverDir = join(homedir(), ".contextweaver");
    await fs.ensureDir(contextWeaverDir);
    const envContent = `# ContextWeaver \u914D\u7F6E (\u7531 CCG \u81EA\u52A8\u751F\u6210)

# Embedding API - \u7845\u57FA\u6D41\u52A8
EMBEDDINGS_API_KEY=${siliconflowApiKey}
EMBEDDINGS_BASE_URL=https://api.siliconflow.cn/v1/embeddings
EMBEDDINGS_MODEL=Qwen/Qwen3-Embedding-8B
EMBEDDINGS_MAX_CONCURRENCY=10
EMBEDDINGS_DIMENSIONS=1024

# Reranker - \u7845\u57FA\u6D41\u52A8
RERANK_API_KEY=${siliconflowApiKey}
RERANK_BASE_URL=https://api.siliconflow.cn/v1/rerank
RERANK_MODEL=Qwen/Qwen3-Reranker-8B
RERANK_TOP_N=20
`;
    await fs.writeFile(join(contextWeaverDir, ".env"), envContent, "utf-8");
    let existingConfig = await readClaudeCodeConfig();
    if (!existingConfig) {
      existingConfig = { mcpServers: {} };
    }
    if (existingConfig.mcpServers && Object.keys(existingConfig.mcpServers).length > 0) {
      const backupPath = await backupClaudeCodeConfig();
      if (backupPath) {
        console.log(`  \u2713 Backup created: ${backupPath}`);
      }
    }
    const contextWeaverMcpConfig = buildMcpServerConfig({
      type: "stdio",
      command: "contextweaver",
      args: ["mcp"]
    });
    let mergedConfig = mergeMcpServers(existingConfig, {
      contextweaver: contextWeaverMcpConfig
    });
    if (isWindows()) {
      mergedConfig = fixWindowsMcpConfig(mergedConfig);
    }
    await writeClaudeCodeConfig(mergedConfig);
    return {
      success: true,
      message: "ContextWeaver MCP configured successfully",
      configPath: join(homedir(), ".claude.json")
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to configure ContextWeaver: ${error}`
    };
  }
}
async function uninstallContextWeaver() {
  try {
    const existingConfig = await readClaudeCodeConfig();
    if (existingConfig?.mcpServers?.contextweaver) {
      delete existingConfig.mcpServers.contextweaver;
      await writeClaudeCodeConfig(existingConfig);
    }
    return {
      success: true,
      message: "ContextWeaver MCP uninstalled successfully"
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to uninstall ContextWeaver: ${error}`
    };
  }
}
async function installMcpServer(id, command, args, env = {}) {
  try {
    await backupClaudeCodeConfig();
    const existingConfig = await readClaudeCodeConfig();
    const serverConfig = buildMcpServerConfig({ type: "stdio", command, args, env });
    let mergedConfig = mergeMcpServers(existingConfig, { [id]: serverConfig });
    if (isWindows()) {
      mergedConfig = fixWindowsMcpConfig(mergedConfig);
    }
    await writeClaudeCodeConfig(mergedConfig);
    return { success: true, message: `${id} MCP installed successfully` };
  } catch (error) {
    return { success: false, message: `Failed to install ${id}: ${error}` };
  }
}
async function uninstallMcpServer(id) {
  try {
    const existingConfig = await readClaudeCodeConfig();
    if (existingConfig?.mcpServers?.[id]) {
      delete existingConfig.mcpServers[id];
      await writeClaudeCodeConfig(existingConfig);
    }
    return { success: true, message: `${id} MCP uninstalled successfully` };
  } catch (error) {
    return { success: false, message: `Failed to uninstall ${id}: ${error}` };
  }
}

async function configMcp() {
  console.log();
  console.log(ansis.cyan.bold(`  \u914D\u7F6E MCP \u5DE5\u5177`));
  console.log();
  const { action } = await inquirer.prompt([{
    type: "list",
    name: "action",
    message: "\u9009\u62E9\u64CD\u4F5C",
    choices: [
      { name: `${ansis.green("\u279C")} \u4EE3\u7801\u68C0\u7D22 MCP ${ansis.gray("(ContextWeaver / ace-tool)")}`, value: "code-retrieval" },
      { name: `${ansis.blue("\u279C")} \u8F85\u52A9\u5DE5\u5177 MCP ${ansis.gray("(context7 / Playwright / exa...)")}`, value: "auxiliary" },
      { name: `${ansis.red("\u2715")} \u5378\u8F7D MCP`, value: "uninstall" },
      new inquirer.Separator(),
      { name: `${ansis.gray("\u8FD4\u56DE")}`, value: "cancel" }
    ]
  }]);
  if (action === "cancel")
    return;
  if (action === "code-retrieval") {
    await handleCodeRetrieval();
  } else if (action === "auxiliary") {
    await handleAuxiliary();
  } else if (action === "uninstall") {
    await handleUninstall();
  }
}
async function handleCodeRetrieval() {
  console.log();
  const { tool } = await inquirer.prompt([{
    type: "list",
    name: "tool",
    message: "\u9009\u62E9\u4EE3\u7801\u68C0\u7D22\u5DE5\u5177",
    choices: [
      { name: `ContextWeaver ${ansis.green("(\u63A8\u8350)")} ${ansis.gray("- \u672C\u5730\u6DF7\u5408\u641C\u7D22")}`, value: "contextweaver" },
      { name: `ace-tool ${ansis.red("(\u6536\u8D39)")} ${ansis.gray("- Node.js")}`, value: "ace-tool" },
      { name: `ace-tool-rs ${ansis.red("(\u6536\u8D39)")} ${ansis.gray("- Rust")}`, value: "ace-tool-rs" },
      new inquirer.Separator(),
      { name: `${ansis.gray("\u8FD4\u56DE")}`, value: "cancel" }
    ]
  }]);
  if (tool === "cancel")
    return;
  if (tool === "contextweaver") {
    await handleInstallContextWeaver();
  } else {
    await handleInstallAceTool(tool === "ace-tool-rs");
  }
}
async function handleInstallAceTool(isRs) {
  const toolName = isRs ? "ace-tool-rs" : "ace-tool";
  console.log();
  console.log(ansis.cyan(`\u{1F4D6} \u83B7\u53D6 ${toolName} \u8BBF\u95EE\u65B9\u5F0F\uFF1A`));
  console.log(`   ${ansis.gray("\u2022")} ${ansis.cyan("\u5B98\u65B9\u670D\u52A1")}: ${ansis.underline("https://augmentcode.com/")}`);
  console.log(`   ${ansis.gray("\u2022")} ${ansis.cyan("\u4E2D\u8F6C\u670D\u52A1")} ${ansis.yellow("(\u65E0\u9700\u6CE8\u518C)")}: ${ansis.underline("https://linux.do/t/topic/1291730")}`);
  console.log();
  const answers = await inquirer.prompt([
    { type: "input", name: "baseUrl", message: `Base URL ${ansis.gray("(\u4E2D\u8F6C\u670D\u52A1\u5FC5\u586B\uFF0C\u5B98\u65B9\u7559\u7A7A)")}` },
    { type: "password", name: "token", message: `Token ${ansis.gray("(\u5FC5\u586B)")}`, validate: (v) => v.trim() !== "" || "\u8BF7\u8F93\u5165 Token" }
  ]);
  console.log();
  console.log(ansis.yellow(`\u23F3 \u6B63\u5728\u914D\u7F6E ${toolName} MCP...`));
  const result = await (isRs ? installAceToolRs : installAceTool)({
    baseUrl: answers.baseUrl?.trim() || void 0,
    token: answers.token.trim()
  });
  console.log();
  if (result.success) {
    console.log(ansis.green(`\u2713 ${toolName} MCP \u914D\u7F6E\u6210\u529F\uFF01`));
    console.log(ansis.gray(`  \u91CD\u542F Claude Code CLI \u4F7F\u914D\u7F6E\u751F\u6548`));
  } else {
    console.log(ansis.red(`\u2717 ${toolName} MCP \u914D\u7F6E\u5931\u8D25: ${result.message}`));
  }
}
async function handleInstallContextWeaver() {
  console.log();
  console.log(ansis.cyan(`\u{1F4D6} \u83B7\u53D6\u7845\u57FA\u6D41\u52A8 API Key\uFF1A`));
  console.log(`   ${ansis.gray("1.")} \u8BBF\u95EE ${ansis.underline("https://siliconflow.cn/")} \u6CE8\u518C\u8D26\u53F7`);
  console.log(`   ${ansis.gray("2.")} \u8FDB\u5165\u63A7\u5236\u53F0 \u2192 API \u5BC6\u94A5 \u2192 \u521B\u5EFA\u5BC6\u94A5`);
  console.log(`   ${ansis.gray("3.")} \u65B0\u7528\u6237\u6709\u514D\u8D39\u989D\u5EA6\uFF0CEmbedding + Rerank \u5B8C\u5168\u591F\u7528`);
  console.log();
  const { apiKey } = await inquirer.prompt([{
    type: "password",
    name: "apiKey",
    message: `\u7845\u57FA\u6D41\u52A8 API Key ${ansis.gray("(sk-xxx)")}`,
    mask: "*",
    validate: (v) => v.trim() !== "" || "\u8BF7\u8F93\u5165 API Key"
  }]);
  console.log();
  console.log(ansis.yellow("\u23F3 \u6B63\u5728\u914D\u7F6E ContextWeaver MCP..."));
  const result = await installContextWeaver({ siliconflowApiKey: apiKey.trim() });
  console.log();
  if (result.success) {
    console.log(ansis.green("\u2713 ContextWeaver MCP \u914D\u7F6E\u6210\u529F\uFF01"));
    console.log(ansis.gray("  \u91CD\u542F Claude Code CLI \u4F7F\u914D\u7F6E\u751F\u6548"));
  } else {
    console.log(ansis.red(`\u2717 ContextWeaver MCP \u914D\u7F6E\u5931\u8D25: ${result.message}`));
  }
}
const AUXILIARY_MCPS = [
  { id: "context7", name: "Context7", desc: "\u83B7\u53D6\u6700\u65B0\u5E93\u6587\u6863", command: "npx", args: ["-y", "@upstash/context7-mcp@latest"] },
  { id: "Playwright", name: "Playwright", desc: "\u6D4F\u89C8\u5668\u81EA\u52A8\u5316/\u6D4B\u8BD5", command: "npx", args: ["-y", "@playwright/mcp@latest"] },
  { id: "mcp-deepwiki", name: "DeepWiki", desc: "\u77E5\u8BC6\u5E93\u67E5\u8BE2", command: "npx", args: ["-y", "mcp-deepwiki@latest"] },
  { id: "exa", name: "Exa", desc: "\u641C\u7D22\u5F15\u64CE\uFF08\u9700 API Key\uFF09", command: "npx", args: ["-y", "exa-mcp-server@latest"], requiresApiKey: true, apiKeyEnv: "EXA_API_KEY" }
];
async function handleAuxiliary() {
  console.log();
  const { selected } = await inquirer.prompt([{
    type: "checkbox",
    name: "selected",
    message: "\u9009\u62E9\u8981\u5B89\u88C5\u7684\u8F85\u52A9\u5DE5\u5177\uFF08\u7A7A\u683C\u9009\u62E9\uFF0C\u56DE\u8F66\u786E\u8BA4\uFF09",
    choices: AUXILIARY_MCPS.map((m) => ({
      name: `${m.name} ${ansis.gray(`- ${m.desc}`)}`,
      value: m.id
    }))
  }]);
  if (!selected || selected.length === 0) {
    console.log(ansis.gray("\u672A\u9009\u62E9\u4EFB\u4F55\u5DE5\u5177"));
    return;
  }
  console.log();
  for (const id of selected) {
    const mcp = AUXILIARY_MCPS.find((m) => m.id === id);
    let env = {};
    if (mcp.requiresApiKey) {
      console.log(ansis.cyan(`\u{1F4D6} \u83B7\u53D6 ${mcp.name} API Key\uFF1A`));
      console.log(`   \u8BBF\u95EE ${ansis.underline("https://exa.ai/")} \u6CE8\u518C\u83B7\u53D6\uFF08\u6709\u514D\u8D39\u989D\u5EA6\uFF09`);
      console.log();
      const { apiKey } = await inquirer.prompt([{
        type: "password",
        name: "apiKey",
        message: `${mcp.name} API Key`,
        mask: "*",
        validate: (v) => v.trim() !== "" || "\u8BF7\u8F93\u5165 API Key"
      }]);
      env[mcp.apiKeyEnv] = apiKey.trim();
    }
    console.log(ansis.yellow(`\u23F3 \u6B63\u5728\u5B89\u88C5 ${mcp.name}...`));
    const result = await installMcpServer(mcp.id, mcp.command, mcp.args, env);
    if (result.success) {
      console.log(ansis.green(`\u2713 ${mcp.name} \u5B89\u88C5\u6210\u529F`));
    } else {
      console.log(ansis.red(`\u2717 ${mcp.name} \u5B89\u88C5\u5931\u8D25: ${result.message}`));
    }
  }
  console.log();
  console.log(ansis.gray("\u91CD\u542F Claude Code CLI \u4F7F\u914D\u7F6E\u751F\u6548"));
}
async function handleUninstall() {
  console.log();
  const allMcps = [
    { name: "ace-tool", value: "ace-tool" },
    { name: "ContextWeaver", value: "contextweaver" },
    ...AUXILIARY_MCPS.map((m) => ({ name: m.name, value: m.id }))
  ];
  const { targets } = await inquirer.prompt([{
    type: "checkbox",
    name: "targets",
    message: "\u9009\u62E9\u8981\u5378\u8F7D\u7684 MCP\uFF08\u7A7A\u683C\u9009\u62E9\uFF0C\u56DE\u8F66\u786E\u8BA4\uFF09",
    choices: allMcps
  }]);
  if (!targets || targets.length === 0) {
    console.log(ansis.gray("\u672A\u9009\u62E9\u4EFB\u4F55\u5DE5\u5177"));
    return;
  }
  console.log();
  for (const target of targets) {
    console.log(ansis.yellow(`\u23F3 \u6B63\u5728\u5378\u8F7D ${target}...`));
    let result;
    if (target === "ace-tool") {
      result = await uninstallAceTool();
    } else if (target === "contextweaver") {
      result = await uninstallContextWeaver();
    } else {
      result = await uninstallMcpServer(target);
    }
    if (result.success) {
      console.log(ansis.green(`\u2713 ${target} \u5DF2\u5378\u8F7D`));
    } else {
      console.log(ansis.red(`\u2717 ${target} \u5378\u8F7D\u5931\u8D25: ${result.message}`));
    }
  }
  console.log();
}

const i18n = i18next;
const zhCN = {
  common: {
    yes: "\u662F",
    no: "\u5426",
    confirm: "\u786E\u8BA4",
    cancel: "\u53D6\u6D88",
    back: "\u8FD4\u56DE",
    exit: "\u9000\u51FA",
    success: "\u6210\u529F",
    error: "\u9519\u8BEF",
    warning: "\u8B66\u544A",
    info: "\u4FE1\u606F",
    loading: "\u52A0\u8F7D\u4E2D...",
    processing: "\u5904\u7406\u4E2D...",
    completed: "\u5DF2\u5B8C\u6210",
    failed: "\u5931\u8D25"
  },
  cli: {
    help: {
      commands: "\u547D\u4EE4",
      commandDescriptions: {
        showMenu: "\u663E\u793A\u4EA4\u4E92\u5F0F\u83DC\u5355\uFF08\u9ED8\u8BA4\uFF09",
        initConfig: "\u521D\u59CB\u5316 CCG \u591A\u6A21\u578B\u534F\u4F5C\u7CFB\u7EDF"
      },
      shortcuts: "\u5FEB\u6377\u65B9\u5F0F:",
      shortcutDescriptions: {
        quickInit: "\u5FEB\u901F\u521D\u59CB\u5316"
      },
      options: "\u9009\u9879",
      optionDescriptions: {
        displayLanguage: "\u663E\u793A\u8BED\u8A00",
        forceOverwrite: "\u5F3A\u5236\u8986\u76D6\u73B0\u6709\u914D\u7F6E",
        displayHelp: "\u663E\u793A\u5E2E\u52A9\u4FE1\u606F",
        displayVersion: "\u663E\u793A\u7248\u672C\u53F7",
        skipAllPrompts: "\u8DF3\u8FC7\u6240\u6709\u4EA4\u4E92\u5F0F\u63D0\u793A\uFF08\u975E\u4EA4\u4E92\u6A21\u5F0F\uFF09",
        frontendModels: "\u524D\u7AEF\u6A21\u578B\uFF08\u9017\u53F7\u5206\u9694\uFF09",
        backendModels: "\u540E\u7AEF\u6A21\u578B\uFF08\u9017\u53F7\u5206\u9694\uFF09",
        collaborationMode: "\u534F\u4F5C\u6A21\u5F0F (parallel/smart/sequential)",
        workflows: "\u8981\u5B89\u88C5\u7684\u5DE5\u4F5C\u6D41",
        installDir: "\u5B89\u88C5\u76EE\u5F55"
      },
      nonInteractiveMode: "\u975E\u4EA4\u4E92\u6A21\u5F0F:",
      examples: "\u793A\u4F8B",
      exampleDescriptions: {
        showInteractiveMenu: "\u663E\u793A\u4EA4\u4E92\u5F0F\u83DC\u5355",
        runFullInitialization: "\u8FD0\u884C\u5B8C\u6574\u521D\u59CB\u5316",
        customModels: "\u81EA\u5B9A\u4E49\u6A21\u578B\u914D\u7F6E",
        parallelMode: "\u4F7F\u7528\u5E76\u884C\u534F\u4F5C\u6A21\u5F0F"
      }
    }
  },
  init: {
    welcome: "\u6B22\u8FCE\u4F7F\u7528 CCG \u591A\u6A21\u578B\u534F\u4F5C\u7CFB\u7EDF",
    selectLanguage: "\u8BF7\u9009\u62E9\u8BED\u8A00",
    selectFrontendModels: "\u9009\u62E9\u524D\u7AEF\u4EFB\u52A1\u4F7F\u7528\u7684\u6A21\u578B\uFF08\u53EF\u591A\u9009\uFF09",
    selectBackendModels: "\u9009\u62E9\u540E\u7AEF\u4EFB\u52A1\u4F7F\u7528\u7684\u6A21\u578B\uFF08\u53EF\u591A\u9009\uFF09",
    selectMode: "\u9009\u62E9\u534F\u4F5C\u6A21\u5F0F",
    selectWorkflows: "\u9009\u62E9\u8981\u5B89\u88C5\u7684\u5DE5\u4F5C\u6D41\uFF08\u53EF\u591A\u9009\uFF09",
    confirmInstall: "\u786E\u8BA4\u5B89\u88C5\u4EE5\u4E0A\u914D\u7F6E\uFF1F",
    installing: "\u6B63\u5728\u5B89\u88C5...",
    installSuccess: "\u5B89\u88C5\u6210\u529F\uFF01",
    installFailed: "\u5B89\u88C5\u5931\u8D25",
    installCancelled: "\u5B89\u88C5\u5DF2\u53D6\u6D88",
    installedCommands: "\u5DF2\u5B89\u88C5\u547D\u4EE4:",
    installedPrompts: "\u5DF2\u5B89\u88C5\u89D2\u8272\u63D0\u793A\u8BCD:",
    installedBinary: "\u5DF2\u5B89\u88C5\u4E8C\u8FDB\u5236\u6587\u4EF6:",
    installationErrors: "\u5B89\u88C5\u8FC7\u7A0B\u4E2D\u51FA\u73B0\u9519\u8BEF:",
    pathWarning: "\u9700\u8981\u5C06 codeagent-wrapper \u6DFB\u52A0\u5230 PATH \u624D\u80FD\u4F7F\u7528",
    autoConfigurePathPrompt: "\u662F\u5426\u81EA\u52A8\u914D\u7F6E PATH \u73AF\u5883\u53D8\u91CF\uFF1F",
    pathConfigured: "PATH \u5DF2\u6DFB\u52A0\u5230 {{file}}",
    pathAlreadyConfigured: "PATH \u5DF2\u914D\u7F6E\u5728 {{file}} \u4E2D",
    pathConfigFailed: "\u81EA\u52A8\u914D\u7F6E\u5931\u8D25",
    restartShellPrompt: "\u8BF7\u8FD0\u884C\u4EE5\u4E0B\u547D\u4EE4\u4F7F\u914D\u7F6E\u751F\u6548:",
    manualConfigInstructions: "\u8BF7\u624B\u52A8\u6DFB\u52A0\u4EE5\u4E0B\u547D\u4EE4\u5230 {{file}}:",
    windowsPathInstructions: "Windows \u7528\u6237 - \u624B\u52A8\u6DFB\u52A0\u5230\u7CFB\u7EDF\u73AF\u5883\u53D8\u91CF:",
    windowsStep1: '\u6309 Win+X\uFF0C\u9009\u62E9"\u7CFB\u7EDF"',
    windowsStep2: '\u70B9\u51FB"\u9AD8\u7EA7\u7CFB\u7EDF\u8BBE\u7F6E" \u2192 "\u73AF\u5883\u53D8\u91CF"',
    windowsStep3: '\u5728"\u7528\u6237\u53D8\u91CF"\u4E2D\u627E\u5230 Path\uFF0C\u70B9\u51FB"\u7F16\u8F91"\uFF0C\u6DFB\u52A0:',
    windowsStep4: '\u70B9\u51FB"\u786E\u5B9A"\u4FDD\u5B58\uFF0C\u91CD\u542F\u7EC8\u7AEF',
    orUsePowerShell: "\u6216\u5728 PowerShell (\u7BA1\u7406\u5458) \u4E2D\u8FD0\u884C:",
    addToShellConfig: "\u8BF7\u6DFB\u52A0\u4EE5\u4E0B\u547D\u4EE4\u5230 {{file}} \u5E76\u91CD\u542F\u7EC8\u7AEF",
    configSavedTo: "\u914D\u7F6E\u5DF2\u4FDD\u5B58\u81F3:",
    validation: {
      selectAtLeastOne: "\u8BF7\u81F3\u5C11\u9009\u62E9\u4E00\u4E2A\u6A21\u578B"
    },
    summary: {
      title: "\u914D\u7F6E\u6458\u8981:",
      frontendModels: "\u524D\u7AEF\u6A21\u578B:",
      backendModels: "\u540E\u7AEF\u6A21\u578B:",
      collaboration: "\u534F\u4F5C\u6A21\u5F0F:",
      workflows: "\u5DE5\u4F5C\u6D41:",
      selected: "\u4E2A\u5DF2\u9009\u62E9"
    },
    modes: {
      parallel: "\u5E76\u884C\u6A21\u5F0F - \u540C\u65F6\u8C03\u7528\u591A\u4E2A\u6A21\u578B",
      smart: "\u667A\u80FD\u6A21\u5F0F - \u6839\u636E\u4EFB\u52A1\u7C7B\u578B\u81EA\u52A8\u9009\u62E9",
      sequential: "\u987A\u5E8F\u6A21\u5F0F - \u4F9D\u6B21\u8C03\u7528\u6A21\u578B"
    },
    models: {
      codex: "Codex - \u64C5\u957F\u540E\u7AEF\u903B\u8F91\u3001\u7B97\u6CD5\u3001\u8C03\u8BD5",
      gemini: "Gemini - \u64C5\u957F\u524D\u7AEFUI\u3001CSS\u3001\u7EC4\u4EF6\u8BBE\u8BA1",
      claude: "Claude - \u64C5\u957F\u7F16\u6392\u3001\u91CD\u6784\u3001\u6587\u6863\u751F\u6210"
    },
    workflows: {
      dev: "\u5B8C\u6574\u5F00\u53D1\u5DE5\u4F5C\u6D41 (/ccg:dev)",
      frontend: "\u524D\u7AEF\u4EFB\u52A1 (/ccg:frontend)",
      backend: "\u540E\u7AEF\u4EFB\u52A1 (/ccg:backend)",
      review: "\u4EE3\u7801\u5BA1\u67E5 (/ccg:review)",
      analyze: "\u6280\u672F\u5206\u6790 (/ccg:analyze)",
      commit: "Git \u667A\u80FD\u63D0\u4EA4 (/ccg:commit)",
      rollback: "Git \u56DE\u6EDA (/ccg:rollback)",
      cleanBranches: "\u6E05\u7406\u5206\u652F (/ccg:clean-branches)",
      worktree: "Worktree \u7BA1\u7406 (/ccg:worktree)",
      init: "\u9879\u76EE\u521D\u59CB\u5316 (/ccg:init)"
    },
    aceTool: {
      title: "ace-tool MCP \u914D\u7F6E",
      description: "\u8F7B\u91CF\u7EA7\u4EE3\u7801\u68C0\u7D22\u548C Prompt \u589E\u5F3A\u5DE5\u5177",
      getToken: "\u83B7\u53D6 Token",
      configure: "\u662F\u5426\u914D\u7F6E ace-tool MCP\uFF1F",
      baseUrl: "API Base URL:",
      token: "API Token:",
      installing: "\u6B63\u5728\u914D\u7F6E ace-tool MCP...",
      failed: "ace-tool \u914D\u7F6E\u5931\u8D25\uFF08\u53EF\u7A0D\u540E\u624B\u52A8\u914D\u7F6E\uFF09"
    },
    aceToolRs: {
      title: "ace-tool-rs MCP \u914D\u7F6E",
      description: "Rust \u5B9E\u73B0\u7684 ace-tool\uFF0C\u66F4\u8F7B\u91CF\u3001\u66F4\u5FEB\u901F",
      getToken: "\u83B7\u53D6 Token",
      configure: "\u662F\u5426\u914D\u7F6E ace-tool-rs MCP\uFF1F",
      baseUrl: "API Base URL:",
      token: "API Token:",
      installing: "\u6B63\u5728\u914D\u7F6E ace-tool-rs MCP...",
      failed: "ace-tool-rs \u914D\u7F6E\u5931\u8D25\uFF08\u53EF\u7A0D\u540E\u624B\u52A8\u914D\u7F6E\uFF09"
    }
  },
  menu: {
    title: "CCG \u4E3B\u83DC\u5355",
    options: {
      init: "\u521D\u59CB\u5316 CCG \u914D\u7F6E",
      update: "\u66F4\u65B0\u5DE5\u4F5C\u6D41",
      uninstall: "\u5378\u8F7D CCG",
      help: "\u5E2E\u52A9",
      exit: "\u9000\u51FA"
    },
    help: {
      title: "CCG \u547D\u4EE4:",
      hint: "\u66F4\u591A\u4FE1\u606F\u8BF7\u8FD0\u884C: npx ccg --help",
      descriptions: {
        dev: "\u5B8C\u6574\u516D\u9636\u6BB5\u5F00\u53D1\u5DE5\u4F5C\u6D41",
        frontend: "\u524D\u7AEF\u4EFB\u52A1 \u2192 Gemini",
        backend: "\u540E\u7AEF\u4EFB\u52A1 \u2192 Codex",
        review: "\u53CC\u6A21\u578B\u4EE3\u7801\u5BA1\u67E5",
        analyze: "\u53CC\u6A21\u578B\u6280\u672F\u5206\u6790",
        commit: "Git \u667A\u80FD\u63D0\u4EA4",
        rollback: "Git \u4EA4\u4E92\u5F0F\u56DE\u6EDA"
      }
    },
    uninstall: {
      confirm: "\u786E\u5B9A\u8981\u5378\u8F7D CCG \u5417\uFF1F\u8FD9\u5C06\u5F3A\u5236\u79FB\u9664\u6240\u6709\u547D\u4EE4\u76EE\u5F55\u3001\u914D\u7F6E\u6587\u4EF6\u548C\u6570\u636E\u3002",
      alsoRemoveAceTool: "\u540C\u65F6\u79FB\u9664 ace-tool MCP \u914D\u7F6E\uFF1F",
      uninstalling: "\u6B63\u5728\u5378\u8F7D...",
      success: "\u5378\u8F7D\u6210\u529F\uFF01",
      removedCommands: "\u5DF2\u79FB\u9664\u547D\u4EE4:",
      removedAceTool: "ace-tool MCP \u914D\u7F6E\u5DF2\u79FB\u9664",
      cancelled: "\u5378\u8F7D\u5DF2\u53D6\u6D88",
      failed: "\u5378\u8F7D\u5931\u8D25"
    }
  }
};
const en = {
  common: {
    yes: "Yes",
    no: "No",
    confirm: "Confirm",
    cancel: "Cancel",
    back: "Back",
    exit: "Exit",
    success: "Success",
    error: "Error",
    warning: "Warning",
    info: "Info",
    loading: "Loading...",
    processing: "Processing...",
    completed: "Completed",
    failed: "Failed"
  },
  cli: {
    help: {
      commands: "Commands",
      commandDescriptions: {
        showMenu: "Show interactive menu (default)",
        initConfig: "Initialize CCG multi-model collaboration system"
      },
      shortcuts: "Shortcuts:",
      shortcutDescriptions: {
        quickInit: "Quick init"
      },
      options: "Options",
      optionDescriptions: {
        displayLanguage: "Display language",
        forceOverwrite: "Force overwrite existing configuration",
        displayHelp: "Display help",
        displayVersion: "Display version",
        skipAllPrompts: "Skip all interactive prompts (non-interactive mode)",
        frontendModels: "Frontend models (comma-separated)",
        backendModels: "Backend models (comma-separated)",
        collaborationMode: "Collaboration mode (parallel/smart/sequential)",
        workflows: "Workflows to install",
        installDir: "Installation directory"
      },
      nonInteractiveMode: "Non-interactive mode:",
      examples: "Examples",
      exampleDescriptions: {
        showInteractiveMenu: "Show interactive menu",
        runFullInitialization: "Run full initialization",
        customModels: "Custom model configuration",
        parallelMode: "Use parallel collaboration mode"
      }
    }
  },
  init: {
    welcome: "Welcome to CCG Multi-Model Collaboration System",
    selectLanguage: "Select language",
    selectFrontendModels: "Select models for frontend tasks (multi-select)",
    selectBackendModels: "Select models for backend tasks (multi-select)",
    selectMode: "Select collaboration mode",
    selectWorkflows: "Select workflows to install (multi-select)",
    confirmInstall: "Confirm installation with above configuration?",
    installing: "Installing...",
    installSuccess: "Installation successful!",
    installFailed: "Installation failed",
    installCancelled: "Installation cancelled",
    installedCommands: "Installed Commands:",
    installedPrompts: "Installed Role Prompts:",
    installedBinary: "Installed Binary:",
    installationErrors: "Installation Errors:",
    pathWarning: "codeagent-wrapper needs to be added to PATH",
    autoConfigurePathPrompt: "Automatically configure PATH environment variable?",
    pathConfigured: "PATH has been added to {{file}}",
    pathAlreadyConfigured: "PATH is already configured in {{file}}",
    pathConfigFailed: "Auto-configuration failed",
    restartShellPrompt: "Run the following command to apply changes:",
    manualConfigInstructions: "Please manually add the following to {{file}}:",
    windowsPathInstructions: "Windows Users - Manually add to System Environment Variables:",
    windowsStep1: 'Press Win+X, select "System"',
    windowsStep2: 'Click "Advanced system settings" \u2192 "Environment Variables"',
    windowsStep3: 'Find "Path" in User variables, click "Edit", add:',
    windowsStep4: 'Click "OK" to save, restart terminal',
    orUsePowerShell: "Or run in PowerShell (Admin):",
    addToShellConfig: "Add the following command to {{file}} and restart your terminal",
    configSavedTo: "Config saved to:",
    validation: {
      selectAtLeastOne: "Please select at least one model"
    },
    summary: {
      title: "Configuration Summary:",
      frontendModels: "Frontend Models:",
      backendModels: "Backend Models:",
      collaboration: "Collaboration:",
      workflows: "Workflows:",
      selected: "selected"
    },
    modes: {
      parallel: "Parallel - Call multiple models simultaneously",
      smart: "Smart - Auto-select based on task type",
      sequential: "Sequential - Call models one by one"
    },
    models: {
      codex: "Codex - Backend logic, algorithms, debugging",
      gemini: "Gemini - Frontend UI, CSS, component design",
      claude: "Claude - Orchestration, refactoring, documentation"
    },
    workflows: {
      dev: "Full development workflow (/ccg:dev)",
      frontend: "Frontend tasks (/ccg:frontend)",
      backend: "Backend tasks (/ccg:backend)",
      review: "Code review (/ccg:review)",
      analyze: "Technical analysis (/ccg:analyze)",
      commit: "Git smart commit (/ccg:commit)",
      rollback: "Git rollback (/ccg:rollback)",
      cleanBranches: "Clean branches (/ccg:clean-branches)",
      worktree: "Worktree management (/ccg:worktree)",
      init: "Project initialization (/ccg:init)"
    },
    aceTool: {
      title: "ace-tool MCP Configuration",
      description: "Lightweight codebase retrieval and prompt enhancement tool",
      getToken: "Get Token",
      configure: "Configure ace-tool MCP?",
      baseUrl: "API Base URL:",
      token: "API Token:",
      installing: "Configuring ace-tool MCP...",
      failed: "ace-tool configuration failed (can be configured manually later)"
    },
    aceToolRs: {
      title: "ace-tool-rs MCP Configuration",
      description: "Rust implementation of ace-tool, more lightweight and faster",
      getToken: "Get Token",
      configure: "Configure ace-tool-rs MCP?",
      baseUrl: "API Base URL:",
      token: "API Token:",
      installing: "Configuring ace-tool-rs MCP...",
      failed: "ace-tool-rs configuration failed (can be configured manually later)"
    }
  },
  menu: {
    title: "CCG Main Menu",
    options: {
      init: "Initialize CCG configuration",
      update: "Update workflows",
      uninstall: "Uninstall CCG",
      help: "Help",
      exit: "Exit"
    },
    help: {
      title: "CCG Commands:",
      hint: "For more information, run: npx ccg --help",
      descriptions: {
        dev: "Complete 6-phase development workflow",
        frontend: "Frontend tasks \u2192 Gemini",
        backend: "Backend tasks \u2192 Codex",
        review: "Dual-model code review",
        analyze: "Dual-model technical analysis",
        commit: "Git smart commit",
        rollback: "Git interactive rollback"
      }
    },
    uninstall: {
      confirm: "Are you sure you want to uninstall CCG? This will force remove all command directories, config files and data.",
      alsoRemoveAceTool: "Also remove ace-tool MCP configuration?",
      uninstalling: "Uninstalling...",
      success: "Uninstallation successful!",
      removedCommands: "Removed commands:",
      removedAceTool: "ace-tool MCP configuration removed",
      cancelled: "Uninstallation cancelled",
      failed: "Uninstallation failed"
    }
  }
};
async function initI18n(lang = "zh-CN") {
  if (!i18n.isInitialized) {
    await i18n.init({
      lng: lang,
      fallbackLng: "en",
      resources: {
        "zh-CN": { translation: zhCN, ...zhCN },
        en: { translation: en, ...en }
      },
      interpolation: {
        escapeValue: false
      }
    });
  } else if (i18n.language !== lang) {
    await i18n.changeLanguage(lang);
  }
}
async function changeLanguage(lang) {
  await i18n.changeLanguage(lang);
}

const CCG_DIR = join(homedir(), ".claude", ".ccg");
const CONFIG_FILE = join(CCG_DIR, "config.toml");
const DEFAULT_MCP_PROVIDER = "ace-tool";
const DEFAULT_MCP_SETUP_URL = "https://augmentcode.com/";
const DEFAULT_FRONTEND_MODEL_ID = "antigravity/gemini-3-pro-high";
const DEFAULT_COMMANDS_PATH = join(homedir(), ".claude", "commands", "ccg");
const DEFAULT_PROMPTS_PATH = join(CCG_DIR, "prompts");
const DEFAULT_BACKUP_PATH = join(CCG_DIR, "backup");
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isModelType(value) {
  return value === "codex" || value === "gemini" || value === "claude";
}
function isCliTool(value) {
  return value === "codex" || value === "gemini-cli" || value === "opencode";
}
function isRoutingStrategy(value) {
  return value === "parallel" || value === "fallback" || value === "round-robin";
}
function isCollaborationMode(value) {
  return value === "parallel" || value === "smart" || value === "sequential";
}
function isSupportedLang(value) {
  return value === "zh-CN" || value === "en";
}
function toModelTypeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(isModelType);
}
function mapLegacyModelToCliTool(model, area) {
  if (model === "codex") return "codex";
  if (model === "gemini") return "opencode";
  return area === "backend" ? "codex" : "opencode";
}
function migrateRoutingTarget(raw, area) {
  const target = isRecord(raw) ? raw : {};
  const defaultCliTool = area === "backend" ? "codex" : "opencode";
  const defaultModelId = area === "frontend" ? DEFAULT_FRONTEND_MODEL_ID : "";
  const legacyModels = toModelTypeArray(target.models);
  const legacyPrimary = isModelType(target.primary) ? target.primary : void 0;
  const cli_tool = isCliTool(target.cli_tool) ? target.cli_tool : legacyPrimary ? mapLegacyModelToCliTool(legacyPrimary, area) : legacyModels[0] ? mapLegacyModelToCliTool(legacyModels[0], area) : defaultCliTool;
  const model_id = typeof target.model_id === "string" ? target.model_id : defaultModelId;
  const strategy = isRoutingStrategy(target.strategy) ? target.strategy : "parallel";
  return { cli_tool, model_id, strategy };
}
function migrateRouting(raw) {
  const routing = isRecord(raw) ? raw : {};
  const frontend = migrateRoutingTarget(routing.frontend, "frontend");
  const backend = migrateRoutingTarget(routing.backend, "backend");
  return {
    frontend,
    backend,
    review: { strategy: "parallel" },
    mode: isCollaborationMode(routing.mode) ? routing.mode : "smart"
  };
}
function createDefaultCliTools() {
  return {
    codex: {
      enabled: true,
      config_path: "~/.codex/config.toml",
      instructions_path: "~/.codex/instructions.md",
      mcp_configured: false
    },
    "gemini-cli": {
      enabled: true,
      config_path: "~/.gemini/settings.json",
      instructions_path: "~/.gemini/GEMINI.md",
      mcp_configured: false
    },
    opencode: {
      enabled: true,
      config_path: "~/.opencode.json",
      instructions_path: "",
      mcp_configured: false
    }
  };
}
function createDefaultCliToolsMcp() {
  return {
    codex: { servers: [] },
    "gemini-cli": { servers: [] },
    opencode: { servers: [] }
  };
}
function mergeCliToolConfig(raw, defaults) {
  const src = isRecord(raw) ? raw : {};
  return {
    enabled: typeof src.enabled === "boolean" ? src.enabled : defaults.enabled,
    config_path: typeof src.config_path === "string" ? src.config_path : defaults.config_path,
    instructions_path: typeof src.instructions_path === "string" ? src.instructions_path : defaults.instructions_path,
    mcp_configured: typeof src.mcp_configured === "boolean" ? src.mcp_configured : defaults.mcp_configured
  };
}
function mergeCliTools(raw) {
  const defaults = createDefaultCliTools();
  const src = isRecord(raw) ? raw : {};
  return {
    codex: mergeCliToolConfig(src.codex, defaults.codex),
    "gemini-cli": mergeCliToolConfig(src["gemini-cli"], defaults["gemini-cli"]),
    opencode: mergeCliToolConfig(src.opencode, defaults.opencode)
  };
}
function mergeCliToolsMcp(raw) {
  const defaults = createDefaultCliToolsMcp();
  const src = isRecord(raw) ? raw : {};
  function mergeSingle(raw2, def) {
    const s = isRecord(raw2) ? raw2 : {};
    const servers = Array.isArray(s.servers) ? s.servers.filter((v) => typeof v === "string") : def.servers;
    return { servers };
  }
  return {
    codex: mergeSingle(src.codex, defaults.codex),
    "gemini-cli": mergeSingle(src["gemini-cli"], defaults["gemini-cli"]),
    opencode: mergeSingle(src.opencode, defaults.opencode)
  };
}
function getCcgDir() {
  return CCG_DIR;
}
function getConfigPath() {
  return CONFIG_FILE;
}
async function ensureCcgDir() {
  await fs.ensureDir(CCG_DIR);
}
function migrateConfig(raw) {
  const src = isRecord(raw) ? raw : {};
  const general = isRecord(src.general) ? src.general : {};
  const workflows = isRecord(src.workflows) ? src.workflows : {};
  const paths = isRecord(src.paths) ? src.paths : {};
  const mcp = isRecord(src.mcp) ? src.mcp : {};
  const performance = isRecord(src.performance) ? src.performance : {};
  return {
    general: {
      version: typeof general.version === "string" ? general.version : version,
      language: isSupportedLang(general.language) ? general.language : "zh-CN",
      createdAt: typeof general.createdAt === "string" ? general.createdAt : (/* @__PURE__ */ new Date()).toISOString()
    },
    routing: migrateRouting(src.routing),
    cli_tools: mergeCliTools(src.cli_tools),
    cli_tools_mcp: mergeCliToolsMcp(src.cli_tools_mcp),
    workflows: {
      installed: Array.isArray(workflows.installed) ? workflows.installed.filter((v) => typeof v === "string") : []
    },
    paths: {
      commands: typeof paths.commands === "string" ? paths.commands : DEFAULT_COMMANDS_PATH,
      prompts: typeof paths.prompts === "string" ? paths.prompts : DEFAULT_PROMPTS_PATH,
      backup: typeof paths.backup === "string" ? paths.backup : DEFAULT_BACKUP_PATH
    },
    mcp: {
      provider: typeof mcp.provider === "string" ? mcp.provider : DEFAULT_MCP_PROVIDER,
      setup_url: typeof mcp.setup_url === "string" ? mcp.setup_url : DEFAULT_MCP_SETUP_URL
    },
    performance: {
      liteMode: typeof performance.liteMode === "boolean" ? performance.liteMode : false
    }
  };
}
async function readCcgConfig() {
  try {
    if (await fs.pathExists(CONFIG_FILE)) {
      const content = await fs.readFile(CONFIG_FILE, "utf-8");
      const parsed = parse(content);
      return migrateConfig(parsed);
    }
  } catch {
  }
  return null;
}
async function writeCcgConfig(config) {
  await ensureCcgDir();
  const content = stringify(config);
  await fs.writeFile(CONFIG_FILE, content, "utf-8");
}
function createDefaultConfig(options) {
  return {
    general: {
      version: version,
      language: options.language,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    routing: migrateRouting(options.routing),
    cli_tools: createDefaultCliTools(),
    cli_tools_mcp: createDefaultCliToolsMcp(),
    workflows: {
      installed: options.installedWorkflows
    },
    paths: {
      commands: DEFAULT_COMMANDS_PATH,
      prompts: DEFAULT_PROMPTS_PATH,
      backup: DEFAULT_BACKUP_PATH
    },
    mcp: {
      provider: options.mcpProvider || DEFAULT_MCP_PROVIDER,
      setup_url: DEFAULT_MCP_SETUP_URL
    },
    performance: {
      liteMode: options.liteMode || false
    }
  };
}
function createDefaultRouting() {
  return {
    frontend: {
      cli_tool: "opencode",
      model_id: DEFAULT_FRONTEND_MODEL_ID,
      strategy: "parallel"
    },
    backend: {
      cli_tool: "codex",
      model_id: "",
      strategy: "parallel"
    },
    review: {
      strategy: "parallel"
    },
    mode: "smart"
  };
}

async function migrateToV1_4_0() {
  const result = {
    success: true,
    migratedFiles: [],
    errors: [],
    skipped: []
  };
  const oldCcgDir = join(homedir(), ".ccg");
  const newCcgDir = join(homedir(), ".claude", ".ccg");
  const oldPromptsDir = join(homedir(), ".claude", "prompts", "ccg");
  const newPromptsDir = join(newCcgDir, "prompts");
  try {
    await fs.ensureDir(newCcgDir);
    if (await fs.pathExists(oldCcgDir)) {
      const files = await fs.readdir(oldCcgDir);
      for (const file of files) {
        const srcFile = join(oldCcgDir, file);
        const destFile = join(newCcgDir, file);
        try {
          if (await fs.pathExists(destFile)) {
            result.skipped.push(`~/.ccg/${file} (already exists in new location)`);
            continue;
          }
          await fs.copy(srcFile, destFile);
          result.migratedFiles.push(`~/.ccg/${file} \u2192 ~/.claude/.ccg/${file}`);
        } catch (error) {
          result.errors.push(`Failed to migrate ${file}: ${error}`);
          result.success = false;
        }
      }
      try {
        const remaining = await fs.readdir(oldCcgDir);
        if (remaining.length === 0) {
          await fs.remove(oldCcgDir);
          result.migratedFiles.push("Removed old ~/.ccg/ directory");
        } else {
          result.skipped.push(`~/.ccg/ (not empty, keeping for safety)`);
        }
      } catch (error) {
        result.skipped.push(`~/.ccg/ (could not remove: ${error})`);
      }
    } else {
      result.skipped.push("~/.ccg/ (does not exist, nothing to migrate)");
    }
    if (await fs.pathExists(oldPromptsDir)) {
      try {
        if (await fs.pathExists(newPromptsDir)) {
          result.skipped.push("~/.claude/prompts/ccg/ (already exists in new location)");
        } else {
          await fs.copy(oldPromptsDir, newPromptsDir);
          result.migratedFiles.push("~/.claude/prompts/ccg/ \u2192 ~/.claude/.ccg/prompts/");
          await fs.remove(oldPromptsDir);
          result.migratedFiles.push("Removed old ~/.claude/prompts/ccg/ directory");
          const promptsParentDir = join(homedir(), ".claude", "prompts");
          const remaining = await fs.readdir(promptsParentDir);
          if (remaining.length === 0) {
            await fs.remove(promptsParentDir);
            result.migratedFiles.push("Removed empty ~/.claude/prompts/ directory");
          }
        }
      } catch (error) {
        result.errors.push(`Failed to migrate prompts: ${error}`);
        result.success = false;
      }
    } else {
      result.skipped.push("~/.claude/prompts/ccg/ (does not exist, nothing to migrate)");
    }
  } catch (error) {
    result.errors.push(`Migration failed: ${error}`);
    result.success = false;
  }
  return result;
}
async function needsMigration() {
  const oldCcgDir = join(homedir(), ".ccg");
  const oldPromptsDir = join(homedir(), ".claude", "prompts", "ccg");
  const oldConfigFile = join(homedir(), ".claude", "commands", "ccg", "_config.md");
  const hasOldCcgDir = await fs.pathExists(oldCcgDir);
  const hasOldPromptsDir = await fs.pathExists(oldPromptsDir);
  const hasOldConfigFile = await fs.pathExists(oldConfigFile);
  return hasOldCcgDir || hasOldPromptsDir || hasOldConfigFile;
}

async function init(options = {}) {
  console.log();
  console.log(ansis.cyan.bold(`  CCG - Claude + Codex + Gemini`));
  console.log(ansis.gray(`  \u591A\u6A21\u578B\u534F\u4F5C\u5F00\u53D1\u5DE5\u4F5C\u6D41`));
  console.log();
  const language = "zh-CN";
  const mode = "smart";
  const selectedWorkflows = getAllCommandIds();
  let liteMode = false;
  let mcpProvider = "ace-tool";
  let aceToolBaseUrl = "";
  let aceToolToken = "";
  let contextWeaverApiKey = "";
  if (options.skipMcp) {
    mcpProvider = "skip";
  } else if (!options.skipPrompt) {
    console.log();
    console.log(ansis.cyan.bold(`  \u{1F527} MCP \u4EE3\u7801\u68C0\u7D22\u5DE5\u5177\u914D\u7F6E`));
    console.log();
    const { selectedMcp } = await inquirer.prompt([{
      type: "list",
      name: "selectedMcp",
      message: "\u9009\u62E9\u4EE3\u7801\u68C0\u7D22 MCP \u5DE5\u5177",
      choices: [
        {
          name: `contextweaver ${ansis.green("(\u63A8\u8350)")} ${ansis.gray("- \u672C\u5730\u5411\u91CF\u5E93\uFF0C\u6DF7\u5408\u641C\u7D22 + Rerank")}`,
          value: "contextweaver"
        },
        {
          name: `ace-tool ${ansis.red("(\u6536\u8D39)")} ${ansis.gray("(Node.js) - Augment \u5B98\u65B9")}`,
          value: "ace-tool"
        },
        {
          name: `ace-tool-rs ${ansis.red("(\u6536\u8D39)")} ${ansis.gray("(Rust) - \u66F4\u8F7B\u91CF")}`,
          value: "ace-tool-rs"
        },
        {
          name: `\u8DF3\u8FC7 ${ansis.gray("- \u7A0D\u540E\u624B\u52A8\u914D\u7F6E")}`,
          value: "skip"
        }
      ],
      default: "contextweaver"
    }]);
    mcpProvider = selectedMcp;
    if (selectedMcp === "ace-tool" || selectedMcp === "ace-tool-rs") {
      const toolName = selectedMcp === "ace-tool-rs" ? "ace-tool-rs" : "ace-tool";
      const toolDesc = selectedMcp === "ace-tool-rs" ? i18n.t("init:aceToolRs.description") : i18n.t("init:aceTool.description");
      console.log();
      console.log(ansis.cyan.bold(`  \u{1F527} ${toolName} MCP \u914D\u7F6E`));
      console.log(ansis.gray(`     ${toolDesc}`));
      console.log();
      const { skipToken } = await inquirer.prompt([{
        type: "confirm",
        name: "skipToken",
        message: "\u662F\u5426\u8DF3\u8FC7 Token \u914D\u7F6E\uFF1F\uFF08\u53EF\u7A0D\u540E\u8FD0\u884C npx ccg config mcp \u914D\u7F6E\uFF09",
        default: false
      }]);
      if (!skipToken) {
        console.log();
        console.log(ansis.cyan(`     \u{1F4D6} \u83B7\u53D6 ace-tool \u8BBF\u95EE\u65B9\u5F0F\uFF1A`));
        console.log();
        console.log(`     ${ansis.gray("\u2022")} ${ansis.cyan("\u5B98\u65B9\u670D\u52A1")}: ${ansis.underline("https://augmentcode.com/")}`);
        console.log(`       ${ansis.gray("\u6CE8\u518C\u8D26\u53F7\u540E\u83B7\u53D6 Token")}`);
        console.log();
        console.log(`     ${ansis.gray("\u2022")} ${ansis.cyan("\u4E2D\u8F6C\u670D\u52A1")} ${ansis.yellow("(\u65E0\u9700\u6CE8\u518C)")}: ${ansis.underline("https://linux.do/t/topic/1291730")}`);
        console.log(`       ${ansis.gray("linux.do \u793E\u533A\u63D0\u4F9B\u7684\u514D\u8D39\u4E2D\u8F6C\u670D\u52A1")}`);
        console.log();
        const aceAnswers = await inquirer.prompt([
          {
            type: "input",
            name: "baseUrl",
            message: `Base URL ${ansis.gray("(\u4F7F\u7528\u4E2D\u8F6C\u670D\u52A1\u65F6\u5FC5\u586B\uFF0C\u5B98\u65B9\u670D\u52A1\u7559\u7A7A)")}`,
            default: ""
          },
          {
            type: "password",
            name: "token",
            message: `Token ${ansis.gray("(\u5FC5\u586B)")}`,
            mask: "*",
            validate: (input) => input.trim() !== "" || "\u8BF7\u8F93\u5165 Token"
          }
        ]);
        aceToolBaseUrl = aceAnswers.baseUrl || "";
        aceToolToken = aceAnswers.token || "";
      } else {
        console.log();
        console.log(ansis.yellow(`  \u2139\uFE0F  \u5DF2\u8DF3\u8FC7 Token \u914D\u7F6E`));
        console.log(ansis.gray(`     \u2022 ace-tool MCP \u5C06\u4E0D\u4F1A\u81EA\u52A8\u5B89\u88C5`));
        console.log(ansis.gray(`     \u2022 \u53EF\u7A0D\u540E\u8FD0\u884C ${ansis.cyan("npx ccg config mcp")} \u914D\u7F6E Token`));
        console.log(ansis.gray(`     \u2022 \u83B7\u53D6 Token: ${ansis.cyan("https://augmentcode.com/")}`));
        console.log();
      }
    } else if (selectedMcp === "contextweaver") {
      console.log();
      console.log(ansis.cyan.bold(`  \u{1F527} ContextWeaver MCP \u914D\u7F6E`));
      console.log(ansis.gray(`     \u672C\u5730\u8BED\u4E49\u4EE3\u7801\u68C0\u7D22\u5F15\u64CE\uFF0C\u6DF7\u5408\u641C\u7D22 + Rerank`));
      console.log();
      const { skipKey } = await inquirer.prompt([{
        type: "confirm",
        name: "skipKey",
        message: "\u662F\u5426\u8DF3\u8FC7 API Key \u914D\u7F6E\uFF1F\uFF08\u53EF\u7A0D\u540E\u8FD0\u884C npx ccg config mcp \u914D\u7F6E\uFF09",
        default: false
      }]);
      if (!skipKey) {
        console.log();
        console.log(ansis.cyan(`     \u{1F4D6} \u83B7\u53D6\u7845\u57FA\u6D41\u52A8 API Key\uFF1A`));
        console.log();
        console.log(`     ${ansis.gray("1.")} \u8BBF\u95EE ${ansis.underline("https://siliconflow.cn/")} \u6CE8\u518C\u8D26\u53F7`);
        console.log(`     ${ansis.gray("2.")} \u8FDB\u5165\u63A7\u5236\u53F0 \u2192 API \u5BC6\u94A5 \u2192 \u521B\u5EFA\u5BC6\u94A5`);
        console.log(`     ${ansis.gray("3.")} \u65B0\u7528\u6237\u6709\u514D\u8D39\u989D\u5EA6\uFF0CEmbedding + Rerank \u5B8C\u5168\u591F\u7528`);
        console.log();
        const cwAnswers = await inquirer.prompt([{
          type: "password",
          name: "apiKey",
          message: `\u7845\u57FA\u6D41\u52A8 API Key ${ansis.gray("(sk-xxx)")}`,
          mask: "*",
          validate: (input) => input.trim() !== "" || "\u8BF7\u8F93\u5165 API Key"
        }]);
        contextWeaverApiKey = cwAnswers.apiKey || "";
      } else {
        console.log();
        console.log(ansis.yellow(`  \u2139\uFE0F  \u5DF2\u8DF3\u8FC7 API Key \u914D\u7F6E`));
        console.log(ansis.gray(`     \u2022 ContextWeaver MCP \u5C06\u4E0D\u4F1A\u81EA\u52A8\u5B89\u88C5`));
        console.log(ansis.gray(`     \u2022 \u53EF\u7A0D\u540E\u8FD0\u884C ${ansis.cyan("npx ccg config mcp")} \u914D\u7F6E`));
        console.log(ansis.gray(`     \u2022 \u83B7\u53D6 Key: ${ansis.cyan("https://siliconflow.cn/")}`));
        console.log();
      }
    } else {
      console.log();
      console.log(ansis.yellow(`  \u2139\uFE0F  \u5DF2\u8DF3\u8FC7 MCP \u914D\u7F6E`));
      console.log(ansis.gray(`     \u2022 \u53EF\u7A0D\u540E\u624B\u52A8\u914D\u7F6E\u4EFB\u4F55 MCP \u670D\u52A1`));
      console.log();
    }
  }
  let apiUrl = "";
  let apiKey = "";
  if (!options.skipPrompt) {
    console.log();
    console.log(ansis.cyan.bold(`  \u{1F511} Claude Code API \u914D\u7F6E`));
    console.log();
    const { configureApi } = await inquirer.prompt([{
      type: "confirm",
      name: "configureApi",
      message: "\u662F\u5426\u914D\u7F6E\u81EA\u5B9A\u4E49 API\uFF1F\uFF08\u4F7F\u7528\u5B98\u65B9\u8D26\u53F7\u53EF\u8DF3\u8FC7\uFF09",
      default: false
    }]);
    if (configureApi) {
      const apiAnswers = await inquirer.prompt([
        {
          type: "input",
          name: "url",
          message: `API URL ${ansis.gray("(\u5FC5\u586B)")}`,
          validate: (v) => v.trim() !== "" || "\u8BF7\u8F93\u5165 API URL"
        },
        {
          type: "password",
          name: "key",
          message: `API Key ${ansis.gray("(\u5FC5\u586B)")}`,
          mask: "*",
          validate: (v) => v.trim() !== "" || "\u8BF7\u8F93\u5165 API Key"
        }
      ]);
      apiUrl = apiAnswers.url?.trim() || "";
      apiKey = apiAnswers.key?.trim() || "";
    }
  }
  if (!options.skipPrompt) {
    const existingConfig = await readCcgConfig();
    const currentLiteMode = existingConfig?.performance?.liteMode || false;
    console.log();
    const { enableWebUI } = await inquirer.prompt([{
      type: "confirm",
      name: "enableWebUI",
      message: `\u542F\u7528 Web UI \u5B9E\u65F6\u8F93\u51FA\uFF1F${ansis.gray("(\u7981\u7528\u53EF\u52A0\u901F\u54CD\u5E94)")}`,
      default: !currentLiteMode
      // Default to current setting (inverted)
    }]);
    liteMode = !enableWebUI;
  } else {
    const existingConfig = await readCcgConfig();
    if (existingConfig?.performance?.liteMode !== void 0) {
      liteMode = existingConfig.performance.liteMode;
    }
  }
  const routing = {
    frontend: {
      cli_tool: "opencode",
      model_id: "antigravity/gemini-3-pro-high",
      strategy: "parallel"
    },
    backend: {
      cli_tool: "codex",
      model_id: "",
      strategy: "parallel"
    },
    review: {
      strategy: "parallel"
    },
    mode
  };
  console.log();
  console.log(ansis.yellow("\u2501".repeat(50)));
  console.log(ansis.bold(`  ${i18n.t("init:summary.title")}`));
  console.log();
  console.log(`  ${ansis.cyan("\u6A21\u578B\u8DEF\u7531")}  ${ansis.green("Gemini")} (\u524D\u7AEF) + ${ansis.blue("Codex")} (\u540E\u7AEF)`);
  console.log(`  ${ansis.cyan("\u547D\u4EE4\u6570\u91CF")}  ${ansis.yellow(selectedWorkflows.length.toString())} \u4E2A`);
  console.log(`  ${ansis.cyan("MCP \u5DE5\u5177")}  ${mcpProvider === "ace-tool" || mcpProvider === "ace-tool-rs" ? aceToolToken ? ansis.green(mcpProvider) : ansis.yellow(`${mcpProvider} (\u5F85\u914D\u7F6E)`) : ansis.gray("\u8DF3\u8FC7")}`);
  console.log(`  ${ansis.cyan("Web UI")}    ${liteMode ? ansis.gray("\u7981\u7528") : ansis.green("\u542F\u7528")}`);
  console.log(ansis.yellow("\u2501".repeat(50)));
  console.log();
  if (!options.skipPrompt && !options.force) {
    const { confirmed } = await inquirer.prompt([{
      type: "confirm",
      name: "confirmed",
      message: i18n.t("init:confirmInstall"),
      default: true
    }]);
    if (!confirmed) {
      console.log(ansis.yellow(i18n.t("init:installCancelled")));
      return;
    }
  }
  const spinner = ora(i18n.t("init:installing")).start();
  try {
    if (await needsMigration()) {
      spinner.text = "Migrating from v1.3.x to v1.4.0...";
      const migrationResult = await migrateToV1_4_0();
      if (migrationResult.migratedFiles.length > 0) {
        spinner.info(ansis.cyan("Migration completed:"));
        console.log();
        for (const file of migrationResult.migratedFiles) {
          console.log(`  ${ansis.green("\u2713")} ${file}`);
        }
        if (migrationResult.skipped.length > 0) {
          console.log();
          console.log(ansis.gray("  Skipped:"));
          for (const file of migrationResult.skipped) {
            console.log(`  ${ansis.gray("\u25CB")} ${file}`);
          }
        }
        console.log();
        spinner.start(i18n.t("init:installing"));
      }
      if (migrationResult.errors.length > 0) {
        spinner.warn(ansis.yellow("Migration completed with errors:"));
        for (const error of migrationResult.errors) {
          console.log(`  ${ansis.red("\u2717")} ${error}`);
        }
        console.log();
        spinner.start(i18n.t("init:installing"));
      }
    }
    await ensureCcgDir();
    const config = createDefaultConfig({
      language,
      routing,
      installedWorkflows: selectedWorkflows,
      mcpProvider,
      liteMode
    });
    await writeCcgConfig(config);
    const installDir = options.installDir || join(homedir(), ".claude");
    const result = await installWorkflows(selectedWorkflows, installDir, options.force, {
      routing,
      liteMode,
      mcpProvider
    });
    if ((mcpProvider === "ace-tool" || mcpProvider === "ace-tool-rs") && aceToolToken) {
      const toolName = mcpProvider === "ace-tool-rs" ? "ace-tool-rs" : "ace-tool";
      const installFn = mcpProvider === "ace-tool-rs" ? installAceToolRs : installAceTool;
      spinner.text = mcpProvider === "ace-tool-rs" ? i18n.t("init:aceToolRs.installing") : i18n.t("init:aceTool.installing");
      const aceResult = await installFn({
        baseUrl: aceToolBaseUrl,
        token: aceToolToken
      });
      if (aceResult.success) {
        spinner.succeed(ansis.green(i18n.t("init:installSuccess")));
        console.log();
        console.log(`    ${ansis.green("\u2713")} ${toolName} MCP ${ansis.gray(`\u2192 ${aceResult.configPath}`)}`);
      } else {
        spinner.warn(ansis.yellow(mcpProvider === "ace-tool-rs" ? i18n.t("init:aceToolRs.failed") : i18n.t("init:aceTool.failed")));
        console.log(ansis.gray(`      ${aceResult.message}`));
      }
    } else if (mcpProvider === "contextweaver" && contextWeaverApiKey) {
      spinner.text = "\u6B63\u5728\u914D\u7F6E ContextWeaver MCP...";
      const cwResult = await installContextWeaver({
        siliconflowApiKey: contextWeaverApiKey
      });
      if (cwResult.success) {
        spinner.succeed(ansis.green(i18n.t("init:installSuccess")));
        console.log();
        console.log(`    ${ansis.green("\u2713")} ContextWeaver MCP ${ansis.gray(`\u2192 ${cwResult.configPath}`)}`);
        console.log(`    ${ansis.green("\u2713")} \u914D\u7F6E\u6587\u4EF6 ${ansis.gray("\u2192 ~/.contextweaver/.env")}`);
        console.log();
        console.log(ansis.cyan(`    \u{1F4D6} \u9996\u6B21\u4F7F\u7528\u9700\u8981\u7D22\u5F15\u4EE3\u7801\u5E93\uFF1A`));
        console.log(ansis.gray(`       cd your-project && cw index`));
      } else {
        spinner.warn(ansis.yellow("ContextWeaver MCP \u914D\u7F6E\u5931\u8D25"));
        console.log(ansis.gray(`      ${cwResult.message}`));
      }
    } else if (mcpProvider === "contextweaver" && !contextWeaverApiKey) {
      spinner.succeed(ansis.green(i18n.t("init:installSuccess")));
      console.log();
      console.log(`    ${ansis.yellow("\u26A0")} ContextWeaver MCP \u672A\u5B89\u88C5 ${ansis.gray("(API Key \u672A\u63D0\u4F9B)")}`);
      console.log(`    ${ansis.gray("\u2192")} \u7A0D\u540E\u8FD0\u884C ${ansis.cyan("npx ccg config mcp")} \u5B8C\u6210\u914D\u7F6E`);
    } else if ((mcpProvider === "ace-tool" || mcpProvider === "ace-tool-rs") && !aceToolToken) {
      const toolName = mcpProvider === "ace-tool-rs" ? "ace-tool-rs" : "ace-tool";
      spinner.succeed(ansis.green(i18n.t("init:installSuccess")));
      console.log();
      console.log(`    ${ansis.yellow("\u26A0")} ${toolName} MCP \u672A\u5B89\u88C5 ${ansis.gray("(Token \u672A\u63D0\u4F9B)")}`);
      console.log(`    ${ansis.gray("\u2192")} \u7A0D\u540E\u8FD0\u884C ${ansis.cyan("npx ccg config mcp")} \u5B8C\u6210\u914D\u7F6E`);
    } else {
      spinner.succeed(ansis.green(i18n.t("init:installSuccess")));
    }
    if (apiUrl && apiKey) {
      const settingsPath = join(installDir, "settings.json");
      let settings = {};
      if (await fs.pathExists(settingsPath)) {
        settings = await fs.readJSON(settingsPath);
      }
      if (!settings.env)
        settings.env = {};
      settings.env.ANTHROPIC_BASE_URL = apiUrl;
      settings.env.ANTHROPIC_API_KEY = apiKey;
      delete settings.env.ANTHROPIC_AUTH_TOKEN;
      settings.env.DISABLE_TELEMETRY = "1";
      settings.env.DISABLE_ERROR_REPORTING = "1";
      settings.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
      settings.env.CLAUDE_CODE_ATTRIBUTION_HEADER = "0";
      settings.env.MCP_TIMEOUT = "60000";
      if (!settings.permissions)
        settings.permissions = {};
      if (!settings.permissions.allow)
        settings.permissions.allow = [];
      const wrapperPerms = [
        "Bash(~/.claude/bin/codeagent-wrapper --backend gemini*)",
        "Bash(~/.claude/bin/codeagent-wrapper --backend codex*)"
      ];
      for (const perm of wrapperPerms) {
        if (!settings.permissions.allow.includes(perm))
          settings.permissions.allow.push(perm);
      }
      await fs.writeJSON(settingsPath, settings, { spaces: 2 });
      console.log();
      console.log(`    ${ansis.green("\u2713")} API \u914D\u7F6E ${ansis.gray(`\u2192 ${settingsPath}`)}`);
    }
    console.log();
    console.log(ansis.cyan(`  ${i18n.t("init:installedCommands")}`));
    result.installedCommands.forEach((cmd) => {
      console.log(`    ${ansis.green("\u2713")} /ccg:${cmd}`);
    });
    if (result.installedPrompts.length > 0) {
      console.log();
      console.log(ansis.cyan(`  ${i18n.t("init:installedPrompts")}`));
      const grouped = {};
      result.installedPrompts.forEach((p) => {
        const [model, role] = p.split("/");
        if (!grouped[model])
          grouped[model] = [];
        grouped[model].push(role);
      });
      Object.entries(grouped).forEach(([model, roles]) => {
        console.log(`    ${ansis.green("\u2713")} ${model}: ${roles.join(", ")}`);
      });
    }
    if (result.errors.length > 0) {
      console.log();
      console.log(ansis.red(`  \u26A0 ${i18n.t("init:installationErrors")}`));
      result.errors.forEach((error) => {
        console.log(`    ${ansis.red("\u2717")} ${error}`);
      });
    }
    if (result.binInstalled && result.binPath) {
      console.log();
      console.log(ansis.cyan(`  ${i18n.t("init:installedBinary")}`));
      console.log(`    ${ansis.green("\u2713")} codeagent-wrapper ${ansis.gray(`\u2192 ${result.binPath}`)}`);
      const platform = process.platform;
      if (platform === "win32") {
        const windowsPath = result.binPath.replace(/\//g, "\\").replace(/\\$/, "");
        try {
          const { execSync } = await import('node:child_process');
          const psFlags = "-NoProfile -NonInteractive -ExecutionPolicy Bypass";
          const currentPath = execSync(`powershell ${psFlags} -Command "[System.Environment]::GetEnvironmentVariable('PATH', 'User')"`, { encoding: "utf-8" }).trim();
          const currentPathNorm = currentPath.toLowerCase().replace(/\\$/g, "");
          const windowsPathNorm = windowsPath.toLowerCase();
          if (!currentPathNorm.includes(windowsPathNorm) && !currentPathNorm.includes(".claude\\bin")) {
            const escapedPath = windowsPath.replace(/'/g, "''");
            const psScript = currentPath ? `$p=[System.Environment]::GetEnvironmentVariable('PATH','User');[System.Environment]::SetEnvironmentVariable('PATH',($p+';'+'${escapedPath}'),'User')` : `[System.Environment]::SetEnvironmentVariable('PATH','${escapedPath}','User')`;
            execSync(`powershell ${psFlags} -Command "${psScript}"`, { stdio: "pipe" });
            console.log(`    ${ansis.green("\u2713")} PATH ${ansis.gray("\u2192 \u7528\u6237\u73AF\u5883\u53D8\u91CF")}`);
          }
        } catch {
        }
      } else if (!options.skipPrompt) {
        const exportCommand = `export PATH="${result.binPath}:$PATH"`;
        const shell = process.env.SHELL || "";
        const isZsh = shell.includes("zsh");
        const isBash = shell.includes("bash");
        const isMacDefaultZsh = process.platform === "darwin" && !shell;
        if (isZsh || isBash || isMacDefaultZsh) {
          const shellRc = isZsh || isMacDefaultZsh ? join(homedir(), ".zshrc") : join(homedir(), ".bashrc");
          const shellRcDisplay = isZsh || isMacDefaultZsh ? "~/.zshrc" : "~/.bashrc";
          try {
            let rcContent = "";
            if (await fs.pathExists(shellRc)) {
              rcContent = await fs.readFile(shellRc, "utf-8");
            }
            if (rcContent.includes(result.binPath) || rcContent.includes("/.claude/bin")) {
              console.log(`    ${ansis.green("\u2713")} PATH ${ansis.gray(`\u2192 ${shellRcDisplay} (\u5DF2\u914D\u7F6E)`)}`);
            } else {
              const configLine = `
# CCG multi-model collaboration system
${exportCommand}
`;
              await fs.appendFile(shellRc, configLine, "utf-8");
              console.log(`    ${ansis.green("\u2713")} PATH ${ansis.gray(`\u2192 ${shellRcDisplay}`)}`);
            }
          } catch {
          }
        } else {
          console.log(`    ${ansis.yellow("\u26A0")} PATH ${ansis.gray("\u2192 \u8BF7\u624B\u52A8\u6DFB\u52A0\u5230 shell \u914D\u7F6E:")}`);
          console.log(`      ${ansis.cyan(exportCommand)}`);
        }
      }
    }
    if (mcpProvider === "skip" || (mcpProvider === "ace-tool" || mcpProvider === "ace-tool-rs") && !aceToolToken || mcpProvider === "contextweaver" && !contextWeaverApiKey) {
      console.log();
      console.log(ansis.cyan.bold(`  \u{1F4D6} MCP \u670D\u52A1\u9009\u9879`));
      console.log();
      console.log(ansis.gray(`     \u5982\u9700\u4F7F\u7528\u4EE3\u7801\u68C0\u7D22\u529F\u80FD\uFF0C\u53EF\u9009\u62E9\u4EE5\u4E0B MCP \u670D\u52A1\uFF1A`));
      console.log();
      console.log(`     ${ansis.green("1.")} ${ansis.cyan("ace-tool / ace-tool-rs")}: ${ansis.underline("https://augmentcode.com/")}`);
      console.log(`        ${ansis.gray("Augment \u5B98\u65B9\uFF0C\u542B Prompt \u589E\u5F3A + \u4EE3\u7801\u68C0\u7D22")}`);
      console.log();
      console.log(`     ${ansis.green("2.")} ${ansis.cyan("ace-tool \u4E2D\u8F6C\u670D\u52A1")} ${ansis.yellow("(\u65E0\u9700\u6CE8\u518C)")}: ${ansis.underline("https://linux.do/t/topic/1291730")}`);
      console.log(`        ${ansis.gray("linux.do \u793E\u533A\u63D0\u4F9B\u7684\u514D\u8D39\u4E2D\u8F6C\u670D\u52A1")}`);
      console.log();
      console.log(`     ${ansis.green("3.")} ${ansis.cyan("ContextWeaver")} ${ansis.yellow("(\u672C\u5730)")}: ${ansis.underline("https://siliconflow.cn/")}`);
      console.log(`        ${ansis.gray("\u672C\u5730\u5411\u91CF\u5E93\uFF0C\u9700\u8981\u7845\u57FA\u6D41\u52A8 API Key\uFF08\u6709\u514D\u8D39\u989D\u5EA6\uFF09")}`);
      console.log();
    }
    console.log();
  } catch (error) {
    spinner.fail(ansis.red(i18n.t("init:installFailed")));
    console.error(error);
  }
}

const execAsync$2 = promisify(exec);
const __filename$1 = fileURLToPath(import.meta.url);
const __dirname$1 = dirname(__filename$1);
const GITHUB_OWNER = "okamitimo233";
const GITHUB_REPO = "ccg-workflow-modify";
const GITHUB_DEFAULT_BRANCH = "main";
function findPackageRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(join(dir, "package.json"))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return startDir;
}
const PACKAGE_ROOT = findPackageRoot(__dirname$1);
function detectInstallSource(packageRoot) {
  const root = PACKAGE_ROOT;
  try {
    const pkgPath = join(root, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = fs.readJSONSync(pkgPath);
      if (typeof pkg._resolved === "string") {
        if (pkg._resolved.includes("registry.npmjs.org") || pkg._resolved.includes("registry.npmmirror.com")) {
          return "npm";
        }
        if (pkg._resolved.includes("github.com") || pkg._resolved.includes("codeload.github.com")) {
          return "github";
        }
      }
      if (typeof pkg._from === "string") {
        if (pkg._from.includes("github:") || pkg._from.includes("github.com")) {
          return "github";
        }
      }
    }
    const normalizedRoot = root.replace(/\\/g, "/");
    if (normalizedRoot.includes("/_npx/") || normalizedRoot.includes("\\_npx\\")) {
      return "github";
    }
  } catch {
  }
  return "github";
}
async function getCurrentVersion() {
  try {
    const pkgPath = join(PACKAGE_ROOT, "package.json");
    const pkg = await fs.readJSON(pkgPath);
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}
async function getLatestVersion(packageName = "ccg-workflow-modify", branch = GITHUB_DEFAULT_BRANCH) {
  const source = detectInstallSource();
  if (source === "npm") {
    return getLatestVersionFromNpm(packageName);
  }
  return getLatestVersionFromGitHub(branch);
}
async function getLatestVersionFromNpm(packageName) {
  try {
    const { stdout } = await execAsync$2(`npm view ${packageName} version`, { timeout: 15e3 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
async function getLatestVersionFromGitHub(branch) {
  try {
    const { stdout } = await execAsync$2(
      `gh api repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/package.json?ref=${branch} --jq '.content'`,
      { timeout: 15e3 }
    );
    const decoded = Buffer.from(stdout.trim(), "base64").toString("utf-8");
    const pkg = JSON.parse(decoded);
    return pkg.version || null;
  } catch {
    try {
      const { stdout } = await execAsync$2(
        `curl -sL "https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${branch}/package.json"`,
        { timeout: 15e3 }
      );
      const pkg = JSON.parse(stdout);
      return pkg.version || null;
    } catch {
      return null;
    }
  }
}
function compareVersions(v1, v2) {
  const result = semver.compare(v1, v2);
  return result;
}
async function checkForUpdates(branch) {
  const currentVersion = await getCurrentVersion();
  const installSource = detectInstallSource();
  const latestVersion = await getLatestVersion("ccg-workflow-modify", branch || GITHUB_DEFAULT_BRANCH);
  if (!latestVersion) {
    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: null,
      installSource
    };
  }
  const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
  return {
    hasUpdate,
    currentVersion,
    latestVersion,
    installSource
  };
}
function getGitHubUpdateCommand(branch = GITHUB_DEFAULT_BRANCH) {
  return `npx github:${GITHUB_OWNER}/${GITHUB_REPO}#${branch}`;
}

const execAsync$1 = promisify(exec);
async function update() {
  console.log();
  console.log(ansis.cyan.bold("\u{1F504} \u68C0\u67E5\u66F4\u65B0..."));
  console.log();
  const spinner = ora("\u6B63\u5728\u68C0\u67E5\u6700\u65B0\u7248\u672C...").start();
  try {
    const { hasUpdate, currentVersion, latestVersion, installSource } = await checkForUpdates();
    const config = await readCcgConfig();
    const localVersion = config?.general?.version || "0.0.0";
    const needsWorkflowUpdate = compareVersions(currentVersion, localVersion) > 0;
    spinner.stop();
    if (!latestVersion) {
      const sourceHint = installSource === "github" ? "\u65E0\u6CD5\u8FDE\u63A5\u5230 GitHub\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u63A5\u6216 gh CLI \u662F\u5426\u53EF\u7528" : "\u65E0\u6CD5\u8FDE\u63A5\u5230 npm registry\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u63A5";
      console.log(ansis.red(`\u274C ${sourceHint}`));
      return;
    }
    console.log(`\u5F53\u524D\u7248\u672C: ${ansis.yellow(`v${currentVersion}`)}`);
    console.log(`\u6700\u65B0\u7248\u672C: ${ansis.green(`v${latestVersion}`)}`);
    console.log(`\u5B89\u88C5\u6765\u6E90: ${ansis.gray(installSource)}`);
    if (localVersion !== "0.0.0") {
      console.log(`\u672C\u5730\u5DE5\u4F5C\u6D41: ${ansis.gray(`v${localVersion}`)}`);
    }
    console.log();
    const effectiveNeedsUpdate = hasUpdate || needsWorkflowUpdate;
    let defaultConfirm = effectiveNeedsUpdate;
    let message;
    if (hasUpdate) {
      message = `\u53D1\u73B0\u65B0\u7248\u672C v${latestVersion} (\u5F53\u524D: v${currentVersion})\uFF0C\u662F\u5426\u66F4\u65B0\uFF1F`;
      defaultConfirm = true;
    } else if (needsWorkflowUpdate) {
      message = `\u68C0\u6D4B\u5230\u672C\u5730\u5DE5\u4F5C\u6D41\u7248\u672C (v${localVersion}) \u4F4E\u4E8E\u5F53\u524D\u7248\u672C (v${currentVersion})\uFF0C\u662F\u5426\u66F4\u65B0\uFF1F`;
      defaultConfirm = true;
    } else {
      message = `\u5F53\u524D\u5DF2\u662F\u6700\u65B0\u7248\u672C (v${currentVersion})\u3002\u662F\u5426\u5F3A\u5236\u91CD\u65B0\u5B89\u88C5/\u4FEE\u590D\u5DE5\u4F5C\u6D41\uFF1F`;
      defaultConfirm = false;
    }
    const { confirmUpdate } = await inquirer.prompt([{
      type: "confirm",
      name: "confirmUpdate",
      message,
      default: defaultConfirm
    }]);
    if (!confirmUpdate) {
      console.log(ansis.gray("\u5DF2\u53D6\u6D88\u66F4\u65B0"));
      return;
    }
    const fromVersion = needsWorkflowUpdate ? localVersion : currentVersion;
    await performUpdate(fromVersion, latestVersion || currentVersion, hasUpdate || needsWorkflowUpdate, installSource);
  } catch (error) {
    spinner.stop();
    console.log(ansis.red(`\u274C \u66F4\u65B0\u5931\u8D25: ${error}`));
  }
}
async function checkIfGlobalInstall$1() {
  try {
    const { stdout } = await execAsync$1("npm list -g ccg-workflow-modify --depth=0", { timeout: 5e3 });
    return stdout.includes("ccg-workflow-modify@");
  } catch {
    return false;
  }
}
function buildNpxCommand(installSource, args) {
  if (installSource === "github") {
    return `${getGitHubUpdateCommand()} ${args}`;
  }
  return `npx --yes ccg-workflow-modify@latest ${args}`;
}
async function performUpdate(fromVersion, toVersion, isNewVersion, installSource = detectInstallSource()) {
  console.log();
  console.log(ansis.yellow.bold("\u2699\uFE0F  \u5F00\u59CB\u66F4\u65B0..."));
  console.log();
  const isGlobalInstall = await checkIfGlobalInstall$1();
  if (isGlobalInstall && !isNewVersion) {
    console.log(ansis.cyan("\u2139\uFE0F  \u68C0\u6D4B\u5230\u4F60\u662F\u901A\u8FC7 npm \u5168\u5C40\u5B89\u88C5\u7684"));
    console.log();
    console.log(ansis.green("\u2713 \u5F53\u524D\u5305\u7248\u672C\u5DF2\u662F\u6700\u65B0 (v" + toVersion + ")"));
    console.log(ansis.yellow("\u2699\uFE0F  \u4EC5\u9700\u66F4\u65B0\u5DE5\u4F5C\u6D41\u6587\u4EF6"));
    console.log();
  } else if (isGlobalInstall && isNewVersion) {
    console.log(ansis.yellow("\u26A0\uFE0F  \u68C0\u6D4B\u5230\u4F60\u662F\u901A\u8FC7 npm \u5168\u5C40\u5B89\u88C5\u7684"));
    console.log();
    console.log("\u63A8\u8350\u7684\u66F4\u65B0\u65B9\u5F0F\uFF1A");
    console.log();
    if (installSource === "github") {
      console.log(ansis.cyan(`  npm install -g github:okamitimo233/ccg-workflow-modify`));
    } else {
      console.log(ansis.cyan("  npm install -g ccg-workflow-modify@latest"));
    }
    console.log();
    console.log(ansis.gray("\u8FD9\u5C06\u540C\u65F6\u66F4\u65B0\u547D\u4EE4\u548C\u5DE5\u4F5C\u6D41\u6587\u4EF6"));
    console.log();
    const { useNpmUpdate } = await inquirer.prompt([{
      type: "confirm",
      name: "useNpmUpdate",
      message: "\u6539\u7528 npm \u66F4\u65B0\uFF08\u63A8\u8350\uFF09\uFF1F",
      default: true
    }]);
    if (useNpmUpdate) {
      console.log();
      console.log(ansis.cyan("\u8BF7\u5728\u65B0\u7684\u7EC8\u7AEF\u7A97\u53E3\u4E2D\u8FD0\u884C\uFF1A"));
      console.log();
      if (installSource === "github") {
        console.log(ansis.cyan.bold("  npm install -g github:okamitimo233/ccg-workflow-modify"));
      } else {
        console.log(ansis.cyan.bold("  npm install -g ccg-workflow-modify@latest"));
      }
      console.log();
      console.log(ansis.gray("(\u8FD0\u884C\u5B8C\u6210\u540E\uFF0C\u5F53\u524D\u7248\u672C\u5C06\u81EA\u52A8\u66F4\u65B0)"));
      console.log();
      return;
    }
    console.log();
    console.log(ansis.yellow("\u26A0\uFE0F  \u7EE7\u7EED\u4F7F\u7528\u5185\u7F6E\u66F4\u65B0\uFF08\u4EC5\u66F4\u65B0\u5DE5\u4F5C\u6D41\u6587\u4EF6\uFF09"));
    console.log(ansis.gray("\u6CE8\u610F\uFF1A\u8FD9\u4E0D\u4F1A\u66F4\u65B0 ccg \u547D\u4EE4\u672C\u8EAB"));
    console.log();
  }
  let spinner = ora("\u6B63\u5728\u4E0B\u8F7D\u6700\u65B0\u7248\u672C...").start();
  try {
    if (process.platform === "win32") {
      spinner.text = "\u6B63\u5728\u6E05\u7406 npx \u7F13\u5B58...";
      try {
        await execAsync$1("npx clear-npx-cache", { timeout: 1e4 });
      } catch {
        const npxCachePath = join(homedir(), ".npm", "_npx");
        try {
          const fs = await import('fs-extra');
          await fs.remove(npxCachePath);
        } catch {
        }
      }
    }
    spinner.text = "\u6B63\u5728\u4E0B\u8F7D\u6700\u65B0\u7248\u672C...";
    const versionCheckCmd = buildNpxCommand(installSource, "--version");
    await execAsync$1(versionCheckCmd, { timeout: 6e4 });
    spinner.succeed("\u6700\u65B0\u7248\u672C\u4E0B\u8F7D\u5B8C\u6210");
  } catch (error) {
    spinner.fail("\u4E0B\u8F7D\u6700\u65B0\u7248\u672C\u5931\u8D25");
    console.log(ansis.red(`\u9519\u8BEF: ${error}`));
    if (installSource === "github") {
      console.log();
      console.log(ansis.yellow("\u63D0\u793A: GitHub \u5B89\u88C5\u6E90\u4E0B\u8F7D\u5931\u8D25\uFF0C\u53EF\u80FD\u539F\u56E0:"));
      console.log(ansis.gray("  \u2022 \u7F51\u7EDC\u65E0\u6CD5\u8BBF\u95EE GitHub"));
      console.log(ansis.gray("  \u2022 \u4ED3\u5E93\u4E0D\u5B58\u5728\u6216\u5206\u652F\u540D\u9519\u8BEF"));
      console.log(ansis.gray(`  \u2022 \u8BF7\u5C1D\u8BD5\u624B\u52A8\u8FD0\u884C: ${getGitHubUpdateCommand()}`));
    } else {
      console.log();
      console.log(ansis.yellow("\u63D0\u793A: npm \u6E90\u4E0B\u8F7D\u5931\u8D25\uFF0C\u53EF\u80FD\u539F\u56E0:"));
      console.log(ansis.gray("  \u2022 \u5305\u5C1A\u672A\u53D1\u5E03\u5230 npm registry"));
      console.log(ansis.gray("  \u2022 \u7F51\u7EDC\u65E0\u6CD5\u8BBF\u95EE npm registry"));
      console.log(ansis.gray(`  \u2022 \u8BF7\u5C1D\u8BD5 GitHub \u5B89\u88C5: ${getGitHubUpdateCommand()}`));
    }
    return;
  }
  if (await needsMigration()) {
    spinner = ora("\u68C0\u6D4B\u5230\u65E7\u7248\u672C\u914D\u7F6E\uFF0C\u6B63\u5728\u8FC1\u79FB...").start();
    const migrationResult = await migrateToV1_4_0();
    if (migrationResult.migratedFiles.length > 0) {
      spinner.info(ansis.cyan("\u914D\u7F6E\u8FC1\u79FB\u5B8C\u6210:"));
      console.log();
      for (const file of migrationResult.migratedFiles) {
        console.log(`  ${ansis.green("\u2713")} ${file}`);
      }
      if (migrationResult.skipped.length > 0) {
        console.log();
        console.log(ansis.gray("  \u5DF2\u8DF3\u8FC7:"));
        for (const file of migrationResult.skipped) {
          console.log(`  ${ansis.gray("\u25CB")} ${file}`);
        }
      }
      console.log();
    }
    if (migrationResult.errors.length > 0) {
      spinner.warn(ansis.yellow("\u8FC1\u79FB\u5B8C\u6210\uFF0C\u4F46\u6709\u90E8\u5206\u9519\u8BEF:"));
      for (const error of migrationResult.errors) {
        console.log(`  ${ansis.red("\u2717")} ${error}`);
      }
      console.log();
    }
  }
  spinner = ora("\u6B63\u5728\u5220\u9664\u65E7\u5DE5\u4F5C\u6D41...").start();
  try {
    const installDir = join(homedir(), ".claude");
    const uninstallResult = await uninstallWorkflows(installDir);
    if (uninstallResult.success) {
      spinner.succeed("\u65E7\u5DE5\u4F5C\u6D41\u5DF2\u5220\u9664");
    } else {
      spinner.warn("\u90E8\u5206\u6587\u4EF6\u5220\u9664\u5931\u8D25\uFF0C\u7EE7\u7EED\u5B89\u88C5...");
      for (const error of uninstallResult.errors) {
        console.log(ansis.yellow(`  \u2022 ${error}`));
      }
    }
  } catch (error) {
    spinner.warn(`\u5220\u9664\u65E7\u5DE5\u4F5C\u6D41\u65F6\u51FA\u9519: ${error}\uFF0C\u7EE7\u7EED\u5B89\u88C5...`);
  }
  spinner = ora("\u6B63\u5728\u5B89\u88C5\u65B0\u7248\u672C\u5DE5\u4F5C\u6D41\u548C\u4E8C\u8FDB\u5236...").start();
  try {
    const initCmd = buildNpxCommand(installSource, "init --force --skip-mcp --skip-prompt");
    await execAsync$1(initCmd, {
      timeout: 12e4,
      env: {
        ...process.env,
        CCG_UPDATE_MODE: "true"
      }
    });
    spinner.succeed("\u65B0\u7248\u672C\u5B89\u88C5\u6210\u529F");
    const config = await readCcgConfig();
    if (config?.workflows?.installed) {
      console.log();
      console.log(ansis.cyan(`\u5DF2\u5B89\u88C5 ${config.workflows.installed.length} \u4E2A\u547D\u4EE4:`));
      for (const cmd of config.workflows.installed) {
        console.log(`  ${ansis.gray("\u2022")} /ccg:${cmd}`);
      }
    }
  } catch (error) {
    spinner.fail("\u5B89\u88C5\u65B0\u7248\u672C\u5931\u8D25");
    console.log(ansis.red(`\u9519\u8BEF: ${error}`));
    console.log();
    if (installSource === "github") {
      console.log(ansis.yellow("\u8BF7\u5C1D\u8BD5\u624B\u52A8\u8FD0\u884C:"));
      console.log(ansis.cyan(`  ${getGitHubUpdateCommand()}`));
    } else {
      console.log(ansis.yellow("\u8BF7\u5C1D\u8BD5\u624B\u52A8\u8FD0\u884C:"));
      console.log(ansis.cyan("  npx ccg-workflow-modify@latest"));
    }
    return;
  }
  console.log();
  console.log(ansis.green.bold("\u2705 \u66F4\u65B0\u5B8C\u6210\uFF01"));
  console.log();
  if (isNewVersion) {
    console.log(ansis.gray(`\u4ECE v${fromVersion} \u5347\u7EA7\u5230 v${toVersion}`));
  } else {
    console.log(ansis.gray(`\u91CD\u65B0\u5B89\u88C5\u4E86 v${toVersion}`));
  }
  console.log();
}

const execAsync = promisify(exec);
async function showMainMenu() {
  while (true) {
    console.log();
    console.log(ansis.cyan.bold(`  CCG - Claude + Codex + Gemini`));
    console.log(ansis.gray("  Multi-Model Collaboration System"));
    console.log();
    const { action } = await inquirer.prompt([{
      type: "list",
      name: "action",
      message: i18n.t("menu:title"),
      choices: [
        { name: `${ansis.green("\u279C")} ${i18n.t("menu:options.init")}`, value: "init" },
        { name: `${ansis.blue("\u279C")} ${i18n.t("menu:options.update")}`, value: "update" },
        { name: `${ansis.cyan("\u2699")} \u914D\u7F6E MCP`, value: "config-mcp" },
        { name: `${ansis.cyan("\u{1F511}")} \u914D\u7F6E API`, value: "config-api" },
        { name: `${ansis.magenta("\u{1F3AD}")} \u914D\u7F6E\u8F93\u51FA\u98CE\u683C`, value: "config-style" },
        { name: `${ansis.yellow("\u{1F527}")} \u5B9E\u7528\u5DE5\u5177`, value: "tools" },
        { name: `${ansis.blue("\u{1F4E6}")} \u5B89\u88C5 Claude Code`, value: "install-claude" },
        { name: `${ansis.magenta("\u279C")} ${i18n.t("menu:options.uninstall")}`, value: "uninstall" },
        { name: `${ansis.yellow("?")} ${i18n.t("menu:options.help")}`, value: "help" },
        new inquirer.Separator(),
        { name: `${ansis.red("\u2715")} ${i18n.t("menu:options.exit")}`, value: "exit" }
      ]
    }]);
    switch (action) {
      case "init":
        await init();
        break;
      case "update":
        await update();
        break;
      case "config-mcp":
        await configMcp();
        break;
      case "config-api":
        await configApi();
        break;
      case "config-style":
        await configOutputStyle();
        break;
      case "tools":
        await handleTools();
        break;
      case "install-claude":
        await handleInstallClaude();
        break;
      case "uninstall":
        await uninstall();
        break;
      case "help":
        showHelp();
        break;
      case "exit":
        console.log(ansis.gray("\u518D\u89C1\uFF01"));
        return;
    }
    console.log();
    await inquirer.prompt([{
      type: "input",
      name: "continue",
      message: ansis.gray("\u6309 Enter \u8FD4\u56DE\u4E3B\u83DC\u5355...")
    }]);
  }
}
function showHelp() {
  console.log();
  console.log(ansis.cyan.bold(i18n.t("menu:help.title")));
  console.log();
  console.log(ansis.yellow.bold("  \u5F00\u53D1\u5DE5\u4F5C\u6D41:"));
  console.log(`  ${ansis.green("/ccg:workflow")}    \u5B8C\u65746\u9636\u6BB5\u5F00\u53D1\u5DE5\u4F5C\u6D41`);
  console.log(`  ${ansis.green("/ccg:plan")}        \u591A\u6A21\u578B\u534F\u4F5C\u89C4\u5212\uFF08Phase 1-2\uFF09`);
  console.log(`  ${ansis.green("/ccg:execute")}     \u591A\u6A21\u578B\u534F\u4F5C\u6267\u884C\uFF08Phase 3-5\uFF09`);
  console.log(`  ${ansis.green("/ccg:frontend")}    ${i18n.t("menu:help.descriptions.frontend")}`);
  console.log(`  ${ansis.green("/ccg:backend")}     ${i18n.t("menu:help.descriptions.backend")}`);
  console.log(`  ${ansis.green("/ccg:feat")}        \u667A\u80FD\u529F\u80FD\u5F00\u53D1`);
  console.log(`  ${ansis.green("/ccg:analyze")}     ${i18n.t("menu:help.descriptions.analyze")}`);
  console.log(`  ${ansis.green("/ccg:debug")}       \u95EE\u9898\u8BCA\u65AD + \u4FEE\u590D`);
  console.log(`  ${ansis.green("/ccg:optimize")}    \u6027\u80FD\u4F18\u5316`);
  console.log(`  ${ansis.green("/ccg:test")}        \u6D4B\u8BD5\u751F\u6210`);
  console.log(`  ${ansis.green("/ccg:review")}      ${i18n.t("menu:help.descriptions.review")}`);
  console.log();
  console.log(ansis.yellow.bold("  OpenSpec \u89C4\u8303\u9A71\u52A8:"));
  console.log(`  ${ansis.green("/ccg:spec-init")}      \u521D\u59CB\u5316 OpenSpec \u73AF\u5883`);
  console.log(`  ${ansis.green("/ccg:spec-research")} \u9700\u6C42\u7814\u7A76 \u2192 \u7EA6\u675F\u96C6`);
  console.log(`  ${ansis.green("/ccg:spec-plan")}     \u591A\u6A21\u578B\u5206\u6790 \u2192 \u96F6\u51B3\u7B56\u8BA1\u5212`);
  console.log(`  ${ansis.green("/ccg:spec-impl")}     \u89C4\u8303\u9A71\u52A8\u5B9E\u73B0`);
  console.log(`  ${ansis.green("/ccg:spec-review")}   \u5F52\u6863\u524D\u53CC\u6A21\u578B\u5BA1\u67E5`);
  console.log();
  console.log(ansis.yellow.bold("  Git \u5DE5\u5177:"));
  console.log(`  ${ansis.green("/ccg:commit")}      ${i18n.t("menu:help.descriptions.commit")}`);
  console.log(`  ${ansis.green("/ccg:rollback")}    ${i18n.t("menu:help.descriptions.rollback")}`);
  console.log(`  ${ansis.green("/ccg:clean-branches")} \u6E05\u7406\u5DF2\u5408\u5E76\u5206\u652F`);
  console.log(`  ${ansis.green("/ccg:worktree")}    Git Worktree \u7BA1\u7406`);
  console.log();
  console.log(ansis.yellow.bold("  \u9879\u76EE\u7BA1\u7406:"));
  console.log(`  ${ansis.green("/ccg:init")}        \u521D\u59CB\u5316\u9879\u76EE CLAUDE.md`);
  console.log();
  console.log(ansis.gray(i18n.t("menu:help.hint")));
  console.log();
}
async function configApi() {
  console.log();
  console.log(ansis.cyan.bold("  \u914D\u7F6E Claude Code API"));
  console.log();
  const settingsPath = join(homedir(), ".claude", "settings.json");
  let settings = {};
  if (await fs.pathExists(settingsPath)) {
    settings = await fs.readJson(settingsPath);
  }
  const currentUrl = settings.env?.ANTHROPIC_BASE_URL;
  const currentKey = settings.env?.ANTHROPIC_API_KEY || settings.env?.ANTHROPIC_AUTH_TOKEN;
  if (currentUrl || currentKey) {
    console.log(ansis.gray("  \u5F53\u524D\u914D\u7F6E:"));
    if (currentUrl)
      console.log(ansis.gray(`    URL: ${currentUrl}`));
    if (currentKey)
      console.log(ansis.gray(`    Key: ${currentKey.slice(0, 8)}...${currentKey.slice(-4)}`));
    console.log();
  }
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "url",
      message: `API URL ${ansis.gray("(\u7559\u7A7A\u4F7F\u7528\u5B98\u65B9)")}`,
      default: currentUrl || ""
    },
    {
      type: "password",
      name: "key",
      message: `API Key ${ansis.gray("(\u7559\u7A7A\u8DF3\u8FC7)")}`,
      mask: "*"
    }
  ]);
  if (!answers.url && !answers.key) {
    console.log(ansis.gray("\u672A\u4FEE\u6539\u914D\u7F6E"));
    return;
  }
  if (!settings.env)
    settings.env = {};
  if (answers.url?.trim()) {
    settings.env.ANTHROPIC_BASE_URL = answers.url.trim();
  }
  if (answers.key?.trim()) {
    settings.env.ANTHROPIC_API_KEY = answers.key.trim();
    delete settings.env.ANTHROPIC_AUTH_TOKEN;
  }
  settings.env.DISABLE_TELEMETRY = "1";
  settings.env.DISABLE_ERROR_REPORTING = "1";
  settings.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
  settings.env.CLAUDE_CODE_ATTRIBUTION_HEADER = "0";
  settings.env.MCP_TIMEOUT = "60000";
  if (!settings.permissions)
    settings.permissions = {};
  if (!settings.permissions.allow)
    settings.permissions.allow = [];
  const wrapperPerms = [
    "Bash(~/.claude/bin/codeagent-wrapper --backend gemini*)",
    "Bash(~/.claude/bin/codeagent-wrapper --backend codex*)"
  ];
  for (const perm of wrapperPerms) {
    if (!settings.permissions.allow.includes(perm))
      settings.permissions.allow.push(perm);
  }
  await fs.ensureDir(join(homedir(), ".claude"));
  await fs.writeJson(settingsPath, settings, { spaces: 2 });
  console.log();
  console.log(ansis.green("\u2713 API \u914D\u7F6E\u5DF2\u4FDD\u5B58"));
  console.log(ansis.gray(`  \u914D\u7F6E\u6587\u4EF6: ${settingsPath}`));
}
const OUTPUT_STYLES = [
  { id: "default", name: "\u9ED8\u8BA4", desc: "Claude Code \u539F\u751F\u98CE\u683C" },
  { id: "engineer-professional", name: "\u4E13\u4E1A\u5DE5\u7A0B\u5E08", desc: "\u7B80\u6D01\u4E13\u4E1A\u7684\u6280\u672F\u98CE\u683C" },
  { id: "nekomata-engineer", name: "\u732B\u5A18\u5DE5\u7A0B\u5E08", desc: "\u53EF\u7231\u732B\u5A18\u8BED\u6C14\u55B5~" },
  { id: "laowang-engineer", name: "\u8001\u738B\u5DE5\u7A0B\u5E08", desc: "\u63A5\u5730\u6C14\u7684\u8001\u738B\u98CE\u683C" },
  { id: "ojousama-engineer", name: "\u5927\u5C0F\u59D0\u5DE5\u7A0B\u5E08", desc: "\u4F18\u96C5\u5927\u5C0F\u59D0\u8BED\u6C14" },
  { id: "abyss-cultivator", name: "\u90AA\u4FEE\u98CE\u683C", desc: "\u5BBF\u547D\u6DF1\u6E0A\xB7\u9053\u8BED\u6807\u7B7E" }
];
async function configOutputStyle() {
  console.log();
  console.log(ansis.cyan.bold("  \u914D\u7F6E\u8F93\u51FA\u98CE\u683C"));
  console.log();
  const settingsPath = join(homedir(), ".claude", "settings.json");
  let settings = {};
  if (await fs.pathExists(settingsPath)) {
    settings = await fs.readJson(settingsPath);
  }
  const currentStyle = settings.outputStyle || "default";
  console.log(ansis.gray(`  \u5F53\u524D\u98CE\u683C: ${currentStyle}`));
  console.log();
  const { style } = await inquirer.prompt([{
    type: "list",
    name: "style",
    message: "\u9009\u62E9\u8F93\u51FA\u98CE\u683C",
    choices: OUTPUT_STYLES.map((s) => ({
      name: `${s.name} ${ansis.gray(`- ${s.desc}`)}`,
      value: s.id
    })),
    default: currentStyle
  }]);
  if (style === currentStyle) {
    console.log(ansis.gray("\u98CE\u683C\u672A\u53D8\u66F4"));
    return;
  }
  if (style !== "default") {
    const outputStylesDir = join(homedir(), ".claude", "output-styles");
    await fs.ensureDir(outputStylesDir);
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    let pkgRoot = dirname(dirname(__dirname));
    if (!await fs.pathExists(join(pkgRoot, "templates"))) {
      pkgRoot = dirname(pkgRoot);
    }
    const templatePath = join(pkgRoot, "templates", "output-styles", `${style}.md`);
    const destPath = join(outputStylesDir, `${style}.md`);
    if (await fs.pathExists(templatePath)) {
      await fs.copy(templatePath, destPath);
      console.log(ansis.green(`\u2713 \u5DF2\u5B89\u88C5\u98CE\u683C\u6587\u4EF6: ${style}.md`));
    }
  }
  if (style === "default") {
    delete settings.outputStyle;
  } else {
    settings.outputStyle = style;
  }
  await fs.writeJson(settingsPath, settings, { spaces: 2 });
  console.log();
  console.log(ansis.green(`\u2713 \u8F93\u51FA\u98CE\u683C\u5DF2\u8BBE\u7F6E\u4E3A: ${style}`));
  console.log(ansis.gray("  \u91CD\u542F Claude Code CLI \u4F7F\u914D\u7F6E\u751F\u6548"));
}
async function handleInstallClaude() {
  console.log();
  console.log(ansis.cyan.bold("  \u5B89\u88C5/\u91CD\u88C5 Claude Code"));
  console.log();
  let isInstalled = false;
  try {
    await execAsync("claude --version", { timeout: 5e3 });
    isInstalled = true;
  } catch {
    isInstalled = false;
  }
  if (isInstalled) {
    console.log(ansis.yellow("\u26A0 \u68C0\u6D4B\u5230\u5DF2\u5B89\u88C5 Claude Code"));
    const { confirm } = await inquirer.prompt([{
      type: "confirm",
      name: "confirm",
      message: "\u662F\u5426\u5378\u8F7D\u540E\u91CD\u65B0\u5B89\u88C5\uFF1F",
      default: false
    }]);
    if (!confirm) {
      console.log(ansis.gray("\u5DF2\u53D6\u6D88"));
      return;
    }
    console.log();
    console.log(ansis.yellow("\u23F3 \u6B63\u5728\u5378\u8F7D Claude Code..."));
    try {
      const uninstallCmd = isWindows() ? "npm uninstall -g @anthropic-ai/claude-code" : "sudo npm uninstall -g @anthropic-ai/claude-code";
      await execAsync(uninstallCmd, { timeout: 6e4 });
      console.log(ansis.green("\u2713 \u5378\u8F7D\u6210\u529F"));
    } catch (e) {
      console.log(ansis.red(`\u2717 \u5378\u8F7D\u5931\u8D25: ${e}`));
      return;
    }
  }
  const isMac = process.platform === "darwin";
  const isLinux = process.platform === "linux";
  const { method } = await inquirer.prompt([{
    type: "list",
    name: "method",
    message: "\u9009\u62E9\u5B89\u88C5\u65B9\u5F0F",
    choices: [
      { name: `npm ${ansis.green("(\u63A8\u8350)")} ${ansis.gray("- \u5168\u5C40\u5B89\u88C5")}`, value: "npm" },
      ...isMac || isLinux ? [{ name: `homebrew ${ansis.gray("- brew install")}`, value: "homebrew" }] : [],
      ...isMac || isLinux ? [{ name: `curl ${ansis.gray("- \u5B98\u65B9\u811A\u672C")}`, value: "curl" }] : [],
      ...isWindows() ? [
        { name: `powershell ${ansis.gray("- Windows \u5B98\u65B9")}`, value: "powershell" },
        { name: `cmd ${ansis.gray("- \u547D\u4EE4\u63D0\u793A\u7B26")}`, value: "cmd" }
      ] : [],
      new inquirer.Separator(),
      { name: `${ansis.gray("\u53D6\u6D88")}`, value: "cancel" }
    ]
  }]);
  if (method === "cancel")
    return;
  console.log();
  console.log(ansis.yellow("\u23F3 \u6B63\u5728\u5B89\u88C5 Claude Code..."));
  try {
    if (method === "npm") {
      const installCmd = isWindows() ? "npm install -g @anthropic-ai/claude-code" : "sudo npm install -g @anthropic-ai/claude-code";
      await execAsync(installCmd, { timeout: 3e5 });
    } else if (method === "homebrew") {
      await execAsync("brew install --cask claude-code", { timeout: 3e5 });
    } else if (method === "curl") {
      await execAsync("curl -fsSL https://claude.ai/install.sh | bash", { timeout: 3e5 });
    } else if (method === "powershell") {
      await execAsync('powershell -Command "irm https://claude.ai/install.ps1 | iex"', { timeout: 3e5 });
    } else if (method === "cmd") {
      await execAsync('cmd /c "curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd"', { timeout: 3e5 });
    }
    console.log(ansis.green("\u2713 Claude Code \u5B89\u88C5\u6210\u529F"));
    console.log();
    console.log(ansis.cyan("\u{1F4A1} \u63D0\u793A\uFF1A\u8FD0\u884C claude \u547D\u4EE4\u542F\u52A8"));
  } catch (e) {
    console.log(ansis.red(`\u2717 \u5B89\u88C5\u5931\u8D25: ${e}`));
  }
}
async function checkIfGlobalInstall() {
  try {
    const { stdout } = await execAsync("npm list -g ccg-workflow-modify --depth=0", { timeout: 5e3 });
    return stdout.includes("ccg-workflow-modify@");
  } catch {
    return false;
  }
}
async function uninstall() {
  console.log();
  const isGlobalInstall = await checkIfGlobalInstall();
  if (isGlobalInstall) {
    console.log(ansis.yellow("\u26A0\uFE0F  \u68C0\u6D4B\u5230\u4F60\u662F\u901A\u8FC7 npm \u5168\u5C40\u5B89\u88C5\u7684"));
    console.log();
    console.log("\u5B8C\u6574\u5378\u8F7D\u9700\u8981\u4E24\u6B65\uFF1A");
    console.log(`  ${ansis.cyan("1. \u79FB\u9664\u5DE5\u4F5C\u6D41\u6587\u4EF6")} (\u5373\u5C06\u6267\u884C)`);
    console.log(`  ${ansis.cyan("2. \u5378\u8F7D npm \u5168\u5C40\u5305")} (\u9700\u8981\u624B\u52A8\u6267\u884C)`);
    console.log();
  }
  const { confirm } = await inquirer.prompt([{
    type: "confirm",
    name: "confirm",
    message: isGlobalInstall ? "\u7EE7\u7EED\u5378\u8F7D\u5DE5\u4F5C\u6D41\u6587\u4EF6\uFF1F" : i18n.t("menu:uninstall.confirm"),
    default: false
  }]);
  if (!confirm) {
    console.log(ansis.gray(i18n.t("menu:uninstall.cancelled")));
    return;
  }
  console.log();
  console.log(ansis.yellow(i18n.t("menu:uninstall.uninstalling")));
  const installDir = join(homedir(), ".claude");
  const result = await uninstallWorkflows(installDir);
  if (result.success) {
    console.log(ansis.green("\u2705 \u5DE5\u4F5C\u6D41\u6587\u4EF6\u5DF2\u79FB\u9664"));
    if (result.removedCommands.length > 0) {
      console.log();
      console.log(ansis.cyan(i18n.t("menu:uninstall.removedCommands")));
      for (const cmd of result.removedCommands) {
        console.log(`  ${ansis.gray("\u2022")} /ccg:${cmd}`);
      }
    }
    if (result.removedAgents.length > 0) {
      console.log();
      console.log(ansis.cyan("\u5DF2\u79FB\u9664\u5B50\u667A\u80FD\u4F53:"));
      for (const agent of result.removedAgents) {
        console.log(`  ${ansis.gray("\u2022")} ${agent}`);
      }
    }
    if (result.removedSkills.length > 0) {
      console.log();
      console.log(ansis.cyan("\u5DF2\u79FB\u9664 Skills:"));
      console.log(`  ${ansis.gray("\u2022")} multi-model-collaboration`);
    }
    if (result.removedBin) {
      console.log();
      console.log(ansis.cyan("\u5DF2\u79FB\u9664\u4E8C\u8FDB\u5236\u6587\u4EF6:"));
      console.log(`  ${ansis.gray("\u2022")} codeagent-wrapper`);
    }
    if (isGlobalInstall) {
      console.log();
      console.log(ansis.yellow.bold("\u{1F538} \u6700\u540E\u4E00\u6B65\uFF1A\u5378\u8F7D npm \u5168\u5C40\u5305"));
      console.log();
      console.log("\u8BF7\u5728\u65B0\u7684\u7EC8\u7AEF\u7A97\u53E3\u4E2D\u8FD0\u884C\uFF1A");
      console.log();
      console.log(ansis.cyan.bold("  npm uninstall -g ccg-workflow-modify"));
      console.log();
      console.log(ansis.gray("(\u5B8C\u6210\u540E ccg \u547D\u4EE4\u5C06\u5F7B\u5E95\u79FB\u9664)"));
    }
  } else {
    console.log(ansis.red(i18n.t("menu:uninstall.failed")));
    for (const error of result.errors) {
      console.log(ansis.red(`  ${error}`));
    }
  }
  console.log();
}
async function handleTools() {
  console.log();
  const { tool } = await inquirer.prompt([{
    type: "list",
    name: "tool",
    message: "\u9009\u62E9\u5DE5\u5177",
    choices: [
      { name: `${ansis.green("\u{1F4CA}")} ccusage ${ansis.gray("- Claude Code \u7528\u91CF\u5206\u6790")}`, value: "ccusage" },
      { name: `${ansis.blue("\u{1F4DF}")} CCometixLine ${ansis.gray("- \u72B6\u6001\u680F\u5DE5\u5177\uFF08Git + \u7528\u91CF\uFF09")}`, value: "ccline" },
      new inquirer.Separator(),
      { name: `${ansis.gray("\u8FD4\u56DE")}`, value: "cancel" }
    ]
  }]);
  if (tool === "cancel")
    return;
  if (tool === "ccusage") {
    await runCcusage();
  } else if (tool === "ccline") {
    await handleCCometixLine();
  }
}
async function runCcusage() {
  console.log();
  console.log(ansis.cyan("\u{1F4CA} \u8FD0\u884C ccusage..."));
  console.log(ansis.gray("$ npx ccusage@latest"));
  console.log();
  return new Promise((resolve) => {
    const child = spawn("npx", ["ccusage@latest"], {
      stdio: "inherit",
      shell: true
    });
    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });
}
async function handleCCometixLine() {
  console.log();
  const { action } = await inquirer.prompt([{
    type: "list",
    name: "action",
    message: "CCometixLine \u64CD\u4F5C",
    choices: [
      { name: `${ansis.green("\u279C")} \u5B89\u88C5/\u66F4\u65B0`, value: "install" },
      { name: `${ansis.red("\u2715")} \u5378\u8F7D`, value: "uninstall" },
      new inquirer.Separator(),
      { name: `${ansis.gray("\u8FD4\u56DE")}`, value: "cancel" }
    ]
  }]);
  if (action === "cancel")
    return;
  if (action === "install") {
    await installCCometixLine();
  } else if (action === "uninstall") {
    await uninstallCCometixLine();
  }
}
async function installCCometixLine() {
  console.log();
  console.log(ansis.yellow("\u23F3 \u6B63\u5728\u5B89\u88C5 CCometixLine..."));
  try {
    const installCmd = isWindows() ? "npm install -g @cometix/ccline" : "sudo npm install -g @cometix/ccline";
    await execAsync(installCmd, { timeout: 12e4 });
    console.log(ansis.green("\u2713 @cometix/ccline \u5B89\u88C5\u6210\u529F"));
    const settingsPath = join(homedir(), ".claude", "settings.json");
    let settings = {};
    if (await fs.pathExists(settingsPath)) {
      settings = await fs.readJson(settingsPath);
    }
    settings.statusLine = {
      type: "command",
      command: isWindows() ? "%USERPROFILE%\\.claude\\ccline\\ccline.exe" : "~/.claude/ccline/ccline",
      padding: 0
    };
    await fs.ensureDir(join(homedir(), ".claude"));
    await fs.writeJson(settingsPath, settings, { spaces: 2 });
    console.log(ansis.green("\u2713 Claude Code statusLine \u5DF2\u914D\u7F6E"));
    console.log();
    console.log(ansis.cyan("\u{1F4A1} \u63D0\u793A\uFF1A\u91CD\u542F Claude Code CLI \u4F7F\u914D\u7F6E\u751F\u6548"));
  } catch (error) {
    console.log(ansis.red(`\u2717 \u5B89\u88C5\u5931\u8D25: ${error}`));
  }
}
async function uninstallCCometixLine() {
  console.log();
  console.log(ansis.yellow("\u23F3 \u6B63\u5728\u5378\u8F7D CCometixLine..."));
  try {
    const settingsPath = join(homedir(), ".claude", "settings.json");
    if (await fs.pathExists(settingsPath)) {
      const settings = await fs.readJson(settingsPath);
      delete settings.statusLine;
      await fs.writeJson(settingsPath, settings, { spaces: 2 });
      console.log(ansis.green("\u2713 statusLine \u914D\u7F6E\u5DF2\u79FB\u9664"));
    }
    const uninstallCmd = isWindows() ? "npm uninstall -g @cometix/ccline" : "sudo npm uninstall -g @cometix/ccline";
    await execAsync(uninstallCmd, { timeout: 6e4 });
    console.log(ansis.green("\u2713 @cometix/ccline \u5DF2\u5378\u8F7D"));
  } catch (error) {
    console.log(ansis.red(`\u2717 \u5378\u8F7D\u5931\u8D25: ${error}`));
  }
}

export { diagnoseMcpConfig as A, isWindows as B, readClaudeCodeConfig as C, fixWindowsMcpConfig as D, writeClaudeCodeConfig as E, configMcp as F, version as G, checkForUpdates as a, compareVersions as b, changeLanguage as c, createDefaultConfig as d, createDefaultRouting as e, getConfigPath as f, getCcgDir as g, getCurrentVersion as h, getLatestVersion as i, getWorkflowById as j, getWorkflowConfigs as k, i18n as l, init as m, initI18n as n, installAceTool as o, installAceToolRs as p, installWorkflows as q, migrateConfig as r, migrateToV1_4_0 as s, needsMigration as t, readCcgConfig as u, showMainMenu as v, uninstallAceTool as w, uninstallWorkflows as x, update as y, writeCcgConfig as z };
