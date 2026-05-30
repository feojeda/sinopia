function renderOpenCodeCommand(capability, instructions) {
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

  const frontmatter = `---\ndescription: ${capability.description}\n---`;
  const body = `# ${capability.invocation}\n\n${instructions.trim()}`;

  return `${frontmatter}\n\n${body}\n`;
}

function getTargets(capability) {
  return [
    {
      targetPath: `.opencode/commands/${capability.id}.md`,
      targetRoot: '.opencode/commands'
    }
  ];
}

module.exports = {
  id: 'opencode',
  targetType: 'command',
  targetRoot: '.opencode/commands',
  render: renderOpenCodeCommand,
  getTargets
};
