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

// Criterio de allowlist oficial para comandos en caso de force-all sin manifest
const OFFICIAL_COMMANDS_ALLOWLIST = [
  'canva-mockup.md',
  'canva-draft.md',
  'canva-refine.md',
  'canva-deliver.md'
];

/**
 * Inicializa el framework en el proyecto destino
 */
async function init(options = {}) {
  const targetDir = process.cwd();
  const frameworkTemplatesDir = path.resolve(__dirname, '../templates');
  
  const PHASE2_AGENTS = ['antigravity'];

  if (options.agent && !PHASE2_AGENTS.includes(options.agent)) {
    const error = new Error(`Agent '${options.agent}' is not supported in this version. Supported: ${PHASE2_AGENTS.join(', ')}`);
    error.code = 'GSDC_ADAPTER_UNKNOWN';
    error.exitCode = 17;
    throw error;
  }

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

  // Mapear skill targets para Antigravity 2.0 (--agent antigravity)
  let skillTargets = [];
  if (options.agent === 'antigravity') {
    const capabilities = agentAdapters.loadAllCapabilities();
    for (const { capability } of capabilities) {
      const adapter = agentAdapters.getAdapter('antigravity');
      const targets = adapter.getTargets(capability);
      for (const { targetPath } of targets) {
        skillTargets.push({
          targetPath,
          capability
        });
        filesToCopy.push({
          src: `agent-source:${capability.id}`,
          dest: path.join(targetDir, targetPath),
          isSkill: true
        });
      }
    }
  }
  
  // Si existe el manifiesto, cargarlo para ver qué archivos están bajo control
  let currentManifest = null;
  if (fs.existsSync(manifestPath)) {
    try {
      currentManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
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
    if (fs.existsSync(antiCommandsDir)) {
      fs.readdirSync(antiCommandsDir).forEach(file => {
        if (OFFICIAL_COMMANDS_ALLOWLIST.includes(file)) {
          try {
            fs.unlinkSync(path.join(antiCommandsDir, file));
          } catch (e) {}
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
  
  // 8. Antigravity 2.0 Skill Installation (--agent antigravity)
  // skillTargets were already added to filesToCopy and passed preflight checks above
  let agentSkillCount = 0;
  if (options.agent === 'antigravity' && skillTargets.length > 0) {
    const adapter = agentAdapters.getAdapter('antigravity');
    const capabilities = agentAdapters.loadAllCapabilities();
    const capMap = new Map(capabilities.map(c => [c.capability.id, c]));

    for (const { targetPath, capability } of skillTargets) {
      const capData = capMap.get(capability.id);
      if (!capData) continue;
      const fullPath = path.join(targetDir, targetPath);
      const rendered = adapter.render(capData.capability, capData.instructions);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      writeAtomicSync(fullPath, rendered);
      const skillHash = getSha256(fullPath);
      manifestFilesList.push({
        source: `agent-source:${capability.id}`,
        target: targetPath,
        sha256: skillHash,
        managed: true
      });
      agentSkillCount++;
    }
  }

  // 9. Escribir manifest.json final
  const manifestData = {
    schemaVersion: 1,
    frameworkVersion: options.frameworkVersion || '1.0.0',
    installedAt: new Date().toISOString(),
    files: manifestFilesList
  };
  writeAtomicSync(manifestPath, JSON.stringify(manifestData, null, 2));
  
  const result = {
    initialized: true,
    schemaVersion: 1,
    filesCount: manifestFilesList.length
  };

  if (options.agent === 'antigravity') {
    result.agentSkillsInstalled = agentSkillCount;
    result.agentTarget = '.agents/skills';
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
  const filesToCopy = [];
  copyRecursiveSync(frameworkTemplatesDir, gsdFolder, filesToCopy);
  
  // Copias externas también hacia .antigravity/commands
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
    const existingEntry = manifest.files.find(mf => mf.target === relativeTarget);
    
    if (fs.existsSync(f.dest)) {
      const currentHash = getSha256(f.dest);
      
      if (existingEntry) {
        if (existingEntry.sha256 !== currentHash) {
          // Conflicto de hashes: El usuario modificó localmente. Respaldar antes de sobreescribir.
          const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
          const backupName = `${f.dest}.bak.${timestamp}`;
          fs.renameSync(f.dest, backupName);
          backupsCreated.push(path.relative(targetDir, backupName));
        }
      } else {
        // Existe archivo pero no está en manifiesto (conflicto externo)
        const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        const backupName = `${f.dest}.bak.${timestamp}`;
        fs.renameSync(f.dest, backupName);
        backupsCreated.push(path.relative(targetDir, backupName));
      }
    }
    
    // Escribir nueva versión del framework
    fs.mkdirSync(path.dirname(f.dest), { recursive: true });
    fs.copyFileSync(f.src, f.dest);
    const newHash = getSha256(f.dest);
    
    // Actualizar registro en el manifest
    if (existingEntry) {
      existingEntry.sha256 = newHash;
    } else {
      manifest.files.push({
        source: path.relative(path.resolve(__dirname, '..'), f.src),
        target: relativeTarget,
        sha256: newHash,
        managed: true
      });
    }
    updatedFiles.push(relativeTarget);
  }
  
  // --- MIGRACIÓN v1.1: Eliminar runtime copiado de instalaciones heredadas ---
  const legacyDirs = [
    path.join(gsdFolder, 'bin'),
    path.join(gsdFolder, 'lib')
  ];
  
  for (const dir of legacyDirs) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  
  manifest.files = manifest.files.filter(mf => {
    const target = mf.target || '';
    return !target.startsWith('.gsd-canva/bin/') && !target.startsWith('.gsd-canva/lib/');
  });
  
  manifest.frameworkVersion = options.frameworkVersion || manifest.frameworkVersion;
  manifest.installedAt = new Date().toISOString();
  writeAtomicSync(manifestPath, JSON.stringify(manifest, null, 2));
  
  return {
    upgraded: true,
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
    if (options.agent.toLowerCase() !== 'antigravity') {
      const error = new Error(`El agente solicitado '${options.agent}' no tiene integración estructurada soportada.`);
      error.code = 'GSDC_AGENT_UNSUPPORTED';
      error.exitCode = 17;
      throw error;
    }

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
    agentDetails.legacyCommands = true;

    const skillsDir = path.join(targetDir, '.agents/skills');
    agentDetails.skillsDir = fs.existsSync(skillsDir);

    const expectedCapabilities = agentAdapters.loadAllCapabilities();
    const expectedSkillIds = expectedCapabilities.map(c => c.capability.id);

    let validSkills = 0;
    const missingSkills = [];
    const extraSkills = [];

    if (agentDetails.skillsDir) {
      const existingDirs = fs.readdirSync(skillsDir).filter(d => {
        return fs.statSync(path.join(skillsDir, d)).isDirectory();
      });

      for (const skillId of expectedSkillIds) {
        const skillFile = path.join(skillsDir, skillId, 'SKILL.md');
        if (fs.existsSync(skillFile)) {
          const content = fs.readFileSync(skillFile, 'utf8');
          if (content.trim().length > 0 && content.includes('---')) {
            validSkills++;
          } else {
            missingSkills.push(skillId);
          }
        } else {
          missingSkills.push(skillId);
        }
      }

      for (const dir of existingDirs) {
        if (!expectedSkillIds.includes(dir)) {
          extraSkills.push(dir);
        }
      }

      agentDetails.expectedSkills = expectedSkillIds.length;
      agentDetails.validSkills = validSkills;
    } else {
      missingSkills.push(...expectedSkillIds);
    }

    agentDetails.skillsCount = expectedSkillIds.length;
    agentDetails.missingSkills = missingSkills.length > 0 ? missingSkills : undefined;
    agentDetails.extraSkills = extraSkills.length > 0 ? extraSkills : undefined;
    agentDetails.allOfficialSkillsPresent = validSkills === expectedSkillIds.length;
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
