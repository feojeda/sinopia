const fs = require('fs');
const path = require('path');
const assert = require('assert');
const installer = require('../lib/installer');
const agentAdapters = require('../lib/agent-adapters');

const tempProjectDir = path.resolve(__dirname, './temp-codex-opencode');

function setupTestProject() {
  if (fs.existsSync(tempProjectDir)) {
    fs.rmSync(tempProjectDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempProjectDir, { recursive: true });
  const originalCwd = process.cwd();
  process.chdir(tempProjectDir);
  return originalCwd;
}

function makeTempDir(name) {
  const dir = path.resolve(__dirname, name);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function run() {
  const originalCwd = setupTestProject();

  try {
    console.log('  - Test 1: init --agent codex creates all Codex command files...');
    const codexResult = await installer.init({
      agent: 'codex',
      frameworkVersion: '1.3.0'
    });

    assert.strictEqual(codexResult.initialized, true);
    assert.strictEqual(codexResult.agentsInstalled.codex.count, 4);
    assert.strictEqual(codexResult.agentsInstalled.codex.target, '.codex/commands');
    assert.strictEqual(codexResult.agentSkillsInstalled, undefined, 'No antigravity compat fields for codex-only');

    const expectedCommands = ['canva-mockup', 'canva-draft', 'canva-refine', 'canva-deliver'];
    for (const cmdId of expectedCommands) {
      const cmdPath = path.join(tempProjectDir, '.codex', 'commands', `${cmdId}.md`);
      assert.ok(fs.existsSync(cmdPath), `Codex command should exist: ${cmdId}.md`);
    }

    for (const cmdId of expectedCommands) {
      const cmdPath = path.join(tempProjectDir, '.codex', 'commands', `${cmdId}.md`);
      const content = fs.readFileSync(cmdPath, 'utf8');
      assert.ok(content.startsWith('# Slash Command:'), `Codex ${cmdId} should start with slash command header`);
      assert.ok(content.length > 50, `Codex ${cmdId} should have substantial content`);
    }

    console.log('  - Test 2: init --agent opencode creates all OpenCode command files...');
    const opencodeDir = makeTempDir('./temp-opencode-p3');
    process.chdir(opencodeDir);

    const opencodeResult = await installer.init({
      agent: 'opencode',
      frameworkVersion: '1.3.0'
    });

    assert.strictEqual(opencodeResult.initialized, true);
    assert.strictEqual(opencodeResult.agentsInstalled.opencode.count, 4);
    assert.strictEqual(opencodeResult.agentsInstalled.opencode.target, '.opencode/commands');

    for (const cmdId of expectedCommands) {
      const cmdPath = path.join(opencodeDir, '.opencode', 'commands', `${cmdId}.md`);
      assert.ok(fs.existsSync(cmdPath), `OpenCode command should exist: ${cmdId}.md`);
    }

    for (const cmdId of expectedCommands) {
      const cmdPath = path.join(opencodeDir, '.opencode', 'commands', `${cmdId}.md`);
      const content = fs.readFileSync(cmdPath, 'utf8');
      assert.ok(content.startsWith('---\n'), `OpenCode ${cmdId} should start with frontmatter`);
      assert.ok(content.includes('description:'), `OpenCode ${cmdId} should have description frontmatter`);
    }

    console.log('  - Test 3: init --agent all creates Antigravity, Codex, and OpenCode artifacts...');
    const allDir = makeTempDir('./temp-all-p3');
    process.chdir(allDir);

    const allResult = await installer.init({
      agent: 'all',
      frameworkVersion: '1.3.0'
    });

    assert.strictEqual(allResult.initialized, true);
    assert.ok(allResult.agentsInstalled.antigravity, 'Should have antigravity installed');
    assert.ok(allResult.agentsInstalled.codex, 'Should have codex installed');
    assert.ok(allResult.agentsInstalled.opencode, 'Should have opencode installed');
    assert.strictEqual(allResult.agentsInstalled.antigravity.count, 4);
    assert.strictEqual(allResult.agentsInstalled.codex.count, 4);
    assert.strictEqual(allResult.agentsInstalled.opencode.count, 4);

    assert.strictEqual(allResult.agentSkillsInstalled, 4, 'Phase 2 backward compat for --agent all');
    assert.strictEqual(allResult.agentTarget, '.agents/skills', 'Phase 2 backward compat for --agent all');

    for (const cmdId of expectedCommands) {
      assert.ok(
        fs.existsSync(path.join(allDir, '.agents/skills', cmdId, 'SKILL.md')),
        `Antigravity skill should exist: ${cmdId}/SKILL.md`
      );
      assert.ok(
        fs.existsSync(path.join(allDir, '.codex/commands', `${cmdId}.md`)),
        `Codex command should exist: ${cmdId}.md`
      );
      assert.ok(
        fs.existsSync(path.join(allDir, '.opencode/commands', `${cmdId}.md`)),
        `OpenCode command should exist: ${cmdId}.md`
      );
    }

    console.log('  - Test 4: Manifest v2 records files per adapter with --agent all...');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(allDir, '.gsd-canva/manifest.json'), 'utf8')
    );
    assert.strictEqual(manifest.schemaVersion, 2, 'Manifest should be schema v2 (Phase 4 manifest v2)');
    assert.ok(manifest.agents.antigravity);
    assert.ok(manifest.agents.codex);
    assert.ok(manifest.agents.opencode);
    assert.strictEqual(manifest.agents.antigravity.files.length, 4);
    assert.strictEqual(manifest.agents.codex.files.length, 4);
    assert.strictEqual(manifest.agents.opencode.files.length, 4);
    assert.strictEqual(manifest.agents.antigravity.adapter, 'antigravity-skill-v1');
    assert.strictEqual(manifest.agents.codex.adapter, 'codex-command-v1');
    assert.strictEqual(manifest.agents.opencode.adapter, 'opencode-command-v1');

    const totalFlat = manifest.files.length;
    const agentFiles = manifest.files.filter(f =>
      f.target.startsWith('.agents/') || f.target.startsWith('.codex/') || f.target.startsWith('.opencode/')
    );
    assert.strictEqual(agentFiles.length, 12, 'Should have 12 agent file entries (4 per adapter)');

    process.chdir(tempProjectDir);

    console.log('  - Test 5: doctor --agent codex validates expected command files...');
    await installer.init({ agent: 'codex', forceAll: true, frameworkVersion: '1.3.0' });
    const codexDoctor = await installer.doctor({ agent: 'codex' });
    assert.strictEqual(codexDoctor.healthy, true);
    assert.strictEqual(codexDoctor.agentDetails.agents.codex.allPresent, true);
    assert.strictEqual(codexDoctor.agentDetails.agents.codex.validCount, 4);
    assert.strictEqual(codexDoctor.agentDetails.agents.codex.expectedCount, 4);
    assert.strictEqual(codexDoctor.agentDetails.agents.codex.missing, undefined);

    console.log('  - Test 6: doctor --agent opencode validates expected command files...');
    const ocDocDir = makeTempDir('./temp-oc-doctor');
    process.chdir(ocDocDir);
    await installer.init({ agent: 'opencode', frameworkVersion: '1.3.0' });
    const ocDocValid = await installer.doctor({ agent: 'opencode' });
    assert.strictEqual(ocDocValid.healthy, true);
    assert.strictEqual(ocDocValid.agentDetails.agents.opencode.allPresent, true);
    assert.strictEqual(ocDocValid.agentDetails.agents.opencode.experimental, true);
    process.chdir(tempProjectDir);

    console.log('  - Test 7: doctor --agent all validates all installed adapters...');
    const allDir2 = makeTempDir('./temp-all-doctor');
    process.chdir(allDir2);
    await installer.init({ agent: 'all', frameworkVersion: '1.3.0' });
    const allDoctor = await installer.doctor({ agent: 'all' });
    assert.strictEqual(allDoctor.healthy, true);
    assert.strictEqual(allDoctor.agentDetails.allAgentsValid, true);
    assert.strictEqual(allDoctor.agentDetails.agents.antigravity.allPresent, true);
    assert.strictEqual(allDoctor.agentDetails.agents.codex.allPresent, true);
    assert.strictEqual(allDoctor.agentDetails.agents.opencode.allPresent, true);
    assert.strictEqual(allDoctor.agentDetails.agents.opencode.experimental, true);
    process.chdir(tempProjectDir);

    console.log('  - Test 8: doctor --agent all fails when one adapter is missing files...');
    const partialDir = makeTempDir('./temp-partial');
    process.chdir(partialDir);
    await installer.init({ agent: 'all', frameworkVersion: '1.3.0' });
    fs.unlinkSync(path.join(partialDir, '.codex/commands/canva-mockup.md'));

    let threwPartial = false;
    try {
      await installer.doctor({ agent: 'all' });
    } catch (e) {
      threwPartial = true;
      assert.strictEqual(e.code, 'GSDC_AGENT_SKILLS_MISSING');
      assert.ok(e.details.codex);
      assert.ok(e.details.codex.missing.includes('canva-mockup'));
    }
    assert.strictEqual(threwPartial, true, 'Should fail when codex adapter has missing files');
    process.chdir(tempProjectDir);

    console.log('  - Test 9: --agent all does not overwrite unmanaged files (conflict test)...');
    const conflictDir = makeTempDir('./temp-all-conflict');
    process.chdir(conflictDir);

    fs.mkdirSync(path.join(conflictDir, '.codex/commands'), { recursive: true });
    fs.writeFileSync(
      path.join(conflictDir, '.codex/commands/canva-mockup.md'),
      '# User custom codex command\nDo not touch this.',
      'utf8'
    );

    let threwConflict = false;
    try {
      await installer.init({ agent: 'all', frameworkVersion: '1.3.0' });
    } catch (e) {
      threwConflict = true;
      assert.strictEqual(e.code, 'GSDC_INIT_CONFLICT');
      assert.ok(e.details.conflictFile.includes('canva-mockup'));
    }
    assert.strictEqual(threwConflict, true, 'Should detect conflict on unmanaged codex file');

    console.log('  - Test 10: --force-all with --agent all overwrites unmanaged files...');
    const forceResult = await installer.init({
      agent: 'all',
      forceAll: true,
      frameworkVersion: '1.3.0'
    });
    assert.strictEqual(forceResult.initialized, true);
    assert.strictEqual(forceResult.agentsInstalled.codex.count, 4);
    assert.strictEqual(forceResult.agentsInstalled.opencode.count, 4);
    assert.strictEqual(forceResult.agentsInstalled.antigravity.count, 4);

    const codexMockupContent = fs.readFileSync(
      path.join(conflictDir, '.codex/commands/canva-mockup.md'), 'utf8'
    );
    assert.ok(codexMockupContent.startsWith('# Slash Command:'), 'Force-all should overwrite with rendered content');
    assert.ok(!codexMockupContent.includes('User custom'), 'Should not contain user custom content');

    console.log('  - Test 11: --adopt --agent codex preserves existing files...');
    const adoptDir = makeTempDir('./temp-adopt-codex');
    process.chdir(adoptDir);

    fs.mkdirSync(path.join(adoptDir, '.codex/commands'), { recursive: true });
    const userContent = '# My Custom Codex Command\nCustom content here.';
    fs.writeFileSync(
      path.join(adoptDir, '.codex/commands/canva-mockup.md'),
      userContent,
      'utf8'
    );

    const adoptResult = await installer.init({
      adopt: true,
      agent: 'codex',
      frameworkVersion: '1.3.0'
    });
    assert.strictEqual(adoptResult.initialized, true);
    assert.strictEqual(adoptResult.agentsInstalled.codex.count, 4);

    const preserved = fs.readFileSync(
      path.join(adoptDir, '.codex/commands/canva-mockup.md'), 'utf8'
    );
    assert.ok(preserved.includes('My Custom Codex'), 'Adopt should preserve user content');

    process.chdir(tempProjectDir);

    console.log('  - Test 12: OpenCode adapter is marked experimental in doctor output...');
    const expDir = makeTempDir('./temp-experimental');
    process.chdir(expDir);
    await installer.init({ agent: 'opencode', frameworkVersion: '1.3.0' });
    const expDoctor = await installer.doctor({ agent: 'opencode' });
    assert.strictEqual(expDoctor.agentDetails.agents.opencode.experimental, true);
    process.chdir(tempProjectDir);

  } finally {
    process.chdir(originalCwd);
    if (fs.existsSync(tempProjectDir)) {
      fs.rmSync(tempProjectDir, { recursive: true, force: true });
    }
    for (const name of [
      './temp-opencode-p3', './temp-all-p3', './temp-oc-doctor',
      './temp-all-doctor', './temp-partial', './temp-all-conflict',
      './temp-adopt-codex', './temp-experimental'
    ]) {
      const dir = path.resolve(__dirname, name);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

module.exports = { run };
