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

async function createFilledPlan(name) {
  const plan = await planManager.create({ name });
  await planManager.answer(plan.planId, 'vertical', 'SaaS / Producto Digital');
  await planManager.answer(plan.planId, 'audiencia', 'Devs');
  await planManager.answer(plan.planId, 'formato', 'Instagram Post (1080x1080)');
  await planManager.answer(plan.planId, 'paleta', 'Azul');
  await planManager.answer(plan.planId, 'copy', 'Test');
  await planManager.answer(plan.planId, 'cta', 'Comprar Ahora');
  await planManager.answer(plan.planId, 'assets', '');
  return plan;
}

async function run() {
  const originalCwd = setupTestProject();

  try {
    await installer.init({ frameworkVersion: '1.0.0' });

    console.log('  - Phase 3.1: Reset clears confirmation/hash and preserves required values...');
    const plan1 = await createFilledPlan('Reset Test 1');
    await planManager.confirmDecisions(plan1.planId, { by: 'user' });
    await planManager.resolveQuestions(plan1.planId);

    const reset1 = await planManager.resetConfirmation(plan1.planId);
    assert.strictEqual(reset1.reset, true);

    const dp1 = path.join('canva-plans', `plan_${plan1.planId}_reset-test-1`, 'decisions.json');
    const d1 = JSON.parse(fs.readFileSync(dp1, 'utf8'));
    assert.strictEqual(d1.confirmation.confirmed, false);
    assert.strictEqual(d1.confirmation.confirmedAt, null);
    assert.strictEqual(d1.confirmation.decisionsHash, '');
    assert.strictEqual(d1.vertical, 'SaaS / Producto Digital', 'Required field must be preserved');
    assert.strictEqual(d1.copy, 'Test', 'Required field must be preserved');

    console.log('  - Phase 3.2: Reset clears optional values and optionalAnswered...');
    assert.strictEqual(d1.assets, '', 'Optional assets must be cleared');
    assert.deepStrictEqual(d1.optionalAnswered, {}, 'optionalAnswered must be cleared');

    console.log('  - Phase 3.3: Reset returns plan to mockup:questions_pending...');
    const pp1 = path.join('canva-plans', `plan_${plan1.planId}_reset-test-1`, 'plan.json');
    const p1 = JSON.parse(fs.readFileSync(pp1, 'utf8'));
    assert.strictEqual(p1.phase, 'mockup');
    assert.strictEqual(p1.status, 'questions_pending');

    console.log('  - Phase 3.4: Reset is idempotent...');
    const reset2 = await planManager.resetConfirmation(plan1.planId);
    assert.strictEqual(reset2.reset, true);

    console.log('  - Phase 3.5: Reset from disallowed final states fails...');
    const plan2 = await createFilledPlan('Final State');
    await planManager.confirmDecisions(plan2.planId, { by: 'user' });
    await planManager.resolveQuestions(plan2.planId);
    const mockupPath = path.join('canva-plans', `plan_${plan2.planId}_final-state`, 'mockup.html');
    fs.writeFileSync(mockupPath, '<h1>Test</h1>', 'utf8');
    await planManager.submitMockup(plan2.planId);
    await planManager.transitionState(plan2.planId, 'approve-mockup');

    try {
      await planManager.resetConfirmation(plan2.planId);
      assert.fail('Should fail reset from approved state');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_INVALID_STATE');
      assert.strictEqual(err.exitCode, 13);
    }

    console.log('  - Phase 3.6: Stale mockup is renamed...');
    const plan3 = await createFilledPlan('Stale Rename');
    await planManager.confirmDecisions(plan3.planId, { by: 'user' });
    await planManager.resolveQuestions(plan3.planId);
    const mp3 = path.join('canva-plans', `plan_${plan3.planId}_stale-rename`, 'mockup.html');
    fs.writeFileSync(mp3, '<h1>Old Mockup</h1>', 'utf8');

    const reset3 = await planManager.resetConfirmation(plan3.planId);
    assert.strictEqual(reset3.reset, true);
    assert.ok(!fs.existsSync(mp3), 'mockup.html must be renamed');
    const staleFiles = fs.readdirSync(path.dirname(mp3)).filter(f => f.startsWith('mockup.html.stale'));
    assert.strictEqual(staleFiles.length, 1, 'Stale mockup file must exist');

    console.log('  - Phase 3.7: Reset without stale mockup works cleanly...');
    const plan4 = await createFilledPlan('No Stale');
    await planManager.confirmDecisions(plan4.planId, { by: 'user' });
    await planManager.resolveQuestions(plan4.planId);
    const reset4 = await planManager.resetConfirmation(plan4.planId);
    assert.strictEqual(reset4.reset, true);
    assert.strictEqual(reset4.staleRenameFailed, false, 'No stale rename when no mockup.html');
    assert.strictEqual(reset4.staleRenameError, undefined);

    console.log('  - Phase 3.8: resetConfirmation() releases lock on errors...');
    const plan5 = await createFilledPlan('Lock Release');
    await planManager.confirmDecisions(plan5.planId, { by: 'user' });
    const dp5 = path.join('canva-plans', `plan_${plan5.planId}_lock-release`, 'decisions.json');
    fs.writeFileSync(dp5, '{bad json', 'utf8');
    try {
      await planManager.resetConfirmation(plan5.planId);
    } catch (err) {
      // expected
    }
    const lockFile = path.join(process.cwd(), '.gsd-canva', '.lock');
    assert.ok(!fs.existsSync(lockFile), 'Lock must be released after resetConfirmation error');

    console.log('  - Phase 3.9: submitMockup() rejects stale mockup.html...');
    const plan6 = await createFilledPlan('Stale Mockup');
    await planManager.confirmDecisions(plan6.planId, { by: 'user' });
    await planManager.resolveQuestions(plan6.planId);
    const mp6 = path.join('canva-plans', `plan_${plan6.planId}_stale-mockup`, 'mockup.html');
    fs.writeFileSync(mp6, '<h1>Old</h1>', 'utf8');
    const oldTime = new Date('2020-01-01T00:00:00Z');
    fs.utimesSync(mp6, oldTime, oldTime);

    try {
      await planManager.submitMockup(plan6.planId);
      assert.fail('Should reject stale mockup');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_STALE_MOCKUP');
      assert.strictEqual(err.exitCode, 27);
    }

    console.log('  - Phase 3.10: Unknown hash version fails with reason unknown_hash_version...');
    const plan7 = await createFilledPlan('Unknown Hash V3');
    const dp7 = path.join('canva-plans', `plan_${plan7.planId}_unknown-hash-v3`, 'decisions.json');
    const d7 = JSON.parse(fs.readFileSync(dp7, 'utf8'));
    d7.confirmation = {
      confirmed: true, confirmedAt: new Date().toISOString(), confirmedBy: 'user',
      source: 'chat', hashAlgorithm: 'sha256-decisions-v99', decisionsHash: 'fake'
    };
    fs.writeFileSync(dp7, JSON.stringify(d7, null, 2), 'utf8');
    try {
      await planManager.resolveQuestions(plan7.planId);
      assert.fail('Should fail with unknown hash version');
    } catch (err) {
      assert.strictEqual(err.details.reason, 'unknown_hash_version');
    }

    console.log('  - Phase 3.11: Existing v1 confirmed plans still resolve/submit...');
    const plan8 = await planManager.create({ name: 'V1 Legacy' });
    const dp8 = path.join('canva-plans', `plan_${plan8.planId}_v1-legacy`, 'decisions.json');
    const d8 = JSON.parse(fs.readFileSync(dp8, 'utf8'));
    d8.vertical = 'Moda'; d8.audiencia = 'Jovenes'; d8.formato = '1080x1080';
    d8.paleta = 'Rojo'; d8.copy = 'Venta'; d8.cta = 'Comprar';
    fs.writeFileSync(dp8, JSON.stringify(d8, null, 2), 'utf8');

    const v1Hash = planManager.computeDecisionsHash(d8, 'sha256-decisions-v1');
    d8.confirmation = { confirmed: true, confirmedAt: new Date().toISOString(), confirmedBy: 'user', source: 'chat', hashAlgorithm: 'sha256-decisions-v1', decisionsHash: v1Hash };
    fs.writeFileSync(dp8, JSON.stringify(d8, null, 2), 'utf8');

    const res8 = await planManager.resolveQuestions(plan8.planId);
    assert.strictEqual(res8.plan.status, 'ready_for_html');

    const mp8 = path.join('canva-plans', `plan_${plan8.planId}_v1-legacy`, 'mockup.html');
    fs.writeFileSync(mp8, '<h1>V1</h1>', 'utf8');
    const sub8 = await planManager.submitMockup(plan8.planId);
    assert.strictEqual(sub8.plan.status, 'pending_approval');

    console.log('  - Phase 3.12: v2 plans detect post-confirmation tampering...');
    const plan9 = await createFilledPlan('V2 Tamper');
    await planManager.confirmDecisions(plan9.planId, { by: 'user' });
    const dp9 = path.join('canva-plans', `plan_${plan9.planId}_v2-tamper`, 'decisions.json');
    const d9 = JSON.parse(fs.readFileSync(dp9, 'utf8'));
    d9.vertical = 'Modified';
    fs.writeFileSync(dp9, JSON.stringify(d9, null, 2), 'utf8');
    try {
      await planManager.resolveQuestions(plan9.planId);
      assert.fail('Should detect tampering');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION');
    }

    console.log('  - Phase 3.13: plan reset-confirmation --json is not double-wrapped...');
    const plan10 = await createFilledPlan('CLI Reset JSON');
    await planManager.confirmDecisions(plan10.planId, { by: 'user' });
    await planManager.resolveQuestions(plan10.planId);
    const { execSync } = require('child_process');
    const cliBin = path.resolve(__dirname, '../bin/gsd-canva.js');
    const jsonOut = execSync(`node "${cliBin}" plan reset-confirmation --id ${plan10.planId} --json`, {
      cwd: process.cwd(), encoding: 'utf8'
    });
    const parsed = JSON.parse(jsonOut.trim());
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.data.reset, true);
    assert.ok(!parsed.data.data, 'Must not double-wrap');

  } finally {
    process.chdir(originalCwd);
  }
}

module.exports = { run };
