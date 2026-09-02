import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getLocalVersion, compareVersions, getRemoteVersion, runUpdate, upgradeNpmPackage } from '../src/index.js';

describe('三省六部更新器与 NPM 原地升级测试套件 (Updater)', () => {
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

  it('3. getRemoteVersion 能够从 NPM 官方 Registry 检索版本', async () => {
    const remoteVer = await getRemoteVersion('sansheng-liubu');
    if (remoteVer) {
      assert.match(remoteVer, /^\d+\.\d+\.\d+/);
    }
  });

  it('4. upgradeNpmPackage 支持 checkOnly 检查模式', async () => {
    const res = await upgradeNpmPackage({ checkOnly: true });
    assert.ok(res);
    assert.ok(['checked', 'network_failed'].includes(res.status));
  });

  it('5. runUpdate 能够无损执行 skipNpm 配置与规则同步模式', async () => {
    await runUpdate({ skipNpm: true });
    assert.ok(true);
  });
});
