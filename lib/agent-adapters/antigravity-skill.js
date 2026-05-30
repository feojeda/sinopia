function renderAntigravitySkill(capability, instructions) {
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

  const triggerList = (capability.triggers || []).join(' or ');
  const descriptionText = triggerList
    ? `Use when the user invokes ${triggerList} or asks to ${capability.description.replace(/^\w/, c => c.toLowerCase())}`
    : capability.description;

  const frontmatter = `---\nname: ${capability.id}\ndescription: ${descriptionText}\n---`;
  const body = `# ${capability.title}\n\n${instructions.trim()}`;

  return `${frontmatter}\n\n${body}\n`;
}

function getTargets(capability) {
  return [
    {
      targetPath: `.agents/skills/${capability.id}/SKILL.md`,
      targetRoot: '.agents/skills'
    }
  ];
}

module.exports = {
  id: 'antigravity',
  targetType: 'skill',
  targetRoot: '.agents/skills',
  render: renderAntigravitySkill,
  getTargets
};
