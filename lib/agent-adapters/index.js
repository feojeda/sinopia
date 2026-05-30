const fs = require('fs');
const path = require('path');

const antigravityAdapter = require('./antigravity-skill');
const codexAdapter = require('./codex-command');
const opencodeAdapter = require('./opencode-command');

const AGENT_ADAPTERS = {
  antigravity: antigravityAdapter,
  codex: codexAdapter,
  opencode: opencodeAdapter
};

function getAdapter(agentId) {
  const adapter = AGENT_ADAPTERS[agentId];
  if (!adapter) {
    const error = new Error(`Unknown agent adapter: ${agentId}`);
    error.code = 'GSDC_ADAPTER_UNKNOWN';
    throw error;
  }
  return adapter;
}

function getSupportedAgents() {
  return Object.keys(AGENT_ADAPTERS);
}

function loadCapability(capabilityDir) {
  const capabilityJsonPath = path.join(capabilityDir, 'capability.json');
  const instructionsPath = path.join(capabilityDir, 'instructions.md');

  if (!fs.existsSync(capabilityJsonPath)) {
    const error = new Error(`Missing capability.json in ${capabilityDir}`);
    error.code = 'GSDC_CAPABILITY_MISSING';
    throw error;
  }

  let capability;
  try {
    capability = JSON.parse(fs.readFileSync(capabilityJsonPath, 'utf8'));
  } catch (e) {
    const error = new Error(`Invalid JSON in capability.json: ${capabilityDir}`);
    error.code = 'GSDC_CAPABILITY_INVALID_JSON';
    throw error;
  }

  if (!capability.id) {
    const error = new Error(`Capability is missing required field: id (${capabilityDir})`);
    error.code = 'GSDC_CAPABILITY_INVALID';
    throw error;
  }

  if (!capability.description) {
    const error = new Error(`Capability is missing required field: description (${capabilityDir})`);
    error.code = 'GSDC_CAPABILITY_INVALID';
    throw error;
  }

  if (!capability.title) {
    const error = new Error(`Capability is missing required field: title (${capabilityDir})`);
    error.code = 'GSDC_CAPABILITY_INVALID';
    throw error;
  }

  if (!capability.invocation) {
    const error = new Error(`Capability is missing required field: invocation (${capabilityDir})`);
    error.code = 'GSDC_CAPABILITY_INVALID';
    throw error;
  }

  if (capability.triggers !== undefined && !Array.isArray(capability.triggers)) {
    const error = new Error(`Capability field 'triggers' must be an array (${capabilityDir})`);
    error.code = 'GSDC_CAPABILITY_INVALID';
    throw error;
  }

  if (!fs.existsSync(instructionsPath)) {
    const error = new Error(`Missing instructions.md in ${capabilityDir}`);
    error.code = 'GSDC_CAPABILITY_MISSING';
    throw error;
  }

  const instructions = fs.readFileSync(instructionsPath, 'utf8');
  if (instructions.trim().length === 0) {
    const error = new Error(`instructions.md is empty in ${capabilityDir}`);
    error.code = 'GSDC_CAPABILITY_EMPTY_INSTRUCTIONS';
    throw error;
  }

  return { capability, instructions };
}

function loadAllCapabilities(sourceRoot) {
  sourceRoot = sourceRoot || path.resolve(__dirname, '../../templates/agent-source');

  if (!fs.existsSync(sourceRoot)) {
    const error = new Error(`Agent source directory not found: ${sourceRoot}`);
    error.code = 'GSDC_SOURCE_MISSING';
    throw error;
  }

  const capabilities = [];
  const dirs = fs.readdirSync(sourceRoot);

  for (const dir of dirs) {
    const dirPath = path.join(sourceRoot, dir);
    if (fs.statSync(dirPath).isDirectory()) {
      if (!fs.existsSync(path.join(dirPath, 'capability.json'))) {
        continue;
      }
      capabilities.push(loadCapability(dirPath));
    }
  }

  return capabilities;
}

module.exports = {
  AGENT_ADAPTERS,
  getAdapter,
  getSupportedAgents,
  loadCapability,
  loadAllCapabilities
};
