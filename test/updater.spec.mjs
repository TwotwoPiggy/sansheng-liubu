import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import {
  getLocalVersion,
  compareVersions,
  getRemoteVersion,
  detectInstallMode,
  parseUpdateOptions,
  runUpdate,
  upgradeNpmPackage,
  upgradeGitPackage,
  syncGlobalSkills,
  collectBuiltinSkills,
} from '../src/index.js';

function gitExec(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
    windowsHide: true,
  }).trim();
}

describe('三省六部更新器、Git/NPM 双模式升级与全局 Skills 同步测试套件 (Updater)', () => {
  const tempDirs = [];
  const makeTmp = (prefix) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  };

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  it('1. getLocalVersion 能够准确读取当前 package.json 版本号', () => {
    const version = getLocalVersion();
    assert.ok(typeof version === 'string');
    assert.match(version, /^\d+\.\d+\.\d+/);
  });

  it('2. compareVersions 语义化版本比对函数测试', () => {
    assert.strictEqual(compareVersions('1.2.1', '1.2.0'), 1);
    assert.strictEqual(compareVersions('2.0.0', '1.9.9'), 1);
    assert.strictEqual(compareVersions('1.2.0', '1.2.0'), 0);
    assert.strictEqual(compareVersions('v1.2.0', '1.2.0'), 0);
    assert.strictEqual(compareVersions('1.1.9', '1.2.0'), -1);
    assert.strictEqual(compareVersions('1.2.0-beta.1', '1.2.0'), 0);
  });

  it('3. detectInstallMode 与 parseUpdateOptions 参数解析准确', () => {
    const gitDir = makeTmp('sansheng-git-mode-');
    fs.mkdirSync(path.join(gitDir, '.git'));
    const npmDir = makeTmp('sansheng-npm-mode-');

    assert.strictEqual(detectInstallMode(gitDir), 'git');
    assert.strictEqual(detectInstallMode(npmDir), 'npm');

    const opts = parseUpdateOptions([
      'v1.5.0',
      '--check',
      '--force',
      '--skip-skills',
      '--skip-workspace',
      '--mode', 'git',
      '--runtimes', 'antigravity,claude',
      '--json',
    ]);
    assert.strictEqual(opts.targetVersion, 'v1.5.0');
    assert.strictEqual(opts.checkOnly, true);
    assert.strictEqual(opts.force, true);
    assert.strictEqual(opts.skipSkills, true);
    assert.strictEqual(opts.skipWorkspace, true);
    assert.strictEqual(opts.mode, 'git');
    assert.deepStrictEqual(opts.runtimes, ['antigravity', 'claude']);
    assert.strictEqual(opts.json, true);
    assert.strictEqual(opts.silent, true);
  });

  it('4. getRemoteVersion 与 upgradeNpmPackage 支持 checkOnly 检查模式', async () => {
    const remoteVer = await getRemoteVersion('sansheng-liubu');
    if (remoteVer) {
      assert.match(remoteVer, /^\d+\.\d+\.\d+/);
    }

    const res = await upgradeNpmPackage({ checkOnly: true, silent: true });
    assert.ok(res);
    assert.strictEqual(res.mode, 'npm');
    assert.ok(['checked', 'network_failed'].includes(res.status));
  });

  it('5. syncGlobalSkills 能够自动探测多 AI 运行时、同步全套 4 个 Skills 并保持幂等', () => {
    const fakeHome = makeTmp('sansheng-fake-home-');
    fs.mkdirSync(path.join(fakeHome, '.gemini', 'antigravity'), { recursive: true });
    fs.mkdirSync(path.join(fakeHome, '.claude'), { recursive: true });

    const builtin = collectBuiltinSkills();
    const skillNames = builtin.map(s => s.name);
    assert.ok(skillNames.includes('sansheng-liubu'));
    assert.ok(skillNames.includes('sansheng-recall'));
    assert.ok(skillNames.includes('sansheng-worker'));
    assert.ok(skillNames.includes('sansheng-update'));

    const first = syncGlobalSkills({ homeDir: fakeHome, silent: true });
    assert.strictEqual(first.success, true);
    assert.deepStrictEqual(first.detectedRuntimes.sort(), ['antigravity', 'claude']);
    assert.strictEqual(first.updatedFiles.length, builtin.length * 2);
    assert.ok(fs.existsSync(path.join(fakeHome, '.gemini', 'antigravity', 'skills', 'sansheng-update', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(fakeHome, '.claude', 'skills', 'sansheng-liubu', 'SKILL.md')));
    // 未安装的运行时目录不应被创建
    assert.strictEqual(fs.existsSync(path.join(fakeHome, '.cursor')), false);

    // 二次同步幂等：无文件重写
    const second = syncGlobalSkills({ homeDir: fakeHome, silent: true });
    assert.strictEqual(second.success, true);
    assert.strictEqual(second.updatedFiles.length, 0);
    assert.strictEqual(second.unchangedFiles.length, builtin.length * 2);
  });

  it('6. runUpdate 在非三省工作区下默认跳过工作区文件写入，避免污染无关目录', async () => {
    const emptyDir = makeTmp('sansheng-empty-cwd-');
    const fakeHome = makeTmp('sansheng-empty-home-');
    fs.mkdirSync(path.join(fakeHome, '.gemini', 'antigravity'), { recursive: true });

    const res = await runUpdate({
      skipNpm: true,
      cwd: emptyDir,
      homeDir: fakeHome,
      silent: true,
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.workspaceSynced, false);
    assert.strictEqual(fs.existsSync(path.join(emptyDir, '.sansheng')), false);
    assert.strictEqual(fs.existsSync(path.join(emptyDir, '.vscode')), false);
    assert.ok(res.skillsResult.updatedFiles.length >= 4);
  });

  it('7. Git 仓库模式支持检测远端更新、拉取升级、指定 Tag 切换、脏工作区拦截与非法引用防护', async () => {
    const bareDir = makeTmp('sansheng-bare-');
    const workSeed = makeTmp('sansheng-seed-');
    const localClone = makeTmp('sansheng-clone-');
    const fakeHome = makeTmp('sansheng-git-home-');
    fs.mkdirSync(path.join(fakeHome, '.gemini', 'antigravity'), { recursive: true });

    // 初始化 bare 远端与初始版本 v1.0.0
    gitExec(['init', '--bare'], bareDir);
    gitExec(['symbolic-ref', 'HEAD', 'refs/heads/main'], bareDir);
    gitExec(['init'], workSeed);
    gitExec(['config', 'user.email', 'test@sansheng.local'], workSeed);
    gitExec(['config', 'user.name', 'Sansheng Test'], workSeed);
    gitExec(['checkout', '-b', 'main'], workSeed);

    fs.writeFileSync(path.join(workSeed, 'package.json'), JSON.stringify({ name: 'sansheng-liubu', version: '1.0.0' }, null, 2));
    fs.writeFileSync(path.join(workSeed, 'SKILL.md'), '# v1.0.0 skill\n');
    gitExec(['add', '.'], workSeed);
    gitExec(['commit', '-m', 'chore: init v1.0.0'], workSeed);
    gitExec(['tag', 'v1.0.0'], workSeed);
    gitExec(['remote', 'add', 'origin', bareDir], workSeed);
    gitExec(['push', '-u', 'origin', 'main', '--tags'], workSeed);

    // 克隆本地仓库
    gitExec(['clone', bareDir, localClone], path.dirname(localClone));
    gitExec(['config', 'user.email', 'test@sansheng.local'], localClone);
    gitExec(['config', 'user.name', 'Sansheng Test'], localClone);
    gitExec(['checkout', 'main'], localClone);

    // 远端推进到 v1.1.0
    fs.writeFileSync(path.join(workSeed, 'package.json'), JSON.stringify({ name: 'sansheng-liubu', version: '1.1.0' }, null, 2));
    fs.writeFileSync(path.join(workSeed, 'SKILL.md'), '# v1.1.0 updated skill\n');
    gitExec(['add', '.'], workSeed);
    gitExec(['commit', '-m', 'feat: release v1.1.0'], workSeed);
    gitExec(['tag', 'v1.1.0'], workSeed);
    gitExec(['push', 'origin', 'main', '--tags'], workSeed);

    // 7.1 非法引用防护
    const invalidRes = await upgradeGitPackage({
      packageRoot: localClone,
      targetVersion: 'main;rm -rf /',
      silent: true,
    });
    assert.strictEqual(invalidRes.status, 'invalid_target');

    // 7.2 checkOnly 模式仅探测不修改本地
    const checkRes = await upgradeGitPackage({
      packageRoot: localClone,
      checkOnly: true,
      silent: true,
    });
    assert.strictEqual(checkRes.status, 'checked');
    assert.strictEqual(checkRes.hasNewerVersion, true);
    assert.strictEqual(checkRes.behindCount, 1);
    assert.strictEqual(getLocalVersion(localClone), '1.0.0');

    // 7.3 脏工作区安全拦截
    fs.writeFileSync(path.join(localClone, 'SKILL.md'), '# dirty local edit\n');
    const dirtyRes = await upgradeGitPackage({
      packageRoot: localClone,
      silent: true,
    });
    assert.strictEqual(dirtyRes.status, 'dirty_worktree');
    // 清理脏修改
    gitExec(['checkout', '--', 'SKILL.md'], localClone);

    // 7.4 完整 runUpdate：自动拉取 v1.1.0 并将新版 SKILL.md 重注入全局运行时
    const updateRes = await runUpdate({
      packageRoot: localClone,
      cwd: localClone,
      homeDir: fakeHome,
      skipWorkspace: true,
      skipInstall: true,
      silent: true,
    });
    assert.strictEqual(updateRes.success, true);
    assert.strictEqual(updateRes.mode, 'git');
    assert.strictEqual(updateRes.previousVersion, '1.0.0');
    assert.strictEqual(updateRes.currentVersion, '1.1.0');
    const syncedSkill = fs.readFileSync(
      path.join(fakeHome, '.gemini', 'antigravity', 'skills', 'sansheng-liubu', 'SKILL.md'),
      'utf-8'
    );
    assert.ok(syncedSkill.includes('v1.1.0 updated skill'));

    // 7.5 指定 Tag 切换到 v1.0.0
    const tagRes = await upgradeGitPackage({
      packageRoot: localClone,
      targetVersion: 'v1.0.0',
      skipInstall: true,
      silent: true,
    });
    assert.strictEqual(tagRes.status, 'success');
    assert.strictEqual(tagRes.newVersion, '1.0.0');
  });
});
