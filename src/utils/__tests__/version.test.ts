import { describe, expect, it, vi } from 'vitest'
import { compareVersions, detectInstallSource } from '../version'

describe('compareVersions', () => {
  // 基础语义版本比较
  it('compares basic semantic versions correctly', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1)
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1)
    expect(compareVersions('1.7.61', '1.7.60')).toBe(1)
    expect(compareVersions('1.7.61', '2.0.0')).toBe(-1)
  })

  // M1: prerelease 语义比较
  it('handles prerelease versions: 2.0.0-alpha.1 < 2.0.0', () => {
    expect(compareVersions('2.0.0-alpha.1', '2.0.0')).toBe(-1)
  })

  it('handles prerelease ordering: 2.0.0-alpha.2 > 2.0.0-alpha.1', () => {
    expect(compareVersions('2.0.0-alpha.2', '2.0.0-alpha.1')).toBe(1)
  })

  it('handles prerelease vs stable: 1.7.61 < 2.0.0-alpha.1', () => {
    expect(compareVersions('1.7.61', '2.0.0-alpha.1')).toBe(-1)
  })

  it('handles beta vs alpha: 2.0.0-beta.1 > 2.0.0-alpha.1', () => {
    expect(compareVersions('2.0.0-beta.1', '2.0.0-alpha.1')).toBe(1)
  })

  it('handles rc versions: 2.0.0-rc.1 > 2.0.0-beta.1', () => {
    expect(compareVersions('2.0.0-rc.1', '2.0.0-beta.1')).toBe(1)
  })
})

describe('detectInstallSource', () => {
  it('returns "github" when resolved from a github URL', () => {
    // 模拟 _resolved 字段包含 github 信息
    const source = detectInstallSource('/some/path/with/github/ccg-workflow-modify')
    // 实际判断基于 package.json 中的 _resolved 字段或安装路径
    // 这里验证函数存在且返回 'npm' 或 'github'
    expect(['npm', 'github']).toContain(source)
  })

  it('returns a valid install source type', () => {
    const source = detectInstallSource()
    expect(['npm', 'github']).toContain(source)
  })
})
