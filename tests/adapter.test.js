const fs = require('fs');
const path = require('path');
const assert = require('assert');

const adapters = require('../lib/agent-adapters');
const antigravitySkill = require('../lib/agent-adapters/antigravity-skill');
const codexCommand = require('../lib/agent-adapters/codex-command');
const opencodeCommand = require('../lib/agent-adapters/opencode-command');

const SOURCE_ROOT = path.resolve(__dirname, '../templates/agent-source');

function makeCapability(overrides = {}) {
  return {
    id: 'test-cap',
    title: 'Test Cap',
    invocation: '/test-cap',
    description: 'A test capability.',
    triggers: ['/test-cap'],
    category: 'gsd-canva',
    supportedAgents: ['antigravity', 'codex', 'opencode'],
    ...overrides
  };
}

const SAMPLE_INSTRUCTIONS = '## Step 1\n\nDo the thing.\n';

async function run() {
  console.log('  - Test 1: Loading all four capabilities...');
  const caps = adapters.loadAllCapabilities(SOURCE_ROOT);
  assert.strictEqual(caps.length, 4, 'Should load exactly 4 capabilities');

  const ids = caps.map(c => c.capability.id).sort();
  assert.deepStrictEqual(ids, ['canva-deliver', 'canva-draft', 'canva-mockup', 'canva-refine']);

  for (const c of caps) {
    assert.ok(c.capability.id, `Capability ${c.capability.id} should have an id`);
    assert.ok(c.capability.description, `Capability ${c.capability.id} should have a description`);
    assert.ok(c.instructions.trim().length > 0, `Capability ${c.capability.id} should have non-empty instructions`);
  }

  console.log('  - Test 2: Rejecting missing id...');
  let threw = false;
  try {
    antigravitySkill.render({ description: 'x' }, SAMPLE_INSTRUCTIONS);
  } catch (e) {
    threw = true;
    assert.strictEqual(e.code, 'GSDC_ADAPTER_INVALID_CAPABILITY');
  }
  assert.strictEqual(threw, true, 'Should throw on missing id');

  threw = false;
  try {
    codexCommand.render({ description: 'x' }, SAMPLE_INSTRUCTIONS);
  } catch (e) {
    threw = true;
    assert.strictEqual(e.code, 'GSDC_ADAPTER_INVALID_CAPABILITY');
  }
  assert.strictEqual(threw, true, 'Should throw on missing id (codex)');

  threw = false;
  try {
    opencodeCommand.render({ description: 'x' }, SAMPLE_INSTRUCTIONS);
  } catch (e) {
    threw = true;
    assert.strictEqual(e.code, 'GSDC_ADAPTER_INVALID_CAPABILITY');
  }
  assert.strictEqual(threw, true, 'Should throw on missing id (opencode)');

  console.log('  - Test 3: Rejecting missing description...');
  threw = false;
  try {
    antigravitySkill.render({ id: 'x' }, SAMPLE_INSTRUCTIONS);
  } catch (e) {
    threw = true;
    assert.strictEqual(e.code, 'GSDC_ADAPTER_INVALID_CAPABILITY');
  }
  assert.strictEqual(threw, true, 'Should throw on missing description');

  threw = false;
  try {
    codexCommand.render({ id: 'x' }, SAMPLE_INSTRUCTIONS);
  } catch (e) {
    threw = true;
    assert.strictEqual(e.code, 'GSDC_ADAPTER_INVALID_CAPABILITY');
  }
  assert.strictEqual(threw, true, 'Should throw on missing description (codex)');

  threw = false;
  try {
    opencodeCommand.render({ id: 'x' }, SAMPLE_INSTRUCTIONS);
  } catch (e) {
    threw = true;
    assert.strictEqual(e.code, 'GSDC_ADAPTER_INVALID_CAPABILITY');
  }
  assert.strictEqual(threw, true, 'Should throw on missing description (opencode)');

  console.log('  - Test 4: Rejecting empty instructions...');
  threw = false;
  try {
    antigravitySkill.render(makeCapability(), '');
  } catch (e) {
    threw = true;
    assert.strictEqual(e.code, 'GSDC_ADAPTER_EMPTY_INSTRUCTIONS');
  }
  assert.strictEqual(threw, true, 'Should throw on empty instructions');

  threw = false;
  try {
    antigravitySkill.render(makeCapability(), '   \n\t  ');
  } catch (e) {
    threw = true;
    assert.strictEqual(e.code, 'GSDC_ADAPTER_EMPTY_INSTRUCTIONS');
  }
  assert.strictEqual(threw, true, 'Should throw on whitespace-only instructions');

  threw = false;
  try {
    codexCommand.render(makeCapability(), '');
  } catch (e) {
    threw = true;
    assert.strictEqual(e.code, 'GSDC_ADAPTER_EMPTY_INSTRUCTIONS');
  }
  assert.strictEqual(threw, true, 'Should throw on empty instructions (codex)');

  threw = false;
  try {
    opencodeCommand.render(makeCapability(), '');
  } catch (e) {
    threw = true;
    assert.strictEqual(e.code, 'GSDC_ADAPTER_EMPTY_INSTRUCTIONS');
  }
  assert.strictEqual(threw, true, 'Should throw on empty instructions (opencode)');

  console.log('  - Test 5: renderAntigravitySkill() emits YAML frontmatter with name and description...');
  const cap = makeCapability({ id: 'canva-mockup', description: 'Create the mockup phase using the gsd-canva lifecycle.' });
  const result = antigravitySkill.render(cap, SAMPLE_INSTRUCTIONS);

  assert.ok(result.startsWith('---\n'), 'Should start with YAML frontmatter');
  assert.ok(result.includes('name: canva-mockup'), 'Should include name in frontmatter');
  assert.ok(result.includes('description:'), 'Should include description in frontmatter');
  assert.ok(result.includes('# Test Cap'), 'Should include title heading');
  assert.ok(result.includes('## Step 1'), 'Should include instructions body');

  const fmMatch = result.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(fmMatch, 'Should have valid frontmatter delimiters');
  const fm = fmMatch[1];
  assert.ok(fm.includes('name: canva-mockup'), 'Frontmatter should have name');
  assert.ok(fm.includes('description:'), 'Frontmatter should have description');

  console.log('  - Test 6: renderCodexCommand() emits markdown slash command header...');
  const codexResult = codexCommand.render(cap, SAMPLE_INSTRUCTIONS);

  assert.ok(codexResult.startsWith('# Slash Command: /test-cap'), 'Should start with slash command header');
  assert.ok(codexResult.includes('## Step 1'), 'Should include instructions body');
  assert.ok(!codexResult.includes('---'), 'Should NOT include YAML frontmatter');

  console.log('  - Test 7: renderOpenCodeCommand() emits description frontmatter...');
  const opencodeResult = opencodeCommand.render(cap, SAMPLE_INSTRUCTIONS);

  assert.ok(opencodeResult.startsWith('---\n'), 'Should start with frontmatter');
  assert.ok(opencodeResult.includes('description:'), 'Should include description frontmatter');
  assert.ok(opencodeResult.includes('# /test-cap'), 'Should include invocation heading');
  assert.ok(opencodeResult.includes('## Step 1'), 'Should include instructions body');

  const ocFmMatch = opencodeResult.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(ocFmMatch, 'Should have valid frontmatter delimiters');
  const ocFm = ocFmMatch[1];
  assert.ok(ocFm.includes('description: Create the mockup phase using the gsd-canva lifecycle.'), 'Frontmatter should have description value');

  console.log('  - Test 8: getTargets() returns correct paths per adapter...');
  const capForTargets = makeCapability();
  const agTargets = antigravitySkill.getTargets(capForTargets);
  assert.strictEqual(agTargets.length, 1);
  assert.strictEqual(agTargets[0].targetPath, '.agents/skills/test-cap/SKILL.md');
  assert.strictEqual(agTargets[0].targetRoot, '.agents/skills');

  const codexTargets = codexCommand.getTargets(capForTargets);
  assert.strictEqual(codexTargets.length, 1);
  assert.strictEqual(codexTargets[0].targetPath, '.codex/commands/test-cap.md');
  assert.strictEqual(codexTargets[0].targetRoot, '.codex/commands');

  const ocTargets = opencodeCommand.getTargets(capForTargets);
  assert.strictEqual(ocTargets.length, 1);
  assert.strictEqual(ocTargets[0].targetPath, '.opencode/commands/test-cap.md');
  assert.strictEqual(ocTargets[0].targetRoot, '.opencode/commands');

  console.log('  - Test 9: getAdapter() and getSupportedAgents()...');
  assert.strictEqual(adapters.getAdapter('antigravity').id, 'antigravity');
  assert.strictEqual(adapters.getAdapter('codex').id, 'codex');
  assert.strictEqual(adapters.getAdapter('opencode').id, 'opencode');

  const supported = adapters.getSupportedAgents();
  assert.deepStrictEqual(supported.sort(), ['antigravity', 'codex', 'opencode']);

  threw = false;
  try {
    adapters.getAdapter('nonexistent');
  } catch (e) {
    threw = true;
    assert.strictEqual(e.code, 'GSDC_ADAPTER_UNKNOWN');
  }
  assert.strictEqual(threw, true, 'Should throw for unknown adapter');

  console.log('  - Test 10: loadCapability rejects missing id in JSON...');
  const tempDir = path.join(__dirname, 'temp-cap-test');
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  fs.writeFileSync(path.join(tempDir, 'capability.json'), JSON.stringify({ title: 'No ID' }));
  fs.writeFileSync(path.join(tempDir, 'instructions.md'), 'content');

  threw = false;
  try {
    adapters.loadCapability(tempDir);
  } catch (e) {
    threw = true;
    assert.strictEqual(e.code, 'GSDC_CAPABILITY_INVALID');
    assert.ok(e.message.includes('id'));
  }
  assert.strictEqual(threw, true);

  console.log('  - Test 11: loadCapability rejects missing description in JSON...');
  fs.writeFileSync(path.join(tempDir, 'capability.json'), JSON.stringify({ id: 'test', title: 'No Desc' }));

  threw = false;
  try {
    adapters.loadCapability(tempDir);
  } catch (e) {
    threw = true;
    assert.strictEqual(e.code, 'GSDC_CAPABILITY_INVALID');
    assert.ok(e.message.includes('description'));
  }
  assert.strictEqual(threw, true);

  console.log('  - Test 12: loadCapability rejects empty instructions.md...');
  fs.writeFileSync(path.join(tempDir, 'capability.json'), JSON.stringify({
    id: 'test', description: 'desc'
  }));
  fs.writeFileSync(path.join(tempDir, 'instructions.md'), '   \n  \n  ');

  threw = false;
  try {
    adapters.loadCapability(tempDir);
  } catch (e) {
    threw = true;
    assert.strictEqual(e.code, 'GSDC_CAPABILITY_EMPTY_INSTRUCTIONS');
  }
  assert.strictEqual(threw, true);

  fs.rmSync(tempDir, { recursive: true, force: true });
}

module.exports = { run };
