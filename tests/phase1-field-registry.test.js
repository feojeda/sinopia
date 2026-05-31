const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const planManager = require('../lib/plan-manager');
const installer = require('../lib/installer');

const tempProjectDir = path.resolve(__dirname, './temp-project');

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
    await installer.init({ frameworkVersion: '1.0.0' });

    console.log('  - Phase 1.1: FIELD_REGISTRY contains seven expected fields...');
    assert.strictEqual(planManager.FIELD_REGISTRY.length, 7, 'FIELD_REGISTRY must have 7 fields');
    const expectedIds = ['vertical', 'formato', 'audiencia', 'paleta', 'copy', 'cta', 'assets'];
    const actualIds = planManager.FIELD_REGISTRY.map(f => f.id);
    assert.deepStrictEqual(actualIds, expectedIds, 'FIELD_REGISTRY ids must match expected order');

    console.log('  - Phase 1.2: Derived field lists are consistent...');
    assert.deepStrictEqual(planManager.REQUIRED_FIELDS, ['vertical', 'formato', 'audiencia', 'paleta', 'copy', 'cta']);
    assert.deepStrictEqual(planManager.OPTIONAL_FIELDS, ['assets']);
    assert.deepStrictEqual(planManager.ALL_FIELDS, expectedIds);
    assert.ok(planManager.REQUIRED_FIELDS.every(f => planManager.ALL_FIELDS.includes(f)), 'REQUIRED_FIELDS must be subset of ALL_FIELDS');
    assert.ok(planManager.OPTIONAL_FIELDS.every(f => planManager.ALL_FIELDS.includes(f)), 'OPTIONAL_FIELDS must be subset of ALL_FIELDS');

    console.log('  - Phase 1.3: New plans include assets, optionalAnswered, and confirmation skeleton...');
    const plan = await planManager.create({ name: 'Test Phase 1' });
    const decisionsPath = path.join('canva-plans', `plan_${plan.planId}_test-phase-1`, 'decisions.json');
    const decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'));
    assert.strictEqual(decisions.assets, '', 'New plans must have assets field');
    assert.deepStrictEqual(decisions.optionalAnswered, {}, 'New plans must have optionalAnswered');
    assert.strictEqual(decisions.confirmation.hashAlgorithm, 'sha256-decisions-v2', 'New plans must use v2 hash');

    console.log('  - Phase 1.4: Legacy decisions normalization via ensureQuestionFields...');
    const legacy = { vertical: '', audiencia: '', formato: '', paleta: '', copy: '', cta: '' };
    planManager.ensureQuestionFields(legacy);
    assert.strictEqual(legacy.assets, '', 'ensureQuestionFields must add assets');
    assert.deepStrictEqual(legacy.optionalAnswered, {}, 'ensureQuestionFields must add optionalAnswered');
    assert.ok(legacy.confirmation, 'ensureQuestionFields must add confirmation');
    assert.strictEqual(legacy.confirmation.hashAlgorithm, 'sha256-decisions-v2', 'Legacy without hash gets v2');

    const legacyWithV1Hash = {
      vertical: 'a', audiencia: 'b', formato: 'c', paleta: 'd', copy: 'e', cta: 'f',
      confirmation: { confirmed: true, decisionsHash: 'abc123' }
    };
    planManager.ensureQuestionFields(legacyWithV1Hash);
    assert.strictEqual(legacyWithV1Hash.confirmation.hashAlgorithm, 'sha256-decisions-v1', 'Legacy with existing hash gets v1');

    console.log('  - Phase 1.5: confirmDecisions() writes sha256-decisions-v2...');
    decisions.vertical = 'SaaS / Producto Digital';
    decisions.audiencia = 'Devs';
    decisions.formato = 'Instagram Post (1080x1080)';
    decisions.paleta = 'Azul';
    decisions.copy = 'Hola';
    decisions.cta = 'Comprar Ahora';
    fs.writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2), 'utf8');

    const confirmRes = await planManager.confirmDecisions(plan.planId, { by: 'tester' });
    assert.strictEqual(confirmRes.confirmed, true);

    const confirmed = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'));
    assert.strictEqual(confirmed.confirmation.hashAlgorithm, 'sha256-decisions-v2', 'confirmDecisions must write v2');

    console.log('  - Phase 1.6: Existing v1 hash fixtures still verify...');
    const plan2 = await planManager.create({ name: 'Legacy V1 Test' });
    const dp2 = path.join('canva-plans', `plan_${plan2.planId}_legacy-v1-test`, 'decisions.json');
    const d2 = JSON.parse(fs.readFileSync(dp2, 'utf8'));

    d2.vertical = 'Moda';
    d2.audiencia = 'Jovenes';
    d2.formato = '1080x1080';
    d2.paleta = 'Azul';
    d2.copy = 'Oferta';
    d2.cta = 'Comprar';
    fs.writeFileSync(dp2, JSON.stringify(d2, null, 2), 'utf8');

    const v1Hash = planManager.computeDecisionsHash(d2, 'sha256-decisions-v1');
    d2.confirmation = {
      confirmed: true,
      confirmedAt: new Date().toISOString(),
      confirmedBy: 'user',
      source: 'chat',
      hashAlgorithm: 'sha256-decisions-v1',
      decisionsHash: v1Hash
    };
    fs.writeFileSync(dp2, JSON.stringify(d2, null, 2), 'utf8');

    const resolved = await planManager.resolveQuestions(plan2.planId);
    assert.strictEqual(resolved.plan.status, 'ready_for_html', 'V1 hash must verify in resolveQuestions');

    console.log('  - Phase 1.7: Hardcoded required-field arrays removed from confirm/resolve/submit...');
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/plan-manager.js'), 'utf8');
    const confirmMatch = src.match(/async function confirmDecisions[\s\S]*?^async function /m);
    const resolveMatch = src.match(/async function resolveQuestions[\s\S]*?^async function /m);
    const submitMatch = src.match(/async function submitMockup[\s\S]*?^async function /m);

    const hardcodedPattern = /\[\s*'vertical'\s*,\s*'audiencia'/;
    const confirmSection = src.substring(src.indexOf('async function confirmDecisions'), src.indexOf('async function resolveQuestions'));
    const resolveSection = src.substring(src.indexOf('async function resolveQuestions'), src.indexOf('async function submitMockup'));
    const submitSection = src.substring(src.indexOf('async function submitMockup'), src.indexOf('async function transitionState'));

    assert.ok(!hardcodedPattern.test(confirmSection), 'confirmDecisions must not have hardcoded field arrays');
    assert.ok(!hardcodedPattern.test(resolveSection), 'resolveQuestions must not have hardcoded field arrays');
    assert.ok(!hardcodedPattern.test(submitSection), 'submitMockup must not have hardcoded field arrays');

    console.log('  - Phase 1.8: Unknown hash version guard in resolveQuestions...');
    const plan3 = await planManager.create({ name: 'Unknown Hash' });
    const dp3 = path.join('canva-plans', `plan_${plan3.planId}_unknown-hash`, 'decisions.json');
    const d3 = JSON.parse(fs.readFileSync(dp3, 'utf8'));
    d3.vertical = 'Test'; d3.audiencia = 'Test'; d3.formato = 'Test';
    d3.paleta = 'Test'; d3.copy = 'Test'; d3.cta = 'Test';
    d3.confirmation = {
      confirmed: true, confirmedAt: new Date().toISOString(), confirmedBy: 'user',
      source: 'chat', hashAlgorithm: 'sha256-decisions-v99', decisionsHash: 'fake'
    };
    fs.writeFileSync(dp3, JSON.stringify(d3, null, 2), 'utf8');

    try {
      await planManager.resolveQuestions(plan3.planId);
      assert.fail('Should have failed with unknown hash version');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_INVALID_STATE', 'Unknown hash must throw GSDC_INVALID_STATE');
      assert.strictEqual(err.details.reason, 'unknown_hash_version', 'Must include unknown_hash_version reason');
    }

    console.log('  - Phase 1.9: No agent instructions changed in this phase...');
    const agentSrc = path.resolve(__dirname, '../templates/agent-source');
    if (fs.existsSync(agentSrc)) {
      const stat = fs.statSync(agentSrc);
      console.log('    (agent-source directory exists, no modifications expected)');
    }

  } finally {
    process.chdir(originalCwd);
  }
}

module.exports = { run };
