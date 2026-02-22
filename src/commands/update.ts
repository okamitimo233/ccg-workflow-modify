import type { CliTool, ModelRouting } from '../types'
import ansis from 'ansis'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import inquirer from 'inquirer'
import ora from 'ora'
import { homedir } from 'node:os'
import { join } from 'pathe'
import { checkForUpdates, compareVersions, detectInstallSource, getGitHubUpdateCommand } from '../utils/version'
import { uninstallWorkflows } from '../utils/installer'
import { readCcgConfig, writeCcgConfig } from '../utils/config'
import { migrateToV1_4_0, needsMigration } from '../utils/migration'
import { i18n } from '../i18n'

const execAsync = promisify(exec)

/**
 * Main update command - checks for updates and installs if available
 */
export async function update(): Promise<void> {
  console.log()
  console.log(ansis.cyan.bold('🔄 检查更新...'))
  console.log()

  const spinner = ora('正在检查最新版本...').start()

  try {
    const { hasUpdate, currentVersion, latestVersion, installSource } = await checkForUpdates()

    // Check if local workflow version differs from running version
    const config = await readCcgConfig()
    const localVersion = config?.general?.version || '0.0.0'
    const needsWorkflowUpdate = compareVersions(currentVersion, localVersion) > 0

    spinner.stop()

    if (!latestVersion) {
      const sourceHint = installSource === 'github'
        ? '无法连接到 GitHub，请检查网络连接或 gh CLI 是否可用'
        : '无法连接到 npm registry，请检查网络连接'
      console.log(ansis.red(`❌ ${sourceHint}`))
      return
    }

    console.log(`当前版本: ${ansis.yellow(`v${currentVersion}`)}`)
    console.log(`最新版本: ${ansis.green(`v${latestVersion}`)}`)
    console.log(`安装来源: ${ansis.gray(installSource)}`)
    if (localVersion !== '0.0.0') {
      console.log(`本地工作流: ${ansis.gray(`v${localVersion}`)}`)
    }
    console.log()

    // Determine effective update status
    const effectiveNeedsUpdate = hasUpdate || needsWorkflowUpdate
    let defaultConfirm = effectiveNeedsUpdate

    let message: string
    if (hasUpdate) {
      message = `发现新版本 v${latestVersion} (当前: v${currentVersion})，是否更新？`
      defaultConfirm = true
    }
    else if (needsWorkflowUpdate) {
      message = `检测到本地工作流版本 (v${localVersion}) 低于当前版本 (v${currentVersion})，是否更新？`
      defaultConfirm = true
    }
    else {
      message = `当前已是最新版本 (v${currentVersion})。是否强制重新安装/修复工作流？`
      defaultConfirm = false
    }

    const { confirmUpdate } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmUpdate',
      message,
      default: defaultConfirm,
    }])

    if (!confirmUpdate) {
      console.log(ansis.gray('已取消更新'))
      return
    }

    // Pass localVersion as fromVersion for accurate display
    const fromVersion = needsWorkflowUpdate ? localVersion : currentVersion
    await performUpdate(fromVersion, latestVersion || currentVersion, hasUpdate || needsWorkflowUpdate, installSource)
  }
  catch (error) {
    spinner.stop()
    console.log(ansis.red(`❌ 更新失败: ${error}`))
  }
}

/**
 * Ask user if they want to reconfigure model routing
 */
async function askReconfigureRouting(currentRouting?: ModelRouting): Promise<ModelRouting | null> {
  console.log()
  console.log(ansis.cyan.bold('🔧 模型路由配置'))
  console.log()

  if (currentRouting) {
    console.log(ansis.gray('当前配置:'))
    const frontendLabel = currentRouting.frontend.cli_tool || 'opencode'
    const backendLabel = currentRouting.backend.cli_tool || 'codex'
    console.log(`  ${ansis.cyan('前端工具:')} ${ansis.green(frontendLabel)}`)
    console.log(`  ${ansis.cyan('后端工具:')} ${ansis.blue(backendLabel)}`)
    console.log()
  }

  const { reconfigure } = await inquirer.prompt([{
    type: 'confirm',
    name: 'reconfigure',
    message: '是否重新配置前端和后端模型？',
    default: false,
  }])

  if (!reconfigure) {
    return null
  }

  console.log()

  // Frontend tool selection
  const { selectedFrontend } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selectedFrontend',
    message: i18n.t('init:selectFrontendModels'),
    choices: [
      { name: 'Gemini (opencode)', value: 'opencode' as CliTool, checked: currentRouting?.frontend.cli_tool === 'opencode' },
      { name: 'Codex', value: 'codex' as CliTool, checked: currentRouting?.frontend.cli_tool === 'codex' },
      { name: 'Gemini CLI', value: 'gemini-cli' as CliTool, checked: currentRouting?.frontend.cli_tool === 'gemini-cli' },
    ],
    validate: (answer: string[]) => answer.length > 0 || i18n.t('init:validation.selectAtLeastOne'),
  }])

  // Backend tool selection
  const { selectedBackend } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selectedBackend',
    message: i18n.t('init:selectBackendModels'),
    choices: [
      { name: 'Codex', value: 'codex' as CliTool, checked: currentRouting?.backend.cli_tool === 'codex' },
      { name: 'Gemini (opencode)', value: 'opencode' as CliTool, checked: currentRouting?.backend.cli_tool === 'opencode' },
      { name: 'Gemini CLI', value: 'gemini-cli' as CliTool, checked: currentRouting?.backend.cli_tool === 'gemini-cli' },
    ],
    validate: (answer: string[]) => answer.length > 0 || i18n.t('init:validation.selectAtLeastOne'),
  }])

  const frontendCliTool: CliTool = (selectedFrontend as CliTool[])[0] || 'opencode'
  const backendCliTool: CliTool = (selectedBackend as CliTool[])[0] || 'codex'

  // Build new routing config
  const newRouting: ModelRouting = {
    frontend: {
      cli_tool: frontendCliTool,
      model_id: frontendCliTool === 'opencode' ? 'antigravity/gemini-3-pro-high' : '',
      strategy: 'parallel',
    },
    backend: {
      cli_tool: backendCliTool,
      model_id: '',
      strategy: 'parallel',
    },
    review: {
      strategy: 'parallel',
    },
    mode: currentRouting?.mode || 'smart',
  }

  console.log()
  console.log(ansis.green('✓ 新配置:'))
  console.log(`  ${ansis.cyan('前端工具:')} ${ansis.green(frontendCliTool)}`)
  console.log(`  ${ansis.cyan('后端工具:')} ${ansis.blue(backendCliTool)}`)
  console.log()

  return newRouting
}

/**
 * Check if CCG is installed globally via npm
 */
async function checkIfGlobalInstall(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('npm list -g ccg-workflow-modify --depth=0', { timeout: 5000 })
    return stdout.includes('ccg-workflow-modify@')
  }
  catch {
    return false
  }
}

/**
 * Build the npx command based on install source
 */
function buildNpxCommand(installSource: 'npm' | 'github', args: string): string {
  if (installSource === 'github') {
    return `${getGitHubUpdateCommand()} ${args}`
  }
  return `npx --yes ccg-workflow-modify@latest ${args}`
}

/**
 * Perform the actual update process
 */
async function performUpdate(
  fromVersion: string,
  toVersion: string,
  isNewVersion: boolean,
  installSource: 'npm' | 'github' = detectInstallSource(),
): Promise<void> {
  console.log()
  console.log(ansis.yellow.bold('⚙️  开始更新...'))
  console.log()

  // Check if installed globally via npm
  const isGlobalInstall = await checkIfGlobalInstall()

  // If globally installed and only workflow needs update (package is already latest)
  if (isGlobalInstall && !isNewVersion) {
    console.log(ansis.cyan('ℹ️  检测到你是通过 npm 全局安装的'))
    console.log()
    console.log(ansis.green('✓ 当前包版本已是最新 (v' + toVersion + ')'))
    console.log(ansis.yellow('⚙️  仅需更新工作流文件'))
    console.log()
    // Continue to update workflows only
  }
  else if (isGlobalInstall && isNewVersion) {
    console.log(ansis.yellow('⚠️  检测到你是通过 npm 全局安装的'))
    console.log()
    console.log('推荐的更新方式：')
    console.log()

    if (installSource === 'github') {
      console.log(ansis.cyan(`  npm install -g github:okamitimo233/ccg-workflow-modify`))
    }
    else {
      console.log(ansis.cyan('  npm install -g ccg-workflow-modify@latest'))
    }

    console.log()
    console.log(ansis.gray('这将同时更新命令和工作流文件'))
    console.log()

    const { useNpmUpdate } = await inquirer.prompt([{
      type: 'confirm',
      name: 'useNpmUpdate',
      message: '改用 npm 更新（推荐）？',
      default: true,
    }])

    if (useNpmUpdate) {
      console.log()
      console.log(ansis.cyan('请在新的终端窗口中运行：'))
      console.log()

      if (installSource === 'github') {
        console.log(ansis.cyan.bold('  npm install -g github:okamitimo233/ccg-workflow-modify'))
      }
      else {
        console.log(ansis.cyan.bold('  npm install -g ccg-workflow-modify@latest'))
      }

      console.log()
      console.log(ansis.gray('(运行完成后，当前版本将自动更新)'))
      console.log()
      return
    }

    console.log()
    console.log(ansis.yellow('⚠️  继续使用内置更新（仅更新工作流文件）'))
    console.log(ansis.gray('注意：这不会更新 ccg 命令本身'))
    console.log()
  }

  // Step 1: Download latest package (force fresh download)
  let spinner = ora('正在下载最新版本...').start()

  try {
    // Clear npx cache first to ensure we get the latest version
    if (process.platform === 'win32') {
      spinner.text = '正在清理 npx 缓存...'
      try {
        await execAsync('npx clear-npx-cache', { timeout: 10000 })
      }
      catch {
        const npxCachePath = join(homedir(), '.npm', '_npx')
        try {
          const fs = await import('fs-extra')
          await fs.remove(npxCachePath)
        }
        catch {
          // Cache clearing failed, but continue anyway
        }
      }
    }

    spinner.text = '正在下载最新版本...'
    // C1: 按安装源分流下载命令
    const versionCheckCmd = buildNpxCommand(installSource, '--version')
    await execAsync(versionCheckCmd, { timeout: 60000 })
    spinner.succeed('最新版本下载完成')
  }
  catch (error) {
    spinner.fail('下载最新版本失败')
    console.log(ansis.red(`错误: ${error}`))

    // C1.5: 区分错误提示
    if (installSource === 'github') {
      console.log()
      console.log(ansis.yellow('提示: GitHub 安装源下载失败，可能原因:'))
      console.log(ansis.gray('  • 网络无法访问 GitHub'))
      console.log(ansis.gray('  • 仓库不存在或分支名错误'))
      console.log(ansis.gray(`  • 请尝试手动运行: ${getGitHubUpdateCommand()}`))
    }
    else {
      console.log()
      console.log(ansis.yellow('提示: npm 源下载失败，可能原因:'))
      console.log(ansis.gray('  • 包尚未发布到 npm registry'))
      console.log(ansis.gray('  • 网络无法访问 npm registry'))
      console.log(ansis.gray(`  • 请尝试 GitHub 安装: ${getGitHubUpdateCommand()}`))
    }
    return
  }

  // Step 2: Auto-migrate from old directory structure (if needed)
  if (await needsMigration()) {
    spinner = ora('检测到旧版本配置，正在迁移...').start()
    const migrationResult = await migrateToV1_4_0()

    if (migrationResult.migratedFiles.length > 0) {
      spinner.info(ansis.cyan('配置迁移完成:'))
      console.log()
      for (const file of migrationResult.migratedFiles) {
        console.log(`  ${ansis.green('✓')} ${file}`)
      }
      if (migrationResult.skipped.length > 0) {
        console.log()
        console.log(ansis.gray('  已跳过:'))
        for (const file of migrationResult.skipped) {
          console.log(`  ${ansis.gray('○')} ${file}`)
        }
      }
      console.log()
    }

    if (migrationResult.errors.length > 0) {
      spinner.warn(ansis.yellow('迁移完成，但有部分错误:'))
      for (const error of migrationResult.errors) {
        console.log(`  ${ansis.red('✗')} ${error}`)
      }
      console.log()
    }
  }

  // Step 3: Delete old workflows first
  spinner = ora('正在删除旧工作流...').start()

  try {
    const installDir = join(homedir(), '.claude')
    const uninstallResult = await uninstallWorkflows(installDir)

    if (uninstallResult.success) {
      spinner.succeed('旧工作流已删除')
    }
    else {
      spinner.warn('部分文件删除失败，继续安装...')
      for (const error of uninstallResult.errors) {
        console.log(ansis.yellow(`  • ${error}`))
      }
    }
  }
  catch (error) {
    spinner.warn(`删除旧工作流时出错: ${error}，继续安装...`)
  }

  // Step 4: Install new workflows using the latest version
  // C1: 按安装源分流 init 命令
  spinner = ora('正在安装新版本工作流和二进制...').start()

  try {
    const initCmd = buildNpxCommand(installSource, 'init --force --skip-mcp --skip-prompt')
    await execAsync(initCmd, {
      timeout: 120000,
      env: {
        ...process.env,
        CCG_UPDATE_MODE: 'true',
      },
    })
    spinner.succeed('新版本安装成功')

    // Read updated config to display installed commands
    const config = await readCcgConfig()
    if (config?.workflows?.installed) {
      console.log()
      console.log(ansis.cyan(`已安装 ${config.workflows.installed.length} 个命令:`))
      for (const cmd of config.workflows.installed) {
        console.log(`  ${ansis.gray('•')} /ccg:${cmd}`)
      }
    }
  }
  catch (error) {
    spinner.fail('安装新版本失败')
    console.log(ansis.red(`错误: ${error}`))
    console.log()

    // C1.5: 按安装源提供恢复建议
    if (installSource === 'github') {
      console.log(ansis.yellow('请尝试手动运行:'))
      console.log(ansis.cyan(`  ${getGitHubUpdateCommand()}`))
    }
    else {
      console.log(ansis.yellow('请尝试手动运行:'))
      console.log(ansis.cyan('  npx ccg-workflow-modify@latest'))
    }
    return
  }

  console.log()
  console.log(ansis.green.bold('✅ 更新完成！'))
  console.log()
  if (isNewVersion) {
    console.log(ansis.gray(`从 v${fromVersion} 升级到 v${toVersion}`))
  }
  else {
    console.log(ansis.gray(`重新安装了 v${toVersion}`))
  }
  console.log()
}
