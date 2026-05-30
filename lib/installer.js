const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const agentAdapters = require('./agent-adapters');

// Helper para calcular sha256 de un archivo o string
function getSha256(filePathOrContent, isContent = false) {
  const content = isContent ? filePathOrContent : fs.readFileSync(filePathOrContent);
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Helper para escrituras atómicas (escribe en .tmp y renombra)
function writeAtomicSync(targetPath, content) {
  const tmpPath = targetPath + '.tmp';
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

// Helper para copiar archivos de forma recursiva con preflight
function copyRecursiveSync(src, dest, filesToCopy = []) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName),
        filesToCopy
      );
    });
  } else {
    // Es un archivo, registrar para copiar
    filesToCopy.push({ src, dest });
  }
}

const OFFICIAL_COMMANDS_ALLOWLIST = [
  'canva-mockup.md',
  'canva-draft.md',
  'canva-refine.md',
  'canva-deliver.md'
];

const PROTECTED_PATHS = [
  'canva-plans/',
  'delivery/',
  'system_templates.json'
];

function getOfficialAgentArtifactPaths() {
  try {
    const capabilities = agentAdapters.loadAllCapabilities();
    const paths = [];
    const adapterIds = agentAdapters.getSupportedAgents();
    for (const agentId of adapterIds) {
      const adapter = agentAdapters.getAdapter(agentId);
      for (const { capability } of capabilities) {
        const targets = adapter.getTargets(capability);
        for (const { targetPath } of targets) {
          paths.push(targetPath);
        }
      }
    }
    for (const { capability } of capabilities) {
      paths.push(`.antigravity/commands/${capability.id}.md`);
    }
    return paths;
  } catch (e) {
    return [];
  }
}

const ADAPTER_IDS = {
  antigravity: 'antigravity-skill-v1',
  codex: 'codex-command-v1',
  opencode: 'opencode-command-v1'
};

const AGENT_TARGET_PREFIXES = {
  '.agents/skills/': 'antigravity',
  '.codex/commands/': 'codex',
  '.opencode/commands/': 'opencode'
};

function migrateManifestV1toV2(manifest) {
  if (!manifest || manifest.schemaVersion === 2) return manifest;

  manifest.schemaVersion = 2;

  if (!manifest.agents) {
    manifest.agents = {};
  }

  for (const [prefix, agentId] of Object.entries(AGENT_TARGET_PREFIXES)) {
    if (!manifest.agents[agentId]) {
      manifest.agents[agentId] = {
        adapter: ADAPTER_IDS[agentId],
        files: []
      };
    }
    if (manifest.files) {
      const agentFiles = manifest.files.filter(f => f.target && f.target.startsWith(prefix));
      for (const af of agentFiles) {
        const alreadyInAgent = manifest.agents[agentId].files.some(
          mf => mf.target === af.target
        );
        if (!alreadyInAgent) {
          manifest.agents[agentId].files.push({
            source: af.source,
            target: af.target,
            sha256: af.sha256,
            managed: af.managed !== undefined ? af.managed : true
          });
        }
      }
    }
  }

  return manifest;
}

/**
 * Inicializa el framework en el proyecto destino
 */
async function init(options = {}) {
  const targetDir = process.cwd();
  const frameworkTemplatesDir = path.resolve(__dirname, '../templates');
  
  const SUPPORTED_AGENTS = agentAdapters.getSupportedAgents();
  const VALID_AGENT_VALUES = [...SUPPORTED_AGENTS, 'all'];

  if (options.agent && !VALID_AGENT_VALUES.includes(options.agent)) {
    const error = new Error(`Agent '${options.agent}' is not supported. Supported: ${VALID_AGENT_VALUES.join(', ')}`);
    error.code = 'GSDC_ADAPTER_UNKNOWN';
    error.exitCode = 17;
    throw error;
  }

  const agentsToInstall = options.agent === 'all'
    ? SUPPORTED_AGENTS
    : (options.agent ? [options.agent] : []);

  const gsdFolder = path.join(targetDir, '.gsd-canva');
  const manifestPath = path.join(gsdFolder, 'manifest.json');
  const gitignorePath = path.join(targetDir, '.gitignore');
  const systemTemplatesPath = path.join(targetDir, 'system_templates.json');
  const antiCommandsDir = path.join(targetDir, '.antigravity/commands');
  
  // --- FASE 1: PREFLIGHT (Validaciones transaccionales antes de escribir) ---
  
  // 1. Validar permisos de escritura en la raíz del proyecto
  try {
    fs.accessSync(targetDir, fs.constants.W_OK);
  } catch (e) {
    const error = new Error('No se cuentan con permisos de escritura en el directorio del proyecto.');
    error.code = 'GSDC_PERMISSION_DENIED';
    error.exitCode = 16;
    throw error;
  }
  
  // 2. Control de existencia de .gsd-canva sin manifest
  if (fs.existsSync(gsdFolder) && !fs.existsSync(manifestPath)) {
    if (!options.adopt && !options.forceAll) {
      const error = new Error(
        'El directorio .gsd-canva/ existe pero no se encuentra el archivo manifest.json. ' +
        'Ejecuta con --adopt para registrar archivos conocidos o --force-all para sobrescribir todo de forma segura.'
      );
      error.code = 'GSDC_MANIFEST_MISSING';
      error.exitCode = 12;
      throw error;
    }
  }
  
  // 3. Evaluar conflictos de sobreescritura (si no se pasa forceAll)
  const filesToCopy = [];
  copyRecursiveSync(frameworkTemplatesDir, gsdFolder, filesToCopy);
  
  // Mapear copias hacia .antigravity/commands también
  const commandsSrcDir = path.join(frameworkTemplatesDir, 'commands');
  if (fs.existsSync(commandsSrcDir)) {
    fs.readdirSync(commandsSrcDir).forEach(file => {
      filesToCopy.push({
        src: path.join(commandsSrcDir, file),
        dest: path.join(antiCommandsDir, file)
      });
    });
  }

  // Mapear adapter targets for all requested agents
  let adapterTargets = [];
  if (agentsToInstall.length > 0) {
    const capabilities = agentAdapters.loadAllCapabilities();
    for (const agentId of agentsToInstall) {
      const adapter = agentAdapters.getAdapter(agentId);
      for (const { capability } of capabilities) {
        const targets = adapter.getTargets(capability);
        for (const { targetPath } of targets) {
          adapterTargets.push({
            agentId,
            targetPath,
            capability
          });
          filesToCopy.push({
            src: `agent-source:${capability.id}`,
            dest: path.join(targetDir, targetPath),
            isSkill: true,
            agentId
          });
        }
      }
    }
  }
  
  // Si existe el manifiesto, cargarlo para ver qué archivos están bajo control
  let currentManifest = null;
  if (fs.existsSync(manifestPath)) {
    try {
      currentManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      currentManifest = migrateManifestV1toV2(currentManifest);
    } catch (e) {
      // Ignorar manifiesto corrupto para preflight
    }
  }
  
  // Comprobación de conflictos de archivos modificados no controlados
  if (!options.forceAll && !options.adopt) {
    for (const f of filesToCopy) {
      if (fs.existsSync(f.dest)) {
        // ¿Está el archivo registrado en el manifiesto actual?
        const isTracked = currentManifest && currentManifest.files && 
                           currentManifest.files.some(mf => path.resolve(mf.target) === path.resolve(f.dest));
        
        // Si no está registrado en el manifiesto, o si fue modificado fuera del hash esperado
        if (!isTracked) {
          // Si el destino es en .antigravity/commands/ y no está en manifest, es un conflicto de seguridad
          const error = new Error(
            `Conflicto detectado: El archivo ${path.relative(targetDir, f.dest)} ya existe y no está registrado en el manifiesto local.`
          );
          error.code = 'GSDC_INIT_CONFLICT';
          error.exitCode = 11;
          error.details = { conflictFile: path.relative(targetDir, f.dest) };
          throw error;
        }
        
        // Si está tracked pero el usuario lo modificó (el hash actual es distinto al manifest)
        const targetHash = getSha256(f.dest);
        const manifestEntry = currentManifest.files.find(mf => path.resolve(mf.target) === path.resolve(f.dest));
        if (manifestEntry && manifestEntry.sha256 !== targetHash) {
          const error = new Error(
            `Conflicto detectado: El archivo ${path.relative(targetDir, f.dest)} fue modificado localmente.`
          );
          error.code = 'GSDC_INIT_CONFLICT';
          error.exitCode = 11;
          error.details = { conflictFile: path.relative(targetDir, f.dest) };
          throw error;
        }
      }
    }
  }
  
  // Validar permisos sobre el .gitignore si existe
  if (fs.existsSync(gitignorePath)) {
    try {
      fs.accessSync(gitignorePath, fs.constants.W_OK);
    } catch (e) {
      const error = new Error('No se cuentan con permisos de escritura para editar el archivo .gitignore.');
      error.code = 'GSDC_PERMISSION_DENIED';
      error.exitCode = 16;
      throw error;
    }
  }
  
  // --- FASE 2: EJECUCIÓN (Una vez que el preflight garantiza éxito absoluto) ---
  
  // 1. Si es forceAll en ausencia de manifest, aplicar allowlist de borrado seguro
  if (options.forceAll && !currentManifest) {
    const dirsToClean = [
      { dir: antiCommandsDir, allowlist: OFFICIAL_COMMANDS_ALLOWLIST },
      { dir: path.join(targetDir, '.agents/skills'), allowlist: null },
      { dir: path.join(targetDir, '.codex/commands'), allowlist: null },
      { dir: path.join(targetDir, '.opencode/commands'), allowlist: null }
    ];
    const officialAgentPaths = getOfficialAgentArtifactPaths();
    for (const { dir, allowlist } of dirsToClean) {
      if (!fs.existsSync(dir)) continue;
      fs.readdirSync(dir).forEach(entry => {
        const entryPath = path.join(dir, entry);
        if (fs.statSync(entryPath).isDirectory()) {
          const skillFile = path.join(entryPath, 'SKILL.md');
          const relPath = path.relative(targetDir, skillFile);
          if (fs.existsSync(skillFile) && officialAgentPaths.includes(relPath)) {
            try { fs.unlinkSync(skillFile); } catch (e) {}
          }
          return;
        }
        if (allowlist) {
          if (allowlist.includes(entry)) {
            try { fs.unlinkSync(entryPath); } catch (e) {}
          }
        } else {
          const relPath = path.relative(targetDir, entryPath);
          if (officialAgentPaths.includes(relPath)) {
            try { fs.unlinkSync(entryPath); } catch (e) {}
          }
        }
      });
    }
  }
  
  // 2. Crear directorios base
  fs.mkdirSync(gsdFolder, { recursive: true });
  fs.mkdirSync(path.join(gsdFolder, 'commands'), { recursive: true });
  fs.mkdirSync(path.join(gsdFolder, 'workflows'), { recursive: true });
  fs.mkdirSync(path.join(gsdFolder, 'plan-templates'), { recursive: true });
  fs.mkdirSync(antiCommandsDir, { recursive: true });
  fs.mkdirSync(path.join(targetDir, 'canva-plans'), { recursive: true });
  
  const manifestFilesList = [];
  
  // 3. Escribir/Copiar archivos físicos del framework y registrar hashes
  for (const f of filesToCopy) {
    if (f.isSkill) continue;

    if (options.adopt && fs.existsSync(f.dest)) {
      const currentHash = getSha256(f.dest);
      manifestFilesList.push({
        source: path.relative(path.resolve(__dirname, '..'), f.src),
        target: path.relative(targetDir, f.dest),
        sha256: currentHash,
        managed: true
      });
      continue;
    }
    
    // De lo contrario, copiar plantilla o archivo de código
    fs.mkdirSync(path.dirname(f.dest), { recursive: true });
    if (fs.existsSync(f.src)) {
      if (options.forceAll && fs.existsSync(f.dest)) {
        const relTarget = path.relative(targetDir, f.dest);
        const managedEntry = currentManifest && currentManifest.files &&
          currentManifest.files.find(mf => mf.target === relTarget);
        if (managedEntry) {
          const currentHash = getSha256(f.dest);
          if (managedEntry.sha256 !== currentHash) {
            const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
            fs.copyFileSync(f.dest, `${f.dest}.bak.${ts}`);
          }
        }
      }
      fs.copyFileSync(f.src, f.dest);
      const copiedHash = getSha256(f.dest);
      manifestFilesList.push({
        source: path.relative(path.resolve(__dirname, '..'), f.src),
        target: path.relative(targetDir, f.dest),
        sha256: copiedHash,
        managed: true
      });
    }
  }
  
  // 4. Crear system_templates.json por defecto si no existe
  if (!fs.existsSync(systemTemplatesPath)) {
    writeAtomicSync(systemTemplatesPath, JSON.stringify({ templates: [] }, null, 2));
  }
  
  // 5. Escribir config.json portable y config.local.example.json si no existen
  const configPath = path.join(gsdFolder, 'config.json');
  if (!fs.existsSync(configPath)) {
    const defaultConfig = {
      defaultWorkflow: "layout-conceptualization.md",
      strictMode: true
    };
    writeAtomicSync(configPath, JSON.stringify(defaultConfig, null, 2));
  }
  
  const configLocalExamplePath = path.join(gsdFolder, 'config.local.example.json');
  if (!fs.existsSync(configLocalExamplePath)) {
    const localExample = {
      description: "Configuración específica de máquina local. Copia a config.local.json y rellena valores.",
      localCanvaMcpPath: "/Users/usuario/.gemini/antigravity-ide/mcp/canva",
      developmentMode: false
    };
    writeAtomicSync(configLocalExamplePath, JSON.stringify(localExample, null, 2));
  }
  
  // 6. Configurar .gitignore de forma segura e idempotente con delimitadores de bloques
  let gitignoreContent = '';
  if (fs.existsSync(gitignorePath)) {
    gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  }
  
  const gitignoreBlock = `# >>> gsd-canva >>>
delivery/
.gsd-canva/config.local.json
.gsd-canva/.lock
# <<< gsd-canva <<<`;
  
  if (gitignoreContent.includes('# >>> gsd-canva >>>')) {
    // Reemplazar el bloque existente de forma atómica para evitar duplicados
    gitignoreContent = gitignoreContent.replace(
      /# >>> gsd-canva >>>[\s\S]*?# <<< gsd-canva <<</g,
      gitignoreBlock
    );
  } else {
    // Append al final
    gitignoreContent = gitignoreContent.trim() + '\n\n' + gitignoreBlock + '\n';
  }
  writeAtomicSync(gitignorePath, gitignoreContent);
  
  // 8. Agent Adapter Installation (--agent codex|opencode|antigravity|all)
  let agentInstallResults = {};
  if (agentsToInstall.length > 0 && adapterTargets.length > 0) {
    const capabilities = agentAdapters.loadAllCapabilities();
    const capMap = new Map(capabilities.map(c => [c.capability.id, c]));

    for (const agentId of agentsToInstall) {
      agentInstallResults[agentId] = { count: 0, target: agentAdapters.getAdapter(agentId).targetRoot };
    }

    for (const { agentId, targetPath, capability } of adapterTargets) {
      const capData = capMap.get(capability.id);
      if (!capData) continue;
      const adapter = agentAdapters.getAdapter(agentId);
      const fullPath = path.join(targetDir, targetPath);

      if (options.adopt && fs.existsSync(fullPath)) {
        const currentHash = getSha256(fullPath);
        manifestFilesList.push({
          source: `agent-source:${capability.id}`,
          target: targetPath,
          sha256: currentHash,
          managed: true,
          agent: agentId
        });
        agentInstallResults[agentId].count++;
        continue;
      }

      const rendered = adapter.render(capData.capability, capData.instructions);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      if (options.forceAll && fs.existsSync(fullPath)) {
        const relTarget = path.relative(targetDir, fullPath);
        const managedEntry = currentManifest && currentManifest.files &&
          currentManifest.files.find(mf => mf.target === relTarget);
        if (managedEntry) {
          const currentHash = getSha256(fullPath);
          if (managedEntry.sha256 !== currentHash) {
            const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
            fs.copyFileSync(fullPath, `${fullPath}.bak.${ts}`);
          }
        }
      }
      writeAtomicSync(fullPath, rendered);
      const fileHash = getSha256(fullPath);
      manifestFilesList.push({
        source: `agent-source:${capability.id}`,
        target: targetPath,
        sha256: fileHash,
        managed: true,
        agent: agentId
      });
      agentInstallResults[agentId].count++;
    }
  }

  // 9. Escribir manifest.json final
  const manifestAgents = {};
  for (const agentId of agentsToInstall) {
    manifestAgents[agentId] = {
      adapter: `${agentId}-${agentAdapters.getAdapter(agentId).targetType}-v1`,
      files: manifestFilesList.filter(f => f.agent === agentId)
    };
  }
  for (const f of manifestFilesList) {
    delete f.agent;
  }

  const manifestData = {
    schemaVersion: 2,
    frameworkVersion: options.frameworkVersion || '1.0.0',
    installedAt: new Date().toISOString(),
    agents: manifestAgents,
    files: manifestFilesList
  };
  writeAtomicSync(manifestPath, JSON.stringify(manifestData, null, 2));
  
  const result = {
    initialized: true,
    schemaVersion: 2,
    filesCount: manifestFilesList.length
  };

  if (agentsToInstall.length > 0) {
    result.agentsInstalled = agentInstallResults;
  }

  if (agentsToInstall.includes('antigravity')) {
    result.agentSkillsInstalled = agentInstallResults.antigravity.count;
    result.agentTarget = agentInstallResults.antigravity.target;
  }

  return result;
}

/**
 * Actualiza los comandos y plantillas con copias de seguridad fechadas en caso de colisión
 */
async function upgrade(options = {}) {
  const targetDir = process.cwd();
  const frameworkTemplatesDir = path.resolve(__dirname, '../templates');
  const gsdFolder = path.join(targetDir, '.gsd-canva');
  const manifestPath = path.join(gsdFolder, 'manifest.json');

  if (!fs.existsSync(gsdFolder) || !fs.existsSync(manifestPath)) {
    const error = new Error('No se detecta una instalación activa del framework en el proyecto.');
    error.code = 'GSDC_MANIFEST_MISSING';
    error.exitCode = 12;
    throw error;
  }

  let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  manifest = migrateManifestV1toV2(manifest);

  for (const agentId of agentAdapters.getSupportedAgents()) {
    if (!manifest.agents[agentId]) {
      manifest.agents[agentId] = {
        adapter: ADAPTER_IDS[agentId],
        files: []
      };
    }
  }

  const filesToCopy = [];
  copyRecursiveSync(frameworkTemplatesDir, gsdFolder, filesToCopy);

  const commandsSrcDir = path.join(frameworkTemplatesDir, 'commands');
  const antiCommandsDir = path.join(targetDir, '.antigravity/commands');
  if (fs.existsSync(commandsSrcDir)) {
    fs.readdirSync(commandsSrcDir).forEach(file => {
      filesToCopy.push({
        src: path.join(commandsSrcDir, file),
        dest: path.join(antiCommandsDir, file)
      });
    });
  }

  const backupsCreated = [];
  const updatedFiles = [];

  for (const f of filesToCopy) {
    if (!fs.existsSync(f.src)) continue;

    const relativeTarget = path.relative(targetDir, f.dest);
    const existingEntry = manifest.files && manifest.files.find(mf => mf.target === relativeTarget);

    if (fs.existsSync(f.dest)) {
      const currentHash = getSha256(f.dest);

      if (existingEntry) {
        if (existingEntry.sha256 !== currentHash) {
          const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
          const backupName = `${f.dest}.bak.${timestamp}`;
          fs.copyFileSync(f.dest, backupName);
          backupsCreated.push(path.relative(targetDir, backupName));
        }
      } else {
        const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        const backupName = `${f.dest}.bak.${timestamp}`;
        fs.copyFileSync(f.dest, backupName);
        backupsCreated.push(path.relative(targetDir, backupName));
      }
    }

    fs.mkdirSync(path.dirname(f.dest), { recursive: true });
    fs.copyFileSync(f.src, f.dest);
    const newHash = getSha256(f.dest);

    if (existingEntry) {
      existingEntry.sha256 = newHash;
    } else {
      if (!manifest.files) manifest.files = [];
      manifest.files.push({
        source: path.relative(path.resolve(__dirname, '..'), f.src),
        target: relativeTarget,
        sha256: newHash,
        managed: true
      });
    }
    updatedFiles.push(relativeTarget);
  }

  if (manifest.agents) {
    let capabilities;
    try {
      capabilities = agentAdapters.loadAllCapabilities();
    } catch (e) {
      capabilities = [];
    }
    const capMap = new Map(capabilities.map(c => [c.capability.id, c]));

    for (const [agentId, agentRecord] of Object.entries(manifest.agents)) {
      if (!agentRecord.files || agentRecord.files.length === 0) continue;

      let adapter;
      try {
        adapter = agentAdapters.getAdapter(agentId);
      } catch (e) {
        continue;
      }

      for (const fileEntry of agentRecord.files) {
        if (!fileEntry.managed) continue;

        const fullPath = path.join(targetDir, fileEntry.target);

        let capId = null;
        const agMatch = fileEntry.target.match(/\.agents\/skills\/([^/]+)\/SKILL\.md/);
        const cmdMatch = fileEntry.target.match(/\.(codex|opencode)\/commands\/(.+)\.md/);

        if (agMatch) {
          capId = agMatch[1];
        } else if (cmdMatch) {
          capId = cmdMatch[2];
        }

        if (!capId) continue;

        const capData = capMap.get(capId);
        if (!capData) continue;

        if (fs.existsSync(fullPath)) {
          const currentHash = getSha256(fullPath);
          if (fileEntry.sha256 && fileEntry.sha256 !== currentHash) {
            const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
            const backupName = `${fullPath}.bak.${timestamp}`;
            fs.copyFileSync(fullPath, backupName);
            backupsCreated.push(path.relative(targetDir, backupName));
          }
        }

        const rendered = adapter.render(capData.capability, capData.instructions);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        writeAtomicSync(fullPath, rendered);

        const newHash = getSha256(fullPath);
        fileEntry.sha256 = newHash;

        if (manifest.files) {
          const flatEntry = manifest.files.find(mf => mf.target === fileEntry.target);
          if (flatEntry) {
            flatEntry.sha256 = newHash;
          }
        }

        updatedFiles.push(fileEntry.target);
      }
    }
  }

  const legacyDirs = [
    path.join(gsdFolder, 'bin'),
    path.join(gsdFolder, 'lib')
  ];

  for (const dir of legacyDirs) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  if (manifest.files) {
    manifest.files = manifest.files.filter(mf => {
      const target = mf.target || '';
      return !target.startsWith('.gsd-canva/bin/') && !target.startsWith('.gsd-canva/lib/');
    });
  }

  manifest.frameworkVersion = options.frameworkVersion || manifest.frameworkVersion;
  manifest.installedAt = new Date().toISOString();
  writeAtomicSync(manifestPath, JSON.stringify(manifest, null, 2));

  return {
    upgraded: true,
    schemaVersion: manifest.schemaVersion,
    frameworkVersion: manifest.frameworkVersion,
    filesUpdated: updatedFiles.length,
    backupsCreated
  };
}

/**
 * Diagnostica y valida la salud del entorno de planificación
 */
async function doctor(options = {}) {
  const targetDir = process.cwd();
  const gsdFolder = path.join(targetDir, '.gsd-canva');
  const manifestPath = path.join(gsdFolder, 'manifest.json');
  const systemTemplatesPath = path.join(targetDir, 'system_templates.json');
  
  // Validaciones Core del Entorno
  if (!fs.existsSync(gsdFolder)) {
    const error = new Error('Directorio de control .gsd-canva/ no encontrado.');
    error.code = 'GSDC_MANIFEST_MISSING';
    error.exitCode = 12;
    throw error;
  }
  
  if (!fs.existsSync(manifestPath)) {
    const error = new Error('Archivo manifest.json no encontrado.');
    error.code = 'GSDC_MANIFEST_MISSING';
    error.exitCode = 12;
    throw error;
  }
  
  // Validar manifest JSON
  try {
    JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    const error = new Error('El archivo manifest.json está corrupto o es ilegible.');
    error.code = 'GSDC_JSON_PARSE_ERROR';
    error.exitCode = 15;
    throw error;
  }
  
  // Validar system_templates JSON
  if (fs.existsSync(systemTemplatesPath)) {
    try {
      JSON.parse(fs.readFileSync(systemTemplatesPath, 'utf8'));
    } catch (e) {
      const error = new Error('El catálogo system_templates.json está corrupto o es ilegible.');
      error.code = 'GSDC_JSON_PARSE_ERROR';
      error.exitCode = 15;
      throw error;
    }
  }
  
  // Validación Estructural del Agente/IDE
  let agentDetails = {};
  if (options.agent) {
    const SUPPORTED_AGENTS = agentAdapters.getSupportedAgents();
    const VALID_DOCTOR_AGENTS = [...SUPPORTED_AGENTS, 'all'];
    const requestedAgent = options.agent.toLowerCase();

    if (!VALID_DOCTOR_AGENTS.includes(requestedAgent)) {
      const error = new Error(`El agente solicitado '${options.agent}' no tiene integración estructurada soportada.`);
      error.code = 'GSDC_AGENT_UNSUPPORTED';
      error.exitCode = 17;
      throw error;
    }

    const agentsToCheck = requestedAgent === 'all' ? SUPPORTED_AGENTS : [requestedAgent];
    const expectedCapabilities = agentAdapters.loadAllCapabilities();

    agentDetails.agents = {};

    for (const agentId of agentsToCheck) {
      const adapter = agentAdapters.getAdapter(agentId);
      const agentResult = { adapterId: agentId };

      if (agentId === 'antigravity') {
        const antiCommandsDir = path.join(targetDir, '.antigravity/commands');
        try {
          fs.mkdirSync(antiCommandsDir, { recursive: true });
          fs.accessSync(antiCommandsDir, fs.constants.R_OK | fs.constants.W_OK);

          const tempTestFile = path.join(antiCommandsDir, '.gsd-test-temp.md');
          fs.writeFileSync(tempTestFile, '### TEST MOCK COMMAND', 'utf8');
          fs.unlinkSync(tempTestFile);
        } catch (e) {
          const error = new Error('No se pudo validar la ruta, los permisos o la estructura de prompts de Antigravity IDE.');
          error.code = 'GSDC_AGENT_DISCOVERY_FAILED';
          error.exitCode = 18;
          throw error;
        }
        agentResult.legacyCommands = true;
      }

      const skillsDir = path.join(targetDir, adapter.targetRoot);
      agentResult.targetDir = fs.existsSync(skillsDir);

      const expectedIds = expectedCapabilities.map(c => c.capability.id);
      let validCount = 0;
      const missing = [];
      const extra = [];

      if (agentResult.targetDir) {
        const existing = fs.readdirSync(skillsDir).filter(d => {
          const p = path.join(skillsDir, d);
          return adapter.targetType === 'skill'
            ? fs.statSync(p).isDirectory()
            : fs.statSync(p).isFile();
        });

        for (const capId of expectedIds) {
          const checkPath = adapter.targetType === 'skill'
            ? path.join(skillsDir, capId, 'SKILL.md')
            : path.join(skillsDir, `${capId}.md`);

          if (fs.existsSync(checkPath)) {
            const content = fs.readFileSync(checkPath, 'utf8');
            if (content.trim().length > 0) {
              validCount++;
            } else {
              missing.push(capId);
            }
          } else {
            missing.push(capId);
          }
        }

        if (adapter.targetType === 'skill') {
          for (const dir of existing) {
            if (!expectedIds.includes(dir)) {
              extra.push(dir);
            }
          }
        }
      } else {
        missing.push(...expectedIds);
      }

      agentResult.expectedCount = expectedIds.length;
      agentResult.validCount = validCount;
      agentResult.missing = missing.length > 0 ? missing : undefined;
      agentResult.extra = extra.length > 0 ? extra : undefined;
      agentResult.allPresent = validCount === expectedIds.length;

      if (agentId === 'opencode') {
        agentResult.experimental = true;
      }

      agentDetails.agents[agentId] = agentResult;
    }

    const allAgentIds = Object.keys(agentDetails.agents);
    agentDetails.allAgentsValid = allAgentIds.every(aid => agentDetails.agents[aid].allPresent);

    if (!agentDetails.allAgentsValid) {
      const failedAgents = allAgentIds.filter(aid => !agentDetails.agents[aid].allPresent);
      const details = {};
      for (const aid of failedAgents) {
        details[aid] = {
          missing: agentDetails.agents[aid].missing,
          validCount: agentDetails.agents[aid].validCount,
          expectedCount: agentDetails.agents[aid].expectedCount
        };
      }
      const error = new Error(
        `Agent validation failed for: ${failedAgents.join(', ')}`
      );
      error.code = 'GSDC_AGENT_SKILLS_MISSING';
      error.exitCode = 19;
      error.details = details;
      throw error;
    }
  }
  
  const result = {
    healthy: true,
    agentValidated: !!options.agent
  };

  if (options.agent) {
    result.agentDetails = agentDetails;
  }

  return result;
}

module.exports = {
  init,
  upgrade,
  doctor
};
