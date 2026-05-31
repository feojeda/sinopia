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
}

module.exports = { run };
