const fs = require('fs');
const path = require('path');
const assert = require('assert');
const installer = require('../lib/installer');
const agentAdapters = require('../lib/agent-adapters');
const antigravityAdapter = require('../lib/agent-adapters/antigravity-skill');

const tempProjectDir = path.resolve(__dirname, './temp-antigravity-skill');

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
    console.log('  - Test 1: init --agent antigravity installs skills to .agents/skills/...');
    const initResult = await installer.init({
      agent: 'antigravity',
      frameworkVersion: '1.3.0'
    });

    assert.strictEqual(initResult.initialized, true);
    assert.strictEqual(initResult.agentsInstalled.antigravity.count, 4, 'Should install 4 skills');
    assert.strictEqual(initResult.agentsInstalled.antigravity.target, '.agents/skills');
    assert.strictEqual(initResult.agentSkillsInstalled, 4, 'Phase 2 backward compat: agentSkillsInstalled');
    assert.strictEqual(initResult.agentTarget, '.agents/skills', 'Phase 2 backward compat: agentTarget');

    const expectedSkills = ['canva-mockup', 'canva-draft', 'canva-refine', 'canva-deliver'];
    for (const skillId of expectedSkills) {
      const skillPath = path.join(tempProjectDir, '.agents', 'skills', skillId, 'SKILL.md');
      assert.ok(fs.existsSync(skillPath), `Skill file should exist: ${skillId}/SKILL.md`);
    }

    console.log('  - Test 2: SKILL.md files have valid YAML frontmatter...');
    for (const skillId of expectedSkills) {
      const skillPath = path.join(tempProjectDir, '.agents', 'skills', skillId, 'SKILL.md');
      const content = fs.readFileSync(skillPath, 'utf8');

      assert.ok(content.startsWith('---\n'), `Skill ${skillId} should start with YAML frontmatter`);
      assert.ok(content.includes(`name: ${skillId}`), `Skill ${skillId} should have name in frontmatter`);
      assert.ok(content.includes('description:'), `Skill ${skillId} should have description in frontmatter`);

      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      assert.ok(fmMatch, `Skill ${skillId} should have valid frontmatter delimiters`);
    }

    console.log('  - Test 3: SKILL.md files contain instruction body...');
    for (const skillId of expectedSkills) {
      const skillPath = path.join(tempProjectDir, '.agents', 'skills', skillId, 'SKILL.md');
      const content = fs.readFileSync(skillPath, 'utf8');
      assert.ok(content.length > 100, `Skill ${skillId} should have substantial content`);
      assert.ok(content.includes('#'), `Skill ${skillId} should have markdown headings`);
    }

    console.log('  - Test 4: Legacy .antigravity/commands/ still present (compatibility)...');
    assert.ok(fs.existsSync(path.join(tempProjectDir, '.antigravity/commands')), 'Legacy commands dir should exist');
    assert.ok(
      fs.existsSync(path.join(tempProjectDir, '.antigravity/commands/canva-mockup.md')),
      'Legacy canva-mockup.md should exist'
    );
    assert.ok(
      fs.existsSync(path.join(tempProjectDir, '.antigravity/commands/canva-draft.md')),
      'Legacy canva-draft.md should exist'
    );
    assert.ok(
      fs.existsSync(path.join(tempProjectDir, '.antigravity/commands/canva-refine.md')),
      'Legacy canva-refine.md should exist'
    );
    assert.ok(
      fs.existsSync(path.join(tempProjectDir, '.antigravity/commands/canva-deliver.md')),
      'Legacy canva-deliver.md should exist'
    );

    console.log('  - Test 5: Skills are registered in manifest.json...');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tempProjectDir, '.gsd-canva/manifest.json'), 'utf8')
    );
    assert.strictEqual(manifest.schemaVersion, 1, 'Manifest should remain schema v1 (Phase 4 owns v2 bump)');
    assert.ok(manifest.agents, 'Manifest should have agents section');
    assert.ok(manifest.agents.antigravity, 'Manifest should have antigravity agent');
    const skillEntries = manifest.agents.antigravity.files;
    assert.strictEqual(skillEntries.length, 4, 'Manifest should have 4 skill entries for antigravity');
    for (const entry of skillEntries) {
      assert.ok(entry.sha256, `Skill entry ${entry.target} should have sha256`);
      assert.strictEqual(entry.managed, true, `Skill entry ${entry.target} should be managed`);
    }
    const allSkillEntries = manifest.files.filter(f => f.target.startsWith('.agents/skills/'));
    assert.strictEqual(allSkillEntries.length, 4, 'Flat files list should have 4 skill entries');

    console.log('  - Test 6: doctor --agent antigravity validates official skills...');
    const doctorResult = await installer.doctor({ agent: 'antigravity' });
    assert.strictEqual(doctorResult.healthy, true);
    assert.strictEqual(doctorResult.agentValidated, true);
    assert.ok(doctorResult.agentDetails);
    assert.ok(doctorResult.agentDetails.agents);
    assert.ok(doctorResult.agentDetails.agents.antigravity);
    const agDet = doctorResult.agentDetails.agents.antigravity;
    assert.strictEqual(agDet.legacyCommands, true);
    assert.strictEqual(agDet.targetDir, true);
    assert.strictEqual(agDet.expectedCount, 4);
    assert.strictEqual(agDet.validCount, 4);
    assert.strictEqual(agDet.allPresent, true);
    assert.strictEqual(agDet.missing, undefined);

    console.log('  - Test 7: doctor throws when official SKILL.md files are missing...');
    fs.unlinkSync(path.join(tempProjectDir, '.agents/skills/canva-mockup/SKILL.md'));
    let threwMissing = false;
    try {
      await installer.doctor({ agent: 'antigravity' });
    } catch (e) {
      threwMissing = true;
      assert.strictEqual(e.code, 'GSDC_AGENT_SKILLS_MISSING');
      assert.strictEqual(e.exitCode, 19);
      assert.ok(e.details.antigravity.missing.includes('canva-mockup'));
    }
    assert.strictEqual(threwMissing, true, 'Should throw when official skills are missing');

    console.log('  - Test 8: doctor throws when .agents/skills/ is absent...');
    const noSkillDir = makeTempDir('./temp-no-skills');
    process.chdir(noSkillDir);
    fs.mkdirSync(path.join(noSkillDir, '.gsd-canva'), { recursive: true });
    fs.writeFileSync(path.join(noSkillDir, '.gsd-canva/manifest.json'), '{}');

    let threwNoSkills = false;
    try {
      await installer.doctor({ agent: 'antigravity' });
    } catch (e) {
      threwNoSkills = true;
      assert.strictEqual(e.code, 'GSDC_AGENT_SKILLS_MISSING');
      assert.strictEqual(e.details.antigravity.missing.length, 4);
      assert.strictEqual(e.details.antigravity.validCount, 0);
    }
    assert.strictEqual(threwNoSkills, true, 'Should throw when no skills installed');
    process.chdir(tempProjectDir);

    console.log('  - Test 9: doctor passes with extra non-official skills when all official present...');
    await installer.init({ agent: 'antigravity', forceAll: true, frameworkVersion: '1.3.0' });
    const extraDir = path.join(tempProjectDir, '.agents/skills/custom-extra');
    fs.mkdirSync(extraDir, { recursive: true });
    fs.writeFileSync(path.join(extraDir, 'SKILL.md'), '---\nname: custom-extra\n---\nExtra skill.');
    const doctorExtra = await installer.doctor({ agent: 'antigravity' });
    assert.strictEqual(doctorExtra.healthy, true);
    assert.strictEqual(doctorExtra.agentDetails.agents.antigravity.allPresent, true);
    assert.ok(doctorExtra.agentDetails.agents.antigravity.extra);
    assert.ok(doctorExtra.agentDetails.agents.antigravity.extra.includes('custom-extra'));
    fs.rmSync(extraDir, { recursive: true, force: true });

    console.log('  - Test 10: init without --agent does not install skills...');
    const noAgentDir = makeTempDir('./temp-no-agent');
    process.chdir(noAgentDir);

    const initNoAgent = await installer.init({ frameworkVersion: '1.3.0' });
    assert.strictEqual(initNoAgent.initialized, true);
    assert.strictEqual(initNoAgent.agentsInstalled, undefined);
    assert.ok(!fs.existsSync(path.join(noAgentDir, '.agents/skills')), 'No skills dir without --agent');
    process.chdir(tempProjectDir);

    console.log('  - Test 11: init with unsupported agent (unknown) throws error...');
    const unknownDir = makeTempDir('./temp-unknown');
    process.chdir(unknownDir);
    let threwUnknown = false;
    try {
      await installer.init({ agent: 'unknown-agent', frameworkVersion: '1.3.0' });
    } catch (e) {
      threwUnknown = true;
      assert.strictEqual(e.code, 'GSDC_ADAPTER_UNKNOWN');
    }
    assert.strictEqual(threwUnknown, true, 'Should throw for unknown agent');
    process.chdir(tempProjectDir);

    console.log('  - Test 12: init --agent codex now succeeds (Phase 3)...');
    const codexDir = makeTempDir('./temp-codex');
    process.chdir(codexDir);
    const codexResult = await installer.init({ agent: 'codex', frameworkVersion: '1.3.0' });
    assert.strictEqual(codexResult.initialized, true);
    assert.strictEqual(codexResult.agentsInstalled.codex.count, 4);
    assert.ok(fs.existsSync(path.join(codexDir, '.codex/commands/canva-mockup.md')));
    process.chdir(tempProjectDir);

    console.log('  - Test 13: init --agent opencode now succeeds (Phase 3)...');
    const opencodeDir = makeTempDir('./temp-opencode');
    process.chdir(opencodeDir);
    const opencodeResult = await installer.init({ agent: 'opencode', frameworkVersion: '1.3.0' });
    assert.strictEqual(opencodeResult.initialized, true);
    assert.strictEqual(opencodeResult.agentsInstalled.opencode.count, 4);
    assert.ok(fs.existsSync(path.join(opencodeDir, '.opencode/commands/canva-mockup.md')));
    process.chdir(tempProjectDir);

    console.log('  - Test 14: init --agent antigravity rejects unmanaged SKILL.md conflict (P1-2 fix)...');
    const conflictDir = makeTempDir('./temp-conflict');
    process.chdir(conflictDir);
    fs.mkdirSync(path.join(conflictDir, '.agents/skills/canva-mockup'), { recursive: true });
    fs.writeFileSync(
      path.join(conflictDir, '.agents/skills/canva-mockup/SKILL.md'),
      '---\nname: user-custom\n---\nUser custom skill content.',
      'utf8'
    );

    let threwConflict = false;
    try {
      await installer.init({ agent: 'antigravity', frameworkVersion: '1.3.0' });
    } catch (e) {
      threwConflict = true;
      assert.strictEqual(e.code, 'GSDC_INIT_CONFLICT', 'Should throw conflict for unmanaged SKILL.md');
      assert.strictEqual(e.exitCode, 11);
      assert.ok(e.details.conflictFile.includes('canva-mockup'));
    }
    assert.strictEqual(threwConflict, true, 'Should detect conflict on unmanaged .agents/skills file');
    process.chdir(tempProjectDir);

    console.log('  - Test 15: init --agent antigravity detects modified managed SKILL.md (P1-2 fix)...');
    const existingSkillPath = path.join(tempProjectDir, '.agents/skills/canva-mockup/SKILL.md');
    if (!fs.existsSync(existingSkillPath)) {
      fs.mkdirSync(path.dirname(existingSkillPath), { recursive: true });
      const reInitForSetup = await installer.init({ agent: 'antigravity', frameworkVersion: '1.3.0' });
      assert.strictEqual(reInitForSetup.agentSkillsInstalled, 4);
    }
    const originalContent = fs.readFileSync(existingSkillPath, 'utf8');
    fs.writeFileSync(existingSkillPath, originalContent + '\n<!-- USER MODIFIED -->', 'utf8');

    let threwModified = false;
    try {
      await installer.init({ agent: 'antigravity', frameworkVersion: '1.3.0' });
    } catch (e) {
      threwModified = true;
      assert.strictEqual(e.code, 'GSDC_INIT_CONFLICT');
      assert.ok(e.details.conflictFile.includes('canva-mockup'));
    }
    assert.strictEqual(threwModified, true, 'Should detect locally modified managed skill file');

    console.log('  - Test 16: Re-init with --force-all overwrites modified skills...');
    const forceResult = await installer.init({
      agent: 'antigravity',
      forceAll: true,
      frameworkVersion: '1.3.0'
    });
    assert.strictEqual(forceResult.agentsInstalled.antigravity.count, 4);
    assert.strictEqual(forceResult.agentSkillsInstalled, 4, 'Phase 2 backward compat after force-all');
    const restoredContent = fs.readFileSync(existingSkillPath, 'utf8');
    assert.ok(!restoredContent.includes('USER MODIFIED'), 'Force-all should overwrite modified skill');

    console.log('  - Test 17: --adopt --agent antigravity preserves existing user SKILL.md (P2 fix)...');
    const adoptDir = makeTempDir('./temp-adopt');
    process.chdir(adoptDir);

    fs.mkdirSync(path.join(adoptDir, '.agents/skills/canva-mockup'), { recursive: true });
    const userContent = '---\nname: canva-mockup\n---\n# My Custom Mockup\nUser-authored content.';
    fs.writeFileSync(
      path.join(adoptDir, '.agents/skills/canva-mockup/SKILL.md'),
      userContent,
      'utf8'
    );

    const adoptResult = await installer.init({
      adopt: true,
      agent: 'antigravity',
      frameworkVersion: '1.3.0'
    });
    assert.strictEqual(adoptResult.initialized, true);
    assert.strictEqual(adoptResult.agentsInstalled.antigravity.count, 4);
    assert.strictEqual(adoptResult.agentSkillsInstalled, 4, 'Phase 2 backward compat after adopt');

    const preserved = fs.readFileSync(
      path.join(adoptDir, '.agents/skills/canva-mockup/SKILL.md'),
      'utf8'
    );
    assert.ok(preserved.includes('My Custom Mockup'), 'Adopt should preserve user-authored content');
    assert.ok(!preserved.includes('Instrucciones Operativas'), 'Should NOT overwrite with rendered template');

    const adoptManifest = JSON.parse(
      fs.readFileSync(path.join(adoptDir, '.gsd-canva/manifest.json'), 'utf8')
    );
    const mockupEntry = adoptManifest.files.find(f => f.target === '.agents/skills/canva-mockup/SKILL.md');
    assert.ok(mockupEntry, 'Adopted skill should be in manifest');
    assert.strictEqual(mockupEntry.managed, true);

    const adoptDoctor = await installer.doctor({ agent: 'antigravity' });
    assert.strictEqual(adoptDoctor.healthy, true);
    process.chdir(tempProjectDir);

    console.log('  - Test 18: SKILL.md trigger-based description rendering...');
    const cap = {
      id: 'custom-skill',
      title: 'Custom Skill',
      invocation: '/custom',
      description: 'A custom test skill.',
      triggers: ['/custom', '/cs']
    };
    const rendered = antigravityAdapter.render(cap, 'Do the custom thing.');
    assert.ok(rendered.includes('name: custom-skill'));
    assert.ok(rendered.includes('/custom or /cs'));
    assert.ok(rendered.includes('Custom Skill'));
    assert.ok(rendered.includes('Do the custom thing.'));

  } finally {
    process.chdir(originalCwd);
    if (fs.existsSync(tempProjectDir)) {
      fs.rmSync(tempProjectDir, { recursive: true, force: true });
    }
    for (const name of ['./temp-no-skills', './temp-no-agent', './temp-unknown', './temp-codex', './temp-opencode', './temp-conflict', './temp-adopt']) {
      const dir = path.resolve(__dirname, name);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

module.exports = { run };
