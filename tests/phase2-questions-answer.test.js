const fs = require('fs');
const path = require('path');
const assert = require('assert');
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

    console.log('  - Phase 2.1: Empty plan returns 6 required pending and 1 optional pending...');
    const plan = await planManager.create({ name: 'Test Questions' });
    const q = await planManager.questions(plan.planId);
    assert.strictEqual(q.planId, plan.planId);
    assert.strictEqual(q.requiredPendingCount, 6, 'Empty plan must have 6 required pending');
    assert.strictEqual(q.optionalPendingCount, 1, 'Empty plan must have 1 optional pending');
    assert.strictEqual(q.requiredFieldsComplete, false);
    assert.strictEqual(q.allQuestionsAddressed, false);
    assert.strictEqual(q.editable, true);
    assert.strictEqual(q.readOnly, false);
    assert.strictEqual(q.confirmed, false);
    assert.strictEqual(q.suggestedAction, 'ask_questions');

    console.log('  - Phase 2.2: Partial answers produce correct filled and pending...');
    await planManager.answer(plan.planId, 'vertical', 'SaaS / Producto Digital');
    const q2 = await planManager.questions(plan.planId);
    assert.strictEqual(q2.filledCount, 1);
    assert.strictEqual(q2.requiredPendingCount, 5);
    const filledIds = q2.filled.map(f => f.id);
    assert.ok(filledIds.includes('vertical'), 'vertical must be in filled');
    const pendingIds = q2.pending.map(f => f.id);
    assert.ok(!pendingIds.includes('vertical'), 'vertical must not be in pending');

    console.log('  - Phase 2.3: Required complete + unasked assets gives requiredFieldsComplete true, allQuestionsAddressed false...');
    await planManager.answer(plan.planId, 'audiencia', 'Devs');
    await planManager.answer(plan.planId, 'formato', 'Instagram Post (1080x1080)');
    await planManager.answer(plan.planId, 'paleta', 'Azul');
    await planManager.answer(plan.planId, 'copy', 'Hola mundo');
    await planManager.answer(plan.planId, 'cta', 'Comprar Ahora');
    const q3 = await planManager.questions(plan.planId);
    assert.strictEqual(q3.requiredFieldsComplete, true, 'All required fields filled');
    assert.strictEqual(q3.allQuestionsAddressed, false, 'Assets not asked yet');
    assert.strictEqual(q3.requiredPendingCount, 0);

    console.log('  - Phase 2.4: Empty assets marks optionalAnsweredStatus.assets true...');
    await planManager.answer(plan.planId, 'assets', '');
    const q4 = await planManager.questions(plan.planId);
    assert.strictEqual(q4.optionalAnsweredStatus.assets, true);
    assert.strictEqual(q4.allQuestionsAddressed, true);

    console.log('  - Phase 2.5: Non-empty assets also marks optionalAnswered true...');
    const plan2 = await planManager.create({ name: 'Assets Non Empty' });
    await planManager.answer(plan2.planId, 'vertical', 'Moda');
    await planManager.answer(plan2.planId, 'audiencia', 'Jovenes');
    await planManager.answer(plan2.planId, 'formato', '1080x1080');
    await planManager.answer(plan2.planId, 'paleta', 'Rojo');
    await planManager.answer(plan2.planId, 'copy', 'Venta');
    await planManager.answer(plan2.planId, 'cta', 'Comprar');
    await planManager.answer(plan2.planId, 'assets', 'Logo en PNG');
    const q5 = await planManager.questions(plan2.planId);
    assert.strictEqual(q5.optionalAnsweredStatus.assets, true);
    assert.strictEqual(q5.allQuestionsAddressed, true);

    console.log('  - Phase 2.6: Confirmed plan returns read-only with retry_resolve...');
    await planManager.confirmDecisions(plan.planId, { by: 'user' });
    const q6 = await planManager.questions(plan.planId);
    assert.strictEqual(q6.readOnly, true);
    assert.strictEqual(q6.suggestedAction, 'retry_resolve');

    console.log('  - Phase 2.7: Invalid field exits with GSDC_INVALID_FIELD...');
    const plan3 = await planManager.create({ name: 'Bad Field' });
    try {
      await planManager.answer(plan3.planId, 'nonexistent', 'value');
      assert.fail('Should have thrown for invalid field');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_INVALID_FIELD');
      assert.strictEqual(err.exitCode, 22);
    }

    console.log('  - Phase 2.8: Wrong state exits with GSDC_INVALID_STATE...');
    const decisionsPath = path.join('canva-plans', `plan_${plan3.planId}_bad-field`, 'decisions.json');
    const d = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'));
    d.confirmation = { confirmed: true, confirmedAt: new Date().toISOString(), confirmedBy: 'user', source: 'chat', hashAlgorithm: 'sha256-decisions-v2', decisionsHash: 'fake' };
    fs.writeFileSync(decisionsPath, JSON.stringify(d, null, 2), 'utf8');
    const planPath = path.join('canva-plans', `plan_${plan3.planId}_bad-field`, 'plan.json');
    const p = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    p.status = 'ready_for_html';
    fs.writeFileSync(planPath, JSON.stringify(p, null, 2), 'utf8');
    try {
      await planManager.answer(plan3.planId, 'vertical', 'Test');
      assert.fail('Should have thrown for wrong state');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_INVALID_STATE');
      assert.strictEqual(err.exitCode, 13);
    }

    console.log('  - Phase 2.9: Confirmed decisions exit with locked-decisions error...');
    const plan4 = await planManager.create({ name: 'Locked Decisions' });
    await planManager.answer(plan4.planId, 'vertical', 'SaaS / Producto Digital');
    await planManager.answer(plan4.planId, 'audiencia', 'Devs');
    await planManager.answer(plan4.planId, 'formato', 'Instagram Post (1080x1080)');
    await planManager.answer(plan4.planId, 'paleta', 'Azul');
    await planManager.answer(plan4.planId, 'copy', 'Test');
    await planManager.answer(plan4.planId, 'cta', 'Comprar Ahora');
    await planManager.answer(plan4.planId, 'assets', '');
    await planManager.confirmDecisions(plan4.planId, { by: 'user' });
    try {
      await planManager.answer(plan4.planId, 'vertical', 'Nuevo');
      assert.fail('Should have thrown for locked decisions');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_DECISIONS_LOCKED');
      assert.strictEqual(err.exitCode, 23);
    }

    console.log('  - Phase 2.10: Numeric choice values are rejected...');
    const plan5 = await planManager.create({ name: 'Numeric Choice' });
    try {
      await planManager.answer(plan5.planId, 'vertical', '3');
      assert.fail('Should have rejected numeric choice');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_INVALID_CHOICE_VALUE');
      assert.strictEqual(err.exitCode, 26);
      assert.strictEqual(err.details.reason, 'numeric_value');
    }

    console.log('  - Phase 2.11: Custom choice values accepted when allowCustom is true...');
    const ansCustom = await planManager.answer(plan5.planId, 'vertical', 'Mi Vertical Custom');
    assert.strictEqual(ansCustom.value, 'Mi Vertical Custom');

    console.log('  - Phase 2.12: Placeholder exact values are rejected...');
    try {
      await planManager.answer(plan5.planId, 'paleta', 'TODO');
      assert.fail('Should reject placeholder');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_INVALID_CHOICE_VALUE');
      assert.strictEqual(err.details.reason, 'placeholder_value');
    }

    console.log('  - Phase 2.13: "TODO: definir colores" is NOT treated as placeholder...');
    const ansTodo = await planManager.answer(plan5.planId, 'paleta', 'TODO: definir colores');
    assert.strictEqual(ansTodo.value, 'TODO: definir colores');

    console.log('  - Phase 2.14: Bracket-wrapped placeholder is rejected...');
    try {
      await planManager.answer(plan5.planId, 'copy', '[pendiente]');
      assert.fail('Should reject bracket placeholder');
    } catch (err) {
      assert.strictEqual(err.details.reason, 'placeholder_value');
    }

    console.log('  - Phase 2.15: Canonical choice matching works case-insensitive...');
    const ansCanon = await planManager.answer(plan5.planId, 'cta', 'comprar ahora');
    assert.strictEqual(ansCanon.value, 'Comprar Ahora', 'Must save canonical value');

    console.log('  - Phase 2.16: questions() releases lock on parse errors...');
    const plan6 = await planManager.create({ name: 'Lock Test' });
    const dp6 = path.join('canva-plans', `plan_${plan6.planId}_lock-test`, 'decisions.json');
    fs.writeFileSync(dp6, '{invalid json', 'utf8');
    let threw = false;
    try {
      await planManager.questions(plan6.planId);
    } catch (err) {
      threw = true;
    }
    assert.ok(threw, 'questions() must throw on invalid JSON');
    const lockFile = path.join(process.cwd(), '.gsd-canva', '.lock');
    assert.ok(!fs.existsSync(lockFile), 'Lock must be released after questions error');

    console.log('  - Phase 2.17: Required empty value returns warning...');
    const plan7 = await planManager.create({ name: 'Empty Required' });
    const ansEmpty = await planManager.answer(plan7.planId, 'vertical', '');
    assert.strictEqual(ansEmpty.warning, 'empty_value_for_required_field');

    console.log('  - Phase 2.18: questions() does not throw GSDC_INVALID_STATE for any state...');
    const q7 = await planManager.questions(plan4.planId);
    assert.strictEqual(q7.readOnly, true);

  } finally {
    process.chdir(originalCwd);
  }
}

module.exports = { run };
