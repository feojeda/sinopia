const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
  const frameworkBinDir = path.resolve(__dirname, '../bin');
  const frameworkLibDir = path.resolve(__dirname, '../lib');
  
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
  
  // Copiar también el binario y la librería al destino local para que sea autoportante
  copyRecursiveSync(frameworkBinDir, path.join(gsdFolder, 'bin'), filesToCopy);
  copyRecursiveSync(frameworkLibDir, path.join(gsdFolder, 'lib'), filesToCopy);
  
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
  fs.mkdirSync(path.join(gsdFolder, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(gsdFolder, 'lib'), { recursive: true });
  fs.mkdirSync(antiCommandsDir, { recursive: true });
  fs.mkdirSync(path.join(targetDir, 'canva-plans'), { recursive: true });
  
  const manifestFilesList = [];
  
  // 3. Escribir/Copiar archivos físicos del framework y registrar hashes
  for (const f of filesToCopy) {
    // Si es adopt y existe, no sobrescribimos, solo adoptamos el hash actual si la ruta es conocida
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
  
  // 7. Escribir manifest.json final
  const manifestData = {
    schemaVersion: 1,
    frameworkVersion: options.frameworkVersion || '1.0.0',
    installedAt: new Date().toISOString(),
    files: manifestFilesList
  };
  writeAtomicSync(manifestPath, JSON.stringify(manifestData, null, 2));
  
  return {
    initialized: true,
    schemaVersion: 1,
    filesCount: manifestFilesList.length
  };
}

/**
 * Actualiza los comandos y plantillas con copias de seguridad fechadas en caso de colisión
 */
async function upgrade(options = {}) {
  const targetDir = process.cwd();
  const frameworkTemplatesDir = path.resolve(__dirname, '../templates');
  const frameworkBinDir = path.resolve(__dirname, '../bin');
  const frameworkLibDir = path.resolve(__dirname, '../lib');
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
  copyRecursiveSync(frameworkBinDir, path.join(gsdFolder, 'bin'), filesToCopy);
  copyRecursiveSync(frameworkLibDir, path.join(gsdFolder, 'lib'), filesToCopy);
  
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
  if (options.agent) {
    if (options.agent.toLowerCase() !== 'antigravity') {
      const error = new Error(`El agente solicitado '${options.agent}' no tiene integración estructurada soportada.`);
      error.code = 'GSDC_AGENT_UNSUPPORTED';
      error.exitCode = 17;
      throw error;
    }
    
    const antiCommandsDir = path.join(targetDir, '.antigravity/commands');
    try {
      // 1. Verificar lectura y escritura del directorio
      fs.mkdirSync(antiCommandsDir, { recursive: true });
      fs.accessSync(antiCommandsDir, fs.constants.R_OK | fs.constants.W_OK);
      
      // 2. Prueba de escritura temporal (preflight transitorio)
      const tempTestFile = path.join(antiCommandsDir, '.gsd-test-temp.md');
      fs.writeFileSync(tempTestFile, '### TEST MOCK COMMAND', 'utf8');
      fs.unlinkSync(tempTestFile);
    } catch (e) {
      const error = new Error('No se pudo validar la ruta, los permisos o la estructura de prompts de Antigravity IDE.');
      error.code = 'GSDC_AGENT_DISCOVERY_FAILED';
      error.exitCode = 18;
      throw error;
    }
  }
  
  return {
    healthy: true,
    agentValidated: !!options.agent
  };
}

module.exports = {
  init,
  upgrade,
  doctor
};
