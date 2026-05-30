const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
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
    // ==========================================
    // TEST 1: Instalación Limpia (init)
    // ==========================================
    console.log('  - Test 1: Ejecutando init limpio...');
    const initResult = await installer.init({ frameworkVersion: '1.0.0' });
    
    assert.strictEqual(initResult.initialized, true, 'Debería inicializar exitosamente');
    assert.strictEqual(initResult.schemaVersion, 1, 'schemaVersion should remain 1 (Phase 4 owns v2 bump)');
    
    assert.ok(fs.existsSync('.gsd-canva'), 'Debería existir la carpeta .gsd-canva');
    assert.ok(fs.existsSync('.gsd-canva/manifest.json'), 'Debería existir manifest.json');
    assert.ok(fs.existsSync('.antigravity/commands'), 'Debería existir la carpeta del IDE');
    assert.ok(fs.existsSync('.antigravity/commands/canva-mockup.md'), 'Debería existir canva-mockup.md en prompts');
    assert.ok(fs.existsSync('system_templates.json'), 'Debería existir system_templates.json');
    assert.ok(fs.existsSync('.gitignore'), 'Debería haberse creado .gitignore');
    
    const gitignoreContent = fs.readFileSync('.gitignore', 'utf8');
    assert.ok(gitignoreContent.includes('# >>> gsd-canva >>>'), 'Debería incluir bloque gsd-canva');
    assert.ok(gitignoreContent.includes('delivery/'), 'Debería ignorar delivery/');
    assert.ok(gitignoreContent.includes('.gsd-canva/config.local.json'), 'Debería ignorar config.local.json');
    
    // ==========================================
    // TEST 2: Idempotencia (segunda ejecución sin cambios)
    // ==========================================
    console.log('  - Test 2: Idempotencia de init...');
    await installer.init({ frameworkVersion: '1.0.0' });
    
    // ==========================================
    // TEST 3: Detección de Conflictos (modificación local)
    // ==========================================
    console.log('  - Test 3: Conflicto ante modificación local...');
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
    
    const restoredContent = fs.readFileSync(targetFile, 'utf8');
    assert.ok(!restoredContent.includes('MODIFICADO POR EL USUARIO'), 'El archivo modificado debió sobrescribirse');
    
    // ==========================================
    // TEST 5: Actualización Segura (upgrade) con backups fechados
    // ==========================================
    console.log('  - Test 5: Actualización controlada (upgrade) con respaldo fechado...');
    fs.writeFileSync(targetFile, '# CAMBIO PERSONALIZADO EN COMANDO MOCKUP', 'utf8');
    
    const upgradeResult = await installer.upgrade({ frameworkVersion: '1.0.1' });
    assert.strictEqual(upgradeResult.upgraded, true, 'Upgrade exitoso');
    assert.strictEqual(upgradeResult.backupsCreated.length, 1, 'Debería crearse un respaldo');
    assert.ok(upgradeResult.backupsCreated[0].includes('.bak.'), 'El archivo de backup debe contener la extensión .bak');
    
    assert.ok(fs.existsSync(upgradeResult.backupsCreated[0]), 'El archivo de respaldo físico debe existir en el disco');
    
    // ==========================================
    // TEST 6: Diagnóstico de Salud (doctor)
    // ==========================================
    console.log('  - Test 6: Diagnóstico y validación estructural (doctor)...');
    const doctorBasic = await installer.doctor();
    assert.strictEqual(doctorBasic.healthy, true, 'doctor sin agente debería retornar healthy: true');

    try {
      await installer.doctor({ agent: 'antigravity' });
      assert.fail('Doctor debería fallar cuando no hay skills instaladas');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_AGENT_SKILLS_MISSING', 'Debería retornar GSDC_AGENT_SKILLS_MISSING');
      assert.strictEqual(err.exitCode, 19, 'Exit code de skills faltantes debe ser 19');
    }
    
    try {
      await installer.doctor({ agent: 'agente-inexistente' });
      assert.fail('Doctor debería fallar ante agente no soportado');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_AGENT_UNSUPPORTED', 'Debería retornar GSDC_AGENT_UNSUPPORTED');
      assert.strictEqual(err.exitCode, 17, 'Exit code de agente no soportado debe ser 17');
    }
    
    try {
      await installer.doctor({ agent: 'agente-inexistente' });
      assert.fail('Doctor debería fallar ante agente no soportado');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_AGENT_UNSUPPORTED', 'Debería retornar GSDC_AGENT_UNSUPPORTED');
      assert.strictEqual(err.exitCode, 17, 'Exit code de agente no soportado debe ser 17');
    }
    
    // ==========================================
    // TEST 7: Verificar que NO se copia runtime al destino en instalación limpia
    // ==========================================
    console.log('  - Test 7: Verificación de ausencia de runtime copiado...');
    assert.ok(!fs.existsSync('.gsd-canva/bin'), 'NO debería existir bin/ en destino');
    assert.ok(!fs.existsSync('.gsd-canva/lib'), 'NO debería existir lib/ en destino');
    
    const manifest = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    const runtimeEntries = manifest.files.filter(f => 
      f.target.startsWith('.gsd-canva/bin/') || f.target.startsWith('.gsd-canva/lib/')
    );
    assert.strictEqual(runtimeEntries.length, 0, 'Manifest no debería registrar archivos de runtime');
    
    // ==========================================
    // TEST 8: Migración de upgrade() limpiando runtime legacy
    // ==========================================
    console.log('  - Test 8: Migración de upgrade desde v1.0 con runtime copiado...');
    
    fs.mkdirSync('.gsd-canva/bin', { recursive: true });
    fs.mkdirSync('.gsd-canva/lib', { recursive: true });
    fs.writeFileSync('.gsd-canva/bin/gsd-canva.js', '// OLD CLI', 'utf8');
    fs.writeFileSync('.gsd-canva/lib/plan-manager.js', '// OLD PLAN', 'utf8');
    
    const manifestBefore = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    manifestBefore.files.push(
      { target: '.gsd-canva/bin/gsd-canva.js', sha256: 'fake1', managed: true },
      { target: '.gsd-canva/lib/plan-manager.js', sha256: 'fake2', managed: true }
    );
    fs.writeFileSync('.gsd-canva/manifest.json', JSON.stringify(manifestBefore, null, 2), 'utf8');
    
    const upgradeResult2 = await installer.upgrade({ frameworkVersion: '1.1.0' });
    assert.strictEqual(upgradeResult2.upgraded, true, 'Upgrade debería completarse');
    
    assert.ok(!fs.existsSync('.gsd-canva/bin'), 'bin/ legacy debería haber sido eliminado');
    assert.ok(!fs.existsSync('.gsd-canva/lib'), 'lib/ legacy debería haber sido eliminado');
    
    const manifestAfter = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    const legacyEntries = manifestAfter.files.filter(f =>
      f.target.startsWith('.gsd-canva/bin/') || f.target.startsWith('.gsd-canva/lib/')
    );
    assert.strictEqual(legacyEntries.length, 0, 'Manifest no debería contener entradas de runtime legacy');
    
    // TEST 8b: Falsos positivos — entradas con prefijo similar NO deben eliminarse
    console.log('  - Test 8b: Falsos positivos con prefijo similar...');
    fs.mkdirSync('.gsd-canva/binoculars', { recursive: true });
    fs.writeFileSync('.gsd-canva/binoculars/config.json', '{}', 'utf8');
    fs.writeFileSync('.gsd-canva/library-config.json', '{}', 'utf8');
    
    const decoy1Hash = crypto.createHash('sha256').update('{}').digest('hex');
    const decoy2Hash = crypto.createHash('sha256').update('{}').digest('hex');
    const manifestWithDecoy = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    manifestWithDecoy.files.push(
      { target: '.gsd-canva/library-config.json', sha256: decoy1Hash, managed: true },
      { target: '.gsd-canva/binoculars/config.json', sha256: decoy2Hash, managed: true }
    );
    fs.writeFileSync('.gsd-canva/manifest.json', JSON.stringify(manifestWithDecoy, null, 2), 'utf8');
    
    const reUpgrade = await installer.upgrade({ frameworkVersion: '1.1.1' });
    assert.strictEqual(reUpgrade.upgraded, true, 'Re-upgrade debería completarse');
    
    assert.ok(fs.existsSync('.gsd-canva/binoculars/config.json'), 'Archivo decoy binoculars no debe borrarse');
    assert.ok(fs.existsSync('.gsd-canva/library-config.json'), 'Archivo decoy library no debe borrarse');
    
    const manifestAfterDecoy = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    const decoyEntries = manifestAfterDecoy.files.filter(f =>
      f.target === '.gsd-canva/library-config.json' || f.target === '.gsd-canva/binoculars/config.json'
    );
    assert.strictEqual(decoyEntries.length, 2, 'Entradas legítimas con prefijo similar NO deben eliminarse');
    
  } finally {
    process.chdir(originalCwd);
  }
}

module.exports = {
  run
};
