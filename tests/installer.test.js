const fs = require('fs');
const path = require('path');
const assert = require('assert');
const installer = require('../lib/installer');

const tempProjectDir = path.resolve(__dirname, './temp-project');

function setupTestProject() {
  if (fs.existsSync(tempProjectDir)) {
    fs.rmSync(tempProjectDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempProjectDir, { recursive: true });
  
  // Guardar CWD original y cambiar al temporal
  const originalCwd = process.cwd();
  process.chdir(tempProjectDir);
  return originalCwd;
}

async function run() {
  const originalCwd = setupTestProject();
  
  try {
    // ==========================================
    // TEST 1: Instalación Limpia (init)
    // ==========================================
    console.log('  - Test 1: Ejecutando init limpio...');
    const initResult = await installer.init({ frameworkVersion: '1.0.0' });
    
    assert.strictEqual(initResult.initialized, true, 'Debería inicializar exitosamente');
    assert.strictEqual(initResult.schemaVersion, 1, 'schemaVersion debería ser 1');
    
    // Verificar que se crearon los directorios clave
    assert.ok(fs.existsSync('.gsd-canva'), 'Debería existir la carpeta .gsd-canva');
    assert.ok(fs.existsSync('.gsd-canva/manifest.json'), 'Debería existir manifest.json');
    assert.ok(fs.existsSync('.antigravity/commands'), 'Debería existir la carpeta del IDE');
    assert.ok(fs.existsSync('.antigravity/commands/canva-mockup.md'), 'Debería existir canva-mockup.md en prompts');
    assert.ok(fs.existsSync('system_templates.json'), 'Debería existir system_templates.json');
    assert.ok(fs.existsSync('.gitignore'), 'Debería haberse creado .gitignore');
    
    // Verificar contenido del gitignore
    const gitignoreContent = fs.readFileSync('.gitignore', 'utf8');
    assert.ok(gitignoreContent.includes('# >>> gsd-canva >>>'), 'Debería incluir bloque gsd-canva');
    assert.ok(gitignoreContent.includes('delivery/'), 'Debería ignorar delivery/');
    assert.ok(gitignoreContent.includes('.gsd-canva/config.local.json'), 'Debería ignorar config.local.json');
    
    // ==========================================
    // TEST 2: Idempotencia (segunda ejecución sin cambios)
    // ==========================================
    console.log('  - Test 2: Idempotencia de init...');
    // Re-correr init no debería fallar ya que no hay modificaciones
    await installer.init({ frameworkVersion: '1.0.0' });
    
    // ==========================================
    // TEST 3: Detección de Conflictos (modificación local)
    // ==========================================
    console.log('  - Test 3: Conflicto ante modificación local...');
    // Modificar un archivo local controlado
    const targetFile = '.gsd-canva/commands/canva-mockup.md';
    fs.writeFileSync(targetFile, '# CONTENIDO MODIFICADO POR EL USUARIO', 'utf8');
    
    try {
      await installer.init({ frameworkVersion: '1.0.0' });
      assert.fail('Debería fallar con error de conflicto al detectar archivo modificado localmente');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_INIT_CONFLICT', 'Debería lanzar código GSDC_INIT_CONFLICT');
      assert.strictEqual(err.exitCode, 11, 'Exit code de conflicto debe ser 11');
    }
    
    // ==========================================
    // TEST 4: Reinstalación Forzada (forceAll)
    // ==========================================
    console.log('  - Test 4: Sobrescritura con --force-all...');
    const forceResult = await installer.init({ forceAll: true, frameworkVersion: '1.0.0' });
    assert.strictEqual(forceResult.initialized, true, 'Debería inicializar forzadamente');
    
    // El archivo debería haberse restaurado con el original
    const restoredContent = fs.readFileSync(targetFile, 'utf8');
    assert.ok(!restoredContent.includes('MODIFICADO POR EL USUARIO'), 'El archivo modificado debió sobrescribirse');
    
    // ==========================================
    // TEST 5: Actualización Segura (upgrade) con backups fechados
    // ==========================================
    console.log('  - Test 5: Actualización controlada (upgrade) con respaldo fechado...');
    // Modificar localmente de nuevo
    fs.writeFileSync(targetFile, '# CAMBIO PERSONALIZADO EN COMANDO MOCKUP', 'utf8');
    
    const upgradeResult = await installer.upgrade({ frameworkVersion: '1.0.1' });
    assert.strictEqual(upgradeResult.upgraded, true, 'Upgrade exitoso');
    assert.strictEqual(upgradeResult.backupsCreated.length, 1, 'Debería crearse un respaldo');
    assert.ok(upgradeResult.backupsCreated[0].includes('.bak.'), 'El archivo de backup debe contener la extensión .bak');
    
    // Verificar que el backup físico existe con timestamp
    assert.ok(fs.existsSync(upgradeResult.backupsCreated[0]), 'El archivo de respaldo físico debe existir en el disco');
    
    // ==========================================
    // TEST 6: Diagnóstico de Salud (doctor)
    // ==========================================
    console.log('  - Test 6: Diagnóstico y validación estructural (doctor)...');
    const doctorResult = await installer.doctor({ agent: 'antigravity' });
    assert.strictEqual(doctorResult.healthy, true, 'doctor debería retornar healthy: true');
    assert.strictEqual(doctorResult.agentValidated, true, 'Debería validar el agente antigravity');
    
    try {
      await installer.doctor({ agent: 'agente-inexistente' });
      assert.fail('Doctor debería fallar ante agente no soportado');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_AGENT_UNSUPPORTED', 'Debería retornar GSDC_AGENT_UNSUPPORTED');
      assert.strictEqual(err.exitCode, 17, 'Exit code de agente no soportado debe ser 17');
    }
    
    // ==========================================
    // TEST 7: Existencia de bin y lib en destino local (autoprotección)
    // ==========================================
    console.log('  - Test 7: Verificación de runtime local copiado...');
    assert.ok(fs.existsSync('.gsd-canva/bin/gsd-canva.js'), 'Debería existir bin local en destino');
    assert.ok(fs.existsSync('.gsd-canva/lib/installer.js'), 'Debería existir lib local en destino');
    
  } finally {
    // Restaurar CWD original siempre
    process.chdir(originalCwd);
  }
}

module.exports = {
  run
};
