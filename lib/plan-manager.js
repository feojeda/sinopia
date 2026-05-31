const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const lockManager = require('./lock-manager');

// Helpers para evaluar rutas de forma dinámica en tiempo de ejecución
function getPlansDir() { return path.join(process.cwd(), 'canva-plans'); }
function getLockFile() { return path.join(process.cwd(), '.gsd-canva/.lock'); }
function getPlanTemplatesDir() { return path.join(process.cwd(), '.gsd-canva/plan-templates'); }

// Helper para sanitizar el nombre del plan en rutas
function sanitizeFolderName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Helper para buscar la carpeta de un plan por su ID secuencial
function findPlanDir(planId) {
  const plansDir = getPlansDir();
  if (!fs.existsSync(plansDir)) {
    fs.mkdirSync(plansDir, { recursive: true });
  }
  const items = fs.readdirSync(plansDir);
  const matched = items.find(item => item.startsWith(`plan_${planId}_`));
  if (!matched) {
    const error = new Error(`No se encontró ningún plan registrado con el ID ${planId}.`);
    error.code = 'GSDC_JSON_PARSE_ERROR';
    error.exitCode = 15;
    throw error;
  }
  return path.join(plansDir, matched);
}

// Helper para escrituras atómicas
function writeAtomicJson(filePath, data) {
  const content = JSON.stringify(data, null, 2);
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

const FIELD_REGISTRY = [
  {
    id: 'vertical',
    question: '¿Qué tipo de diseño quieres crear?',
    type: 'choice',
    required: true,
    allowCustom: true,
    options: [
      { label: 'SaaS / Producto Digital', value: 'SaaS / Producto Digital' },
      { label: 'E-Commerce / Retail', value: 'E-Commerce / Retail' },
      { label: 'Evento / Workshop', value: 'Evento / Workshop' },
      { label: 'Restaurante / Alimentos', value: 'Restaurante / Alimentos' },
      { label: 'Educación / Curso', value: 'Educación / Curso' },
      { label: 'Salud / Bienestar', value: 'Salud / Bienestar' },
      { label: 'Inmobiliaria', value: 'Inmobiliaria' },
      { label: 'Personal Brand / Portafolio', value: 'Personal Brand / Portafolio' }
    ]
  },
  {
    id: 'formato',
    question: '¿Qué formato y dimensiones necesitas?',
    type: 'choice',
    required: true,
    allowCustom: true,
    options: [
      { label: 'Instagram Post (1080x1080)', value: 'Instagram Post (1080x1080)' },
      { label: 'Instagram Story (1080x1920)', value: 'Instagram Story (1080x1920)' },
      { label: 'Facebook Post (1200x630)', value: 'Facebook Post (1200x630)' },
      { label: 'LinkedIn Banner (1584x396)', value: 'LinkedIn Banner (1584x396)' },
      { label: 'YouTube Thumbnail (1280x720)', value: 'YouTube Thumbnail (1280x720)' },
      { label: 'A4 Flyer (2480x3508)', value: 'A4 Flyer (2480x3508)' },
      { label: 'Pinterest Pin (1000x1500)', value: 'Pinterest Pin (1000x1500)' }
    ]
  },
  {
    id: 'audiencia',
    question: '¿A qué público objetivo nos dirigimos?',
    type: 'text',
    required: true,
    placeholder: 'Ej: Desarrolladores jóvenes, Mujeres 25-40, Profesionales creativos...'
  },
  {
    id: 'paleta',
    question: '¿Qué colores o paleta cromática prefieres?',
    type: 'text',
    required: true,
    placeholder: 'Ej: Azul corporativo + blanco, Tonos tierra, Neón oscuro...'
  },
  {
    id: 'copy',
    question: '¿Cuál será el texto principal o eslogan?',
    type: 'text',
    required: true,
    placeholder: "Ej: '50% de descuento', 'Lanzamiento oficial 2026'..."
  },
  {
    id: 'cta',
    question: '¿Qué texto llevará el botón de acción?',
    type: 'choice',
    required: true,
    allowCustom: true,
    options: [
      { label: 'Comprar Ahora', value: 'Comprar Ahora' },
      { label: 'Registrarse Gratis', value: 'Registrarse Gratis' },
      { label: 'Saber Más', value: 'Saber Más' },
      { label: 'Reservar Cupo', value: 'Reservar Cupo' },
      { label: 'Descargar', value: 'Descargar' },
      { label: 'Ver Colección', value: 'Ver Colección' }
    ]
  },
  {
    id: 'assets',
    question: '¿Hay tipografías específicas, logos o recursos visuales externos?',
    type: 'text',
    required: false,
    placeholder: 'Ej: Logo en PNG, fuente Montserrat, imagen de fondo...'
  }
];

const REQUIRED_FIELDS = FIELD_REGISTRY.filter(f => f.required).map(f => f.id);
const OPTIONAL_FIELDS = FIELD_REGISTRY.filter(f => !f.required).map(f => f.id);
const ALL_FIELDS = FIELD_REGISTRY.map(f => f.id);

const NORMALIZE = (v) => String(v || '').trim().normalize('NFC');

function computeDecisionsHash(decisions, hashAlgorithm) {
  const fields = hashAlgorithm === 'sha256-decisions-v1'
    ? ['vertical', 'audiencia', 'formato', 'paleta', 'copy', 'cta']
    : ['vertical', 'audiencia', 'formato', 'paleta', 'copy', 'cta', 'assets'];
  const payload = JSON.stringify(Object.fromEntries(fields.map(f => [f, NORMALIZE(decisions[f])])));
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function ensureQuestionFields(decisions) {
  if (!decisions.assets && decisions.assets !== '') {
    decisions.assets = '';
  }
  if (!decisions.optionalAnswered) {
    decisions.optionalAnswered = {};
  }
  if (!decisions.confirmation) {
    decisions.confirmation = {
      confirmed: false,
      confirmedAt: null,
      confirmedBy: null,
      source: 'chat',
      decisionsHash: '',
      hashAlgorithm: 'sha256-decisions-v2'
    };
  }
  if (!decisions.confirmation.hashAlgorithm) {
    decisions.confirmation.hashAlgorithm = decisions.confirmation.decisionsHash
      ? 'sha256-decisions-v1'
      : 'sha256-decisions-v2';
  }
  return decisions;
}

/**
 * Crea un nuevo plan secuencial bajo lock
 */
async function create(options = {}) {
  const name = options.name;
  if (!name) {
    const error = new Error('El parámetro --name es obligatorio para crear un plan.');
    error.code = 'GSDC_JSON_PARSE_ERROR';
    error.exitCode = 15;
    throw error;
  }
  
  const plansDir = getPlansDir();
  const lockFile = getLockFile();
  const templatesDir = getPlanTemplatesDir();
  
  // 1. Asegurar directorio de planes y .gsd-canva
  fs.mkdirSync(plansDir, { recursive: true });
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  
  // 2. Adquirir lock para evitar condiciones de carrera
  await lockManager.acquire(lockFile);
  
  try {
    // 3. Determinar el siguiente ID secuencial de tres dígitos (001, 002...)
    const items = fs.readdirSync(plansDir);
    let maxId = 0;
    
    items.forEach(item => {
      const match = item.match(/^plan_(\d{3})_/);
      if (match) {
        const id = parseInt(match[1], 10);
        if (id > maxId) maxId = id;
      }
    });
    
    const nextIdVal = maxId + 1;
    const planId = String(nextIdVal).padStart(3, '0');
    
    const folderName = `plan_${planId}_${sanitizeFolderName(name)}`;
    const planDir = path.join(plansDir, folderName);
    
    // 4. Crear carpeta física del plan
    fs.mkdirSync(planDir, { recursive: true });
    
    // 5. Copiar plantillas de planificación locales a la nueva carpeta
    if (fs.existsSync(templatesDir)) {
      fs.readdirSync(templatesDir).forEach(file => {
        const src = path.join(templatesDir, file);
        const dest = path.join(planDir, file);
        fs.copyFileSync(src, dest);
      });
    }
    
    // 6. Inicializar decisiones.json por defecto
    const decisionsPath = path.join(planDir, 'decisions.json');
    const decisionsData = {
      vertical: "",
      audiencia: "",
      formato: "",
      paleta: "",
      copy: "",
      cta: "",
      assets: "",
      optionalAnswered: {},
      confirmation: {
        confirmed: false,
        confirmedAt: null,
        confirmedBy: null,
        source: "chat",
        hashAlgorithm: "sha256-decisions-v2",
        decisionsHash: ""
      }
    };
    writeAtomicJson(decisionsPath, decisionsData);
    
    // 7. Inicializar plan.json (máquina de estados)
    const planJsonPath = path.join(planDir, 'plan.json');
    const nowStr = new Date().toISOString();
    const planData = {
      id: planId,
      name: name,
      phase: 'mockup',
      status: 'questions_pending',
      canvaDesignId: '',
      timestamps: {
        created: nowStr,
        updated: nowStr
      },
      history: [
        {
          timestamp: nowStr,
          action: 'created',
          details: 'Plan secuencial inicializado'
        }
      ]
    };
    
    writeAtomicJson(planJsonPath, planData);
    
    return {
      planId,
      planDir: path.relative(process.cwd(), planDir),
      plan: planData
    };
  } finally {
    // Liberar lock siempre
    lockManager.release(lockFile);
  }
}

/**
 * Registra la confirmación y congela las decisiones mediante hash de integridad
 */
async function confirmDecisions(planId, options = {}) {
  const lockFile = getLockFile();
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  await lockManager.acquire(lockFile);
  
  try {
    const planDir = findPlanDir(planId);
    const planJsonPath = path.join(planDir, 'plan.json');
    const decisionsPath = path.join(planDir, 'decisions.json');
    
    if (!fs.existsSync(planJsonPath) || !fs.existsSync(decisionsPath)) {
      const error = new Error(`El plan con ID ${planId} no está correctamente inicializado.`);
      error.code = 'GSDC_JSON_PARSE_ERROR';
      error.exitCode = 15;
      throw error;
    }
    
    const planData = JSON.parse(fs.readFileSync(planJsonPath, 'utf8'));
    if (planData.phase !== 'mockup' || planData.status !== 'questions_pending') {
      const error = new Error(`Transición ilegal: Solo se pueden confirmar decisiones cuando el plan está en mockup:questions_pending. Estado actual: ${planData.phase}:${planData.status}`);
      error.code = 'GSDC_INVALID_STATE';
      error.exitCode = 13;
      throw error;
    }
    
    const decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'));
    ensureQuestionFields(decisions);
    
    // Validar campos y placeholders
    const placeholders = ['TODO', 'TBD', 'N/A', 'PENDIENTE', 'POR DEFINIR'];
    const fields = REQUIRED_FIELDS;
    const missing = [];
    
    fields.forEach(field => {
      const val = String(decisions[field] || '').trim();
      const isPlaceholder = placeholders.some(p => val.toUpperCase().includes(p)) || (val.startsWith('[') && val.endsWith(']'));
      if (!val || isPlaceholder) {
        missing.push(field);
      }
    });
    
    if (missing.length > 0) {
      const error = new Error(`Faltan campos obligatorios o hay placeholders por resolver en decisions.json: [${missing.join(', ')}]`);
      error.code = 'GSDC_QUESTIONS_UNRESOLVED';
      error.exitCode = 19;
      error.details = { missingFields: missing };
      throw error;
    }
    
    const hash = computeDecisionsHash(decisions, 'sha256-decisions-v2');
    
    decisions.confirmation = {
      confirmed: true,
      confirmedAt: new Date().toISOString(),
      confirmedBy: options.by || "user",
      source: "chat",
      hashAlgorithm: "sha256-decisions-v2",
      decisionsHash: hash
    };
    
    writeAtomicJson(decisionsPath, decisions);
    
    return {
      planId,
      confirmed: true,
      decisionsHash: hash
    };
  } finally {
    lockManager.release(lockFile);
  }
}

/**
 * Valida decisiones y protocolo de firma, moviendo el plan a ready_for_html
 */
async function resolveQuestions(planId) {
  const lockFile = getLockFile();
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  await lockManager.acquire(lockFile);
  
  try {
    const planDir = findPlanDir(planId);
    const planJsonPath = path.join(planDir, 'plan.json');
    const decisionsPath = path.join(planDir, 'decisions.json');
    
    if (!fs.existsSync(planJsonPath) || !fs.existsSync(decisionsPath)) {
      const error = new Error(`El plan con ID ${planId} no está correctamente inicializado.`);
      error.code = 'GSDC_JSON_PARSE_ERROR';
      error.exitCode = 15;
      throw error;
    }
    
    const planData = JSON.parse(fs.readFileSync(planJsonPath, 'utf8'));
    if (planData.phase !== 'mockup' || planData.status !== 'questions_pending') {
      const error = new Error(`Transición ilegal: Se esperaba mockup:questions_pending para resolver preguntas. Estado actual: ${planData.phase}:${planData.status}`);
      error.code = 'GSDC_INVALID_STATE';
      error.exitCode = 13;
      throw error;
    }
    
    const decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'));
    ensureQuestionFields(decisions);
    
    // 1. Validar que esté confirmado
    if (!decisions.confirmation || decisions.confirmation.confirmed !== true) {
      const error = new Error("No se ha registrado la confirmación del usuario para las decisiones actuales.");
      error.code = 'GSDC_QUESTIONS_UNRESOLVED';
      error.exitCode = 19;
      throw error;
    }
    
    // 2. Validar campos y placeholders
    const placeholders = ['TODO', 'TBD', 'N/A', 'PENDIENTE', 'POR DEFINIR'];
    const fields = REQUIRED_FIELDS;
    const missing = [];
    
    fields.forEach(field => {
      const val = String(decisions[field] || '').trim();
      const isPlaceholder = placeholders.some(p => val.toUpperCase().includes(p)) || (val.startsWith('[') && val.endsWith(']'));
      if (!val || isPlaceholder) {
        missing.push(field);
      }
    });
    
    if (missing.length > 0) {
      const error = new Error(`Faltan campos obligatorios o hay placeholders por resolver en decisions.json: [${missing.join(', ')}]`);
      error.code = 'GSDC_QUESTIONS_UNRESOLVED';
      error.exitCode = 19;
      error.details = { missingFields: missing };
      throw error;
    }
    
    // 3. Verificar el hash criptográfico de integridad
    if (decisions.confirmation.hashAlgorithm &&
        decisions.confirmation.hashAlgorithm.startsWith('sha256-decisions-') &&
        decisions.confirmation.hashAlgorithm !== 'sha256-decisions-v1' &&
        decisions.confirmation.hashAlgorithm !== 'sha256-decisions-v2') {
      const error = new Error(`Versión de hash desconocida: ${decisions.confirmation.hashAlgorithm}`);
      error.code = 'GSDC_INVALID_STATE';
      error.exitCode = 13;
      error.details = { reason: 'unknown_hash_version', hashAlgorithm: decisions.confirmation.hashAlgorithm };
      throw error;
    }

    const hash = computeDecisionsHash(decisions, decisions.confirmation.hashAlgorithm);
    
    if (hash !== decisions.confirmation.decisionsHash) {
      const error = new Error("Las decisiones de diseño fueron modificadas después de la confirmación explícita del usuario.");
      error.code = 'GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION';
      error.exitCode = 21;
      throw error;
    }
    
    // 4. Transicionar estado a ready_for_html
    const nowStr = new Date().toISOString();
    planData.status = 'ready_for_html';
    planData.timestamps.updated = nowStr;
    planData.history.push({
      timestamp: nowStr,
      action: 'resolve-questions',
      details: 'Preguntas resueltas y hash de integridad verificado. Avanzado a ready_for_html.'
    });
    
    writeAtomicJson(planJsonPath, planData);
    
    return {
      planId,
      planDir: path.relative(process.cwd(), planDir),
      plan: planData
    };
  } finally {
    lockManager.release(lockFile);
  }
}

/**
 * Valida la existencia de mockup.html y el hash criptográfico antes de mover a pending_approval
 */
async function submitMockup(planId) {
  const lockFile = getLockFile();
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  await lockManager.acquire(lockFile);
  
  try {
    const planDir = findPlanDir(planId);
    const planJsonPath = path.join(planDir, 'plan.json');
    const decisionsPath = path.join(planDir, 'decisions.json');
    
    if (!fs.existsSync(planJsonPath) || !fs.existsSync(decisionsPath)) {
      const error = new Error(`El plan con ID ${planId} no está correctamente inicializado.`);
      error.code = 'GSDC_JSON_PARSE_ERROR';
      error.exitCode = 15;
      throw error;
    }
    
    const planData = JSON.parse(fs.readFileSync(planJsonPath, 'utf8'));
    if (planData.phase !== 'mockup' || planData.status !== 'ready_for_html') {
      const error = new Error(`Transición ilegal: Se esperaba mockup:ready_for_html para enviar el mockup. Estado actual: ${planData.phase}:${planData.status}`);
      error.code = 'GSDC_INVALID_STATE';
      error.exitCode = 13;
      throw error;
    }
    
    const decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'));
    ensureQuestionFields(decisions);
    
    // 1. Recalcular y validar hash de integridad (para evitar modificaciones después de resolve-questions)
    if (decisions.confirmation.hashAlgorithm &&
        decisions.confirmation.hashAlgorithm.startsWith('sha256-decisions-') &&
        decisions.confirmation.hashAlgorithm !== 'sha256-decisions-v1' &&
        decisions.confirmation.hashAlgorithm !== 'sha256-decisions-v2') {
      const error = new Error(`Versión de hash desconocida: ${decisions.confirmation.hashAlgorithm}`);
      error.code = 'GSDC_INVALID_STATE';
      error.exitCode = 13;
      error.details = { reason: 'unknown_hash_version', hashAlgorithm: decisions.confirmation.hashAlgorithm };
      throw error;
    }

    const hash = computeDecisionsHash(decisions, decisions.confirmation.hashAlgorithm);
    
    if (hash !== decisions.confirmation.decisionsHash) {
      const error = new Error("Las decisiones de diseño fueron modificadas después de la confirmación explícita del usuario.");
      error.code = 'GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION';
      error.exitCode = 21;
      throw error;
    }
    
    // 2. Verificar existencia física y tamaño de mockup.html
    const mockupHtmlPath = path.join(planDir, 'mockup.html');
    if (!fs.existsSync(mockupHtmlPath) || fs.statSync(mockupHtmlPath).size === 0) {
      const error = new Error("Falta un artefacto requerido: mockup.html no existe o está vacío.");
      error.code = 'GSDC_ARTIFACT_MISSING';
      error.exitCode = 20;
      throw error;
    }
    
    // 3. Transicionar estado a pending_approval
    const nowStr = new Date().toISOString();
    planData.status = 'pending_approval';
    planData.timestamps.updated = nowStr;
    planData.history.push({
      timestamp: nowStr,
      action: 'submit-mockup',
      details: 'Mockup HTML verificado físicamente y hash de integridad validado. Avanzado a pending_approval.'
    });
    
    writeAtomicJson(planJsonPath, planData);
    
    return {
      planId,
      planDir: path.relative(process.cwd(), planDir),
      plan: planData
    };
  } finally {
    lockManager.release(lockFile);
  }
}

/**
 * Transiciona el estado de un plan validando reglas estrictas de la máquina de estados
 */
async function transitionState(planId, action) {
  const lockFile = getLockFile();
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  await lockManager.acquire(lockFile);
  
  try {
    const planDir = findPlanDir(planId);
    const planJsonPath = path.join(planDir, 'plan.json');
    
    if (!fs.existsSync(planJsonPath)) {
      const error = new Error(`El archivo de estados plan.json no existe en ${planDir}.`);
      error.code = 'GSDC_JSON_PARSE_ERROR';
      error.exitCode = 15;
      throw error;
    }
    
    const planData = JSON.parse(fs.readFileSync(planJsonPath, 'utf8'));
    const currentPhase = planData.phase;
    const currentStatus = planData.status;
    
    let nextPhase = currentPhase;
    let nextStatus = currentStatus;
    
    // Reglas estrictas de transiciones de la máquina de estados
    switch (action) {
      case 'approve-mockup':
        if (currentPhase !== 'mockup' || currentStatus !== 'pending_approval') {
          const error = new Error(`Transición ilegal: Se esperaba phase:status mockup:pending_approval para aprobar mockup. Estado actual: ${currentPhase}:${currentStatus}.`);
          error.code = 'GSDC_INVALID_STATE';
          error.exitCode = 13;
          throw error;
        }
        nextPhase = 'mockup';
        nextStatus = 'approved';
        break;
        
      case 'start-draft':
        if (currentPhase !== 'mockup' || currentStatus !== 'approved') {
          const error = new Error(`Transición ilegal: Se esperaba mockup:approved para iniciar borrador. Estado actual: ${currentPhase}:${currentStatus}.`);
          error.code = 'GSDC_INVALID_STATE';
          error.exitCode = 13;
          throw error;
        }
        nextPhase = 'draft';
        nextStatus = 'pending';
        break;
        
      case 'approve-draft':
        if (currentPhase !== 'draft' || currentStatus !== 'pending') {
          const error = new Error(`Transición ilegal: Se esperaba draft:pending para aprobar borrador. Estado actual: ${currentPhase}:${currentStatus}.`);
          error.code = 'GSDC_INVALID_STATE';
          error.exitCode = 13;
          throw error;
        }
        nextPhase = 'draft';
        nextStatus = 'approved';
        break;
        
      case 'start-refine':
        if (currentPhase !== 'draft' || currentStatus !== 'approved') {
          const error = new Error(`Transición ilegal: Se esperaba draft:approved para iniciar refinamientos. Estado actual: ${currentPhase}:${currentStatus}.`);
          error.code = 'GSDC_INVALID_STATE';
          error.exitCode = 13;
          throw error;
        }
        nextPhase = 'refine';
        nextStatus = 'pending';
        break;
        
      case 'approve-refine':
        if (currentPhase !== 'refine' || currentStatus !== 'pending') {
          const error = new Error(`Transición ilegal: Se esperaba refine:pending para aprobar refinamientos. Estado actual: ${currentPhase}:${currentStatus}.`);
          error.code = 'GSDC_INVALID_STATE';
          error.exitCode = 13;
          throw error;
        }
        // Transiciona DIRECTAMENTE a deliver:ready como se definió en Rev. 10
        nextPhase = 'deliver';
        nextStatus = 'ready';
        break;
        
      default:
        const error = new Error(`Acción de transición desconocida '${action}'.`);
        error.code = 'GSDC_INVALID_STATE';
        error.exitCode = 13;
        throw error;
    }
    
    // Actualizar datos del plan
    const nowStr = new Date().toISOString();
    planData.phase = nextPhase;
    planData.status = nextStatus;
    planData.timestamps.updated = nowStr;
    
    planData.history.push({
      timestamp: nowStr,
      action: action,
      details: `Estado transicionado a ${nextPhase}:${nextStatus}`
    });
    
    writeAtomicJson(planJsonPath, planData);
    
    return {
      planId,
      planDir: path.relative(process.cwd(), planDir),
      plan: planData
    };
  } finally {
    lockManager.release(lockFile);
  }
}

/**
 * Valida los entregables físicos y realiza la entrega final y cierre del plan
 */
async function deliver(planId) {
  const lockFile = getLockFile();
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  await lockManager.acquire(lockFile);
  
  try {
    const planDir = findPlanDir(planId);
    const planJsonPath = path.join(planDir, 'plan.json');
    
    if (!fs.existsSync(planJsonPath)) {
      const error = new Error(`El archivo de estados plan.json no existe en ${planDir}.`);
      error.code = 'GSDC_JSON_PARSE_ERROR';
      error.exitCode = 15;
      throw error;
    }
    
    const planData = JSON.parse(fs.readFileSync(planJsonPath, 'utf8'));
    
    // Validar precondición estricta
    if (planData.phase !== 'deliver' || planData.status !== 'ready') {
      const error = new Error(`Transición ilegal: Se esperaba deliver:ready para entregar el plan. Estado actual: ${planData.phase}:${planData.status}.`);
      error.code = 'GSDC_INVALID_STATE';
      error.exitCode = 13;
      throw error;
    }
    
    // Verificación física del entregable válido en delivery/plan_[ID]
    const deliveryDir = path.join(process.cwd(), 'delivery', `plan_${planId}`);
    
    if (!fs.existsSync(deliveryDir)) {
      const error = new Error(`Falta de entregable válido: El directorio delivery/plan_${planId}/ no existe.`);
      error.code = 'GSDC_DELIVERY_MISSING';
      error.exitCode = 14;
      throw error;
    }
    
    const files = fs.readdirSync(deliveryDir);
    const validFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      const stats = fs.statSync(path.join(deliveryDir, file));
      return (ext === '.png' || ext === '.pdf') && stats.size > 0;
    });
    
    if (validFiles.length === 0) {
      const error = new Error(
        `Falta de entregable válido: No se encontraron archivos .png o .pdf de tamaño mayor a 0 bytes en delivery/plan_${planId}/.`
      );
      error.code = 'GSDC_DELIVERY_MISSING';
      error.exitCode = 14;
      throw error;
    }
    
    // Transicionar a DELIVERED
    const nowStr = new Date().toISOString();
    planData.phase = 'deliver';
    planData.status = 'delivered';
    planData.timestamps.updated = nowStr;
    
    planData.history.push({
      timestamp: nowStr,
      action: 'deliver',
      details: `Entregas físicas verificadas. Plan cerrado como DELIVERED.`
    });
    
    writeAtomicJson(planJsonPath, planData);
    
    return {
      planId,
      delivered: true,
      files: validFiles,
      plan: planData
    };
  } finally {
    lockManager.release(lockFile);
  }
}

/**
 * Retorna la lista de planes existentes en el workspace
 */
async function list(options = {}) {
  const plansDir = getPlansDir();
  if (!fs.existsSync(plansDir)) {
    return { plans: [] };
  }
  
  const folders = fs.readdirSync(plansDir);
  const plans = [];
  
  for (const folder of folders) {
    if (folder.startsWith('plan_')) {
      const planJsonPath = path.join(plansDir, folder, 'plan.json');
      if (fs.existsSync(planJsonPath)) {
        try {
          const planData = JSON.parse(fs.readFileSync(planJsonPath, 'utf8'));
          
          if (options.phase && planData.phase !== options.phase) {
            continue;
          }
          
          plans.push({
            id: planData.id,
            name: planData.name,
            phase: planData.phase,
            status: planData.status,
            canvaDesignId: planData.canvaDesignId
          });
        } catch (e) {
          // Ignorar planes corruptos en la lista
        }
      }
    }
  }
  
  // Ordenar secuencialmente por ID de tres dígitos
  plans.sort((a, b) => a.id.localeCompare(b.id));
  
  return { plans };
}

/**
 * Consulta de estado detallada de un plan secuencial específico
 */
async function status(planId) {
  const planDir = findPlanDir(planId);
  const planJsonPath = path.join(planDir, 'plan.json');
  
  if (!fs.existsSync(planJsonPath)) {
    const error = new Error(`El archivo de estados plan.json no existe en ${planDir}.`);
    error.code = 'GSDC_JSON_PARSE_ERROR';
    error.exitCode = 15;
    throw error;
  }
  
  try {
    const planData = JSON.parse(fs.readFileSync(planJsonPath, 'utf8'));
    return {
      planId,
      planDir: path.relative(process.cwd(), planDir),
      plan: planData
    };
  } catch (e) {
    const error = new Error('El archivo plan.json está corrupto o es ilegible.');
    error.code = 'GSDC_JSON_PARSE_ERROR';
    error.exitCode = 15;
    throw error;
  }
}

module.exports = {
  FIELD_REGISTRY,
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS,
  ALL_FIELDS,
  ensureQuestionFields,
  computeDecisionsHash,
  create,
  confirmDecisions,
  resolveQuestions,
  submitMockup,
  transitionState,
  deliver,
  list,
  status
};
