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

async function run() {
  const originalCwd = setupTestProject();

  try {
    console.log('  - Test 1: init --agent antigravity installs skills to .agents/skills/...');
    const initResult = await installer.init({
      agent: 'antigravity',
      frameworkVersion: '1.3.0'
    });

    assert.strictEqual(initResult.initialized, true);
    assert.strictEqual(initResult.agentSkillsInstalled, 4, 'Should install 4 skills');
    assert.strictEqual(initResult.agentTarget, '.agents/skills');

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
    const skillEntries = manifest.files.filter(f => f.target.startsWith('.agents/skills/'));
    assert.strictEqual(skillEntries.length, 4, 'Manifest should have 4 skill entries');
    for (const entry of skillEntries) {
      assert.ok(entry.sha256, `Skill entry ${entry.target} should have sha256`);
      assert.strictEqual(entry.managed, true, `Skill entry ${entry.target} should be managed`);
    }

    console.log('  - Test 6: doctor --agent antigravity validates skills structure...');
    const doctorResult = await installer.doctor({ agent: 'antigravity' });
    assert.strictEqual(doctorResult.healthy, true);
    assert.strictEqual(doctorResult.agentValidated, true);
    assert.ok(doctorResult.agentDetails);
    assert.strictEqual(doctorResult.agentDetails.legacyCommands, true);
    assert.strictEqual(doctorResult.agentDetails.skillsDir, true);
    assert.strictEqual(doctorResult.agentDetails.skillsCount, 4);
    assert.strictEqual(doctorResult.agentDetails.validSkills, 4);

    console.log('  - Test 7: doctor detects missing SKILL.md files...');
    fs.unlinkSync(path.join(tempProjectDir, '.agents/skills/canva-mockup/SKILL.md'));
    const doctorMissing = await installer.doctor({ agent: 'antigravity' });
    assert.strictEqual(doctorMissing.agentDetails.validSkills, 3);
    assert.ok(doctorMissing.agentDetails.missingSkills);
    assert.ok(doctorMissing.agentDetails.missingSkills.includes('canva-mockup'));

    console.log('  - Test 8: doctor reports when no skills installed...');
    const noSkillDir = path.resolve(__dirname, './temp-no-skills');
    if (fs.existsSync(noSkillDir)) fs.rmSync(noSkillDir, { recursive: true, force: true });
    fs.mkdirSync(noSkillDir, { recursive: true });
    process.chdir(noSkillDir);
    fs.mkdirSync(path.join(noSkillDir, '.gsd-canva'), { recursive: true });
    fs.writeFileSync(path.join(noSkillDir, '.gsd-canva/manifest.json'), '{}');

    const doctorNoSkills = await installer.doctor({ agent: 'antigravity' });
    assert.strictEqual(doctorNoSkills.agentDetails.skillsDir, false);
    process.chdir(tempProjectDir);

    console.log('  - Test 9: init without --agent does not install skills...');
    if (fs.existsSync(noSkillDir)) fs.rmSync(noSkillDir, { recursive: true, force: true });
    fs.mkdirSync(noSkillDir, { recursive: true });
    process.chdir(noSkillDir);

    const initNoAgent = await installer.init({ frameworkVersion: '1.3.0' });
    assert.strictEqual(initNoAgent.initialized, true);
    assert.strictEqual(initNoAgent.agentSkillsInstalled, undefined);
    assert.ok(!fs.existsSync(path.join(noSkillDir, '.agents/skills')), 'No skills dir without --agent');
    process.chdir(tempProjectDir);

    console.log('  - Test 10: init with unsupported agent throws error...');
    let threwAgent = false;
    try {
      await installer.init({ agent: 'unknown-agent', frameworkVersion: '1.3.0' });
    } catch (e) {
      threwAgent = true;
      assert.strictEqual(e.code, 'GSDC_ADAPTER_UNKNOWN');
    }
    assert.strictEqual(threwAgent, true, 'Should throw for unknown agent');

    console.log('  - Test 11: Re-init with --agent antigravity is idempotent...');
    const mockupSkillPath = path.join(tempProjectDir, '.agents/skills/canva-mockup/SKILL.md');
    if (fs.existsSync(mockupSkillPath)) {
      fs.rmSync(mockupSkillPath);
    }
    const reInitResult = await installer.init({
      agent: 'antigravity',
      frameworkVersion: '1.3.0'
    });
    assert.strictEqual(reInitResult.agentSkillsInstalled, 4, 'Should re-install all 4 skills');
    assert.ok(
      fs.existsSync(path.join(tempProjectDir, '.agents/skills/canva-mockup/SKILL.md')),
      'canva-mockup skill should be restored'
    );

    console.log('  - Test 12: SKILL.md trigger-based description rendering...');
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
    const noSkillDir = path.resolve(__dirname, './temp-no-skills');
    if (fs.existsSync(noSkillDir)) {
      fs.rmSync(noSkillDir, { recursive: true, force: true });
    }
  }
}

module.exports = { run };
