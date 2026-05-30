# Propuesta de Mejora Arquitectónica — GSD Canva v1.1 (Rev. 5)

**Fecha**: 2026-05-30  
**Contexto**: Prueba de campo con Gemini agent ejecutando `/canva-mockup test2`  
**Estado**: Pendiente de aprobación final  
**Revisiones**: Rev. 1 → Rev. 2 → Rev. 3 → Rev. 4 → Rev. 5 (incorpora hallazgos de 5 revisiones externas)

---

## Resumen Ejecutivo

La prueba de campo reveló **3 problemas críticos** y **2 problemas menores** en la arquitectura actual. El más grave es que el instalador copia runtime ejecutable (`bin/`, `lib/`) al proyecto destino, obligando al agente a instalar dependencias y ejecutar rutas frágiles. Esta propuesta **propone corregir** la arquitectura a **CLI global puro**, reforzar los prompts de agentes contra la invención creativa prematura, alinear la suite de tests, y agregar migración obligatoria para instalaciones existentes.

---

## A. Estado Observado *(capturado al momento de redactar Rev. 5)*

Cambios no commiteados en `lib/installer.js`, `canva-mockup.md`, `canva-draft.md` y `tests/installer.test.js`. Los archivos `canva-refine.md` y `canva-deliver.md` no tienen cambios. Este documento es un archivo nuevo (`??`) no trackeado en Git.

### A.1. Critico 1: Runtime copiado al proyecto destino (estado original)

**Archivo**: `lib/installer.js`

El instalador original copiaba `bin/` y `lib/` dentro de `.gsd-canva/` del destino. Esto fue identificado como la causa raíz del incidente.

**Impacto**:
- El agente ejecutó `node .gsd-canva/bin/gsd-canva.js` en vez del binario global.
- El runtime copiado necesita `commander` y `chalk` → el agente corrió `npm install commander chalk@4` en el proyecto destino.
- Deuda de versión: si se actualiza el framework global, las copias locales quedan desactualizadas.
- Contaminación del workspace del usuario con `node_modules/` y `package.json` del framework.

### A.2. Critico 2: Comandos slash con rutas inconsistentes (estado mixto)

**Archivos**: Templates en `templates/commands/canva-*.md`

| Archivo | Modificado en WT? | Usa CLI global? | Tiene preflight? | Ocurrencias `node .gsd-canva/bin/...` | Header |
|---|---|---|---|---|---|
| `canva-mockup.md` | Si | Si | Si (seccion 0) | **0** | "CLI global del framework" |
| `canva-draft.md` | Si | Si | Si (seccion 0) | **0** | "CLI global del framework" |
| `canva-refine.md` | **No** | **No** | **No** | **3** (lineas 14, 19, 43) | "motor del CLI local de Node" |
| `canva-deliver.md` | **No** | **No** | **No** | **3** (lineas 14, 19, 33) | "motor del CLI local de Node" |

### A.3. Critico 3: El agente inventó contenido creativo sin brief

El agente interpretó instrucciones ambiguas como permiso para inventar una marca completa ("Urban Coffee Roasters") cuando el usuario solo dijo `test2`.

### A.4. Menor 1: `decisions.json` no fue actualizado por el agente

El agente editó Markdown pero no escribió en `decisions.json`. El Yield Gate depende de ese archivo.

### A.5. Menor 2: Terminología imprecisa

El agente dijo "firmar la integridad" en vez de "registrar la confirmación y calcular el hash criptográfico".

---

## B. Errores en Implementación Parcial (Working Tree)

Los siguientes problemas existen en los archivos ya modificados pero no commiteados:

### B.1. Filtro de migración sin slash final

**Archivo**: `lib/installer.js` (working tree)

`upgrade()` usa `startsWith('.gsd-canva/bin')` y `startsWith('.gsd-canva/lib')` **sin slash final**. Esto puede causar falsos positivos con rutas como `.gsd-canva/library-*`. El predicado correcto es `startsWith('.gsd-canva/bin/')` y `startsWith('.gsd-canva/lib/')`.

### B.2. Test usa predicado distinto a la migración

**Archivo**: `tests/installer.test.js` (working tree)

Lineas 156-157 usan `f.target.includes('bin/')` y `f.target.includes('lib/')` en vez de `f.target.startsWith('.gsd-canva/bin/')` y `f.target.startsWith('.gsd-canva/lib/')`. Esto es mas amplio y puede dar falsos positivos. El test debe usar el mismo predicado exacto que la migración.

### B.3. `canva-mockup.md` falta la regla fuerte de `decisions.json` primero

**Archivo**: `templates/commands/canva-mockup.md` (working tree)

El template incluye la "REGLA DE SUGERENCIAS" y distingue tentativas vs confirmadas, pero **no establece `decisions.json` como fuente de verdad obligatoria antes de los Markdown**. Este fue un fallo observado en la prueba de campo — el agente editó Markdown sin tocar `decisions.json`. Debe ser tratado como **bloqueante**.

---

## C. Especificación Final Requerida

Todos los cambios a continuación están **pendientes de completar, corregir y commitear**. Algunos ya están parcialmente aplicados en el working tree (Cambio 1 en `installer.js`, Cambio 3 en `mockup`/`draft`, Cambio 6 tests 7/8) pero requieren correcciones documentadas en la sección B antes de commitear. Otros son completamente nuevos (Cambio 3 para `refine`/`deliver`, Cambio 4, Cambios 7-9).

### Cambio 1: Eliminar copia de runtime en el instalador

**Archivo**: `lib/installer.js`

**Remover** las lineas que copian `bin/` y `lib/`:

```diff
  // Copiar también el binario y la librería al destino local para que sea autoportante
- copyRecursiveSync(frameworkBinDir, path.join(gsdFolder, 'bin'), filesToCopy);
- copyRecursiveSync(frameworkLibDir, path.join(gsdFolder, 'lib'), filesToCopy);
```

**Remover** la creación de directorios:

```diff
- fs.mkdirSync(path.join(gsdFolder, 'bin'), { recursive: true });
- fs.mkdirSync(path.join(gsdFolder, 'lib'), { recursive: true });
```

**Remover** las referencias a `frameworkBinDir` y `frameworkLibDir` en `init()`:

```diff
- const frameworkBinDir = path.resolve(__dirname, '../bin');
- const frameworkLibDir = path.resolve(__dirname, '../lib');
```

**Remover** las variables y copias en `upgrade()`:

```diff
  async function upgrade(options = {}) {
    const targetDir = process.cwd();
    const frameworkTemplatesDir = path.resolve(__dirname, '../templates');
-   const frameworkBinDir = path.resolve(__dirname, '../bin');
-   const frameworkLibDir = path.resolve(__dirname, '../lib');
```

```diff
- copyRecursiveSync(frameworkBinDir, path.join(gsdFolder, 'bin'), filesToCopy);
- copyRecursiveSync(frameworkLibDir, path.join(gsdFolder, 'lib'), filesToCopy);
```

**Resultado**: `.gsd-canva/` en el destino solo contendrá `commands/`, `workflows/`, `plan-templates/`, `manifest.json`, `config.json` y `config.local.example.json`. Cero código ejecutable.

---

### Cambio 2: Agregar migración de limpieza en `upgrade()` (REQUISITO OBLIGATORIO)

**Archivo**: `lib/installer.js` — función `upgrade()`

Despues de las copias de templates y antes de escribir el manifest, agregar logica que elimine runtime legacy de proyectos existentes:

```js
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

// Eliminar entradas legacy del manifest (NOTA: usar slash final para evitar prefijos accidentales)
manifest.files = manifest.files.filter(mf => {
  const target = mf.target || '';
  return !target.startsWith('.gsd-canva/bin/') && !target.startsWith('.gsd-canva/lib/');
});
```

Esto garantiza que proyectos inicializados con v1.0 (que tienen `bin/` y `lib/` copiados) sean limpiados automaticamente al correr `gsd-canva upgrade`.

**CORRECCION PENDIENTE**: La implementacion actual en el working tree (`lib/installer.js`) usa `startsWith('.gsd-canva/bin')` y `startsWith('.gsd-canva/lib')` **sin slash final**. Esto puede causar falsos positivos con rutas como `.gsd-canva/library-*`. El predicado correcto debe incluir el slash: `startsWith('.gsd-canva/bin/')` y `startsWith('.gsd-canva/lib/')`. Debe corregirse antes de commitear.

---

### Cambio 3: Migrar `canva-refine.md` y `canva-deliver.md` a CLI global

**Archivos**: `templates/commands/canva-refine.md`, `templates/commands/canva-deliver.md`

**Para `canva-refine.md`** — Reemplazar todas las ocurrencias de `node .gsd-canva/bin/gsd-canva.js` por `gsd-canva` y agregar la seccion de preflight + actualizar header, siguiendo el patron ya implementado en `canva-mockup.md` y `canva-draft.md`:

```markdown
## Instrucciones Operativas para el Agente

Cuando el usuario invoque este comando, debes ejecutar de forma obligatoria los siguientes pasos secuenciales utilizando el CLI global del framework:

### 0. Preflight del Entorno (OBLIGATORIO)
*   Antes de ejecutar cualquier otra acción, verifica que el CLI global de `gsd-canva` esté disponible en tu `PATH`:
    ```bash
    gsd-canva --help
    ```
    *(Alternativamente, puedes verificar con `command -v gsd-canva`)*.
*   ⚠️ **PARADA CRÍTICA**: Si el comando falla o no es encontrado, **detén tu ejecución inmediatamente**. Informa al usuario que el CLI global no está configurado o enlazado en su sistema y solicita que ejecute `npm install -g .` o `npm link` en el directorio raíz del framework antes de volver a intentar. **PROHIBIDO** instalar paquetes o buscar dependencias locales por tu cuenta.
```

**Para `canva-deliver.md`** — Identico tratamiento: reemplazar todas las ocurrencias de `node .gsd-canva/bin/gsd-canva.js` por `gsd-canva`, agregar preflight, actualizar header.

**NOTA**: `canva-mockup.md` y `canva-draft.md` ya tienen preflight y usan `gsd-canva` global. Sin embargo, `canva-mockup.md` aún requiere la regla `decisions.json primero` del Cambio 4 — sus rutas están migradas pero su lógica funcional no está completa.

---

### Cambio 4: Reforzar canva-mockup.md contra invencion prematura (con distincion de tentativas)

**Archivo**: `templates/commands/canva-mockup.md`

**ESTADO ACTUAL**: El working tree tiene una version parcialmente mejorada que incluye la "REGLA DE SUGERENCIAS" y distingue tentativas vs confirmadas. Sin embargo, **falta la regla critica** de escribir en `decisions.json` **siempre primero**. El template actual dice "Pobla esos campos en `decisions.json` de inmediato" solo para contexto completo, pero no establece `decisions.json` como fuente de verdad obligatoria antes de los Markdown.

**CAMBIO REQUERIDO**: Agregar explicitamente despues de la seccion de analisis de contexto:

```markdown
*   **Poblado Obligatorio de Archivos (decisions.json primero)**:
    *   Escribe **SIEMPRE** en `decisions.json` primero. Este archivo es la fuente de verdad para el Yield Gate criptografico. Los archivos Markdown (`requerimientos.md`, `investigacion.md`) se actualizan como espejo de lo que ya esta en `decisions.json`.
    *   Los campos desconocidos en `decisions.json` se dejan como strings vacios (`""`).
    *   Los campos desconocidos en los Markdown se dejan con los placeholders originales del template.
    *   ⚠️ **PROHIBIDO** editar `requerimientos.md` o `investigacion.md` con datos que no esten primero en `decisions.json`.
```

**Texto completo que debe reemplazar la seccion "Analisis Inteligente" del template original**:

```markdown
### 2. Levantamiento de Requisitos, Investigación y Confirmación (YIELD GATE OBLIGATORIO)
*   **Análisis del Contexto del Usuario**:
    *   Analiza la instrucción inicial del usuario cuidadosamente y clasifica el nivel de contexto recibido:
        *   **Contexto Completo**: El usuario proveyó vertical, audiencia, formato, paleta, copy y CTA → Pobla esos campos en `decisions.json` de inmediato.
        *   **Contexto Parcial**: El usuario proveyó algunos datos pero no todos → Pobla los campos conocidos en `decisions.json` y deja los demás como strings vacíos (`""`).
        *   **Sin Contexto**: El usuario solo proveyó un nombre genérico (ej: `test2`) → Deja TODOS los campos de `decisions.json` como strings vacíos (`""`).
    *   💡 **REGLA DE SUGERENCIAS**: Puedes diseñar y proponer opciones estéticas o creativas sugeridas al usuario en el chat, marcándolas **explícitamente como propuestas tentativas no confirmadas**. Sin embargo, está **PROHIBIDO** registrarlas en `decisions.json` o darlas por definitivas en `requerimientos.md` o `investigacion.md` sin el consentimiento explícito del usuario. Los campos desconocidos en los archivos se dejan con los placeholders originales del template hasta que sean validados.
*   **Poblado Obligatorio de Archivos (decisions.json primero)**:
    *   Escribe **SIEMPRE** en `decisions.json` primero. Este archivo es la fuente de verdad para el Yield Gate criptográfico. Los archivos Markdown (`requerimientos.md`, `investigacion.md`) se actualizan como espejo de lo que ya está en `decisions.json`.
    *   Los campos desconocidos en `decisions.json` se dejan como strings vacíos (`""`).
    *   Los campos desconocidos en los Markdown se dejan con los placeholders originales del template.
    *   ⚠️ **PROHIBIDO** editar `requerimientos.md` o `investigacion.md` con datos que no estén primero en `decisions.json`.
    *   Escribe las preguntas faltantes en la sección `Pendientes` de `preguntas.md`.
*   **Parada Obligatoria (Roadblock)**:
    1. Presenta en el chat un resumen de: (a) lo que sabes con certeza, (b) opciones tentativas que sugieres, y (c) lo que falta por definir.
    2. Formula preguntas específicas por cada campo vacío en `decisions.json`.
    3. Pide confirmación explícita al usuario para congelar el diseño.
    4. ⚠️ **DETÉN tu generación en el chat inmediatamente**. **PROHIBIDO** generar `mockup.html` o ejecutar comandos de transición de forma autónoma.
```

Ademas, actualizar las instrucciones de confirmacion para usar terminologia precisa:

```diff
- *   Ejecuta el comando de firma de integridad en el CLI:
+ *   Ejecuta el comando para registrar la confirmación y calcular el hash de integridad en el CLI:
```

---

### Cambio 5: Expandir árbol en mensaje de init (OPCIONAL)

**Archivo**: `bin/gsd-canva.js` — sección del mensaje de éxito de `init`

El mensaje actual muestra `.gsd-canva/` como entrada única. Opcionalmente, expandir el árbol para mostrar el contenido interno (`commands/`, `workflows/`, `plan-templates/`) y mejorar la comprensión del usuario sobre qué se creó.

**Nota**: Este cambio tiene impacto bajo. No es bloqueante.

---

### Cambio 6: Actualizar la suite de tests

**Archivo**: `tests/installer.test.js`

**Remover** Test 7 anterior (verificacion positiva de runtime copiado):

```diff
-   // ==========================================
-   // TEST 7: Existencia de bin y lib en destino local (autoprotección)
-   // ==========================================
-   console.log('  - Test 7: Verificación de runtime local copiado...');
-   assert.ok(fs.existsSync('.gsd-canva/bin/gsd-canva.js'), 'Debería existir bin local en destino');
-   assert.ok(fs.existsSync('.gsd-canva/lib/installer.js'), 'Debería existir lib local en destino');
```

**Agregar** Test 7 — verificacion negativa en instalacion limpia:

```js
    // TEST 7: Verificar que NO se copia runtime al destino en instalación limpia
    console.log('  - Test 7: Verificación de ausencia de runtime copiado...');
    assert.ok(!fs.existsSync('.gsd-canva/bin'), 'NO debería existir bin/ en destino');
    assert.ok(!fs.existsSync('.gsd-canva/lib'), 'NO debería existir lib/ en destino');
    
    // Verificar que manifest no registra archivos de bin/ ni lib/
    const manifest = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    const runtimeEntries = manifest.files.filter(f => 
      f.target.startsWith('.gsd-canva/bin/') || f.target.startsWith('.gsd-canva/lib/')
    );
    assert.strictEqual(runtimeEntries.length, 0, 'Manifest no debería registrar archivos de runtime');
```

**Agregar** Test 8 — migracion de `upgrade()` desde instalacion v1.0 con runtime legacy:

```js
    // ==========================================
    // TEST 8: Migración de upgrade() limpiando runtime legacy
    // ==========================================
    console.log('  - Test 8: Migración de upgrade desde v1.0 con runtime copiado...');
    
    // Simular instalación v1.0: crear bin/ y lib/ falsos con entradas en manifest
    fs.mkdirSync('.gsd-canva/bin', { recursive: true });
    fs.mkdirSync('.gsd-canva/lib', { recursive: true });
    fs.writeFileSync('.gsd-canva/bin/gsd-canva.js', '// OLD CLI', 'utf8');
    fs.writeFileSync('.gsd-canva/lib/plan-manager.js', '// OLD PLAN', 'utf8');
    
    // Inyectar entradas legacy en el manifest
    const manifestBefore = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    manifestBefore.files.push(
      { target: '.gsd-canva/bin/gsd-canva.js', sha256: 'fake1', managed: true },
      { target: '.gsd-canva/lib/plan-manager.js', sha256: 'fake2', managed: true }
    );
    fs.writeFileSync('.gsd-canva/manifest.json', JSON.stringify(manifestBefore, null, 2), 'utf8');
    
    // Ejecutar upgrade
    const upgradeResult = await installer.upgrade({ frameworkVersion: '1.1.0' });
    assert.strictEqual(upgradeResult.upgraded, true, 'Upgrade debería completarse');
    
    // Verificar que bin/ y lib/ fueron eliminados del disco
    assert.ok(!fs.existsSync('.gsd-canva/bin'), 'bin/ legacy debería haber sido eliminado');
    assert.ok(!fs.existsSync('.gsd-canva/lib'), 'lib/ legacy debería haber sido eliminado');
    
    // Verificar que las entradas legacy fueron eliminadas del manifest
    // NOTA: Usar startsWith con slash final para evitar falsos positivos con .gsd-canva/library-*
    const manifestAfter = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    const legacyEntries = manifestAfter.files.filter(f =>
      f.target.startsWith('.gsd-canva/bin/') || f.target.startsWith('.gsd-canva/lib/')
    );
    assert.strictEqual(legacyEntries.length, 0, 'Manifest no debería contener entradas de runtime legacy');
    
    // TEST 8b: Falsos positivos — entradas con prefijo similar NO deben eliminarse
    // Crear archivos físicos decoy con prefijo similar a bin/lib
    fs.mkdirSync('.gsd-canva/binoculars', { recursive: true });
    fs.writeFileSync('.gsd-canva/binoculars/config.json', '{}', 'utf8');
    fs.writeFileSync('.gsd-canva/library-config.json', '{}', 'utf8');
    
    // Agregar entradas decoy al manifest (hash calculado del contenido real para evitar side effects)
    // NOTA: requiere agregar `const crypto = require('crypto');` al inicio del test
    const decoy1Hash = crypto.createHash('sha256').update('{}').digest('hex');
    const decoy2Hash = crypto.createHash('sha256').update('{}').digest('hex');
    const manifestWithDecoy = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    manifestWithDecoy.files.push(
      { target: '.gsd-canva/library-config.json', sha256: decoy1Hash, managed: true },
      { target: '.gsd-canva/binoculars/config.json', sha256: decoy2Hash, managed: true }
    );
    fs.writeFileSync('.gsd-canva/manifest.json', JSON.stringify(manifestWithDecoy, null, 2), 'utf8');
    
    // Ejecutar upgrade de nuevo
    const reUpgrade = await installer.upgrade({ frameworkVersion: '1.1.1' });
    assert.strictEqual(reUpgrade.upgraded, true, 'Re-upgrade debería completarse');
    
    // Verificar que los archivos físicos decoy NO fueron eliminados
    assert.ok(fs.existsSync('.gsd-canva/binoculars/config.json'), 'Archivo decoy binoculars no debe borrarse');
    assert.ok(fs.existsSync('.gsd-canva/library-config.json'), 'Archivo decoy library no debe borrarse');
    
    // Verificar que las entradas decoy NO fueron eliminadas del manifest
    const manifestAfterDecoy = JSON.parse(fs.readFileSync('.gsd-canva/manifest.json', 'utf8'));
    const decoyEntries = manifestAfterDecoy.files.filter(f =>
      f.target === '.gsd-canva/library-config.json' || f.target === '.gsd-canva/binoculars/config.json'
    );
    assert.strictEqual(decoyEntries.length, 2, 'Entradas legítimas con prefijo similar NO deben eliminarse');
```

**CORRECCION PENDIENTE**: La implementacion actual del test en el working tree usa `f.target.includes('bin/')` y `f.target.includes('lib/')`, que es mas amplio y puede causar falsos positivos. Debe corregirse para usar el mismo predicado exacto que la migracion en `installer.js`: `f.target.startsWith('.gsd-canva/bin/')` y `f.target.startsWith('.gsd-canva/lib/')` (con slash final).

**Archivo**: `tests/plan.test.js`

Sin cambios requeridos. Los tests de plan-manager funcionan independientemente de la copia de runtime porque importan directamente los modulos del framework.

---

### Cambio 7: Actualizar documentacion de arquitectura

**Archivo**: `docs/implementation_plans/approved_phase1_core.md`

Actualizar la seccion 1 "Arquitectura de Runtime Autocontenido" para reflejar el cambio a CLI global:

```diff
- ### 1. Arquitectura de Runtime Autocontenido (Self-Contained Runtime)
- Para evitar la instalación de binarios o scripts a nivel de sistema global ...
+ ### 1. Arquitectura de CLI Global (Global CLI Architecture)
+ El framework se instala como un paquete global de Node.js (`npm install -g` o `npm link`). Todas las operaciones se ejecutan a través del binario global `gsd-canva`, sin copiar runtime al proyecto destino:
```

**IMPORTANTE**: `bin/` y `lib/` siguen siendo parte del paquete global del framework (listados en `package.json` → `files`). Lo que cambia es que **no se copian al proyecto destino**. No eliminar las referencias a empaquetar `bin/`, `lib/` y `templates/` para distribución NPM — solo las referencias a copiarlos dentro de `.gsd-canva/`.

Actualizar la seccion del workspace para remover `bin/` y `lib/` del destino:

```diff
  .gsd-canva/
    ├── manifest.json              <-- Hashes sha256, mappings y schemaVersion: 1
    ├── config.json                <-- Configuración portable (Commiteado)
    ├── config.local.example.json  <-- Plantilla de configuración local
    ├── commands/                  <-- Slash commands markdown
    ├── workflows/                 <-- Guías y especificaciones de flujo
-   ├── plan-templates/            <-- Plantillas de documentos de planificación
-   ├── bin/
-   │     └── gsd-canva.js         <-- CLI de enrutamiento local del proyecto (Copiado)
-   ├── lib/
-   │     ├── installer.js         <-- Actualizador y diagnóstico local (Copiado)
-   │     ├── lock-manager.js      <-- Concurrencia atómica local (Copiado)
-   │     ├── plan-manager.js      <-- Máquina de estados local (Copiado)
-   │     └── template-catalog.js  <-- Registro local del catálogo (Copiado)
+   └── plan-templates/            <-- Plantillas de documentos de planificación
    └── .lock                      <-- Lockfile temporal de concurrencia (Gitignored/Temporal)
```

---

### Cambio 8: Actualizar el README

**Archivo**: `README.md`

Actualizar la seccion de Arquitectura del Workspace (lineas 17-23) para remover `bin/` y `lib/` del arbol mostrado, y la seccion de Instalacion (lineas 44-59) para enfatizar el registro global como requisito.

---

### Cambio 9: Marcar plan de mejora anterior como superseded

**Archivo**: `docs/implementation_plans/yield_gate_improvement.md`

Agregar al inicio del archivo una nota indicando que este plan ha sido reemplazado por la propuesta actual (`docs/PROPOSAL_v1.1_architectural_fixes.md`), con enlace a la nueva ruta. No eliminar el archivo original — conserva trazabilidad histórica.

---

## Resumen de Archivos Afectados

| Archivo | Tipo de Cambio | Prioridad |
|---|---|---|
| `lib/installer.js` | Remover copia de runtime + migracion en upgrade | **Critica** |
| `templates/commands/canva-mockup.md` | Anti-invencion + decisions.json + terminologia | **Critica** |
| `templates/commands/canva-refine.md` | CLI global + preflight (3 rutas + header) | **Alta** |
| `templates/commands/canva-deliver.md` | CLI global + preflight (3 rutas + header) | **Alta** |
| `bin/gsd-canva.js` | Expandir árbol en mensaje de init | **Opcional** — no requerido para aprobación |
| `tests/installer.test.js` | Test negativo + test de migracion upgrade | **Alta** |
| `docs/implementation_plans/approved_phase1_core.md` | Documentacion | **Baja** |
| `README.md` | Documentacion | **Baja** |
| `docs/implementation_plans/yield_gate_improvement.md` | Marcar como superseded | **Baja** |

---

## Plan de Verificacion Post-Implementacion

1. `npm test` — Todos los tests existentes + nuevos deben pasar (Test 7 negativo + Test 8 migracion).
2. `npm link` en el directorio del framework.
3. Crear un proyecto destino vacio y ejecutar `gsd-canva init`.
4. Verificar que `.gsd-canva/` NO contiene `bin/` ni `lib/`.
5. Verificar que `manifest.json` no registra entradas de `bin/` ni `lib/`.
6. Verificar que `gsd-canva doctor --agent antigravity` funciona.
7. Verificar que `gsd-canva plan create --name "test"` funciona.
8. Simular una instalacion v1.0 (crear `.gsd-canva/bin/` y `.gsd-canva/lib/` manualmente con entradas en manifest), ejecutar `gsd-canva upgrade`, y verificar que:
   - `bin/` y `lib/` fueron eliminados del disco.
   - Las entradas legacy fueron removidas del manifest.
   - Los templates y comandos fueron actualizados correctamente.
9. Probar el flujo completo `/canva-mockup test3` con un agente y validar que:
   - Ejecuta el preflight de disponibilidad del CLI primero.
   - Usa `gsd-canva` global (no rutas locales).
   - Pregunta antes de proponer (sugiere tentativas, no afirma).
   - Escribe en `decisions.json` antes que en los Markdown.
   - No instala dependencias en el destino.
10. Verificar que **ningún** comando slash contiene la ruta local:
    ```bash
    rg "node \.gsd-canva/bin/gsd-canva\.js" templates/commands/
    ```
    Esperado: cero resultados.
11. Verificar que `canva-refine.md` y `canva-deliver.md` tienen:
    - Header que dice "CLI global del framework".
    - Sección "Preflight del Entorno (OBLIGATORIO)".
    - Todas las llamadas CLI usan `gsd-canva` (no rutas locales).
12. Ejecutar `gsd-canva init` en un proyecto destino limpio y verificar que `.antigravity/commands/canva-refine.md` y `.antigravity/commands/canva-deliver.md` contienen la versión migrada (con preflight y `gsd-canva` global). El agente descubre comandos desde `.antigravity/commands/`, no desde `templates/commands/`.
13. En un proyecto legacy con comandos viejos en `.antigravity/commands/`, ejecutar `gsd-canva upgrade` y verificar que `.antigravity/commands/canva-refine.md` y `.antigravity/commands/canva-deliver.md` fueron actualizados a la versión migrada (con preflight y `gsd-canva` global).
14. Verificar que ningún comando instalado contiene la ruta local:
    ```bash
    rg "node \.gsd-canva/bin/gsd-canva\.js" .antigravity/commands/
    ```
    Esperado: cero resultados.

---

## D. Riesgos y Consideraciones

1. **Proyectos existentes con runtime copiado**: **Pendiente de implementar**. El Cambio 2 agrega limpieza en `upgrade()`. La implementacion actual en el working tree tiene un bug en el predicado del filtro (B.1) que debe corregirse antes de commitear.

2. **Dependencia de instalacion global**: El framework requiere `npm install -g .` o `npm link` antes de usar `gsd-canva init`. Actualmente 2 de los 4 slash commands tienen preflight obligatorio (mockup, draft). Los otros 2 (refine, deliver) lo recibiran con el Cambio 3.

3. **Compatibilidad con agentes**: Las directivas `PROHIBIDO`, `REGLA ABSOLUTA` y `PARADA CRÍTICA` en los templates son intencionalmente fuertes para maximizar la compliance. El preflight de CLI reduce la ventana de improvisacion del agente.

4. **Cambios sin commitear en working tree**: Existen modificaciones parciales en 4 archivos que no estan commiteadas. Se recomienda comparar archivo por archivo contra la spec en seccion C, conservar lo que ya está correcto, corregir lo que tiene bugs (B.1, B.2, B.3), y aplicar lo faltante (Cambio 3 para refine/deliver, Cambios 7-9). No se recomienda revertir sin aprobación explícita — los cambios parciales contienen parte de la solución.

---

## Apéndice: Bitácora de Revisiones Externas

*Nota: Esta sección es para auditoría histórica. La spec ejecutable está en la sección C.*

### Revision 1

| Hallazgo | Severidad | Resolucion |
|---|---|---|
| Migracion de proyectos existentes como requisito obligatorio | Alta | **Cambio 2**: Logica de limpieza en `upgrade()`. **Test 8** cubre el caso. |
| Test de migracion de `upgrade()` desde v1.0 | Alta | **Test 8**: Simula runtime legacy, ejecuta `upgrade()`, verifica limpieza. |
| Tabla de ocurrencias inconsistente con repo | Media | Tabla en A.2 verificada con datos reales del repo. |
| Regla anti-invencion demasiado restrictiva | Media | **Cambio 4**: Distingue "decisiones confirmadas" vs "opciones tentativas". |
| Preflight de disponibilidad del CLI en slash commands | Media | **Cambio 3**: Preflight en refine y deliver. |
| Mensaje de init = baja prioridad real | Baja | Prioridad bajada a **Baja**. |

### Revision 2

| Hallazgo | Severidad | Resolucion |
|---|---|---|
| Documento mezcla propuesta con estado parcialmente implementado | Alta | Reestructurado en secciones A (observado), B (bugs en WT), C (spec final). |
| Afirma que los 4 slash commands tienen preflight (falso) | Alta | Tabla A.2 muestra estado exacto: solo 2 de 4. |
| `canva-mockup.md` no cumple regla fuerte de `decisions.json` primero | Alta | **B.3** marca como bloqueante. **Cambio 4** agrega seccion "Poblado Obligatorio". |
| Filtro de migracion demasiado amplio (sin slash final) | Media | **B.1** marca como pendiente. **Cambio 2** especifica predicado correcto. |
| Test usa predicado distinto a la migracion (`includes` vs `startsWith`) | Media | **B.2** marca como pendiente. **Test 8** especifica predicado correcto. |
| Proposal es archivo no trackeado en Git | Baja | Documentado en cabecera. |
| "Validado con grep" no es metodo de audit trail | Baja | Eliminado. |

### Revision 3

| Hallazgo | Severidad | Resolucion |
|---|---|---|
| Proposal dice "resuelto" para cambios pendientes | Alta | **Cambio 2** ahora dice "CORRECCION PENDIENTE". Seccion de Riesgos usa "pendiente de implementar". |
| Documento mezcla design spec con audit de working tree | Alta | Reestructurado: A=observado, B=bugs en WT, C=spec final, D=bitácora. |
| `canva-refine.md` y `canva-deliver.md` siguen sin migrar | Alta | **BLOQUEANTE**. Cambio 3 pendiente. Tabla A.2 lo refleja. |
| Titulo dice Rev. 2 pero tabla dice Rev. 3 | Media | Corregido: titulo ahora es Rev. 3. Tabla unificada en seccion D. |
| `canva-mockup.md` falta regla `decisions.json` primero | Media | **B.3 BLOQUEANTE**. Cambio 4 pendiente. |
| Test actual puede dar falsos positivos | Media | **B.2**. Correccion pendiente antes de commitear. |
| Referencias de linea de Critico 1 obsoletas | Baja | Seccion A.1 ya no referencia lineas especificas del working tree. |

### Revision 4

| Hallazgo | Severidad | Resolucion |
|---|---|---|
| Recomendacion de revertir con `git checkout .` es peligrosa | Alta | Eliminada. Seccion E.4 ahora dice "comparar archivo por archivo, conservar lo correcto, corregir lo buggy". |
| Spec dice "todos pendientes" pero algunos ya estan parcialmente aplicados | Alta | Seccion C ahora dice "pendientes de completar, corregir y commitear" y detalla que existe parcialmente. |
| `canva-refine.md` y `canva-deliver.md` siguen sin migrar | Alta | **BLOQUEANTE**. Sin cambios — Cambio 3 sigue pendiente. |
| Cambio 5 describe correccion que el codigo actual ya no necesita | Media | Reescrito como "OPCIONAL: expandir arbol para mostrar contenido interno". Ya no dice "remover mencion de bin/lib". |
| Espec usa lineas del working tree como referencias estables | Media | Eliminadas referencias a lineas especificas del WT en Cambios 3, 4 y 6. Ahora usan patrones ("todas las ocurrencias de X"). |
| Documento menciona commit hash sin verificacion | Baja | Eliminada referencia a `6f382ab` en A.1. |

### Revision 5

| Hallazgo | Severidad | Resolucion |
|---|---|---|
| "Estado observado" queda obsoleto con cada edición | Media | Seccion A ahora dice "capturado al momento de redactar Rev. 5". |
| Test 8b no cubre falsos positivos del filtro | Media | Agregado Test 8b: inserta archivos físicos y entradas manifest `.gsd-canva/library-config.json` y `.gsd-canva/binoculars/config.json`, verifica que `upgrade()` no los elimina del disco ni del manifest. |
| Verificacion no cubre comandos copiados en `.antigravity/commands` | Media | Agregado paso 12: verificar que `.antigravity/commands/` contiene version migrada tras `init`. |
| "Archivar" yield_gate_improvement.md oculta trazabilidad | Baja | Cambio 9 ahora dice "marcar como superseded con enlace", no "archivar". |
| Resumen dice "corrige" pero estado es pendiente | Baja | Cambiado a "propone corregir". |
