const fs = require('fs');
const path = require('path');
const assert = require('assert');
const os = require('os');
const planManager = require('../lib/plan-manager');
const gessoManager = require('../lib/gesso-manager');
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
      'GSDC_ADAPTER_UNKNOWN',
      'GSDC_GESSO_NOT_FOUND', 'GSDC_GESSO_INVALID_STATE',
      'GSDC_GESSO_ARTIFACT_MISSING', 'GSDC_GESSO_INVALID_ARTIFACT',
      'GSDC_GESSO_CHANGED_AFTER_CONFIRMATION', 'GSDC_GESSO_LINK_FAILED'
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
    const readmeErrorSection = readmeContent.substring(readmeContent.indexOf('Catálogo Oficial de Errores'));
    for (const code of Object.keys(expectedErrorCodes)) {
      assert.ok(readmeErrorSection.includes(code), `README error catalog must include ${code}`);
    }

    console.log('  - Phase 5.D.4: Implementation source error codes match README catalog...');
    const readmeErrorCodes = readmeErrorSection.match(/\`GSDC_[A-Z_]+\`/g) || [];
    const planManagerCodes = new Set();
    const pmCodeMatches = planManagerSrc.match(/'GSDC_[A-Z_]+'/g) || [];
    pmCodeMatches.forEach(m => planManagerCodes.add(m.replace(/'/g, '')));
    for (const code of readmeErrorCodes) {
      const cleanCode = code.replace(/`/g, '');
      if (planManagerSrc.includes('plan-manager.js') || cleanCode.startsWith('GSDC_')) {
        assert.ok(
          planManagerCodes.has(cleanCode) || fs.readFileSync(path.resolve(__dirname, '../lib/installer.js'), 'utf8').includes(cleanCode) || fs.readFileSync(path.resolve(__dirname, '../bin/gsd-canva.js'), 'utf8').includes(cleanCode) || fs.readFileSync(path.resolve(__dirname, '../lib/gesso-manager.js'), 'utf8').includes(cleanCode),
          `${cleanCode} from README must exist in implementation`
        );
      }
    }

    // ================================================================
    // PART E: Gesso End-to-End Flow
    // ================================================================

    const GESSO_FIXTURE = `# Gesso / Lienzo en Blanco

## Nombre del lienzo
Cafe de Barrio

## Metodologia usada
socratic

## Resumen narrativo
Un café de barrio acogedor con enfoque artesanal.

## Intencion visual y tonal
Cálido, cercano, artesanal. Colores tierra.

## Audiencia y contexto de uso
Vecinos del barrio, 25-60 años.

## Mensaje central
Café de especialidad con alma de barrio.

## Estructura de layout propuesta
Header con logo, sección de productos, footer con horarios.

## Elementos obligatorios
Logo circular, paleta de colores tierra.

## Riesgos o restricciones
Ninguno específico.

## Exploraciones descartadas
Estilo minimalista frío.

## Recomendaciones para Abbozzo
Jerarquía visual clara con el producto como protagonista.
`;

    console.log('  - Phase 5.E.1: Create lienzo...');
    const lienzo = await gessoManager.create({
      name: 'Cafe de Barrio',
      methodology: 'socratic',
      language: 'es'
    });
    assert.strictEqual(lienzo.lienzo.status, 'en_blanco');
    assert.strictEqual(lienzo.lienzo.methodology, 'socratic');
    assert.ok(lienzo.lienzoDir.startsWith('lienzos/lienzo_'), 'Lienzo dir must be under lienzos/');

    console.log('  - Phase 5.E.2: Append turns...');
    const turn1 = await gessoManager.appendTurn(lienzo.lienzoId, 'user', 'Quiero un café de barrio acogedor', ['initial_prompt']);
    assert.strictEqual(turn1.turnCount, 1);
    assert.strictEqual(turn1.turn.role, 'user');
    assert.deepStrictEqual(turn1.turn.tags, ['initial_prompt']);

    const turn2 = await gessoManager.appendTurn(lienzo.lienzoId, 'assistant', '¿Qué sensación debe transmitir?', ['methodology_question']);
    assert.strictEqual(turn2.turnCount, 2);
    assert.strictEqual(turn2.turn.role, 'assistant');

    console.log('  - Phase 5.E.3: Update notes...');
    const noteRes = await gessoManager.updateNotes(lienzo.lienzoId, 'tone', 'Cálido, cercano, artesanal');
    assert.strictEqual(noteRes.field, 'tone');
    assert.strictEqual(noteRes.value, 'Cálido, cercano, artesanal');

    const noteRes2 = await gessoManager.updateNotes(lienzo.lienzoId, 'audience', 'Vecinos del barrio, 25-60 años');
    assert.strictEqual(noteRes2.field, 'audience');

    // Verify sesion.json has the turns and notes
    const lienzoDir = path.join('lienzos', `lienzo_${lienzo.lienzoId}_cafe-de-barrio`);
    const sesionPath = path.join(lienzoDir, 'sesion.json');
    const sesionData = JSON.parse(fs.readFileSync(sesionPath, 'utf8'));
    assert.strictEqual(sesionData.turns.length, 2);
    assert.strictEqual(sesionData.workingNotes.tone, 'Cálido, cercano, artesanal');
    assert.strictEqual(sesionData.workingNotes.audience, 'Vecinos del barrio, 25-60 años');

    console.log('  - Phase 5.E.4: Write gesso.md (valid fixture)...');
    const fixturePath = path.join(lienzoDir, '..', 'fixture_gesso.md');
    fs.writeFileSync(fixturePath, GESSO_FIXTURE, 'utf8');
    const writeRes = await gessoManager.write(lienzo.lienzoId, fixturePath);
    assert.ok(writeRes.gessoMdPath.includes('gesso.md'), 'Must write gesso.md');
    assert.strictEqual(writeRes.lienzo.status, 'en_blanco', 'Status remains en_blanco after write');

    // Clean up fixture
    fs.unlinkSync(fixturePath);

    // Verify gesso.md content was written correctly
    const gessoMdPath = path.join(lienzoDir, 'gesso.md');
    const gessoContent = fs.readFileSync(gessoMdPath, 'utf8');
    assert.ok(gessoContent.includes('Cafe de Barrio'), 'gesso.md must contain lienzo name');
    assert.ok(gessoContent.includes('Jerarquía visual clara'), 'gesso.md must contain recommendations');
    assert.ok(!gessoContent.includes('{{'), 'gesso.md must not contain placeholders');
    assert.ok(!gessoContent.includes('Por definir'), 'gesso.md must not contain placeholder text');

    console.log('  - Phase 5.E.5: Confirm → verify status is gesso_listo...');
    const confirmGessoRes = await gessoManager.confirm(lienzo.lienzoId, { by: 'user' });
    assert.strictEqual(confirmGessoRes.confirmed, true);
    assert.strictEqual(confirmGessoRes.confirmedBy, 'user');
    assert.strictEqual(confirmGessoRes.gessoHash.length, 64, 'SHA-256 hex = 64 chars');
    assert.strictEqual(confirmGessoRes.lienzo.status, 'gesso_listo');
    assert.strictEqual(confirmGessoRes.lienzo.confirmation.confirmed, true);
    assert.strictEqual(confirmGessoRes.lienzo.confirmation.hashAlgorithm, 'sha256-gesso-v1');

    console.log('  - Phase 5.E.6: Verify (gesso verify passes)...');
    const verifyGessoRes = await gessoManager.verify(lienzo.lienzoId);
    assert.strictEqual(verifyGessoRes.verified, true);
    assert.strictEqual(verifyGessoRes.gessoHash, confirmGessoRes.gessoHash);
    assert.strictEqual(verifyGessoRes.hashAlgorithm, 'sha256-gesso-v1');

    // Verify that tampering after confirmation is detected
    fs.writeFileSync(gessoMdPath, GESSO_FIXTURE + '\nTampered content.\n', 'utf8');
    try {
      await gessoManager.verify(lienzo.lienzoId);
      assert.fail('Should have thrown after tampering');
    } catch (e) {
      assert.strictEqual(e.code, 'GSDC_GESSO_CHANGED_AFTER_CONFIRMATION');
      assert.strictEqual(e.exitCode, 35);
    }
    // Restore original
    fs.writeFileSync(gessoMdPath, GESSO_FIXTURE, 'utf8');
    const verifyGessoRes2 = await gessoManager.verify(lienzo.lienzoId);
    assert.strictEqual(verifyGessoRes2.verified, true);

    // Verify append-turn fails after confirmation
    try {
      await gessoManager.appendTurn(lienzo.lienzoId, 'user', 'Intento post-confirmacion');
      assert.fail('Should have thrown on append-turn after confirm');
    } catch (e) {
      assert.strictEqual(e.code, 'GSDC_GESSO_INVALID_STATE');
      assert.strictEqual(e.exitCode, 32);
    }

    // Verify update-notes fails after confirmation
    try {
      await gessoManager.updateNotes(lienzo.lienzoId, 'tone', 'Modificado');
      assert.fail('Should have thrown on update-notes after confirm');
    } catch (e) {
      assert.strictEqual(e.code, 'GSDC_GESSO_INVALID_STATE');
      assert.strictEqual(e.exitCode, 32);
    }

    console.log('  - Phase 5.E.7: Create mockup plan independently...');
    const gessoPlan = await createFilledPlan('Cafe de Barrio');
    assert.ok(gessoPlan.planId, 'Plan must have an ID');
    const planJsonPath = path.join('canva-plans', `plan_${gessoPlan.planId}_cafe-de-barrio`, 'plan.json');
    const planDataForCheck = JSON.parse(fs.readFileSync(planJsonPath, 'utf8'));
    assert.strictEqual(planDataForCheck.sourceLienzoId, undefined, 'Plan created without gesso has no sourceLienzoId');

    console.log('  - Phase 5.E.8: Link gesso to plan...');
    const linkGessoRes = await gessoManager.linkPlan(lienzo.lienzoId, gessoPlan.planId);
    assert.strictEqual(linkGessoRes.linked, true);
    assert.strictEqual(linkGessoRes.lienzo.status, 'con_mockup');
    assert.strictEqual(linkGessoRes.lienzo.linkedPlanId, gessoPlan.planId);
    assert.strictEqual(linkGessoRes.plan.sourceLienzoId, lienzo.lienzoId);

    // Verify lienzo.json on disk
    const lienzoJsonPath = path.join(lienzoDir, 'lienzo.json');
    const lienzoDataOnDisk = JSON.parse(fs.readFileSync(lienzoJsonPath, 'utf8'));
    assert.strictEqual(lienzoDataOnDisk.status, 'con_mockup');
    assert.strictEqual(lienzoDataOnDisk.linkedPlanId, gessoPlan.planId);

    // Verify plan.json on disk has sourceLienzoId
    const planDataLinked = JSON.parse(fs.readFileSync(planJsonPath, 'utf8'));
    assert.strictEqual(planDataLinked.sourceLienzoId, lienzo.lienzoId);

    // Idempotency: link again same lienzo → same plan
    const linkGessoRes2 = await gessoManager.linkPlan(lienzo.lienzoId, gessoPlan.planId);
    assert.strictEqual(linkGessoRes2.linked, true);
    assert.strictEqual(linkGessoRes2.idempotent, true);

    console.log('  - Phase 5.E.9: Plan questions still work normally after link...');
    const qAfterLink = await planManager.questions(gessoPlan.planId);
    assert.strictEqual(qAfterLink.allQuestionsAddressed, true, 'Plan questions must still be addressed after link');

    // Create a fresh plan with just create (no fill) to test questions work
    const planAfterLink = await planManager.create({ name: 'Test After Link' });
    const qAfterLink2 = await planManager.questions(planAfterLink.planId);
    assert.strictEqual(qAfterLink2.requiredPendingCount, 6, 'New plan must have 6 required pending');
    assert.strictEqual(qAfterLink2.suggestedAction, 'ask_questions');

    // Verify confirm-decisions still works (fill all required first)
    await planManager.answer(planAfterLink.planId, 'vertical', 'E-Commerce');
    await planManager.answer(planAfterLink.planId, 'audiencia', 'Usuarios');
    await planManager.answer(planAfterLink.planId, 'formato', 'Instagram Post (1080x1080)');
    await planManager.answer(planAfterLink.planId, 'paleta', 'Oscuro');
    await planManager.answer(planAfterLink.planId, 'copy', 'Test copy');
    await planManager.answer(planAfterLink.planId, 'cta', 'Comprar');
    await planManager.answer(planAfterLink.planId, 'assets', '');
    const confirmPlanAfterLink = await planManager.confirmDecisions(planAfterLink.planId, { by: 'user' });
    assert.strictEqual(confirmPlanAfterLink.confirmed, true);

    console.log('  - Phase 5.E.10: Direct plan creation without gesso still works...');
    // Create plan in a fresh init to isolate
    const noGessoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-canva-nogesso-'));
    const origCwd3 = process.cwd();
    process.chdir(noGessoDir);
    try {
      await installer.init({ frameworkVersion: '1.0.0' });
      const directPlan = await planManager.create({ name: 'Direct Plan No Gesso' });
      assert.ok(directPlan.planId, 'Direct plan must have an ID');

      // Verify the full plan lifecycle still works
      await planManager.answer(directPlan.planId, 'vertical', 'SaaS');
      await planManager.answer(directPlan.planId, 'audiencia', 'Desarrolladores');
      await planManager.answer(directPlan.planId, 'formato', 'Twitter Post (1200x675)');
      await planManager.answer(directPlan.planId, 'paleta', 'Oscuro');
      await planManager.answer(directPlan.planId, 'copy', 'Nuevo producto');
      await planManager.answer(directPlan.planId, 'cta', 'Probar Gratis');
      await planManager.answer(directPlan.planId, 'assets', '');

      const qDirect = await planManager.questions(directPlan.planId);
      assert.strictEqual(qDirect.allQuestionsAddressed, true);

      const cDirect = await planManager.confirmDecisions(directPlan.planId, { by: 'user' });
      assert.strictEqual(cDirect.confirmed, true);

      // Verify no lienzos/ dir was created
      assert.ok(!fs.existsSync(path.join(noGessoDir, 'lienzos')), 'No lienzos/ dir when gesso not used');
    } finally {
      process.chdir(origCwd3);
      fs.rmSync(noGessoDir, { recursive: true, force: true });
    }

    // ================================================================
    // PART F: Gesso Documentation Existence Checks
    // ================================================================

    console.log('  - Phase 5.F.1: gesso.md command reference exists...');
    const gessoCmdDocPath = path.resolve(__dirname, '../docs/commands/gesso.md');
    assert.ok(fs.existsSync(gessoCmdDocPath), 'docs/commands/gesso.md must exist');
    const gessoCmdDoc = fs.readFileSync(gessoCmdDocPath, 'utf8');
    assert.ok(gessoCmdDoc.includes('gesso create'), 'Must document gesso create');
    assert.ok(gessoCmdDoc.includes('gesso confirm'), 'Must document gesso confirm');
    assert.ok(gessoCmdDoc.includes('gesso link-plan'), 'Must document gesso link-plan');
    assert.ok(gessoCmdDoc.includes('GSDC_GESSO_NOT_FOUND'), 'Must document error codes');
    assert.ok(gessoCmdDoc.includes('GSDC_GESSO_CHANGED_AFTER_CONFIRMATION'), 'Must document hash error');

    console.log('  - Phase 5.F.2: User guide exists and covers required topics...');
    const userGuidePath = path.resolve(__dirname, '../docs/guides/gesso_lienzo_en_blanco.md');
    assert.ok(fs.existsSync(userGuidePath), 'docs/guides/gesso_lienzo_en_blanco.md must exist');
    const userGuide = fs.readFileSync(userGuidePath, 'utf8');
    assert.ok(userGuide.includes('lienzo-en-blanco'), 'Must mention lienzo-en-blanco alias');
    assert.ok(userGuide.includes('blank-canvas'), 'Must mention blank-canvas alias');
    assert.ok(userGuide.includes('tela-bianca'), 'Must mention tela-bianca alias');
    assert.ok(userGuide.includes('gesso'), 'Must mention gesso alias');
    assert.ok(userGuide.includes('canva-blank-canvas'), 'Must mention canva-blank-canvas alias');
    assert.ok(userGuide.includes('obligatorio'), 'Must mention Gesso is optional');
    assert.ok(userGuide.includes('no autopobla'), 'Must clarify that Gesso does not autopopulate decisions.json');

    console.log('  - Phase 5.F.3: Developer state model exists and covers required topics...');
    const devDocPath = path.resolve(__dirname, '../docs/developer/gesso_state_model.md');
    assert.ok(fs.existsSync(devDocPath), 'docs/developer/gesso_state_model.md must exist');
    const devDoc = fs.readFileSync(devDocPath, 'utf8');
    assert.ok(devDoc.includes('en_blanco'), 'Must document en_blanco state');
    assert.ok(devDoc.includes('gesso_listo'), 'Must document gesso_listo state');
    assert.ok(devDoc.includes('con_mockup'), 'Must document con_mockup state');
    assert.ok(devDoc.includes('sha256-gesso-v1'), 'Must document hash algorithm');
    assert.ok(devDoc.includes('writeAtomicJson'), 'Must document atomic write pattern');
    assert.ok(devDoc.includes('lockManager'), 'Must document lock manager');

    console.log('  - Phase 5.F.4: README.md and README.es.md have gesso doc links...');
    const readmeMd = fs.readFileSync(path.resolve(__dirname, '../README.md'), 'utf8');
    assert.ok(readmeMd.includes('docs/commands/gesso.md'), 'README.md must link to gesso commands');
    assert.ok(readmeMd.includes('GSDC_GESSO_NOT_FOUND'), 'README.md must include gesso error codes');

    const readmeEs = fs.readFileSync(path.resolve(__dirname, '../README.es.md'), 'utf8');
    assert.ok(readmeEs.includes('docs/guides/gesso_lienzo_en_blanco.md'), 'README.es.md must link to gesso user guide');

  } finally {
    process.chdir(originalCwd);
  }
}

module.exports = { run };
