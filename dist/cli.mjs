#!/usr/bin/env node
import cac from 'cac';
import ansis from 'ansis';
import { z as diagnoseMcpConfig, A as isWindows, B as readClaudeCodeConfig, C as fixWindowsMcpConfig, D as writeClaudeCodeConfig, t as readCcgConfig, n as initI18n, u as showMainMenu, m as init, E as configMcp, F as version, l as i18n } from './shared/ccg-workflow-modify.Veo9NcPe.mjs';
import 'inquirer';
import 'node:child_process';
import 'node:util';
import 'node:os';
import 'node:url';
import 'pathe';
import 'fs-extra';
import 'i18next';
import 'ora';
import 'smol-toml';

async function diagnoseMcp() {
  console.log();
  console.log(ansis.cyan.bold("  \u{1F50D} MCP Configuration Diagnostics"));
  console.log();
  const issues = await diagnoseMcpConfig();
  console.log(ansis.bold("  Diagnostic Results:"));
  console.log();
  for (const issue of issues) {
    if (issue.startsWith("\u2705")) {
      console.log(ansis.green(`  ${issue}`));
    } else if (issue.startsWith("\u26A0\uFE0F")) {
      console.log(ansis.yellow(`  ${issue}`));
    } else if (issue.startsWith("\u274C")) {
      console.log(ansis.red(`  ${issue}`));
    } else {
      console.log(`  ${issue}`);
    }
  }
  if (isWindows() && issues.some((i) => i.includes("not properly wrapped"))) {
    console.log();
    console.log(ansis.yellow("  \u{1F4A1} Tip: Run the following command to fix Windows MCP configuration:"));
    console.log(ansis.gray("     npx ccg fix-mcp"));
  }
  console.log();
}
async function fixMcp() {
  console.log();
  console.log(ansis.cyan.bold("  \u{1F527} Fixing MCP Configuration"));
  console.log();
  if (!isWindows()) {
    console.log(ansis.yellow("  \u26A0\uFE0F  This command is only needed on Windows"));
    console.log();
    return;
  }
  try {
    const config = await readClaudeCodeConfig();
    if (!config) {
      console.log(ansis.red("  \u274C No ~/.claude.json found"));
      console.log();
      return;
    }
    if (!config.mcpServers || Object.keys(config.mcpServers).length === 0) {
      console.log(ansis.yellow("  \u26A0\uFE0F  No MCP servers configured"));
      console.log();
      return;
    }
    const fixedConfig = fixWindowsMcpConfig(config);
    await writeClaudeCodeConfig(fixedConfig);
    console.log(ansis.green("  \u2705 Windows MCP configuration fixed"));
    console.log();
    console.log(ansis.gray("  Run diagnostics again to verify:"));
    console.log(ansis.gray("     npx ccg diagnose-mcp"));
    console.log();
  } catch (error) {
    console.log(ansis.red(`  \u274C Failed to fix MCP configuration: ${error}`));
    console.log();
  }
}

function customizeHelp(sections) {
  sections.unshift({
    title: "",
    body: ansis.cyan.bold(`CCG - Claude + Codex + Gemini v${version}`)
  });
  sections.push({
    title: ansis.yellow(i18n.t("cli:help.commands")),
    body: [
      `  ${ansis.cyan("ccg")}              ${i18n.t("cli:help.commandDescriptions.showMenu")}`,
      `  ${ansis.cyan("ccg init")} | ${ansis.cyan("i")}     ${i18n.t("cli:help.commandDescriptions.initConfig")}`,
      `  ${ansis.cyan("ccg config mcp")}   \u914D\u7F6E ace-tool MCP Token`,
      `  ${ansis.cyan("ccg diagnose-mcp")} \u8BCA\u65AD MCP \u914D\u7F6E\u95EE\u9898`,
      `  ${ansis.cyan("ccg fix-mcp")}      \u4FEE\u590D Windows MCP \u914D\u7F6E`,
      "",
      ansis.gray(`  ${i18n.t("cli:help.shortcuts")}`),
      `  ${ansis.cyan("ccg i")}            ${i18n.t("cli:help.shortcutDescriptions.quickInit")}`
    ].join("\n")
  });
  sections.push({
    title: ansis.yellow(i18n.t("cli:help.options")),
    body: [
      `  ${ansis.green("--lang, -l")} <lang>         ${i18n.t("cli:help.optionDescriptions.displayLanguage")} (zh-CN, en)`,
      `  ${ansis.green("--force, -f")}               ${i18n.t("cli:help.optionDescriptions.forceOverwrite")}`,
      `  ${ansis.green("--help, -h")}                ${i18n.t("cli:help.optionDescriptions.displayHelp")}`,
      `  ${ansis.green("--version, -v")}             ${i18n.t("cli:help.optionDescriptions.displayVersion")}`,
      "",
      ansis.gray(`  ${i18n.t("cli:help.nonInteractiveMode")}`),
      `  ${ansis.green("--skip-prompt, -s")}         ${i18n.t("cli:help.optionDescriptions.skipAllPrompts")}`,
      `  ${ansis.green("--frontend, -F")} <models>   ${i18n.t("cli:help.optionDescriptions.frontendModels")}`,
      `  ${ansis.green("--backend, -B")} <models>    ${i18n.t("cli:help.optionDescriptions.backendModels")}`,
      `  ${ansis.green("--mode, -m")} <mode>         ${i18n.t("cli:help.optionDescriptions.collaborationMode")}`,
      `  ${ansis.green("--workflows, -w")} <list>    ${i18n.t("cli:help.optionDescriptions.workflows")}`,
      `  ${ansis.green("--install-dir, -d")} <path>  ${i18n.t("cli:help.optionDescriptions.installDir")}`
    ].join("\n")
  });
  sections.push({
    title: ansis.yellow(i18n.t("cli:help.examples")),
    body: [
      ansis.gray(`  # ${i18n.t("cli:help.exampleDescriptions.showInteractiveMenu")}`),
      `  ${ansis.cyan("npx ccg")}`,
      "",
      ansis.gray(`  # ${i18n.t("cli:help.exampleDescriptions.runFullInitialization")}`),
      `  ${ansis.cyan("npx ccg init")}`,
      `  ${ansis.cyan("npx ccg i")}`,
      "",
      ansis.gray(`  # ${i18n.t("cli:help.exampleDescriptions.customModels")}`),
      `  ${ansis.cyan("npx ccg i --frontend gemini,codex --backend codex,gemini")}`,
      "",
      ansis.gray(`  # ${i18n.t("cli:help.exampleDescriptions.parallelMode")}`),
      `  ${ansis.cyan("npx ccg i --mode parallel")}`,
      ""
    ].join("\n")
  });
  return sections;
}
async function setupCommands(cli) {
  try {
    const config = await readCcgConfig();
    const defaultLang = config?.general?.language || "zh-CN";
    await initI18n(defaultLang);
  } catch {
    await initI18n("zh-CN");
  }
  cli.command("", "\u663E\u793A\u4EA4\u4E92\u5F0F\u83DC\u5355\uFF08\u9ED8\u8BA4\uFF09").option("--lang, -l <lang>", "\u663E\u793A\u8BED\u8A00 (zh-CN, en)").action(async (options) => {
    if (options.lang) {
      await initI18n(options.lang);
    }
    await showMainMenu();
  });
  cli.command("init", "\u521D\u59CB\u5316 CCG \u591A\u6A21\u578B\u534F\u4F5C\u7CFB\u7EDF").alias("i").option("--lang, -l <lang>", "\u663E\u793A\u8BED\u8A00 (zh-CN, en)").option("--force, -f", "\u5F3A\u5236\u8986\u76D6\u73B0\u6709\u914D\u7F6E").option("--skip-prompt, -s", "\u8DF3\u8FC7\u6240\u6709\u4EA4\u4E92\u5F0F\u63D0\u793A\uFF08\u975E\u4EA4\u4E92\u6A21\u5F0F\uFF09").option("--skip-mcp", "\u8DF3\u8FC7 MCP \u914D\u7F6E\uFF08\u66F4\u65B0\u65F6\u4F7F\u7528\uFF09").option("--frontend, -F <models>", "\u524D\u7AEF\u6A21\u578B\uFF08\u9017\u53F7\u5206\u9694: gemini,codex,claude\uFF09").option("--backend, -B <models>", "\u540E\u7AEF\u6A21\u578B\uFF08\u9017\u53F7\u5206\u9694: codex,gemini,claude\uFF09").option("--mode, -m <mode>", "\u534F\u4F5C\u6A21\u5F0F (parallel, smart, sequential)").option("--workflows, -w <workflows>", '\u8981\u5B89\u88C5\u7684\u5DE5\u4F5C\u6D41\uFF08\u9017\u53F7\u5206\u9694\u6216 "all"\uFF09').option("--install-dir, -d <path>", "\u5B89\u88C5\u76EE\u5F55\uFF08\u9ED8\u8BA4: ~/.claude\uFF09").action(async (options) => {
    if (options.lang) {
      await initI18n(options.lang);
    }
    await init(options);
  });
  cli.command("diagnose-mcp", "\u8BCA\u65AD MCP \u914D\u7F6E\u95EE\u9898").action(async () => {
    await diagnoseMcp();
  });
  cli.command("fix-mcp", "\u4FEE\u590D Windows MCP \u914D\u7F6E\u95EE\u9898").action(async () => {
    await fixMcp();
  });
  cli.command("config <subcommand>", "\u914D\u7F6E CCG \u8BBE\u7F6E").action(async (subcommand) => {
    if (subcommand === "mcp") {
      await configMcp();
    } else {
      console.log(ansis.red(`\u672A\u77E5\u5B50\u547D\u4EE4: ${subcommand}`));
      console.log(ansis.gray("\u53EF\u7528\u5B50\u547D\u4EE4: mcp"));
    }
  });
  cli.help((sections) => customizeHelp(sections));
  cli.version(version);
}

async function main() {
  const cli = cac("ccg");
  await setupCommands(cli);
  cli.parse();
}
main().catch(console.error);
