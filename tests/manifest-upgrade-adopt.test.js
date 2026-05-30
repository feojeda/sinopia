const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const installer = require('../lib/installer');
const agentAdapters = require('../lib/agent-adapters');

const tempBase = path.resolve(__dirname, './temp-p4');

function makeTempDir(name) {
  const dir = path.join(tempBase, name);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function run() {
  const originalCwd = process.cwd();

  try {
    console.log('  - Test 1: Manifest v1 migrates to v2 on upgrade...');
    const t1 = makeTempDir('t1-migration');
    process.chdir(t1);

    await installer.init({ frameworkVersion: '1.0.0' });

    const v1Manifest = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    assert.strictEqual(v1Manifest.schemaVersion, 2, 'Init should now write v2');

    const v1Style = {
      schemaVersion: 1,
      frameworkVersion: '1.0.0',
      installedAt: '2026-01-01T00:00:00.000Z',
      files: v1Manifest.files,
      agents: {}
    };
    fs.writeFileSync('.gsd-canva/manifest.json', JSON.stringify(v1Style, null, 2), 'utf8');

    const upResult = await installer.upgrade({ frameworkVersion: '1.3.0' });
    assert.strictEqual(upResult.upgraded, true);
    assert.strictEqual(upResult.schemaVersion, 2, 'Upgrade should migrate to v2');

    const migrated = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    assert.strictEqual(migrated.schemaVersion, 2);
    assert.ok(migrated.agents, 'Migrated manifest should have agents section');
    process.chdir(originalCwd);

    console.log('  - Test 2: Fresh init --agent antigravity writes v2 with agent records...');
    const t2 = makeTempDir('t2-fresh-ag');
    process.chdir(t2);

    const initAg = await installer.init({ agent: 'antigravity', frameworkVersion: '1.3.0' });
    assert.strictEqual(initAg.schemaVersion, 2);
    assert.strictEqual(initAg.agentsInstalled.antigravity.count, 4);
    assert.strictEqual(initAg.agentSkillsInstalled, 4);
    assert.strictEqual(initAg.agentTarget, '.agents/skills');

    const m2 = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    assert.strictEqual(m2.schemaVersion, 2);
    assert.ok(m2.agents.antigravity);
    assert.strictEqual(m2.agents.antigravity.adapter, 'antigravity-skill-v1');
    assert.strictEqual(m2.agents.antigravity.files.length, 4);
    assert.ok(
      m2.agents.antigravity.files.every(f => f.target.startsWith('.agents/skills/')),
      'All antigravity files should be under .agents/skills/'
    );
    process.chdir(originalCwd);

    console.log('  - Test 3: Fresh init --agent codex, opencode, and all write correct records...');
    const t3a = makeTempDir('t3-codex');
    process.chdir(t3a);
    const codexRes = await installer.init({ agent: 'codex', frameworkVersion: '1.3.0' });
    assert.strictEqual(codexRes.agentsInstalled.codex.count, 4);
    assert.strictEqual(codexRes.agentSkillsInstalled, undefined);
    const m3a = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    assert.strictEqual(m3a.schemaVersion, 2);
    assert.ok(m3a.agents.codex);
    assert.strictEqual(m3a.agents.codex.adapter, 'codex-command-v1');
    process.chdir(originalCwd);

    const t3b = makeTempDir('t3-opencode');
    process.chdir(t3b);
    const ocRes = await installer.init({ agent: 'opencode', frameworkVersion: '1.3.0' });
    assert.strictEqual(ocRes.agentsInstalled.opencode.count, 4);
    const m3b = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    assert.strictEqual(m3b.schemaVersion, 2);
    assert.ok(m3b.agents.opencode);
    assert.strictEqual(m3b.agents.opencode.adapter, 'opencode-command-v1');
    process.chdir(originalCwd);

    const t3c = makeTempDir('t3-all');
    process.chdir(t3c);
    const allRes = await installer.init({ agent: 'all', frameworkVersion: '1.3.0' });
    assert.strictEqual(allRes.agentsInstalled.antigravity.count, 4);
    assert.strictEqual(allRes.agentsInstalled.codex.count, 4);
    assert.strictEqual(allRes.agentsInstalled.opencode.count, 4);
    assert.strictEqual(allRes.agentSkillsInstalled, 4);
    assert.strictEqual(allRes.agentTarget, '.agents/skills');
    const m3c = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    assert.strictEqual(m3c.schemaVersion, 2);
    assert.ok(m3c.agents.antigravity);
    assert.ok(m3c.agents.codex);
    assert.ok(m3c.agents.opencode);
    assert.strictEqual(m3c.agents.antigravity.files.length, 4);
    assert.strictEqual(m3c.agents.codex.files.length, 4);
    assert.strictEqual(m3c.agents.opencode.files.length, 4);

    const flatAgentFiles = m3c.files.filter(f =>
      f.target.startsWith('.agents/') || f.target.startsWith('.codex/') || f.target.startsWith('.opencode/')
    );
    assert.strictEqual(flatAgentFiles.length, 12, 'Flat files should have 12 agent entries');
    process.chdir(originalCwd);

    console.log('  - Test 4: Upgrade regenerates managed Antigravity skills...');
    const t4 = makeTempDir('t4-upgrade-ag');
    process.chdir(t4);

    await installer.init({ agent: 'antigravity', frameworkVersion: '1.3.0' });

    const skillPath = path.join(t4, '.agents/skills/canva-mockup/SKILL.md');
    const originalContent = fs.readFileSync(skillPath, 'utf8');
    fs.writeFileSync(skillPath, originalContent + '\n<!-- USER EDIT -->', 'utf8');

    const upAg = await installer.upgrade({ frameworkVersion: '1.3.1' });
    assert.strictEqual(upAg.upgraded, true);
    assert.strictEqual(upAg.schemaVersion, 2);

    const regenerated = fs.readFileSync(skillPath, 'utf8');
    assert.ok(!regenerated.includes('USER EDIT'), 'Upgrade should regenerate skill from source');

    const backupFiles = upAg.backupsCreated.filter(b => b.includes('canva-mockup'));
    assert.ok(backupFiles.length >= 1, 'Should create backup for modified managed skill');
    assert.ok(fs.existsSync(backupFiles[0]), 'Backup file should exist on disk');

    const upManifest = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    const mockupEntry = upManifest.agents.antigravity.files.find(
      f => f.target === '.agents/skills/canva-mockup/SKILL.md'
    );
    assert.ok(mockupEntry, 'Skill entry should persist after upgrade');
    const newHash = crypto.createHash('sha256').update(regenerated).digest('hex');
    assert.strictEqual(mockupEntry.sha256, newHash, 'Manifest hash should match regenerated content');
    process.chdir(originalCwd);

    console.log('  - Test 5: Upgrade regenerates Codex/OpenCode when installed...');
    const t5 = makeTempDir('t5-upgrade-codex');
    process.chdir(t5);

    await installer.init({ agent: 'codex', frameworkVersion: '1.3.0' });

    const cmdPath = path.join(t5, '.codex/commands/canva-mockup.md');
    const origCmd = fs.readFileSync(cmdPath, 'utf8');
    fs.writeFileSync(cmdPath, origCmd + '\n<!-- LOCAL MOD -->', 'utf8');

    const upCodex = await installer.upgrade({ frameworkVersion: '1.3.1' });
    assert.strictEqual(upCodex.upgraded, true);

    const regenCmd = fs.readFileSync(cmdPath, 'utf8');
    assert.ok(!regenCmd.includes('LOCAL MOD'), 'Upgrade should regenerate codex command');

    const cmdBackups = upCodex.backupsCreated.filter(b => b.includes('canva-mockup'));
    assert.ok(cmdBackups.length >= 1, 'Should create backup for modified codex command');
    process.chdir(originalCwd);

    const t5b = makeTempDir('t5-upgrade-opencode');
    process.chdir(t5b);
    await installer.init({ agent: 'opencode', frameworkVersion: '1.3.0' });
    const ocPath = path.join(t5b, '.opencode/commands/canva-mockup.md');
    const origOc = fs.readFileSync(ocPath, 'utf8');
    fs.writeFileSync(ocPath, origOc + '\n<!-- OC MOD -->', 'utf8');

    const upOc = await installer.upgrade({ frameworkVersion: '1.3.1' });
    const regenOc = fs.readFileSync(ocPath, 'utf8');
    assert.ok(!regenOc.includes('OC MOD'), 'Upgrade should regenerate opencode command');
    process.chdir(originalCwd);

    console.log('  - Test 6: Locally modified managed file is protected with backup...');
    const t6 = makeTempDir('t6-backup-protect');
    process.chdir(t6);

    await installer.init({ agent: 'antigravity', frameworkVersion: '1.3.0' });

    const skill6 = path.join(t6, '.agents/skills/canva-mockup/SKILL.md');
    fs.writeFileSync(skill6, '---\nname: canva-mockup\n---\nCustom user content.', 'utf8');

    const up6 = await installer.upgrade({ frameworkVersion: '1.3.1' });
    const backup6 = up6.backupsCreated.find(b => b.includes('canva-mockup'));
    assert.ok(backup6, 'Should create backup before overwriting modified managed file');
    assert.ok(fs.existsSync(backup6), 'Backup file should exist');

    const backupContent = fs.readFileSync(backup6, 'utf8');
    assert.ok(backupContent.includes('Custom user content'), 'Backup should contain user content');
    process.chdir(originalCwd);

    console.log('  - Test 7: --adopt registers existing artifacts without overwriting content...');
    const t7 = makeTempDir('t7-adopt');
    process.chdir(t7);

    const caps = agentAdapters.loadAllCapabilities();
    const skillDirs = ['.agents/skills', '.codex/commands', '.opencode/commands'];
    for (const dir of skillDirs) {
      fs.mkdirSync(path.join(t7, dir), { recursive: true });
    }

    for (const cap of caps) {
      const agDir = path.join(t7, '.agents/skills', cap.capability.id);
      fs.mkdirSync(agDir, { recursive: true });
      fs.writeFileSync(
        path.join(agDir, 'SKILL.md'),
        `---\nname: ${cap.capability.id}\n---\nUser-authored ${cap.capability.id} content.`,
        'utf8'
      );

      fs.writeFileSync(
        path.join(t7, '.codex/commands', `${cap.capability.id}.md`),
        `# User Codex: ${cap.capability.id}\nUser content.`,
        'utf8'
      );

      fs.writeFileSync(
        path.join(t7, '.opencode/commands', `${cap.capability.id}.md`),
        `---\ndescription: user ${cap.capability.id}\n---\n# User OpenCode: ${cap.capability.id}`,
        'utf8'
      );
    }

    const adoptRes = await installer.init({
      adopt: true,
      agent: 'all',
      frameworkVersion: '1.3.0'
    });
    assert.strictEqual(adoptRes.initialized, true);
    assert.strictEqual(adoptRes.agentsInstalled.antigravity.count, 4);
    assert.strictEqual(adoptRes.agentsInstalled.codex.count, 4);
    assert.strictEqual(adoptRes.agentsInstalled.opencode.count, 4);

    for (const cap of caps) {
      const agContent = fs.readFileSync(
        path.join(t7, '.agents/skills', cap.capability.id, 'SKILL.md'), 'utf8'
      );
      assert.ok(agContent.includes('User-authored'), `Adopt should preserve ${cap.capability.id} antigravity content`);

      const codexContent = fs.readFileSync(
        path.join(t7, '.codex/commands', `${cap.capability.id}.md`), 'utf8'
      );
      assert.ok(codexContent.includes('User Codex'), `Adopt should preserve ${cap.capability.id} codex content`);

      const ocContent = fs.readFileSync(
        path.join(t7, '.opencode/commands', `${cap.capability.id}.md`), 'utf8'
      );
      assert.ok(ocContent.includes('User OpenCode'), `Adopt should preserve ${cap.capability.id} opencode content`);
    }

    const adoptManifest = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    assert.strictEqual(adoptManifest.schemaVersion, 2);
    assert.strictEqual(adoptManifest.agents.antigravity.files.length, 4);
    assert.strictEqual(adoptManifest.agents.codex.files.length, 4);
    assert.strictEqual(adoptManifest.agents.opencode.files.length, 4);
    for (const f of adoptManifest.agents.antigravity.files) {
      assert.strictEqual(f.managed, true, `Adopted file ${f.target} should be managed`);
    }
    process.chdir(originalCwd);

    console.log('  - Test 8: --force-all only touches official managed/allowlisted artifacts...');
    const t8 = makeTempDir('t8-forceall-scope');
    process.chdir(t8);

    await installer.init({ agent: 'all', frameworkVersion: '1.3.0' });

    fs.mkdirSync(path.join(t8, '.agents/skills/my-custom-skill'), { recursive: true });
    fs.writeFileSync(
      path.join(t8, '.agents/skills/my-custom-skill/SKILL.md'),
      '---\nname: my-custom-skill\n---\nThis should survive.',
      'utf8'
    );
    fs.mkdirSync(path.join(t8, '.codex/commands'), { recursive: true });
    fs.writeFileSync(
      path.join(t8, '.codex/commands/custom-command.md'),
      '# My Custom Command\nShould survive.',
      'utf8'
    );
    fs.mkdirSync(path.join(t8, '.opencode/commands'), { recursive: true });
    fs.writeFileSync(
      path.join(t8, '.opencode/commands/custom-oc.md'),
      '---\ndescription: custom\n---\nShould survive.',
      'utf8'
    );

    const forceRes = await installer.init({
      agent: 'all',
      forceAll: true,
      frameworkVersion: '1.3.0'
    });
    assert.strictEqual(forceRes.initialized, true);

    assert.ok(
      fs.existsSync(path.join(t8, '.agents/skills/my-custom-skill/SKILL.md')),
      'Unmanaged custom skill should survive force-all'
    );
    const customSkill = fs.readFileSync(
      path.join(t8, '.agents/skills/my-custom-skill/SKILL.md'), 'utf8'
    );
    assert.ok(customSkill.includes('This should survive'), 'Unmanaged custom skill content should be intact');

    assert.ok(
      fs.existsSync(path.join(t8, '.codex/commands/custom-command.md')),
      'Unmanaged custom codex command should survive force-all'
    );
    const customCmd = fs.readFileSync(
      path.join(t8, '.codex/commands/custom-command.md'), 'utf8'
    );
    assert.ok(customCmd.includes('Should survive'), 'Unmanaged codex content should be intact');

    assert.ok(
      fs.existsSync(path.join(t8, '.opencode/commands/custom-oc.md')),
      'Unmanaged custom opencode command should survive force-all'
    );

    assert.ok(fs.existsSync(path.join(t8, 'canva-plans')), 'canva-plans/ should survive force-all');
    assert.ok(fs.existsSync(path.join(t8, 'system_templates.json')), 'system_templates.json should survive force-all');

    for (const cap of caps) {
      assert.ok(
        fs.existsSync(path.join(t8, '.agents/skills', cap.capability.id, 'SKILL.md')),
        `Official skill ${cap.capability.id} should be regenerated`
      );
    }
    process.chdir(originalCwd);

    console.log('  - Test 9: Unmanaged files survive upgrade and force-all...');
    const t9 = makeTempDir('t9-unmanaged-survive');
    process.chdir(t9);

    await installer.init({ agent: 'antigravity', frameworkVersion: '1.3.0' });

    fs.mkdirSync(path.join(t9, '.agents/skills/unmanaged-skill'), { recursive: true });
    const unmanagedContent = '---\nname: unmanaged\n---\nDo not touch.';
    fs.writeFileSync(
      path.join(t9, '.agents/skills/unmanaged-skill/SKILL.md'),
      unmanagedContent,
      'utf8'
    );

    await installer.upgrade({ frameworkVersion: '1.3.1' });

    assert.ok(
      fs.existsSync(path.join(t9, '.agents/skills/unmanaged-skill/SKILL.md')),
      'Unmanaged skill should survive upgrade'
    );
    const survived = fs.readFileSync(
      path.join(t9, '.agents/skills/unmanaged-skill/SKILL.md'), 'utf8'
    );
    assert.strictEqual(survived, unmanagedContent, 'Unmanaged content should be unchanged after upgrade');

    const forceUp = await installer.init({
      agent: 'antigravity',
      forceAll: true,
      frameworkVersion: '1.3.1'
    });
    assert.ok(forceUp.initialized);

    const survivedForce = fs.readFileSync(
      path.join(t9, '.agents/skills/unmanaged-skill/SKILL.md'), 'utf8'
    );
    assert.strictEqual(survivedForce, unmanagedContent, 'Unmanaged content should be unchanged after force-all');
    process.chdir(originalCwd);

    console.log('  - Test 10: Upgrade is idempotent...');
    const t10 = makeTempDir('t10-idempotent');
    process.chdir(t10);

    await installer.init({ agent: 'all', frameworkVersion: '1.3.0' });

    const up1 = await installer.upgrade({ frameworkVersion: '1.3.1' });
    assert.strictEqual(up1.upgraded, true);

    const up2 = await installer.upgrade({ frameworkVersion: '1.3.1' });
    assert.strictEqual(up2.upgraded, true);

    assert.strictEqual(up2.backupsCreated.length, 0, 'Second upgrade should create no backups (no modifications)');

    const manifest10 = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    assert.strictEqual(manifest10.schemaVersion, 2);
    process.chdir(originalCwd);

    console.log('  - Test 11: V1 manifest with agent files migrates correctly...');
    const t11 = makeTempDir('t11-v1-agents');
    process.chdir(t11);

    await installer.init({ agent: 'antigravity', frameworkVersion: '1.2.0' });

    const m11orig = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    const v1StyleWithAgents = {
      schemaVersion: 1,
      frameworkVersion: '1.2.0',
      installedAt: m11orig.installedAt,
      files: m11orig.files,
      agents: m11orig.agents
    };
    fs.writeFileSync('.gsd-canva/manifest.json', JSON.stringify(v1StyleWithAgents, null, 2), 'utf8');

    const up11 = await installer.upgrade({ frameworkVersion: '1.3.0' });
    assert.strictEqual(up11.schemaVersion, 2);

    const m11after = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    assert.strictEqual(m11after.schemaVersion, 2);
    assert.ok(m11after.agents.antigravity, 'Antigravity agent should persist after migration');
    assert.strictEqual(m11after.agents.antigravity.files.length, 4, 'All 4 skill entries should persist');

    for (const entry of m11after.agents.antigravity.files) {
      assert.ok(entry.target.startsWith('.agents/skills/'), `Entry ${entry.target} should be under .agents/skills/`);
      assert.ok(entry.sha256, `Entry ${entry.target} should have hash`);
      assert.strictEqual(entry.managed, true);
    }
    process.chdir(originalCwd);

    console.log('  - Test 12: Adopt for codex and opencode directories...');
    const t12 = makeTempDir('t12-adopt-codex-oc');
    process.chdir(t12);

    fs.mkdirSync(path.join(t12, '.codex/commands'), { recursive: true });
    fs.mkdirSync(path.join(t12, '.opencode/commands'), { recursive: true });

    for (const cap of caps) {
      fs.writeFileSync(
        path.join(t12, '.codex/commands', `${cap.capability.id}.md`),
        `# Adopted Codex ${cap.capability.id}\nUser content.`,
        'utf8'
      );
      fs.writeFileSync(
        path.join(t12, '.opencode/commands', `${cap.capability.id}.md`),
        `---\ndescription: adopted\n---\n# Adopted OC ${cap.capability.id}`,
        'utf8'
      );
    }

    const adopt12 = await installer.init({
      adopt: true,
      agent: 'codex',
      frameworkVersion: '1.3.0'
    });
    assert.strictEqual(adopt12.agentsInstalled.codex.count, 4);
    for (const cap of caps) {
      const c = fs.readFileSync(path.join(t12, '.codex/commands', `${cap.capability.id}.md`), 'utf8');
      assert.ok(c.includes('Adopted Codex'), `Codex ${cap.capability.id} content should be preserved`);
    }
    process.chdir(originalCwd);

    console.log('  - Test 13: Upgrade skips agents not in manifest...');
    const t13 = makeTempDir('t13-skip-uninstalled');
    process.chdir(t13);

    await installer.init({ agent: 'codex', frameworkVersion: '1.3.0' });

    assert.ok(!fs.existsSync(path.join(t13, '.agents/skills')), 'No antigravity skills should exist');

    const up13 = await installer.upgrade({ frameworkVersion: '1.3.1' });
    assert.strictEqual(up13.upgraded, true);
    assert.ok(!fs.existsSync(path.join(t13, '.agents/skills')), 'Upgrade should not create antigravity skills');

    const m13 = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    assert.ok(m13.agents.antigravity);
    assert.strictEqual(m13.agents.antigravity.files.length, 0, 'Antigravity agent should have no files');
    assert.strictEqual(m13.agents.codex.files.length, 4, 'Codex agent should have 4 files');
    process.chdir(originalCwd);

    console.log('  - Test 14: Force-all creates backup for modified managed agent files...');
    const t14 = makeTempDir('t14-forceall-backup');
    process.chdir(t14);

    await installer.init({ agent: 'antigravity', frameworkVersion: '1.3.0' });

    const skill14 = path.join(t14, '.agents/skills/canva-mockup/SKILL.md');
    const orig14 = fs.readFileSync(skill14, 'utf8');
    fs.writeFileSync(skill14, orig14 + '\n<!-- MODIFIED BY USER -->', 'utf8');

    const force14 = await installer.init({
      agent: 'antigravity',
      forceAll: true,
      frameworkVersion: '1.3.0'
    });
    assert.strictEqual(force14.initialized, true);
    assert.strictEqual(force14.agentsInstalled.antigravity.count, 4);

    const restored = fs.readFileSync(skill14, 'utf8');
    assert.ok(!restored.includes('MODIFIED BY USER'), 'Force-all should overwrite modified file');

    const bakFiles = fs.readdirSync(path.join(t14, '.agents/skills/canva-mockup'))
      .filter(f => f.includes('.bak.'));
    assert.ok(bakFiles.length >= 1, 'Should create backup file for modified managed skill');

    const bakContent = fs.readFileSync(
      path.join(t14, '.agents/skills/canva-mockup', bakFiles[0]), 'utf8'
    );
    assert.ok(bakContent.includes('MODIFIED BY USER'), 'Backup should contain user modification');
    process.chdir(originalCwd);

    console.log('  - Test 15: Migration from realistic Phase 1 v1 manifest (no agents section)...');
    const t15 = makeTempDir('t15-phase1-migration');
    process.chdir(t15);

    await installer.init({ frameworkVersion: '1.0.0' });

    const phase1Manifest = {
      schemaVersion: 1,
      frameworkVersion: '1.0.0',
      installedAt: '2026-01-01T00:00:00.000Z',
      files: [
        {
          source: 'templates/commands/canva-mockup.md',
          target: '.gsd-canva/commands/canva-mockup.md',
          sha256: 'abc123',
          managed: true
        },
        {
          source: 'templates/commands/canva-mockup.md',
          target: '.antigravity/commands/canva-mockup.md',
          sha256: 'def456',
          managed: true
        }
      ]
    };
    fs.writeFileSync('.gsd-canva/manifest.json', JSON.stringify(phase1Manifest, null, 2), 'utf8');

    const up15 = await installer.upgrade({ frameworkVersion: '1.3.0' });
    assert.strictEqual(up15.schemaVersion, 2, 'Phase 1 manifest should migrate to v2');

    const m15 = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    assert.strictEqual(m15.schemaVersion, 2);
    assert.ok(m15.agents, 'Should have agents section');
    assert.ok(m15.agents.antigravity, 'Should have antigravity agent');
    assert.ok(m15.agents.codex, 'Should have codex agent');
    assert.ok(m15.agents.opencode, 'Should have opencode agent');
    assert.strictEqual(m15.agents.antigravity.files.length, 0, 'No agent files in Phase 1 manifest');
    assert.strictEqual(m15.agents.codex.files.length, 0, 'No codex files in Phase 1 manifest');
    assert.strictEqual(m15.agents.opencode.files.length, 0, 'No opencode files in Phase 1 manifest');
    process.chdir(originalCwd);

    console.log('  - Test 16: Partial re-init preserves previously installed adapters in manifest (P1 fix)...');
    const t16 = makeTempDir('t16-partial-reinit');
    process.chdir(t16);

    const initAll = await installer.init({ agent: 'all', frameworkVersion: '1.3.0' });
    assert.strictEqual(initAll.agentsInstalled.antigravity.count, 4);
    assert.strictEqual(initAll.agentsInstalled.codex.count, 4);
    assert.strictEqual(initAll.agentsInstalled.opencode.count, 4);

    const initCodex = await installer.init({ agent: 'codex', frameworkVersion: '1.3.0' });
    assert.strictEqual(initCodex.agentsInstalled.codex.count, 4);

    const m16 = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    assert.strictEqual(m16.schemaVersion, 2);
    assert.ok(m16.agents.antigravity, 'Antigravity agent should survive partial re-init');
    assert.ok(m16.agents.opencode, 'OpenCode agent should survive partial re-init');
    assert.strictEqual(m16.agents.antigravity.files.length, 4, 'Antigravity files should survive');
    assert.strictEqual(m16.agents.opencode.files.length, 4, 'OpenCode files should survive');

    const agFiles = m16.files.filter(f => f.target.startsWith('.agents/skills/'));
    const ocFiles = m16.files.filter(f => f.target.startsWith('.opencode/commands/'));
    assert.strictEqual(agFiles.length, 4, 'Flat files should preserve antigravity entries');
    assert.strictEqual(ocFiles.length, 4, 'Flat files should preserve opencode entries');

    assert.ok(
      fs.existsSync(path.join(t16, '.agents/skills/canva-mockup/SKILL.md')),
      'Antigravity skills should still be on disk'
    );
    assert.ok(
      fs.existsSync(path.join(t16, '.opencode/commands/canva-mockup.md')),
      'OpenCode commands should still be on disk'
    );
    process.chdir(originalCwd);

    console.log('  - Test 17: upgrade --adopt preserves modified managed files (P2 fix)...');
    const t17 = makeTempDir('t17-upgrade-adopt');
    process.chdir(t17);

    await installer.init({ agent: 'antigravity', frameworkVersion: '1.3.0' });

    const skill17 = path.join(t17, '.agents/skills/canva-mockup/SKILL.md');
    fs.writeFileSync(skill17, '---\nname: canva-mockup\n---\nAdopted user content.', 'utf8');

    const up17 = await installer.upgrade({ adopt: true, frameworkVersion: '1.3.1' });
    assert.strictEqual(up17.upgraded, true);

    const preserved17 = fs.readFileSync(skill17, 'utf8');
    assert.ok(preserved17.includes('Adopted user content'), 'upgrade --adopt should preserve user content');
    assert.ok(!preserved17.includes('Instrucciones Operativas'), 'Should not overwrite with rendered template');

    assert.strictEqual(up17.backupsCreated.length, 0, 'upgrade --adopt should create no backups');

    const m17 = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    const entry17 = m17.agents.antigravity.files.find(
      f => f.target === '.agents/skills/canva-mockup/SKILL.md'
    );
    assert.ok(entry17, 'Entry should exist');
    const expectedHash = crypto.createHash('sha256').update(preserved17).digest('hex');
    assert.strictEqual(entry17.sha256, expectedHash, 'Hash should match preserved user content');
    process.chdir(originalCwd);

    console.log('  - Test 18: upgrade --adopt registers unmanaged official artifacts (P2 fix)...');
    const t18 = makeTempDir('t18-upgrade-adopt-unmanaged');
    process.chdir(t18);

    await installer.init({ agent: 'codex', frameworkVersion: '1.3.0' });

    const adapter = agentAdapters.getAdapter('opencode');
    for (const { capability, instructions } of agentAdapters.loadAllCapabilities()) {
      const targets = adapter.getTargets(capability);
      for (const { targetPath } of targets) {
        const full = path.join(t18, targetPath);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, `---\ndescription: user\n---\nUser ${capability.id} content.`, 'utf8');
      }
    }

    const m18before = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    assert.ok(!m18before.agents.opencode || m18before.agents.opencode.files.length === 0, 'No opencode files before upgrade --adopt');

    const up18 = await installer.upgrade({ adopt: true, frameworkVersion: '1.3.1' });
    assert.strictEqual(up18.upgraded, true);

    const m18after = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    assert.strictEqual(m18after.agents.opencode.files.length, 4, 'Should adopt 4 opencode files');

    for (const f of m18after.agents.opencode.files) {
      assert.strictEqual(f.managed, true);
      const full = path.join(t18, f.target);
      const content = fs.readFileSync(full, 'utf8');
      assert.ok(content.includes('User'), `Adopted ${f.target} should preserve user content`);
      assert.ok(!content.startsWith('# Slash Command:'), `Adopted ${f.target} should not be rendered template`);
    }
    process.chdir(originalCwd);

    console.log('  - Test 19: upgrade --force-all regenerates unmanaged official artifacts (P2 fix)...');
    const t19 = makeTempDir('t19-upgrade-forceall');
    process.chdir(t19);

    await installer.init({ agent: 'codex', frameworkVersion: '1.3.0' });

    const agAdapter = agentAdapters.getAdapter('antigravity');
    for (const { capability } of agentAdapters.loadAllCapabilities()) {
      const targets = agAdapter.getTargets(capability);
      for (const { targetPath } of targets) {
        const full = path.join(t19, targetPath);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, `---\nname: ${capability.id}\n---\nStale content.`, 'utf8');
      }
    }

    const m19before = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    assert.ok(!m19before.agents.antigravity || m19before.agents.antigravity.files.length === 0, 'No antigravity managed files before');

    const up19 = await installer.upgrade({ forceAll: true, frameworkVersion: '1.3.1' });
    assert.strictEqual(up19.upgraded, true);

    const m19after = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    assert.strictEqual(m19after.agents.antigravity.files.length, 4, 'Should register 4 antigravity files');

    for (const f of m19after.agents.antigravity.files) {
      assert.strictEqual(f.managed, true);
      const full = path.join(t19, f.target);
      const content = fs.readFileSync(full, 'utf8');
      assert.ok(!content.includes('Stale content'), `Should regenerate ${f.target}`);
      assert.ok(content.includes('---'), `Should have rendered content for ${f.target}`);
    }
    process.chdir(originalCwd);

  } finally {
    process.chdir(originalCwd);
    if (fs.existsSync(tempBase)) {
      fs.rmSync(tempBase, { recursive: true, force: true });
    }
  }
}

module.exports = { run };
