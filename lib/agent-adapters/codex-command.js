function renderCodexCommand(capability, instructions) {
  if (!capability || !capability.id) {
    const error = new Error('Capability is missing required field: id');
    error.code = 'GSDC_ADAPTER_INVALID_CAPABILITY';
    throw error;
  }
  if (!capability.description) {
    const error = new Error('Capability is missing required field: description');
    error.code = 'GSDC_ADAPTER_INVALID_CAPABILITY';
    throw error;
  }
  if (!instructions || instructions.trim().length === 0) {
    const error = new Error('Instructions must not be empty');
    error.code = 'GSDC_ADAPTER_EMPTY_INSTRUCTIONS';
    throw error;
  }

  const header = `# Slash Command: ${capability.invocation}`;
  const body = instructions.trim();

  return `${header}\n\n${body}\n`;
}

function getTargets(capability) {
  return [
    {
      targetPath: `.codex/commands/${capability.id}.md`,
      targetRoot: '.codex/commands'
    }
  ];
}

module.exports = {
  id: 'codex',
  targetType: 'command',
  targetRoot: '.codex/commands',
  render: renderCodexCommand,
  getTargets
};
