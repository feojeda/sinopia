const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execSync } = require('child_process');
const gessoManager = require('../lib/gesso-manager');
const planManager = require('../lib/plan-manager');
const installer = require('../lib/installer');

const tempProjectDir = path.resolve(__dirname, './temp-project');
const cliBin = path.resolve(__dirname, '../bin/gsd-canva.js');

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

    // ==========================================
    // TEST 0: list returns empty when no lienzos exist
    // ==========================================
    console.log('  - Gesso Test 0: list returns empty when no lienzos exist...');
    const emptyList = await gessoManager.list();
    assert.deepStrictEqual(emptyList.lienzos, [], 'list debe devolver array vacío cuando no hay lienzos');

    // ==========================================
    // TEST 0b: status fails when lienzos/ does not exist
    // ==========================================
    console.log('  - Gesso Test 0b: status fails when lienzos/ does not exist...');
    try {
      await gessoManager.status('001');
      assert.fail('Debería haber fallado por directorio inexistente');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_GESSO_NOT_FOUND');
      assert.strictEqual(err.exitCode, 31);
    }

    // ==========================================
    // TEST 1: create creates lienzos/ and the three expected files
    // ==========================================
    console.log('  - Gesso Test 1: create creates lienzos/ and expected files...');
    const g1 = await gessoManager.create({ name: 'Mi Cafe', methodology: 'socratic', language: 'es' });
    assert.strictEqual(g1.lienzoId, '001', 'Primer lienzo debe tener ID 001');
    assert.ok(fs.existsSync('lienzos'), 'Debe crear directorio lienzos/');
    assert.ok(fs.existsSync(g1.lienzoDir), 'Debe crear carpeta del lienzo');
    assert.ok(fs.existsSync(path.join(g1.lienzoDir, 'lienzo.json')), 'Debe crear lienzo.json');
    assert.ok(fs.existsSync(path.join(g1.lienzoDir, 'sesion.json')), 'Debe crear sesion.json');
    assert.ok(fs.existsSync(path.join(g1.lienzoDir, 'gesso.md')), 'Debe crear gesso.md');

    // ==========================================
    // TEST 2: IDs are sequential and independent from canva-plans/
    // ==========================================
    console.log('  - Gesso Test 2: IDs are sequential and independent from plans...');
    const p1 = await planManager.create({ name: 'Plan Primero' });
    assert.strictEqual(p1.planId, '001', 'Primer plan debe tener ID 001');
    const g2 = await gessoManager.create({ name: 'Segundo Lienzo', methodology: '5w1h', language: 'en' });
    assert.strictEqual(g2.lienzoId, '002', 'Segundo lienzo debe tener ID 002');
    const p2 = await planManager.create({ name: 'Plan Segundo' });
    assert.strictEqual(p2.planId, '002', 'Segundo plan debe tener ID 002');
    const g3 = await gessoManager.create({ name: 'Tercer Lienzo', methodology: 'design_thinking', language: 'it' });
    assert.strictEqual(g3.lienzoId, '003', 'Tercer lienzo debe tener ID 003');

    // ==========================================
    // TEST 3: Folder names are sanitized
    // ==========================================
    console.log('  - Gesso Test 3: Folder names are sanitized...');
    const g4 = await gessoManager.create({ name: 'Cafe & Te!!!', methodology: 'socratic', language: 'es' });
    assert.ok(g4.lienzoDir.includes('cafe-te'), `Slug sanitizado debe ser cafe-te, fue: ${g4.lienzoDir}`);

    // ==========================================
    // TEST 4: lienzo.json matches the initial contract
    // ==========================================
    console.log('  - Gesso Test 4: lienzo.json matches initial contract...');
    const lienzoJsonPath = path.join(g1.lienzoDir, 'lienzo.json');
    const lienzoData = JSON.parse(fs.readFileSync(lienzoJsonPath, 'utf8'));
    assert.strictEqual(lienzoData.id, '001');
    assert.strictEqual(lienzoData.name, 'Mi Cafe');
    assert.strictEqual(lienzoData.slug, 'mi-cafe');
    assert.strictEqual(lienzoData.phase, 'gesso');
    assert.strictEqual(lienzoData.status, 'en_blanco');
    assert.strictEqual(lienzoData.methodology, 'socratic');
    assert.strictEqual(lienzoData.language, 'es');
    assert.strictEqual(lienzoData.linkedPlanId, null);
    assert.ok(lienzoData.timestamps.created, 'Debe tener created');
    assert.ok(lienzoData.timestamps.updated, 'Debe tener updated');
    assert.strictEqual(lienzoData.timestamps.approved, null);
    assert.strictEqual(lienzoData.confirmation.confirmed, false);
    assert.strictEqual(lienzoData.confirmation.confirmedAt, null);
    assert.strictEqual(lienzoData.confirmation.confirmedBy, null);
    assert.strictEqual(lienzoData.confirmation.source, 'chat');
    assert.strictEqual(lienzoData.confirmation.hashAlgorithm, 'sha256-gesso-v1');
    assert.strictEqual(lienzoData.confirmation.gessoHash, '');
    assert.ok(Array.isArray(lienzoData.history), 'history debe ser array');
    assert.strictEqual(lienzoData.history.length, 1);
    assert.strictEqual(lienzoData.history[0].action, 'created');

    // ==========================================
    // TEST 5: sesion.json matches the initial contract
    // ==========================================
    console.log('  - Gesso Test 5: sesion.json matches initial contract...');
    const sesionJsonPath = path.join(g1.lienzoDir, 'sesion.json');
    const sesionData = JSON.parse(fs.readFileSync(sesionJsonPath, 'utf8'));
    assert.strictEqual(sesionData.lienzoId, '001');
    assert.strictEqual(sesionData.methodology, 'socratic');
    assert.strictEqual(sesionData.language, 'es');
    assert.ok(Array.isArray(sesionData.turns), 'turns debe ser array');
    assert.strictEqual(sesionData.turns.length, 0);
    assert.deepStrictEqual(Object.keys(sesionData.workingNotes).sort(),
      ['audience', 'constraints', 'context', 'discardedDirections', 'idea', 'layout', 'mandatoryElements', 'tone'].sort());

    // ==========================================
    // TEST 6: status returns the expected lienzo
    // ==========================================
    console.log('  - Gesso Test 6: status returns expected lienzo...');
    const st = await gessoManager.status('001');
    assert.strictEqual(st.lienzoId, '001');
    assert.strictEqual(st.lienzo.name, 'Mi Cafe');

    // ==========================================
    // TEST 7: list returns created lienzos
    // ==========================================
    console.log('  - Gesso Test 7: list returns created lienzos...');
    const lst = await gessoManager.list();
    assert.ok(lst.lienzos.length >= 3, 'Debe haber al menos 3 lienzos');
    const ids = lst.lienzos.map(l => l.id);
    assert.ok(ids.includes('001'));
    assert.ok(ids.includes('002'));
    assert.ok(ids.includes('003'));

    // ==========================================
    // TEST 8: append-turn records turns in order with timestamp, role, content, and tags
    // ==========================================
    console.log('  - Gesso Test 8: append-turn records turns correctly...');
    const turn1 = await gessoManager.appendTurn('001', 'user', 'Hola, quiero un banner', ['initial_prompt']);
    assert.strictEqual(turn1.turnCount, 1);
    assert.strictEqual(turn1.turn.role, 'user');
    assert.strictEqual(turn1.turn.content, 'Hola, quiero un banner');
    assert.deepStrictEqual(turn1.turn.tags, ['initial_prompt']);
    assert.ok(turn1.turn.timestamp, 'Debe tener timestamp');

    const turn2 = await gessoManager.appendTurn('001', 'assistant', 'Claro, cuéntame más');
    assert.strictEqual(turn2.turnCount, 2);
    assert.strictEqual(turn2.turn.role, 'assistant');
    assert.deepStrictEqual(turn2.turn.tags, []);

    const sesionAfterTurns = JSON.parse(fs.readFileSync(sesionJsonPath, 'utf8'));
    assert.strictEqual(sesionAfterTurns.turns.length, 2);
    assert.strictEqual(sesionAfterTurns.turns[0].role, 'user');
    assert.strictEqual(sesionAfterTurns.turns[1].role, 'assistant');

    // ==========================================
    // TEST 9: update-notes updates only allowed fields
    // ==========================================
    console.log('  - Gesso Test 9: update-notes updates allowed fields...');
    const noteRes = await gessoManager.updateNotes('001', 'tone', 'cálido, cercano');
    assert.strictEqual(noteRes.field, 'tone');
    assert.strictEqual(noteRes.value, 'cálido, cercano');

    const sesionAfterNotes = JSON.parse(fs.readFileSync(sesionJsonPath, 'utf8'));
    assert.strictEqual(sesionAfterNotes.workingNotes.tone, 'cálido, cercano');

    try {
      await gessoManager.updateNotes('001', 'campo_inexistente', 'valor');
      assert.fail('Debería haber fallado por campo desconocido');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_INVALID_FIELD');
    }

    // ==========================================
    // TEST 10: Invalid methodology is rejected
    // ==========================================
    console.log('  - Gesso Test 10: Invalid methodology is rejected...');
    try {
      await gessoManager.create({ name: 'Bad', methodology: 'unknown', language: 'es' });
      assert.fail('Debería haber fallado por metodología inválida');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_INVALID_FIELD');
    }

    // ==========================================
    // TEST 11: Invalid language is rejected
    // ==========================================
    console.log('  - Gesso Test 11: Invalid language is rejected...');
    try {
      await gessoManager.create({ name: 'Bad', methodology: 'socratic', language: 'fr' });
      assert.fail('Debería haber fallado por idioma inválido');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_INVALID_FIELD');
    }

    // ==========================================
    // TEST 12: Unknown lienzo ID returns GSDC_GESSO_NOT_FOUND
    // ==========================================
    console.log('  - Gesso Test 12: Unknown lienzo ID returns GSDC_GESSO_NOT_FOUND...');
    try {
      await gessoManager.status('999');
      assert.fail('Debería haber fallado por lienzo inexistente');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_GESSO_NOT_FOUND');
      assert.strictEqual(err.exitCode, 31);
    }

    try {
      await gessoManager.appendTurn('999', 'user', 'test');
      assert.fail('Debería haber fallado por lienzo inexistente');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_GESSO_NOT_FOUND');
    }

    try {
      await gessoManager.updateNotes('999', 'tone', 'test');
      assert.fail('Debería haber fallado por lienzo inexistente');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_GESSO_NOT_FOUND');
    }

    // ==========================================
    // TEST 13: Non-editable status blocks append-turn and update-notes
    // ==========================================
    console.log('  - Gesso Test 13: Non-editable status blocks mutations...');
    const gEditable = await gessoManager.create({ name: 'Editable Test', methodology: 'socratic', language: 'es' });
    const editableLienzoPath = path.join(gEditable.lienzoDir, 'lienzo.json');
    const editableLienzo = JSON.parse(fs.readFileSync(editableLienzoPath, 'utf8'));
    editableLienzo.status = 'gesso_listo';
    fs.writeFileSync(editableLienzoPath, JSON.stringify(editableLienzo, null, 2), 'utf8');

    try {
      await gessoManager.appendTurn(gEditable.lienzoId, 'user', 'test');
      assert.fail('Debería haber fallado por estado no editable');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_GESSO_INVALID_STATE');
      assert.strictEqual(err.exitCode, 32);
    }

    try {
      await gessoManager.updateNotes(gEditable.lienzoId, 'tone', 'test');
      assert.fail('Debería haber fallado por estado no editable');
    } catch (err) {
      assert.strictEqual(err.code, 'GSDC_GESSO_INVALID_STATE');
      assert.strictEqual(err.exitCode, 32);
    }

    // ==========================================
    // TEST 14: CLI --json output is structured and not double-wrapped
    // ==========================================
    console.log('  - Gesso Test 14: CLI --json output is structured and not double-wrapped...');

    // gesso create --json
    const createJson = execSync(`node "${cliBin}" gesso create --name "CLI Test" --methodology socratic --language es --json`, {
      cwd: process.cwd(), encoding: 'utf8'
    });
    const parsedCreate = JSON.parse(createJson.trim());
    assert.strictEqual(parsedCreate.ok, true);
    assert.ok(parsedCreate.data.lienzoId, 'create --json debe devolver lienzoId');
    assert.ok(!parsedCreate.data.data, 'Must not double-wrap data');
    const cliLienzoId = parsedCreate.data.lienzoId;

    // gesso status --json
    const statusJson = execSync(`node "${cliBin}" gesso status --id ${cliLienzoId} --json`, {
      cwd: process.cwd(), encoding: 'utf8'
    });
    const parsedStatus = JSON.parse(statusJson.trim());
    assert.strictEqual(parsedStatus.ok, true);
    assert.strictEqual(parsedStatus.data.lienzoId, cliLienzoId);
    assert.ok(!parsedStatus.data.data, 'Must not double-wrap data');

    // gesso list --json
    const listJson = execSync(`node "${cliBin}" gesso list --json`, {
      cwd: process.cwd(), encoding: 'utf8'
    });
    const parsedList = JSON.parse(listJson.trim());
    assert.strictEqual(parsedList.ok, true);
    assert.ok(Array.isArray(parsedList.data.lienzos), 'list --json debe devolver lienzos array');
    assert.ok(!parsedList.data.data, 'Must not double-wrap data');

    // gesso append-turn --json
    const turnJson = execSync(`node "${cliBin}" gesso append-turn --id ${cliLienzoId} --role user --content "Hola" --tags initial,greeting --json`, {
      cwd: process.cwd(), encoding: 'utf8'
    });
    const parsedTurn = JSON.parse(turnJson.trim());
    assert.strictEqual(parsedTurn.ok, true);
    assert.strictEqual(parsedTurn.data.turn.role, 'user');
    assert.deepStrictEqual(parsedTurn.data.turn.tags, ['initial', 'greeting']);
    assert.ok(!parsedTurn.data.data, 'Must not double-wrap data');

    // gesso update-notes --json
    const notesJson = execSync(`node "${cliBin}" gesso update-notes --id ${cliLienzoId} --field idea --value "Una idea genial" --json`, {
      cwd: process.cwd(), encoding: 'utf8'
    });
    const parsedNotes = JSON.parse(notesJson.trim());
    assert.strictEqual(parsedNotes.ok, true);
    assert.strictEqual(parsedNotes.data.field, 'idea');
    assert.strictEqual(parsedNotes.data.value, 'Una idea genial');
    assert.ok(!parsedNotes.data.data, 'Must not double-wrap data');

    // gesso status --json for unknown ID (error case)
    try {
      execSync(`node "${cliBin}" gesso status --id 999 --json`, {
        cwd: process.cwd(), encoding: 'utf8'
      });
      assert.fail('Debería haber fallado CLI con lienzo inexistente');
    } catch (cliErr) {
      assert.ok(cliErr.stderr, 'CLI error debe ir a stderr');
      const errParsed = JSON.parse(cliErr.stderr.trim());
      assert.strictEqual(errParsed.ok, false);
      assert.strictEqual(errParsed.code, 'GSDC_GESSO_NOT_FOUND');
      assert.strictEqual(errParsed.details && errParsed.details.id, undefined); // just verify structure
    }

    // gesso create --json with invalid methodology
    console.log('  - Gesso Test 14b: CLI create rejects invalid methodology...');
    try {
      execSync(`node "${cliBin}" gesso create --name "Bad" --methodology unknown --language es --json`, {
        cwd: process.cwd(), encoding: 'utf8'
      });
      assert.fail('Debería haber fallado CLI con metodología inválida');
    } catch (cliErr) {
      const errParsed = JSON.parse(cliErr.stderr.trim());
      assert.strictEqual(errParsed.ok, false);
      assert.strictEqual(errParsed.code, 'GSDC_INVALID_FIELD');
    }

    // gesso create --json with invalid language
    console.log('  - Gesso Test 14c: CLI create rejects invalid language...');
    try {
      execSync(`node "${cliBin}" gesso create --name "Bad" --methodology socratic --language fr --json`, {
        cwd: process.cwd(), encoding: 'utf8'
      });
      assert.fail('Debería haber fallado CLI con idioma inválido');
    } catch (cliErr) {
      const errParsed = JSON.parse(cliErr.stderr.trim());
      assert.strictEqual(errParsed.ok, false);
      assert.strictEqual(errParsed.code, 'GSDC_INVALID_FIELD');
    }

    console.log('  - Gesso Test 15: Existing plan tests still pass (verified by run.js suite)...');

  } finally {
    process.chdir(originalCwd);
  }
}

module.exports = { run };
