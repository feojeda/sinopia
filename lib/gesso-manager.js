const fs = require('fs');
const path = require('path');
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

const GEsso_MD_TEMPLATE = `# Gesso / Lienzo en Blanco

## Nombre del lienzo
{{name}}

## Metodología usada
{{methodology}}

## Resumen narrativo de la idea
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

module.exports = {
  VALID_METHODOLOGIES,
  VALID_LANGUAGES,
  VALID_ROLES,
  WORKING_NOTE_FIELDS,
  create,
  status,
  list,
  appendTurn,
  updateNotes
};
