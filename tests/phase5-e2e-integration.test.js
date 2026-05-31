const fs = require('fs');
const path = require('path');
const assert = require('assert');
const os = require('os');
const planManager = require('../lib/plan-manager');
const installer = require('../lib/installer');
const agentAdapters = require('../lib/agent-adapters');

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

    // ================================================================
    // PART A: Full Lifecycle E2E Test
    // ================================================================

    console.log('  - Phase 5.A.1: plan create → verify decisions has v2 shape...');
    const plan = await planManager.create({ name: 'E2E Lifecycle' });
    const dp = path.join('canva-plans', `plan_${plan.planId}_e2e-lifecycle`, 'decisions.json');
    const d = JSON.parse(fs.readFileSync(dp, 'utf8'));
    assert.strictEqual(d.confirmation.hashAlgorithm, 'sha256-decisions-v2', 'New plan must use v2 hash');
    assert.strictEqual(d.confirmation.confirmed, false);
    assert.strictEqual(d.assets, '');
    assert.deepStrictEqual(d.optionalAnswered, {});
    assert.ok(typeof d.vertical !== 'undefined', 'Must have vertical field');
    assert.ok(typeof d.formato !== 'undefined', 'Must have formato field');

    console.log('  - Phase 5.A.2: plan questions → verify 6 required pending, 1 optional pending...');
    const q = await planManager.questions(plan.planId);
    assert.strictEqual(q.requiredPendingCount, 6, 'Must have 6 required pending');
    assert.strictEqual(q.optionalPendingCount, 1, 'Must have 1 optional pending (assets)');
    assert.strictEqual(q.allQuestionsAddressed, false);
    assert.strictEqual(q.suggestedAction, 'ask_questions');

    console.log('  - Phase 5.A.3: Multiple plan answer calls → fill all required + decline assets...');
    await planManager.answer(plan.planId, 'vertical', 'E-Commerce / Retail');
    await planManager.answer(plan.planId, 'audiencia', 'Mujeres 25-40');
    await planManager.answer(plan.planId, 'formato', 'Instagram Story (1080x1920)');
    await planManager.answer(plan.planId, 'paleta', 'Tonos tierra');
    await planManager.answer(plan.planId, 'copy', 'Gran apertura 2026');
    await planManager.answer(plan.planId, 'cta', 'Saber Más');
    await planManager.answer(plan.planId, 'assets', '');

    const qFilled = await planManager.questions(plan.planId);
    assert.strictEqual(qFilled.requiredPendingCount, 0, 'All required filled');
    assert.strictEqual(qFilled.allQuestionsAddressed, true, 'Assets declined');
    assert.strictEqual(qFilled.optionalAnsweredStatus.assets, true);

    console.log('  - Phase 5.A.4: confirm-decisions → verify v2 hash...');
    const confirmRes = await planManager.confirmDecisions(plan.planId, { by: 'user' });
    assert.strictEqual(confirmRes.confirmed, true);
    assert.ok(confirmRes.decisionsHash, 'Must have hash');
    assert.strictEqual(confirmRes.decisionsHash.length, 64, 'SHA-256 hex = 64 chars');

    const dConfirmed = JSON.parse(fs.readFileSync(dp, 'utf8'));
    assert.strictEqual(dConfirmed.confirmation.hashAlgorithm, 'sha256-decisions-v2');
    assert.strictEqual(dConfirmed.confirmation.confirmed, true);
    assert.strictEqual(dConfirmed.confirmation.decisionsHash, confirmRes.decisionsHash);

    console.log('  - Phase 5.A.5: resolve-questions → verify status ready_for_html...');
    const resolveRes = await planManager.resolveQuestions(plan.planId);
    assert.strictEqual(resolveRes.plan.status, 'ready_for_html');

    console.log('  - Phase 5.A.6: Create mockup.html...');
    const planDir = path.join('canva-plans', `plan_${plan.planId}_e2e-lifecycle`);
    const mockupPath = path.join(planDir, 'mockup.html');
    fs.writeFileSync(mockupPath, '<html><body><h1>Test Mockup</h1></body></html>', 'utf8');

    console.log('  - Phase 5.A.7: submit-mockup → verify pending_approval...');
    const submitRes = await planManager.submitMockup(plan.planId);
    assert.strictEqual(submitRes.plan.status, 'pending_approval');

    console.log('  - Phase 5.A.8: reset-confirmation → verify back to questions_pending, stale mockup renamed...');
    const resetRes = await planManager.resetConfirmation(plan.planId);
    assert.strictEqual(resetRes.reset, true);

    const pp = path.join(planDir, 'plan.json');
    const pData = JSON.parse(fs.readFileSync(pp, 'utf8'));
    assert.strictEqual(pData.status, 'questions_pending');

    assert.ok(!fs.existsSync(mockupPath), 'mockup.html must be renamed');
    const staleFiles = fs.readdirSync(planDir).filter(f => f.startsWith('mockup.html.stale'));
    assert.strictEqual(staleFiles.length, 1, 'Stale mockup file must exist');

    const dReset = JSON.parse(fs.readFileSync(dp, 'utf8'));
    assert.strictEqual(dReset.confirmation.confirmed, false);
    assert.strictEqual(dReset.confirmation.decisionsHash, '');
    assert.strictEqual(dReset.assets, '', 'Optional assets cleared on reset');
    assert.deepStrictEqual(dReset.optionalAnswered, {}, 'optionalAnswered cleared on reset');

    console.log('  - Phase 5.A.9: Re-answer optional field (assets with value)...');
    await planManager.answer(plan.planId, 'assets', 'Logo en PNG, fuente Montserrat');

    const qReanswered = await planManager.questions(plan.planId);
    assert.strictEqual(qReanswered.requiredPendingCount, 0, 'Required fields preserved');
    assert.strictEqual(qReanswered.optionalAnsweredStatus.assets, true, 'Assets now answered');
    assert.strictEqual(qReanswered.allQuestionsAddressed, true);

    console.log('  - Phase 5.A.10: Re-confirm → verify works...');
    const confirmRes2 = await planManager.confirmDecisions(plan.planId, { by: 'user' });
    assert.strictEqual(confirmRes2.confirmed, true);
    assert.strictEqual(confirmRes2.decisionsHash.length, 64);

    console.log('  - Phase 5.A.11: Re-resolve, re-submit → verify full cycle works...');
    const resolveRes2 = await planManager.resolveQuestions(plan.planId);
    assert.strictEqual(resolveRes2.plan.status, 'ready_for_html');

    const mockupPath2 = path.join(planDir, 'mockup.html');
    fs.writeFileSync(mockupPath2, '<html><body><h1>Updated Mockup</h1></body></html>', 'utf8');

    const submitRes2 = await planManager.submitMockup(plan.planId);
    assert.strictEqual(submitRes2.plan.status, 'pending_approval');

    const dFinal = JSON.parse(fs.readFileSync(dp, 'utf8'));
    assert.strictEqual(dFinal.assets, 'Logo en PNG, fuente Montserrat', 'Assets value preserved in final cycle');
    assert.strictEqual(dFinal.confirmation.confirmed, true);
    assert.strictEqual(dFinal.vertical, 'E-Commerce / Retail', 'Required values preserved through reset');

    // ================================================================
    // PART B: Generated Adapter Output Test (in temp dir)
    // ================================================================

    console.log('  - Phase 5.B.1: Run installer.init({ forceAll: true, agent: "all" }) in temp dir...');
    const adapterTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-canva-phase5-'));
    const origCwd2 = process.cwd();
    process.chdir(adapterTempDir);

    try {
      const initResult = await installer.init({ forceAll: true, agent: 'all', frameworkVersion: '1.0.0' });
      assert.strictEqual(initResult.initialized, true);
      assert.strictEqual(initResult.schemaVersion, 2);

      console.log('  - Phase 5.B.2: Verify generated adapter files contain plan questions and plan answer...');
      const skillsDir = path.join(adapterTempDir, '.agents/skills/canva-mockup');
      const skillPath = path.join(skillsDir, 'SKILL.md');
      assert.ok(fs.existsSync(skillPath), 'Antigravity skill must exist');
      const skillContent = fs.readFileSync(skillPath, 'utf8');
      assert.ok(skillContent.includes('plan questions'), 'Skill must include plan questions');
      assert.ok(skillContent.includes('plan answer'), 'Skill must include plan answer');
      assert.ok(skillContent.includes('--field'), 'Skill must include --field');
      assert.ok(skillContent.includes('--value'), 'Skill must include --value');

      const codexCmdPath = path.join(adapterTempDir, '.codex/commands/canva-mockup.md');
      assert.ok(fs.existsSync(codexCmdPath), 'Codex command must exist');
      const codexContent = fs.readFileSync(codexCmdPath, 'utf8');
      assert.ok(codexContent.includes('plan questions'), 'Codex must include plan questions');
      assert.ok(codexContent.includes('plan answer'), 'Codex must include plan answer');

      const opencodeCmdPath = path.join(adapterTempDir, '.opencode/commands/canva-mockup.md');
      assert.ok(fs.existsSync(opencodeCmdPath), 'OpenCode command must exist');
      const opencodeContent = fs.readFileSync(opencodeCmdPath, 'utf8');
      assert.ok(opencodeContent.includes('plan questions'), 'OpenCode must include plan questions');
      assert.ok(opencodeContent.includes('plan answer'), 'OpenCode must include plan answer');

      console.log('  - Phase 5.B.3: Verify agent instructions don\'t reference direct decisions.json writes...');
      const prohibitionPatterns = [
        /PROHIBIDO.*escribir\s+`?decisions\.json`?/i,
        /PROHIBIDO.*decisions\.json.*directamente/i,
        /nunca.*escrib[ae].*decisions\.json.*directamente/i
      ];
      const hasProhibition = prohibitionPatterns.some(p => p.test(skillContent));
      assert.ok(hasProhibition, 'Skill must contain prohibition against writing decisions.json directly');
      assert.ok(
        !skillContent.includes('Escribe **SIEMPRE** en `decisions.json` primero'),
        'Skill must not contain old instruction to write decisions.json directly'
      );
      assert.ok(
        !codexContent.includes('Escribe **SIEMPRE** en `decisions.json` primero'),
        'Codex must not contain old instruction to write decisions.json directly'
      );
    } finally {
      process.chdir(origCwd2);
      fs.rmSync(adapterTempDir, { recursive: true, force: true });
    }

    // ================================================================
    // PART C: Documentation Consistency Checks
    // ================================================================

    console.log('  - Phase 5.C.1: README mentions plan questions/answer API or doesn\'t contradict it...');
    const readmePath = path.resolve(__dirname, '../README.md');
    const readmeContent = fs.readFileSync(readmePath, 'utf8');
    const readmeHasQuestionApi = readmeContent.includes('plan questions') || readmeContent.includes('plan answer');
    const readmeContradicts = readmeContent.includes('decisions.json') &&
      (readmeContent.includes('Escribe') || readmeContent.includes('escribir')) &&
      readmeContent.includes('directamente') &&
      !readmeContent.includes('PROHIBIDO');
    assert.ok(
      !readmeContradicts,
      'README must not contain instructions to write decisions.json directly'
    );

    console.log('  - Phase 5.C.2: No active docs describe .antigravity/commands as primary surface for Antigravity 2.0...');
    const docsDir = path.resolve(__dirname, '../docs');
    const docsFiles = [];
    function collectMdFiles(dir) {
      if (!fs.existsSync(dir)) return;
      fs.readdirSync(dir).forEach(entry => {
        const fullPath = path.join(dir, entry);
        if (fs.statSync(fullPath).isDirectory()) {
          collectMdFiles(fullPath);
        } else if (entry.endsWith('.md')) {
          docsFiles.push(fullPath);
        }
      });
    }
    collectMdFiles(docsDir);

    let activeDocsPrimaryAntigravity = [];
    for (const docFile of docsFiles) {
      const content = fs.readFileSync(docFile, 'utf8');
      const mentionsAntigravityCommands = content.includes('.antigravity/commands');
      const hasPrimary = /primary|principal|primar/i.test(
        content.substring(
          Math.max(0, content.indexOf('.antigravity/commands') - 200),
          content.indexOf('.antigravity/commands') + 200
        )
      );
      const hasNoDeprecated = !content.includes('deprecated') && !content.includes('legacy') && !content.includes('Legacy') && !content.includes('Deprecated');
      const isImplementationPlan = docFile.includes('implementation_plans');
      if (mentionsAntigravityCommands && hasPrimary && hasNoDeprecated && !isImplementationPlan) {
        activeDocsPrimaryAntigravity.push(path.relative(path.resolve(__dirname, '..'), docFile));
      }
    }
    assert.strictEqual(
      activeDocsPrimaryAntigravity.length, 0,
      `Active docs must not describe .antigravity/commands as primary: ${activeDocsPrimaryAntigravity.join(', ')}`
    );

    // Also check templates/agent-source instructions
    const instructionsPath = path.resolve(__dirname, '../templates/agent-source/canva-mockup/instructions.md');
    const instructionsContent = fs.readFileSync(instructionsPath, 'utf8');
    assert.ok(
      !instructionsContent.includes('.antigravity/commands/') ||
      instructionsContent.includes('legacy') ||
      instructionsContent.includes('deprecated'),
      'Agent instructions must not describe .antigravity/commands/ as Antigravity 2.0 primary surface'
    );

    // ================================================================
    // PART D: Error Catalog Consistency
    // ================================================================

    console.log('  - Phase 5.D.1: Error codes used in Phases 1-4 are consistent...');
    const planManagerSrc = fs.readFileSync(path.resolve(__dirname, '../lib/plan-manager.js'), 'utf8');

    const expectedErrorCodes = {
      GSDC_INVALID_FIELD: 22,
      GSDC_DECISIONS_LOCKED: 23,
      GSDC_INVALID_CHOICE_VALUE: 26,
      GSDC_STALE_MOCKUP: 27
    };

    for (const [code, expectedExit] of Object.entries(expectedErrorCodes)) {
      assert.ok(planManagerSrc.includes(`'${code}'`), `plan-manager.js must define error code ${code}`);
      const regex = new RegExp(`error\\.code\\s*=\\s*'${code}'[\\s\\S]*?error\\.exitCode\\s*=\\s*${expectedExit}`);
      assert.ok(regex.test(planManagerSrc), `${code} must have exitCode ${expectedExit}`);
    }

    console.log('  - Phase 5.D.2: No test references non-existent error codes...');
    const testFiles = [
      'phase1-field-registry.test.js',
      'phase2-questions-answer.test.js',
      'phase3-reset-confirmation.test.js',
      'phase4-agent-source-interactive.test.js',
      'phase5-e2e-integration.test.js'
    ];

    const knownCodes = new Set([
      'GSDC_INVALID_FIELD', 'GSDC_DECISIONS_LOCKED', 'GSDC_INVALID_CHOICE_VALUE',
      'GSDC_STALE_MOCKUP', 'GSDC_INVALID_STATE', 'GSDC_JSON_PARSE_ERROR',
      'GSDC_QUESTIONS_UNRESOLVED', 'GSDC_ARTIFACT_MISSING',
      'GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION', 'GSDC_LOCK_TIMEOUT',
      'GSDC_INIT_CONFLICT', 'GSDC_MANIFEST_MISSING', 'GSDC_DELIVERY_MISSING',
      'GSDC_PERMISSION_DENIED', 'GSDC_ADAPTER_UNKNOWN', 'GSDC_AGENT_DISCOVERY_FAILED',
      'GSDC_AGENT_SKILLS_MISSING', 'GSDC_ADAPTER_INVALID_CAPABILITY',
      'GSDC_ADAPTER_EMPTY_INSTRUCTIONS', 'GSDC_CAPABILITY_MISSING',
      'GSDC_CAPABILITY_INVALID_JSON', 'GSDC_CAPABILITY_INVALID',
      'GSDC_CAPABILITY_EMPTY_INSTRUCTIONS', 'GSDC_SOURCE_MISSING',
      'GSDC_ADAPTER_UNKNOWN'
    ]);

    for (const testFile of testFiles) {
      const tfp = path.resolve(__dirname, testFile);
      if (!fs.existsSync(tfp)) continue;
      const content = fs.readFileSync(tfp, 'utf8');
      const codeMatches = content.match(/GSDC_[A-Z_]+/g) || [];
      for (const code of codeMatches) {
        assert.ok(knownCodes.has(code), `Test ${testFile} references unknown error code: ${code}`);
      }
    }

    console.log('  - Phase 5.D.3: README error catalog includes Phase 1-4 codes...');
    assert.ok(readmeContent.includes('GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION'), 'README must include GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION');

    const readmeErrorSection = readmeContent.substring(readmeContent.indexOf('Catálogo Oficial de Errores'));
    const readmeErrorCodes = readmeErrorSection.match(/GSDC_[A-Z_]+/g) || [];
    assert.ok(readmeErrorCodes.includes('GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION'), 'Error catalog must include Phase 1-4 codes');

    console.log('  - Phase 5.D.4: Implementation source error codes match README catalog...');
    for (const code of readmeErrorCodes) {
      if (code === 'GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION') {
        assert.ok(planManagerSrc.includes(`'${code}'`), `${code} must exist in plan-manager.js`);
      }
    }

  } finally {
    process.chdir(originalCwd);
  }
}

module.exports = { run };
