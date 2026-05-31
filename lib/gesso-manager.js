const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const lockManager = require('./lock-manager');

function getLienzosDir() { return path.join(process.cwd(), 'lienzos'); }
function getLockFile() { return path.join(process.cwd(), '.gsd-canva/.lock'); }

function sanitizeFolderName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function findLienzoDir(lienzoId) {
  const lienzosDir = getLienzosDir();
  if (!fs.existsSync(lienzosDir)) {
    const error = new Error(`No se encontró ningún lienzo registrado con el ID ${lienzoId}.`);
    error.code = 'GSDC_GESSO_NOT_FOUND';
    error.exitCode = 31;
    throw error;
  }
  const items = fs.readdirSync(lienzosDir);
  const matched = items.find(item => item.startsWith(`lienzo_${lienzoId}_`));
  if (!matched) {
    const error = new Error(`No se encontró ningún lienzo registrado con el ID ${lienzoId}.`);
    error.code = 'GSDC_GESSO_NOT_FOUND';
    error.exitCode = 31;
    throw error;
  }
  return path.join(lienzosDir, matched);
}

function writeAtomicJson(filePath, data) {
  const content = JSON.stringify(data, null, 2);
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

const VALID_METHODOLOGIES = [
  'socratic',
  'creative_brief',
  'jobs_to_be_done',
  'design_thinking',
  '5w1h'
];

const VALID_LANGUAGES = ['es', 'en', 'it'];
const VALID_ROLES = ['user', 'assistant', 'system'];

const WORKING_NOTE_FIELDS = [
  'idea',
  'audience',
  'tone',
  'layout',
  'context',
  'constraints',
  'mandatoryElements',
  'discardedDirections'
];

const REQUIRED_GEsso_SECTIONS = [
  'Nombre del lienzo',
  'Metodologia usada',
  'Resumen narrativo',
  'Intencion visual y tonal',
  'Audiencia y contexto de uso',
  'Mensaje central',
  'Estructura de layout propuesta',
  'Elementos obligatorios',
  'Riesgos o restricciones',
  'Exploraciones descartadas',
  'Recomendaciones para Abbozzo'
];

const GEsso_MD_TEMPLATE = `# Gesso / Lienzo en Blanco

## Nombre del lienzo
{{name}}

## Metodología usada
{{methodology}}

## Resumen narrativo
(Por definir durante la conversación)

## Intención visual y tonal
(Por definir durante la conversación)

## Audiencia y contexto de uso
(Por definir durante la conversación)

## Mensaje central
(Por definir durante la conversación)

## Estructura de layout propuesta
(Por definir durante la conversación)

## Elementos obligatorios
(Por definir durante la conversación)

## Riesgos o restricciones
(Por definir durante la conversación)

## Exploraciones descartadas
(Por definir durante la conversación)

## Recomendaciones para Abbozzo
(Por definir durante la conversación)

---
*Este documento es un placeholder. No está aprobado ni completo.*
`;

function assertEditable(lienzoData) {
  if (lienzoData.status !== 'en_blanco') {
    const error = new Error(`El lienzo no es editable porque su estado es '${lienzoData.status}'. Solo se permite editar en 'en_blanco'.`);
    error.code = 'GSDC_GESSO_INVALID_STATE';
    error.exitCode = 32;
    throw error;
  }
}

function normalizeHeading(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function validateGessoSections(content) {
  const foundHeadings = new Set();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^#{1,6}\s+(.+)$/);
    if (match) {
      foundHeadings.add(normalizeHeading(match[1]));
    }
  }

  const missing = [];
  for (const section of REQUIRED_GEsso_SECTIONS) {
    if (!foundHeadings.has(normalizeHeading(section))) {
      missing.push(section);
    }
  }

  return { valid: missing.length === 0, missing };
}

function isPlaceholderGesso(content) {
  return /\{\{[^}]+\}\}/.test(content);
}

function hasPlaceholderContent(content) {
  return content.includes('(Por definir durante la conversación)') ||
         content.includes('Este documento es un placeholder');
}

function hashGessoV1(content) {
  const normalized = content
    .normalize('NFC')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trimEnd();
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

async function create(options = {}) {
  const name = options.name;
  if (!name) {
    const error = new Error('El parámetro --name es obligatorio para crear un lienzo.');
    error.code = 'GSDC_INVALID_FIELD';
    error.exitCode = 22;
    throw error;
  }

  const methodology = options.methodology;
  if (!methodology) {
    const error = new Error('El parámetro --methodology es obligatorio para crear un lienzo.');
    error.code = 'GSDC_INVALID_FIELD';
    error.exitCode = 22;
    throw error;
  }
  if (!VALID_METHODOLOGIES.includes(methodology)) {
    const error = new Error(`Metodología '${methodology}' no es válida. Valores permitidos: [${VALID_METHODOLOGIES.join(', ')}]`);
    error.code = 'GSDC_INVALID_FIELD';
    error.exitCode = 22;
    throw error;
  }

  const language = options.language;
  if (!language) {
    const error = new Error('El parámetro --language es obligatorio para crear un lienzo.');
    error.code = 'GSDC_INVALID_FIELD';
    error.exitCode = 22;
    throw error;
  }
  if (!VALID_LANGUAGES.includes(language)) {
    const error = new Error(`Idioma '${language}' no es válido. Valores permitidos: [${VALID_LANGUAGES.join(', ')}]`);
    error.code = 'GSDC_INVALID_FIELD';
    error.exitCode = 22;
    throw error;
  }

  const lienzosDir = getLienzosDir();
  const lockFile = getLockFile();

  fs.mkdirSync(lienzosDir, { recursive: true });
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });

  await lockManager.acquire(lockFile);

  try {
    const items = fs.readdirSync(lienzosDir);
    let maxId = 0;

    items.forEach(item => {
      const match = item.match(/^lienzo_(\d{3})_/);
      if (match) {
        const id = parseInt(match[1], 10);
        if (id > maxId) maxId = id;
      }
    });

    const nextIdVal = maxId + 1;
    if (nextIdVal > 999) {
      const error = new Error('Se ha alcanzado el límite máximo de 999 lienzos.');
      error.code = 'GSDC_GESSO_INVALID_STATE';
      error.exitCode = 32;
      throw error;
    }
    const lienzoId = String(nextIdVal).padStart(3, '0');
    const slug = sanitizeFolderName(name);
    const folderName = `lienzo_${lienzoId}_${slug}`;
    const lienzoDir = path.join(lienzosDir, folderName);

    fs.mkdirSync(lienzoDir, { recursive: true });

    const nowStr = new Date().toISOString();

    const lienzoJsonPath = path.join(lienzoDir, 'lienzo.json');
    const lienzoData = {
      id: lienzoId,
      name: name,
      slug: slug,
      phase: 'gesso',
      status: 'en_blanco',
      methodology: methodology,
      language: language,
      linkedPlanId: null,
      timestamps: {
        created: nowStr,
        updated: nowStr,
        approved: null
      },
      confirmation: {
        confirmed: false,
        confirmedAt: null,
        confirmedBy: null,
        source: 'chat',
        hashAlgorithm: 'sha256-gesso-v1',
        gessoHash: ''
      },
      history: [
        {
          timestamp: nowStr,
          action: 'created',
          details: 'Lienzo inicializado'
        }
      ]
    };
    writeAtomicJson(lienzoJsonPath, lienzoData);

    const sesionJsonPath = path.join(lienzoDir, 'sesion.json');
    const sesionData = {
      lienzoId: lienzoId,
      methodology: methodology,
      language: language,
      turns: [],
      workingNotes: {
        idea: '',
        audience: '',
        tone: '',
        layout: '',
        context: '',
        constraints: '',
        mandatoryElements: '',
        discardedDirections: ''
      }
    };
    writeAtomicJson(sesionJsonPath, sesionData);

    const gessoMdPath = path.join(lienzoDir, 'gesso.md');
    const gessoMdContent = GEsso_MD_TEMPLATE
      .replace('{{name}}', name)
      .replace('{{methodology}}', methodology);
    fs.writeFileSync(gessoMdPath, gessoMdContent, 'utf8');

    return {
      lienzoId,
      lienzoDir: path.relative(process.cwd(), lienzoDir),
      lienzo: lienzoData
    };
  } finally {
    lockManager.release(lockFile);
  }
}

async function status(lienzoId) {
  const lienzoDir = findLienzoDir(lienzoId);
  const lienzoJsonPath = path.join(lienzoDir, 'lienzo.json');

  if (!fs.existsSync(lienzoJsonPath)) {
    const error = new Error(`El archivo lienzo.json no existe en ${lienzoDir}.`);
    error.code = 'GSDC_GESSO_NOT_FOUND';
    error.exitCode = 31;
    throw error;
  }

  try {
    const lienzoData = JSON.parse(fs.readFileSync(lienzoJsonPath, 'utf8'));
    return {
      lienzoId,
      lienzoDir: path.relative(process.cwd(), lienzoDir),
      lienzo: lienzoData
    };
  } catch (e) {
    const error = new Error('El archivo lienzo.json está corrupto o es ilegible.');
    error.code = 'GSDC_JSON_PARSE_ERROR';
    error.exitCode = 15;
    throw error;
  }
}

async function list(options = {}) {
  const lienzosDir = getLienzosDir();
  if (!fs.existsSync(lienzosDir)) {
    return { lienzos: [] };
  }

  const folders = fs.readdirSync(lienzosDir);
  const lienzos = [];

  for (const folder of folders) {
    if (folder.startsWith('lienzo_')) {
      const lienzoJsonPath = path.join(lienzosDir, folder, 'lienzo.json');
      if (fs.existsSync(lienzoJsonPath)) {
        try {
          const lienzoData = JSON.parse(fs.readFileSync(lienzoJsonPath, 'utf8'));
          lienzos.push({
            id: lienzoData.id,
            name: lienzoData.name,
            phase: lienzoData.phase,
            status: lienzoData.status,
            methodology: lienzoData.methodology,
            language: lienzoData.language
          });
        } catch (e) {
          // Ignorar lienzos corruptos en la lista
        }
      }
    }
  }

  lienzos.sort((a, b) => a.id.localeCompare(b.id));
  return { lienzos };
}

async function appendTurn(lienzoId, role, content, tags = []) {
  if (!VALID_ROLES.includes(role)) {
    const error = new Error(`Rol '${role}' no es válido. Roles permitidos: [${VALID_ROLES.join(', ')}]`);
    error.code = 'GSDC_INVALID_FIELD';
    error.exitCode = 22;
    throw error;
  }

  const lockFile = getLockFile();
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  await lockManager.acquire(lockFile);

  try {
    const lienzoDir = findLienzoDir(lienzoId);
    const lienzoJsonPath = path.join(lienzoDir, 'lienzo.json');
    const sesionJsonPath = path.join(lienzoDir, 'sesion.json');

    if (!fs.existsSync(lienzoJsonPath) || !fs.existsSync(sesionJsonPath)) {
      const error = new Error(`El lienzo con ID ${lienzoId} no está correctamente inicializado.`);
      error.code = 'GSDC_GESSO_NOT_FOUND';
      error.exitCode = 31;
      throw error;
    }

    const lienzoData = JSON.parse(fs.readFileSync(lienzoJsonPath, 'utf8'));
    assertEditable(lienzoData);

    const sesionData = JSON.parse(fs.readFileSync(sesionJsonPath, 'utf8'));
    const nowStr = new Date().toISOString();

    sesionData.turns.push({
      timestamp: nowStr,
      role,
      content: String(content || ''),
      tags: Array.isArray(tags) ? tags : [String(tags)]
    });
    writeAtomicJson(sesionJsonPath, sesionData);

    lienzoData.timestamps.updated = nowStr;
    lienzoData.history.push({
      timestamp: nowStr,
      action: 'append-turn',
      details: `Turno agregado con rol '${role}'`
    });
    writeAtomicJson(lienzoJsonPath, lienzoData);

    return {
      lienzoId,
      turn: sesionData.turns[sesionData.turns.length - 1],
      turnCount: sesionData.turns.length,
      lienzo: lienzoData
    };
  } finally {
    lockManager.release(lockFile);
  }
}

async function updateNotes(lienzoId, field, value) {
  if (!WORKING_NOTE_FIELDS.includes(field)) {
    const error = new Error(`Campo de notas '${field}' no es válido. Campos permitidos: [${WORKING_NOTE_FIELDS.join(', ')}]`);
    error.code = 'GSDC_INVALID_FIELD';
    error.exitCode = 22;
    throw error;
  }

  const lockFile = getLockFile();
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  await lockManager.acquire(lockFile);

  try {
    const lienzoDir = findLienzoDir(lienzoId);
    const lienzoJsonPath = path.join(lienzoDir, 'lienzo.json');
    const sesionJsonPath = path.join(lienzoDir, 'sesion.json');

    if (!fs.existsSync(lienzoJsonPath) || !fs.existsSync(sesionJsonPath)) {
      const error = new Error(`El lienzo con ID ${lienzoId} no está correctamente inicializado.`);
      error.code = 'GSDC_GESSO_NOT_FOUND';
      error.exitCode = 31;
      throw error;
    }

    const lienzoData = JSON.parse(fs.readFileSync(lienzoJsonPath, 'utf8'));
    assertEditable(lienzoData);

    const sesionData = JSON.parse(fs.readFileSync(sesionJsonPath, 'utf8'));
    const nowStr = new Date().toISOString();

    sesionData.workingNotes[field] = String(value || '');
    writeAtomicJson(sesionJsonPath, sesionData);

    lienzoData.timestamps.updated = nowStr;
    lienzoData.history.push({
      timestamp: nowStr,
      action: 'update-notes',
      details: `Nota '${field}' actualizada`
    });
    writeAtomicJson(lienzoJsonPath, lienzoData);

    return {
      lienzoId,
      field,
      value: sesionData.workingNotes[field],
      lienzo: lienzoData
    };
  } finally {
    lockManager.release(lockFile);
  }
}

async function write(lienzoId, sourceFilePath) {
  if (!fs.existsSync(sourceFilePath)) {
    const error = new Error(`El archivo fuente no existe: ${sourceFilePath}`);
    error.code = 'GSDC_GESSO_ARTIFACT_MISSING';
    error.exitCode = 33;
    throw error;
  }

  const sourceContent = fs.readFileSync(sourceFilePath, 'utf8');
  if (!sourceContent || sourceContent.trim().length === 0) {
    const error = new Error(`El archivo fuente está vacío: ${sourceFilePath}`);
    error.code = 'GSDC_GESSO_ARTIFACT_MISSING';
    error.exitCode = 33;
    throw error;
  }

  const sectionValidation = validateGessoSections(sourceContent);
  if (!sectionValidation.valid) {
    const error = new Error(`El gesso.md no contiene las secciones requeridas: ${sectionValidation.missing.join(', ')}`);
    error.code = 'GSDC_GESSO_INVALID_ARTIFACT';
    error.exitCode = 34;
    throw error;
  }

  const lockFile = getLockFile();
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  await lockManager.acquire(lockFile);

  try {
    const lienzoDir = findLienzoDir(lienzoId);
    const lienzoJsonPath = path.join(lienzoDir, 'lienzo.json');

    if (!fs.existsSync(lienzoJsonPath)) {
      const error = new Error(`El lienzo con ID ${lienzoId} no está correctamente inicializado.`);
      error.code = 'GSDC_GESSO_NOT_FOUND';
      error.exitCode = 31;
      throw error;
    }

    const lienzoData = JSON.parse(fs.readFileSync(lienzoJsonPath, 'utf8'));
    assertEditable(lienzoData);

    const gessoMdPath = path.join(lienzoDir, 'gesso.md');
    fs.writeFileSync(gessoMdPath, sourceContent, 'utf8');

    const nowStr = new Date().toISOString();
    lienzoData.timestamps.updated = nowStr;
    lienzoData.history.push({
      timestamp: nowStr,
      action: 'write',
      details: `gesso.md escrito desde ${path.basename(sourceFilePath)}`
    });
    writeAtomicJson(lienzoJsonPath, lienzoData);

    return {
      lienzoId,
      gessoMdPath: path.relative(process.cwd(), gessoMdPath),
      lienzo: lienzoData
    };
  } finally {
    lockManager.release(lockFile);
  }
}

async function confirm(lienzoId, options = {}) {
  const lienzoDir = findLienzoDir(lienzoId);
  const lienzoJsonPath = path.join(lienzoDir, 'lienzo.json');
  const gessoMdPath = path.join(lienzoDir, 'gesso.md');

  if (!fs.existsSync(lienzoJsonPath)) {
    const error = new Error(`El lienzo con ID ${lienzoId} no está correctamente inicializado.`);
    error.code = 'GSDC_GESSO_NOT_FOUND';
    error.exitCode = 31;
    throw error;
  }

  if (!fs.existsSync(gessoMdPath)) {
    const error = new Error(`El archivo gesso.md no existe para el lienzo ${lienzoId}.`);
    error.code = 'GSDC_GESSO_ARTIFACT_MISSING';
    error.exitCode = 33;
    throw error;
  }

  const lockFile = getLockFile();
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  await lockManager.acquire(lockFile);

  try {
    const gessoContent = fs.readFileSync(gessoMdPath, 'utf8');
    if (!gessoContent || gessoContent.trim().length === 0) {
      const error = new Error(`El archivo gesso.md está vacío para el lienzo ${lienzoId}.`);
      error.code = 'GSDC_GESSO_ARTIFACT_MISSING';
      error.exitCode = 33;
      throw error;
    }

    if (isPlaceholderGesso(gessoContent)) {
      const error = new Error(`El gesso.md contiene placeholders sin resolver. Use 'gesso write' antes de confirmar.`);
      error.code = 'GSDC_GESSO_INVALID_ARTIFACT';
      error.exitCode = 34;
      throw error;
    }

    if (hasPlaceholderContent(gessoContent)) {
      const error = new Error(`El gesso.md contiene texto placeholder. Use 'gesso write' con contenido real antes de confirmar.`);
      error.code = 'GSDC_GESSO_INVALID_ARTIFACT';
      error.exitCode = 34;
      throw error;
    }

    const sectionValidation = validateGessoSections(gessoContent);
    if (!sectionValidation.valid) {
      const error = new Error(`El gesso.md no contiene las secciones requeridas: ${sectionValidation.missing.join(', ')}`);
      error.code = 'GSDC_GESSO_INVALID_ARTIFACT';
      error.exitCode = 34;
      throw error;
    }

    const lienzoData = JSON.parse(fs.readFileSync(lienzoJsonPath, 'utf8'));
    assertEditable(lienzoData);

    const nowStr = new Date().toISOString();
    const hash = hashGessoV1(gessoContent);

    lienzoData.status = 'gesso_listo';
    lienzoData.timestamps.updated = nowStr;
    lienzoData.timestamps.approved = nowStr;
    lienzoData.confirmation = {
      confirmed: true,
      confirmedAt: nowStr,
      confirmedBy: options.by || 'user',
      source: 'chat',
      hashAlgorithm: 'sha256-gesso-v1',
      gessoHash: hash
    };
    lienzoData.history.push({
      timestamp: nowStr,
      action: 'confirm',
      details: `Gesso confirmado por ${options.by || 'user'}`
    });

    writeAtomicJson(lienzoJsonPath, lienzoData);

    return {
      lienzoId,
      confirmed: true,
      confirmedAt: nowStr,
      confirmedBy: options.by || 'user',
      gessoHash: hash,
      lienzo: lienzoData
    };
  } finally {
    lockManager.release(lockFile);
  }
}

async function verify(lienzoId) {
  const lienzoDir = findLienzoDir(lienzoId);
  const lienzoJsonPath = path.join(lienzoDir, 'lienzo.json');
  const gessoMdPath = path.join(lienzoDir, 'gesso.md');

  if (!fs.existsSync(lienzoJsonPath)) {
    const error = new Error(`El lienzo con ID ${lienzoId} no está correctamente inicializado.`);
    error.code = 'GSDC_GESSO_NOT_FOUND';
    error.exitCode = 31;
    throw error;
  }

  if (!fs.existsSync(gessoMdPath)) {
    const error = new Error(`El archivo gesso.md no existe para el lienzo ${lienzoId}.`);
    error.code = 'GSDC_GESSO_ARTIFACT_MISSING';
    error.exitCode = 33;
    throw error;
  }

  const lockFile = getLockFile();
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  await lockManager.acquire(lockFile);

  try {
    const lienzoData = JSON.parse(fs.readFileSync(lienzoJsonPath, 'utf8'));

    if (!lienzoData.confirmation || !lienzoData.confirmation.confirmed) {
      const error = new Error(`El lienzo ${lienzoId} no ha sido confirmado aún.`);
      error.code = 'GSDC_GESSO_INVALID_STATE';
      error.exitCode = 32;
      throw error;
    }

    const gessoContent = fs.readFileSync(gessoMdPath, 'utf8');
    const currentHash = hashGessoV1(gessoContent);

    if (currentHash !== lienzoData.confirmation.gessoHash) {
      const error = new Error(`El gesso.md ha sido modificado después de la confirmación.`);
      error.code = 'GSDC_GESSO_CHANGED_AFTER_CONFIRMATION';
      error.exitCode = 35;
      throw error;
    }

    return {
      lienzoId,
      verified: true,
      gessoHash: currentHash,
      hashAlgorithm: 'sha256-gesso-v1',
      lienzo: lienzoData
    };
  } finally {
    lockManager.release(lockFile);
  }
}

module.exports = {
  VALID_METHODOLOGIES,
  VALID_LANGUAGES,
  VALID_ROLES,
  WORKING_NOTE_FIELDS,
  REQUIRED_GEsso_SECTIONS,
  create,
  status,
  list,
  appendTurn,
  updateNotes,
  write,
  confirm,
  verify
};
