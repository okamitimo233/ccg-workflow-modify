import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'fs-extra'
import { dirname, join } from 'pathe'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

const execAsync = promisify(exec)

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// GitHub 仓库信息
const GITHUB_OWNER = 'okamitimo233'
const GITHUB_REPO = 'ccg-workflow-modify'
const GITHUB_DEFAULT_BRANCH = 'main'

// Find package root by looking for package.json
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

/**
 * Detect install source: 'npm' or 'github'
 *
 * 判断逻辑：
 * 1. 检查 package.json 中的 _resolved 字段（npm 安装时自动写入）
 * 2. 检查 node_modules 目录结构特征
 * 3. 检查安装路径是否包含 github 相关标识
 */
export function detectInstallSource(packageRoot?: string): 'npm' | 'github' {
  const root = packageRoot || PACKAGE_ROOT
  try {
    const pkgPath = join(root, 'package.json')
    if (fs.existsSync(pkgPath)) {
      const pkg = fs.readJSONSync(pkgPath)

      // npm 安装会设置 _resolved 指向 registry
      if (typeof pkg._resolved === 'string') {
        if (pkg._resolved.includes('registry.npmjs.org') || pkg._resolved.includes('registry.npmmirror.com')) {
          return 'npm'
        }
        if (pkg._resolved.includes('github.com') || pkg._resolved.includes('codeload.github.com')) {
          return 'github'
        }
      }

      // 检查 _from 字段（npm 5+ 在 package-lock.json 中）
      if (typeof pkg._from === 'string') {
        if (pkg._from.includes('github:') || pkg._from.includes('github.com')) {
          return 'github'
        }
      }
    }

    // 检查安装路径特征
    const normalizedRoot = root.replace(/\\/g, '/')
    if (normalizedRoot.includes('/_npx/') || normalizedRoot.includes('\\_npx\\')) {
      // npx 缓存路径 — 可能是 npm 或 github，进一步检查
      // 若上面的 _resolved 检查没命中，默认按 github（因为 npm 未发布）
      return 'github'
    }
  }
  catch {
    // 读取失败时保守返回 github（因为项目当前按 GitHub 分发）
  }

  // 默认返回 github（当前项目通过 GitHub 直装分发）
  return 'github'
}

/**
 * Get current installed version from package.json
 */
export async function getCurrentVersion(): Promise<string> {
  try {
    const pkgPath = join(PACKAGE_ROOT, 'package.json')
    const pkg = await fs.readJSON(pkgPath)
    return pkg.version || '0.0.0'
  }
  catch {
    return '0.0.0'
  }
}

/**
 * Get latest version — 根据安装源自动选择获取方式
 *
 * - npm 安装：通过 `npm view` 查询 registry
 * - GitHub 安装：通过 GitHub API 读取远程 package.json 中的 version
 */
export async function getLatestVersion(
  packageName = 'ccg-workflow-modify',
  branch = GITHUB_DEFAULT_BRANCH,
): Promise<string | null> {
  const source = detectInstallSource()

  if (source === 'npm') {
    return getLatestVersionFromNpm(packageName)
  }
  return getLatestVersionFromGitHub(branch)
}

/**
 * 从 npm registry 获取最新版本
 */
async function getLatestVersionFromNpm(packageName: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`npm view ${packageName} version`, { timeout: 15000 })
    return stdout.trim() || null
  }
  catch {
    return null
  }
}

/**
 * 从 GitHub 仓库获取最新版本
 * 通过 GitHub API 读取指定分支的 package.json
 */
async function getLatestVersionFromGitHub(branch: string): Promise<string | null> {
  try {
    // 优先尝试 gh CLI（已认证，无速率限制）
    const { stdout } = await execAsync(
      `gh api repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/package.json?ref=${branch} --jq '.content'`,
      { timeout: 15000 },
    )

    const decoded = Buffer.from(stdout.trim(), 'base64').toString('utf-8')
    const pkg = JSON.parse(decoded)
    return pkg.version || null
  }
  catch {
    // gh CLI 不可用时，回退到 raw URL（可能受速率限制）
    try {
      const { stdout } = await execAsync(
        `curl -sL "https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${branch}/package.json"`,
        { timeout: 15000 },
      )
      const pkg = JSON.parse(stdout)
      return pkg.version || null
    }
    catch {
      return null
    }
  }
}

/**
 * Compare two semantic versions (supports prerelease tags)
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1: string, v2: string): number {
  const result = semver.compare(v1, v2)
  return result
}

/**
 * Check if update is available
 */
export async function checkForUpdates(branch?: string): Promise<{
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string | null
  installSource: 'npm' | 'github'
}> {
  const currentVersion = await getCurrentVersion()
  const installSource = detectInstallSource()
  const latestVersion = await getLatestVersion('ccg-workflow-modify', branch || GITHUB_DEFAULT_BRANCH)

  if (!latestVersion) {
    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: null,
      installSource,
    }
  }

  const hasUpdate = compareVersions(latestVersion, currentVersion) > 0

  return {
    hasUpdate,
    currentVersion,
    latestVersion,
    installSource,
  }
}

/**
 * Get GitHub update command for the given branch
 */
export function getGitHubUpdateCommand(branch = GITHUB_DEFAULT_BRANCH): string {
  return `npx github:${GITHUB_OWNER}/${GITHUB_REPO}#${branch}`
}

/**
 * Get changelog between two versions (simplified)
 */
export async function getChangelog(fromVersion: string, toVersion: string): Promise<string[]> {
  // In a real implementation, this would fetch from CHANGELOG.md or GitHub releases
  // For now, return a placeholder
  return [
    `升级从 v${fromVersion} 到 v${toVersion}`,
    '• 优化命令模板',
    '• 更新专家提示词',
    '• 修复已知问题',
  ]
}
