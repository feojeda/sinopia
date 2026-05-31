const path = require('path');
const fs = require('fs');

async function runAll() {
  console.log('\n==================================================');
  console.log('🧪 INICIANDO SUITE DE PRUEBAS DE GSD-CANVA (FASE 4)');
  console.log('==================================================\n');

  // Limpiar directorio temporal antes de empezar
  const tempDir = path.resolve(__dirname, './temp-project');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  let failed = false;

  try {
    console.log('--- 1. Pruebas de Instalador e Integridad ---');
    const installerTests = require('./installer.test');
    await installerTests.run();
    console.log('🟢 Pruebas de Instalador completadas con éxito.\n');
  } catch (err) {
    console.error('🔴 FAILED: Pruebas de Instalador fallaron.');
    console.error(err);
    failed = true;
  }

  try {
    console.log('--- 2. Pruebas de Máquina de Estados y Concurrencia ---');
    const planTests = require('./plan.test');
    await planTests.run();
    console.log('🟢 Pruebas de Planes y Lockfile completadas con éxito.\n');
  } catch (err) {
    console.error('🔴 FAILED: Pruebas de Planes y Concurrencia fallaron.');
    console.error(err);
    failed = true;
  }

  try {
    console.log('--- 3. Pruebas de Agent Adapters y Renderers ---');
    const adapterTests = require('./adapter.test');
    await adapterTests.run();
    console.log('🟢 Pruebas de Agent Adapters completadas con éxito.\n');
  } catch (err) {
    console.error('🔴 FAILED: Pruebas de Agent Adapters fallaron.');
    console.error(err);
    failed = true;
  }

  try {
    console.log('--- 4. Pruebas de Antigravity 2.0 Skills ---');
    const skillTests = require('./antigravity-skill.test');
    await skillTests.run();
    console.log('🟢 Pruebas de Antigravity 2.0 Skills completadas con éxito.\n');
  } catch (err) {
    console.error('🔴 FAILED: Pruebas de Antigravity 2.0 Skills fallaron.');
    console.error(err);
    failed = true;
  }

  try {
    console.log('--- 5. Pruebas de Codex/OpenCode Adapters (Phase 3) ---');
    const codexOpencodeTests = require('./codex-opencode.test');
    await codexOpencodeTests.run();
    console.log('🟢 Pruebas de Codex/OpenCode Adapters completadas con éxito.\n');
  } catch (err) {
    console.error('🔴 FAILED: Pruebas de Codex/OpenCode Adapters fallaron.');
    console.error(err);
    failed = true;
  }

  try {
    console.log('--- 6. Pruebas de Manifest v2, Upgrade, Adopt, Force-All (Phase 4) ---');
    const p4Tests = require('./manifest-upgrade-adopt.test');
    await p4Tests.run();
    console.log('🟢 Pruebas de Phase 4 (Manifest v2, Upgrade, Adopt) completadas con éxito.\n');
  } catch (err) {
    console.error('🔴 FAILED: Pruebas de Phase 4 (Manifest v2, Upgrade, Adopt) fallaron.');
    console.error(err);
    failed = true;
  }

  try {
    console.log('--- 7. Pruebas de v1.4 Phase 1: Field Registry and Decisions ---');
    const phase1Tests = require('./phase1-field-registry.test');
    await phase1Tests.run();
    console.log('🟢 Pruebas de v1.4 Phase 1 completadas con éxito.\n');
  } catch (err) {
    console.error('🔴 FAILED: Pruebas de v1.4 Phase 1 fallaron.');
    console.error(err);
    failed = true;
  }

  try {
    console.log('--- 8. Pruebas de v1.4 Phase 2: Questions and Answer CLI ---');
    const phase2Tests = require('./phase2-questions-answer.test');
    await phase2Tests.run();
    console.log('🟢 Pruebas de v1.4 Phase 2 completadas con éxito.\n');
  } catch (err) {
    console.error('🔴 FAILED: Pruebas de v1.4 Phase 2 fallaron.');
    console.error(err);
    failed = true;
  }

  try {
    console.log('--- 9. Pruebas de v1.4 Phase 3: Reset Confirmation, Hash, Stale ---');
    const phase3Tests = require('./phase3-reset-confirmation.test');
    await phase3Tests.run();
    console.log('🟢 Pruebas de v1.4 Phase 3 completadas con éxito.\n');
  } catch (err) {
    console.error('🔴 FAILED: Pruebas de v1.4 Phase 3 fallaron.');
    console.error(err);
    failed = true;
  }

  try {
    console.log('--- 10. Pruebas de v1.4 Phase 4: Agent-Source Interactive Mockup Flow ---');
    const phase4Tests = require('./phase4-agent-source-interactive.test');
    await phase4Tests.run();
    console.log('🟢 Pruebas de v1.4 Phase 4 completadas con éxito.\n');
  } catch (err) {
    console.error('🔴 FAILED: Pruebas de v1.4 Phase 4 fallaron.');
    console.error(err);
    failed = true;
  }

  // Limpieza final
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('==================================================');
  if (failed) {
    console.log('❌ ALGUNAS PRUEBAS FALLARON. Revisa los detalles arriba.');
    process.exit(1);
  } else {
    console.log('🎉 ¡TODAS LAS PRUEBAS PASARON EXITOSAMENTE!');
    process.exit(0);
  }
}

runAll();
