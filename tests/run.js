const path = require('path');
const fs = require('fs');

async function runAll() {
  console.log('\n==================================================');
  console.log('🧪 INICIANDO SUITE DE PRUEBAS DE GSD-CANVA (FASE 1)');
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
