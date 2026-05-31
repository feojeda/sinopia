const fs = require('fs');
const path = require('path');
const assert = require('assert');

const instructionsPath = path.resolve(__dirname, '../templates/agent-source/canva-mockup/instructions.md');

function readInstructions() {
  return fs.readFileSync(instructionsPath, 'utf8');
}

async function run() {
  const content = readInstructions();

  console.log('  - Phase 4.1: Instructions contain plan questions command...');
  assert.ok(
    content.includes('plan questions') && content.includes('--id <ID> --json'),
    'Must reference gsd-canva plan questions --id <ID> --json'
  );

  console.log('  - Phase 4.2: Instructions contain plan answer command...');
  assert.ok(
    content.includes('plan answer') && content.includes('--field') && content.includes('--value'),
    'Must reference gsd-canva plan answer --id <ID> --field <campo> --value <valor>'
  );

  console.log('  - Phase 4.3: Instructions contain reset-confirmation command...');
  assert.ok(
    content.includes('reset-confirmation') && content.includes('--id <ID>'),
    'Must reference gsd-canva plan reset-confirmation --id <ID>'
  );

  console.log('  - Phase 4.4: Instructions prohibit direct decisions.json writes...');
  const prohibitionPatterns = [
    /PROHIBIDO.*escribir\s+`?decisions\.json`?/i,
    /PROHIBIDO.*decisions\.json.*directamente/i,
    /nunca.*escrib[ae].*decisions\.json.*directamente/i
  ];
  const hasProhibition = prohibitionPatterns.some(p => p.test(content));
  assert.ok(
    hasProhibition,
    'Must contain explicit prohibition against writing decisions.json directly'
  );
  assert.ok(
    !content.includes('Escribe **SIEMPRE** en `decisions.json` primero'),
    'Must not contain old instruction to write decisions.json directly'
  );

  console.log('  - Phase 4.5: Instructions require final confirmation from user input only...');
  assert.ok(
    content.includes('último mensaje del usuario'),
    'Must specify that confirmation is parsed only from the last user message'
  );

  console.log('  - Phase 4.6: Instructions mention custom option fallback for allowCustom...');
  assert.ok(
    /allowCustom.*true.*personalizada/i.test(content) || /opción personalizada.*allowCustom/i.test(content) || content.includes('puede escribir una opción personalizada'),
    'Must mention that users can write custom options for allowCustom fields'
  );

  console.log('  - Phase 4.7: Instructions avoid "confirmo"/"confirmado" as filler words...');
  const section2 = content.split('### 2.')[1]?.split('### 3.')[0] || '';
  const confirmoMatches = section2.match(/\bconfirmo\b/gi);
  const confirmadoMatches = section2.match(/\bconfirmado\b/gi);
  assert.strictEqual(
    confirmoMatches ? confirmoMatches.length : 0, 0,
    'Section 2 must not contain "confirmo"'
  );
  assert.strictEqual(
    confirmadoMatches ? confirmadoMatches.length : 0, 0,
    'Section 2 must not contain "confirmado"'
  );

  console.log('  - Phase 4.8: Instructions include safe filler alternatives...');
  assert.ok(
    content.includes('registrado') || content.includes('anotado') || content.includes('listo para revisar'),
    'Must include safe filler alternatives like "registrado", "anotado", "listo para revisar"'
  );

  console.log('  - Phase 4.9: Rendered Antigravity skill includes the interactive flow...');
  const agentAdapters = require('../lib/agent-adapters');
  const antigravitySkill = require('../lib/agent-adapters/antigravity-skill');
  const codexCommand = require('../lib/agent-adapters/codex-command');
  const opencodeCommand = require('../lib/agent-adapters/opencode-command');
  const sourceRoot = path.resolve(__dirname, '../templates/agent-source');
  const caps = agentAdapters.loadAllCapabilities(sourceRoot);
  const capEntry = caps.find(c => c.capability && c.capability.id === 'canva-mockup');
  assert.ok(capEntry, 'canva-mockup capability must load');

  const antigravityRendered = antigravitySkill.render(capEntry.capability, capEntry.instructions);
  assert.ok(antigravityRendered.includes('plan questions'), 'Antigravity skill must include plan questions');
  assert.ok(antigravityRendered.includes('plan answer'), 'Antigravity skill must include plan answer');

  console.log('  - Phase 4.10: Rendered Codex command includes the interactive flow...');
  const codexRendered = codexCommand.render(capEntry.capability, capEntry.instructions);
  assert.ok(codexRendered.includes('plan questions'), 'Codex command must include plan questions');
  assert.ok(codexRendered.includes('plan answer'), 'Codex command must include plan answer');

  console.log('  - Phase 4.11: Rendered OpenCode command includes the interactive flow...');
  const opencodeRendered = opencodeCommand.render(capEntry.capability, capEntry.instructions);
  assert.ok(opencodeRendered.includes('plan questions'), 'OpenCode command must include plan questions');
  assert.ok(opencodeRendered.includes('plan answer'), 'OpenCode command must include plan answer');

  console.log('  - Phase 4.12: Legacy .antigravity/commands/ is not presented as Antigravity 2.0 primary...');
  assert.ok(
    !content.includes('.antigravity/commands/') || content.includes('legacy') || content.includes('deprecated'),
    'Instructions must not describe .antigravity/commands/ as Antigravity 2.0 primary surface'
  );

  // --- Gesso Phase 4 tests ---

  console.log('  - Phase 4.13: Capability catalog includes gesso...');
  const gessoCapEntry = caps.find(c => c.capability && c.capability.id === 'gesso');
  assert.ok(gessoCapEntry, 'gesso capability must be in the catalog');
  assert.ok(gessoCapEntry.capability.title, 'gesso must have a title');
  assert.ok(gessoCapEntry.capability.invocation, 'gesso must have an invocation');
  assert.ok(Array.isArray(gessoCapEntry.capability.triggers), 'gesso must have triggers array');
  assert.strictEqual(gessoCapEntry.capability.triggers.length, 5, 'gesso must have 5 triggers');

  console.log('  - Phase 4.14: Gesso triggers include all 5 multilingual aliases...');
  const expectedTriggers = ['/lienzo-en-blanco', '/blank-canvas', '/tela-bianca', '/gesso', '/canva-blank-canvas'];
  for (const t of expectedTriggers) {
    assert.ok(gessoCapEntry.capability.triggers.includes(t), `gesso triggers must include ${t}`);
  }

  console.log('  - Phase 4.15: Gesso instructions contain required CLI commands...');
  const gessoContent = gessoCapEntry.instructions;
  assert.ok(gessoContent.includes('gesso create'), 'Must reference gsd-canva gesso create');
  assert.ok(gessoContent.includes('gesso append-turn'), 'Must reference gsd-canva gesso append-turn');
  assert.ok(gessoContent.includes('gesso update-notes'), 'Must reference gsd-canva gesso update-notes');
  assert.ok(gessoContent.includes('gesso write'), 'Must reference gsd-canva gesso write');
  assert.ok(gessoContent.includes('gesso confirm'), 'Must reference gsd-canva gesso confirm');

  console.log('  - Phase 4.16: Gesso instructions require preflight CLI...');
  assert.ok(gessoContent.includes('gsd-canva --help'), 'Must require preflight gsd-canva --help');

  console.log('  - Phase 4.17: Gesso instructions prohibit direct JSON edits...');
  assert.ok(
    gessoContent.includes('PROHIBIDO') && gessoContent.includes('lienzo.json'),
    'Must prohibit editing lienzo.json directly'
  );
  assert.ok(
    gessoContent.includes('PROHIBIDO') && gessoContent.includes('sesion.json'),
    'Must prohibit editing sesion.json directly'
  );

  console.log('  - Phase 4.18: Gesso instructions require explicit user approval before confirm...');
  assert.ok(
    gessoContent.includes('PROHIBIDO') && gessoContent.includes('mockup') && gessoContent.includes('gesso confirm'),
    'Must prohibit mockup before gesso confirm'
  );
  assert.ok(
    gessoContent.includes('aprobación') || gessoContent.includes('explícita') || gessoContent.includes('confirmación'),
    'Must require explicit user approval'
  );

  console.log('  - Phase 4.19: Gesso instructions prohibit autopopulating technical decisions...');
  assert.ok(
    gessoContent.includes('PROHIBIDO') && gessoContent.includes('autopoblar'),
    'Must prohibit autopopulating technical decisions'
  );
  assert.ok(
    gessoContent.includes('decisions.json'),
    'Must reference decisions.json prohibition'
  );

  console.log('  - Phase 4.20: Gesso instructions prohibit Studi or Opere...');
  assert.ok(
    gessoContent.includes('PROHIBIDO') && gessoContent.includes('Studi') || gessoContent.includes('Opere'),
    'Must prohibit creating Studi or Opere'
  );

  console.log('  - Phase 4.21: Gesso instructions offer methodology selection...');
  const methodologies = ['Socrática', 'Creative Brief', 'Jobs-to-be-Done', 'Design Thinking', '5W + 1H'];
  for (const m of methodologies) {
    assert.ok(gessoContent.includes(m), `Must mention methodology: ${m}`);
  }

  console.log('  - Phase 4.22: Rendered Antigravity skill contains all 5 gesso aliases as triggers...');
  const antigravityGesso = antigravitySkill.render(gessoCapEntry.capability, gessoCapEntry.instructions);
  for (const t of expectedTriggers) {
    assert.ok(antigravityGesso.includes(t), `Antigravity skill must include trigger ${t}`);
  }

  console.log('  - Phase 4.23: Rendered Codex command contains gesso invocation...');
  const codexGesso = codexCommand.render(gessoCapEntry.capability, gessoCapEntry.instructions);
  assert.ok(codexGesso.includes('/lienzo-en-blanco'), 'Codex command must include gesso invocation');
  assert.ok(codexGesso.includes('gesso create'), 'Codex command must include gesso create');

  console.log('  - Phase 4.24: Rendered OpenCode command contains gesso invocation...');
  const opencodeGesso = opencodeCommand.render(gessoCapEntry.capability, gessoCapEntry.instructions);
  assert.ok(opencodeGesso.includes('/lienzo-en-blanco'), 'OpenCode command must include gesso invocation');
  assert.ok(opencodeGesso.includes('gesso create'), 'OpenCode command must include gesso create');

  console.log('  - Phase 4.25: Gesso instructions mention transition to canva-mockup after confirmation...');
  assert.ok(
    gessoContent.includes('/canva-mockup'),
    'Must offer transition to /canva-mockup after confirmation'
  );

  console.log('  - Phase 4.26: Existing canva-mockup capability unchanged...');
  const canvaContent = gessoCapEntry ? caps.find(c => c.capability.id === 'canva-mockup') : null;
  assert.ok(canvaContent, 'canva-mockup capability must still load');
  assert.ok(canvaContent.instructions.includes('plan questions'), 'canva-mockup instructions must still contain plan questions');
}

module.exports = { run };
