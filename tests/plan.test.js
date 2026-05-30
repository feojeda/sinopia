const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const planManager = require('../lib/plan-manager');
const templateCatalog = require('../lib/template-catalog');
const lockManager = require('../lib/lock-manager');
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
    // Inicializar el espacio con init para tener las plantillas
    await installer.init({ frameworkVersion: '1.0.0' });
    
    // ==========================================
    // TEST 1: Creación Atómica e Inicialización en mockup:questions_pending
    // ==========================================
    console.log('  - Test 1: Creando planes e inicializando decisiones...');
    const plan1 = await planManager.create({ name: 'Primer Banner Instagram' });
    assert.strictEqual(plan1.planId, '001', 'El primer plan debe tener ID 001');
    assert.strictEqual(plan1.plan.phase, 'mockup', 'La fase inicial debe ser mockup');
    assert.strictEqual(plan1.plan.status, 'questions_pending', 'El estado inicial debe ser questions_pending');
    
    // Validar existencia de decisions.json
    const decisionsPath = 'canva-plans/plan_001_primer-banner-instagram/decisions.json';
    assert.ok(fs.existsSync(decisionsPath), 'decisions.json debe ser creado en canva-plans/plan_001/');
    const decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'));
    assert.strictEqual(decisions.confirmation.confirmed, false, 'Debe iniciar no confirmado');
    
    // ==========================================
    // TEST 2: Validación de Placeholders e Intentos Ilegales de Transición
    // ==========================================
    console.log('  - Test 2: Validación de placeholders e intentos ilegales de resolución...');
    try {
      // Intentar resolver sin confirmar ni rellenar decisions (debe fallar con exitCode 19)
      await planManager.resolveQuestions('001');
      assert.fail('Debería haber fallado resolveQuestions por falta de confirmación y datos vacíos');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_QUESTIONS_UNRESOLVED', 'Debería arrojar GSDC_QUESTIONS_UNRESOLVED');
      assert.strictEqual(err.exitCode, 19, 'Exit code de resolución incompleta debe ser 19');
    }
    
    // Rellenar decisiones con placeholders
    decisions.vertical = 'Moda';
    decisions.audiencia = 'Jóvenes';
    decisions.formato = '1080x1080';
    decisions.paleta = 'TODO: definir'; // Contiene placeholder
    decisions.copy = 'Oferta especial';
    decisions.cta = 'Comprar ahora';
    fs.writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2), 'utf8');
    
    try {
      // Intentar confirmar decisiones con placeholders (debe fallar)
      await planManager.confirmDecisions('001');
      assert.fail('Debería haber fallado confirmDecisions por contener TODO en paleta');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_QUESTIONS_UNRESOLVED', 'Debería arrojar GSDC_QUESTIONS_UNRESOLVED');
    }
    
    // ==========================================
    // TEST 3: Confirmación Exitosa e Integridad del Hash
    // ==========================================
    console.log('  - Test 3: Confirmación de decisiones y validación del hash criptográfico...');
    decisions.paleta = 'Azul HSL(210, 80%, 20%)';
    fs.writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2), 'utf8');
    
    const confirmRes = await planManager.confirmDecisions('001', { by: 'user_tester' });
    assert.strictEqual(confirmRes.confirmed, true, 'Confirmación exitosa');
    
    // Verificar que decisions.json tiene la confirmación grabada
    const decisionsConfirm = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'));
    assert.strictEqual(decisionsConfirm.confirmation.confirmed, true, 'Confirmed debe ser true');
    assert.strictEqual(decisionsConfirm.confirmation.confirmedBy, 'user_tester', 'Debe registrar el autor');
    assert.ok(decisionsConfirm.confirmation.decisionsHash, 'Debe generar el hash de integridad');
    
    // ==========================================
    // TEST 4: Detección de Modificaciones No Autorizadas (Tampering) en resolve-questions
    // ==========================================
    console.log('  - Test 4: Detección de tampering antes de resolver preguntas...');
    // Alterar decisions.json después de haber sido confirmado
    decisionsConfirm.vertical = 'Comida Rápida';
    fs.writeFileSync(decisionsPath, JSON.stringify(decisionsConfirm, null, 2), 'utf8');
    
    try {
      await planManager.resolveQuestions('001');
      assert.fail('Debería haber fallado resolveQuestions por inconsistencia en el hash de integridad');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION', 'Debería arrojar error de decisiones modificadas');
      assert.strictEqual(err.exitCode, 21, 'Exit code de manipulación debe ser 21');
    }
    
    // Restaurar valor original para que el hash coincida
    decisionsConfirm.vertical = 'Moda';
    fs.writeFileSync(decisionsPath, JSON.stringify(decisionsConfirm, null, 2), 'utf8');
    
    // Resolver preguntas con éxito
    const resQuestions = await planManager.resolveQuestions('001');
    assert.strictEqual(resQuestions.plan.status, 'ready_for_html', 'El plan debe avanzar a ready_for_html');
    
    // ==========================================
    // TEST 5: Detección de Artefacto Faltante y Tampering en submit-mockup
    // ==========================================
    console.log('  - Test 5: Validación de artefactos faltantes y tampering en submit-mockup...');
    try {
      // Intentar enviar mockup sin que exista mockup.html (debe fallar con exitCode 20)
      await planManager.submitMockup('001');
      assert.fail('Debería haber fallado por mockup.html faltante');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_ARTIFACT_MISSING', 'Debería retornar GSDC_ARTIFACT_MISSING');
      assert.strictEqual(err.exitCode, 20, 'Exit code de artefacto faltante debe ser 20');
    }
    
    // Crear mockup.html pero simular alteración de decisiones post-resolución
    const mockupPath = 'canva-plans/plan_001_primer-banner-instagram/mockup.html';
    fs.writeFileSync(mockupPath, '<h1>Boceto Visual</h1>', 'utf8');
    
    const decisionsTamper2 = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'));
    decisionsTamper2.copy = 'Oferta Increíble'; // Modificado
    fs.writeFileSync(decisionsPath, JSON.stringify(decisionsTamper2, null, 2), 'utf8');
    
    try {
      await planManager.submitMockup('001');
      assert.fail('Debería fallar submitMockup porque las decisiones cambiaron después de resolve-questions');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION', 'Debería detectar alteración en submit-mockup');
    }
    
    // Restaurar y enviar con éxito
    decisionsTamper2.copy = 'Oferta especial';
    fs.writeFileSync(decisionsPath, JSON.stringify(decisionsTamper2, null, 2), 'utf8');
    
    const subMockResult = await planManager.submitMockup('001');
    assert.strictEqual(subMockResult.plan.status, 'pending_approval', 'Estado debe ser pending_approval');
    
    // ==========================================
    // TEST 6: Cierre del Mockup y Flujo de Borrador Separado
    // ==========================================
    console.log('  - Test 6: Aprobación de mockup y desacoplamiento de borrador...');
    // Aprobación: pending_approval -> approved
    const appMock = await planManager.transitionState('001', 'approve-mockup');
    assert.strictEqual(appMock.plan.status, 'approved', 'Plan mockup aprobado exitosamente');
    
    // Iniciar borrador de Canva: approved -> draft:pending
    const startDraft = await planManager.transitionState('001', 'start-draft');
    assert.strictEqual(startDraft.plan.phase, 'draft', 'Fase transicionada a draft');
    assert.strictEqual(startDraft.plan.status, 'pending', 'Estado transicionado a pending');
    
    // ==========================================
    // TEST 7: Registro en Catálogo y Vinculación
    // ==========================================
    console.log('  - Test 7: Registro técnico en system_templates.json...');
    const regResult = await templateCatalog.register({
      id: 'CANVA_DESIGN_123_XYZ',
      name: 'Instagram Banner Base Template',
      planId: '001'
    });
    
    assert.strictEqual(regResult.registered, true, 'Debería registrar con éxito');
    
    // Avanzar la máquina hasta refine y deliver
    await planManager.transitionState('001', 'approve-draft');
    await planManager.transitionState('001', 'start-refine');
    const t3 = await planManager.transitionState('001', 'approve-refine');
    assert.strictEqual(t3.plan.phase, 'deliver', 'Debería pasar a deliver directamente');
    assert.strictEqual(t3.plan.status, 'ready', 'Estado de entrega debe ser ready');
    
    // Simular descargas y entregar
    const deliveryDir = 'delivery/plan_001';
    fs.mkdirSync(deliveryDir, { recursive: true });
    fs.writeFileSync(path.join(deliveryDir, 'banner_final.png'), 'DUMMY BINARY DATA CONTENT', 'utf8');
    
    const delResult = await planManager.deliver('001');
    assert.strictEqual(delResult.delivered, true, 'Entrega debería ser exitosa');
    assert.strictEqual(delResult.plan.status, 'delivered', 'Estado final debe ser delivered');
    
  } finally {
    process.chdir(originalCwd);
  }
}

module.exports = {
  run
};
