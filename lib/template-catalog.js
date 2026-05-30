const fs = require('fs');
const path = require('path');

// Helpers para evaluar rutas de forma dinámica en tiempo de ejecución
function getCatalogPath() { return path.join(process.cwd(), 'system_templates.json'); }
function getPlansDir() { return path.join(process.cwd(), 'canva-plans'); }

// Helper para escrituras atómicas
function writeAtomicJson(filePath, data) {
  const content = JSON.stringify(data, null, 2);
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

// Helper para buscar plan y verificar su existencia
function getPlanJsonPath(planId) {
  const plansDir = getPlansDir();
  if (!fs.existsSync(plansDir)) {
    fs.mkdirSync(plansDir, { recursive: true });
  }
  const folders = fs.readdirSync(plansDir);
  const matched = folders.find(f => f.startsWith(`plan_${planId}_`));
  if (!matched) {
    const error = new Error(`El plan asociado con ID ${planId} no existe en canva-plans/.`);
    error.code = 'GSDC_JSON_PARSE_ERROR';
    error.exitCode = 15;
    throw error;
  }
  return path.join(plansDir, matched, 'plan.json');
}

/**
 * Registra un diseño de Canva con sus placeholders en system_templates.json
 */
async function register(options = {}) {
  const { id, name, planId } = options;
  
  if (!id || !name || !planId) {
    const error = new Error('Los parámetros --id (Canva ID), --name y --plan son obligatorios.');
    error.code = 'GSDC_JSON_PARSE_ERROR';
    error.exitCode = 15;
    throw error;
  }
  
  // 1. Validar que el plan exista en el espacio de trabajo local
  const planJsonPath = getPlanJsonPath(planId);
  const planData = JSON.parse(fs.readFileSync(planJsonPath, 'utf8'));
  
  // 2. Inicializar system_templates.json si no existe
  let catalog = { templates: [] };
  const catalogPath = getCatalogPath();
  if (fs.existsSync(catalogPath)) {
    try {
      catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    } catch (e) {
      const error = new Error('El catálogo system_templates.json está corrupto o es ilegible.');
      error.code = 'GSDC_JSON_PARSE_ERROR';
      error.exitCode = 15;
      throw error;
    }
  }
  
  // 3. Crear/Actualizar la entrada del catálogo
  let existingIndex = catalog.templates.findIndex(t => t.id === id);
  const templateEntry = {
    id: id,
    name: name,
    planId: planId,
    placeholders: [] // Se inicializa vacío para ser completado por transacciones de edición/escaneo
  };
  
  if (existingIndex !== -1) {
    // Mantener los placeholders existentes si ya estaba registrado
    templateEntry.placeholders = catalog.templates[existingIndex].placeholders || [];
    catalog.templates[existingIndex] = templateEntry;
  } else {
    catalog.templates.push(templateEntry);
  }
  
  // 4. Actualizar canvaDesignId en plan.json para asociarlos de forma oficial
  planData.canvaDesignId = id;
  planData.timestamps.updated = new Date().toISOString();
  writeAtomicJson(planJsonPath, planData);
  
  // 5. Guardar system_templates.json atómicamente
  writeAtomicJson(catalogPath, catalog);
  
  return {
    registered: true,
    template: templateEntry
  };
}

module.exports = {
  register
};
