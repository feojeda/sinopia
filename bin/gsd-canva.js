#!/usr/bin/env node

const { Command } = require('commander');
const path = require('path');
const fs = require('fs');
const agentAdapters = require('../lib/agent-adapters');

// Intentar leer package.json de forma relativa a la instalación del paquete
let pkg = { version: '1.0.0' };
try {
  const pkgPath = path.resolve(__dirname, '../package.json');
  pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
} catch (e) {
  // Fallback si por alguna razón falla la lectura relativa
}

const frameworkVersion = pkg.version;
const program = new Command();

// Configuración global del CLI
program
  .name('gsd-canva')
  .description('Spec-Driven Development Framework and CLI for structured Canva element creation in Antigravity 2.0')
  .version(frameworkVersion);

// Helpers para dar formato estricto a las salidas M2M (--json) y consola humana
function getJsonMode() {
  // Buscar si la bandera --json está presente en los argumentos de commander o crudos
  return process.argv.includes('--json') || process.argv.includes('-j');
}

/**
 * Emite una salida de éxito.
 * En modo --json: Imprime { ok: true, data } en stdout y mantiene stderr en silencio absoluto.
 * En modo Humano: Imprime un mensaje estético con chalk en stdout.
 */
function handleSuccess(data, humanMessage = '') {
  const chalk = require('chalk');
  if (getJsonMode()) {
    process.stdout.write(JSON.stringify({ ok: true, data }) + '\n');
    process.exit(0);
  } else {
    if (humanMessage) {
      console.log(humanMessage);
    } else {
      console.log(chalk.green('✔ Operación completada con éxito.'));
    }
    process.exit(0);
  }
}

/**
 * Emite una salida de error estructurado y aborta la ejecución con un exit code no nulo.
 * En modo --json: stdout queda en silencio; stderr recibe un JSON con el código de error y detalles.
 * En modo Humano: Imprime un banner de error estético en stderr con detalles legibles.
 */
function handleError(code, message, exitCode = 1, details = {}) {
  const chalk = require('chalk');
  if (getJsonMode()) {
    const errorJson = JSON.stringify({
      ok: false,
      code,
      message,
      details
    });
    process.stderr.write(errorJson + '\n');
    process.exit(exitCode);
  } else {
    console.error(chalk.red.bold(`\n❌ ERROR [${code}]: ${message}`));
    if (Object.keys(details).length > 0) {
      console.error(chalk.yellow('Detalles:'), JSON.stringify(details, null, 2));
    }
    console.error();
    process.exit(exitCode);
  }
}

// ==========================================
// COMANDO: init
// ==========================================
program
  .command('init')
  .description('Inicializa el framework GSD Canva en el espacio de trabajo local')
  .option('--force-all', 'Fuerza la reinstalación y sobrescritura de archivos del framework y comandos controlados')
  .option('--adopt', 'Adopta archivos locales conocidos si no existe el manifiesto de control')
  .option('--agent <nombre>', 'Instala capabilities como skills del agente (ej: antigravity)')
  .option('--json', 'Salida estructurada en JSON puro para integraciones de agentes')
  .action(async (options) => {
    try {
      const installer = require('../lib/installer');
      const result = await installer.init({
        forceAll: !!options.forceAll,
        adopt: !!options.adopt,
        agent: options.agent || null,
        json: !!options.json,
        frameworkVersion
      });
      
      let humanMsg = '';
      if (!options.json) {
        const chalk = require('chalk');
        humanMsg = `
${chalk.bgCyan.black.bold(' 🚀 GSD-CANVA INICIALIZADO CON ÉXITO ')}

${chalk.cyan('El entorno de planificación estructurada ha sido creado:')}
${chalk.blue('├── .gsd-canva/')}             ${chalk.gray('<-- Archivos de control y plantillas del framework')}
${chalk.blue('├── .antigravity/commands/')}   ${chalk.gray('<-- Comandos slash copiados para descubrimiento en el IDE')}
${chalk.blue('├── canva-plans/')}             ${chalk.gray('<-- Carpeta de planes secuenciales e historial del usuario')}
${chalk.blue('└── system_templates.json')}    ${chalk.gray('<-- Catálogo local de placeholders y diseños registrados')}

${chalk.green('✔ Archivos de configuración listos.')}
${chalk.green('✔ Reglas agregadas a .gitignore de forma segura e idempotente.')}
`;
        if (options.agent && result.agentsInstalled) {
          for (const [agentId, info] of Object.entries(result.agentsInstalled)) {
            const agentLabels = {
              antigravity: 'Antigravity 2.0 Skills',
              codex: 'Codex Commands',
              opencode: 'OpenCode Commands (experimental)'
            };
            const label = agentLabels[agentId] || agentId;
            humanMsg += `
${chalk.magenta('🤖 ' + label + ' instalados:')}
${chalk.blue('├── ' + info.target + '/')}          ${chalk.gray('<-- ' + label)}
${chalk.green('✔ ' + info.count + ' artifacts instalados')}
`;
            if (agentId === 'opencode') {
              humanMsg += `${chalk.yellow('  ⚠ OpenCode adapter is experimental — format not yet verified against official docs.')}\n`;
            }
          }
          if (options.agent === 'all' || (options.agent !== 'antigravity' && result.agentsInstalled.antigravity)) {
            humanMsg += `${chalk.gray('  Compatibilidad legacy: .antigravity/commands/ preservado')}\n`;
          }
        } else if (options.agent === 'antigravity' && result.agentSkillsInstalled) {
          humanMsg += `
${chalk.magenta('🤖 Antigravity 2.0 Skills instalados:')}
${chalk.blue('├── .agents/skills/')}          ${chalk.gray('<-- Skills en formato Antigravity 2.0')}
${chalk.green('✔ ' + result.agentSkillsInstalled + ' skills instalados en .agents/skills/<id>/SKILL.md')}
${chalk.gray('  Compatibilidad legacy: .antigravity/commands/ preservado')}
`;
        }

        humanMsg += `
${chalk.yellow('Próximos pasos recomendados para tu agente de IA:')}
1. Usa ${chalk.bold('/canva-mockup <nombre>')} para inicializar el plan 001 y crear tu primera propuesta visual.
2. Ejecuta ${chalk.bold('gsd-canva doctor')} para verificar la salud y compatibilidad del entorno.
`;
      }
      handleSuccess(result, humanMsg);
    } catch (err) {
      handleError(
        err.code || 'GSDC_PERMISSION_DENIED',
        err.message || 'Fallo al inicializar el espacio de trabajo.',
        err.exitCode || 16,
        err.details || {}
      );
    }
  });

// ==========================================
// COMANDO: upgrade
// ==========================================
program
  .command('upgrade')
  .description('Actualiza las plantillas y comandos de gsd-canva en el proyecto')
  .option('--force-all', 'Fuerza la regeneración de artifacts oficiales, con backup de archivos modificados')
  .option('--adopt', 'Adopta artifacts existentes sin sobrescribir contenido del usuario')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const installer = require('../lib/installer');
      const result = await installer.upgrade({
        json: !!options.json,
        forceAll: !!options.forceAll,
        adopt: !!options.adopt,
        frameworkVersion
      });
      
      let humanMsg = '';
      if (!options.json) {
        const chalk = require('chalk');
        humanMsg = chalk.green('✔ Framework actualizado con éxito a la versión ') + chalk.bold(frameworkVersion);
        if (result.backupsCreated && result.backupsCreated.length > 0) {
          humanMsg += `\n\n${chalk.yellow('Aviso: Se crearon respaldos de archivos locales modificados:')}\n` +
            result.backupsCreated.map(f => `  - ${f}`).join('\n');
        }
      }
      handleSuccess(result, humanMsg);
    } catch (err) {
      handleError(
        err.code || 'GSDC_PERMISSION_DENIED',
        err.message || 'Fallo durante la actualización del framework.',
        err.exitCode || 16,
        err.details || {}
      );
    }
  });

// ==========================================
// COMANDO: doctor
// ==========================================
program
  .command('doctor')
  .description('Verifica la salud del espacio de trabajo y compatibilidad del IDE')
  .option('--agent <nombre>', 'Nombre del agente o IDE para validación estructural (ej: antigravity)')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const installer = require('../lib/installer');
      const result = await installer.doctor({
        agent: options.agent,
        json: !!options.json
      });
      
      let humanMsg = '';
      if (!options.json) {
        const chalk = require('chalk');
        humanMsg = `${chalk.bold.green('✔ Salud del entorno GSD Canva: EXCELENTE')}\n`;
        humanMsg += `  - Estado del Manifiesto: ${chalk.green('OK')}\n`;
        humanMsg += `  - Catálogo de Plantillas: ${chalk.green('VÁLIDO')}\n`;
        if (options.agent) {
          humanMsg += `  - Validación de Prompts para ${chalk.cyan(options.agent)}: ${chalk.green('OK')}\n`;
          if (result.agentDetails && result.agentDetails.agents) {
            for (const [agentId, details] of Object.entries(result.agentDetails.agents)) {
              const adapter = agentAdapters.getAdapter(agentId);
              const label = agentId === 'antigravity' ? 'Antigravity 2.0 Skills'
                : agentId === 'codex' ? 'Codex Commands'
                : 'OpenCode Commands';
              humanMsg += `  - ${label} (${adapter.targetRoot}/): ${chalk.green(details.validCount + '/' + details.expectedCount + ' válidos')}\n`;
              if (details.experimental) {
                humanMsg += `    ${chalk.yellow('⚠ experimental — format not yet verified')}\n`;
              }
            }
          } else if (result.agentDetails) {
            if (result.agentDetails.legacyCommands) {
              humanMsg += `  - Legacy Commands (.antigravity/commands/): ${chalk.green('OK')}\n`;
            }
            if (result.agentDetails.skillsDir) {
              humanMsg += `  - Antigravity 2.0 Skills (.agents/skills/): ${chalk.green(result.agentDetails.validSkills + '/' + result.agentDetails.skillsCount + ' válidos')}\n`;
            } else {
              humanMsg += `  - Antigravity 2.0 Skills: ${chalk.yellow('No instalados (use --agent antigravity en init)')}\n`;
            }
          }
        }
      }
      handleSuccess(result, humanMsg);
    } catch (err) {
      handleError(
        err.code || 'GSDC_AGENT_DISCOVERY_FAILED',
        err.message || 'Fallo de verificación en el diagnóstico del entorno.',
        err.exitCode || 18,
        err.details || {}
      );
    }
  });

// ==========================================
// GRUPO DE COMANDOS: plan
// ==========================================
const planCmd = program.command('plan').description('Gestiona el ciclo de vida y la máquina de estados de los planes');

// plan create
planCmd
  .command('create')
  .description('Crea un nuevo plan secuencial en canva-plans/')
  .requiredOption('--name <nombre>', 'Nombre descriptivo del nuevo diseño')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const planManager = require('../lib/plan-manager');
      const result = await planManager.create({
        name: options.name,
        json: !!options.json
      });
      
      let humanMsg = '';
      if (!options.json) {
        const chalk = require('chalk');
        humanMsg = chalk.green(`✔ Plan secuencial `) + chalk.bold(result.planId) + chalk.green(` creado con éxito en: `) + chalk.cyan(result.planDir);
      }
      handleSuccess(result, humanMsg);
    } catch (err) {
      handleError(
        err.code || 'GSDC_LOCK_TIMEOUT',
        err.message || 'Fallo al crear el nuevo plan.',
        err.exitCode || 10,
        err.details || {}
      );
    }
  });

// plan questions
planCmd
  .command('questions')
  .description('Muestra el estado de las preguntas interactivas de un plan')
  .requiredOption('--id <id>', 'ID del plan secuencial de tres dígitos')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const planManager = require('../lib/plan-manager');
      const result = await planManager.questions(options.id);
      let humanMsg = '';
      if (!options.json) {
        const chalk = require('chalk');
        humanMsg = `${chalk.bold.yellow('❓ PREGUNTAS DEL PLAN ' + options.id)}\n`;
        humanMsg += `  Estado: ${chalk.cyan(result.phase + ':' + result.status)}\n`;
        humanMsg += `  Completados: ${chalk.green(result.filledCount + '/' + result.totalFields)}\n`;
        humanMsg += `  Requeridos pendientes: ${result.requiredPendingCount > 0 ? chalk.red(result.requiredPendingCount) : chalk.green(0)}\n`;
        humanMsg += `  Opcionales pendientes: ${chalk.yellow(result.optionalPendingCount)}\n`;
        humanMsg += `  Editable: ${result.editable ? chalk.green('Sí') : chalk.red('No')}\n`;
        if (result.pending.length > 0) {
          humanMsg += `\n  ${chalk.bold('Pendientes:')}\n`;
          result.pending.forEach(f => {
            const req = f.required ? chalk.red('*') : chalk.gray('○');
            humanMsg += `    ${req} ${chalk.bold(f.id)}: ${f.question}\n`;
          });
        }
      }
      handleSuccess(result, humanMsg);
    } catch (err) {
      handleError(err.code || 'GSDC_JSON_PARSE_ERROR', err.message, err.exitCode || 15, err.details || {});
    }
  });

// plan answer
planCmd
  .command('answer')
  .description('Guarda la respuesta de un campo del plan de forma atómica')
  .requiredOption('--id <id>', 'ID del plan secuencial')
  .requiredOption('--field <campo>', 'Nombre del campo a responder')
  .requiredOption('--value <valor>', 'Valor de la respuesta')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const planManager = require('../lib/plan-manager');
      const result = await planManager.answer(options.id, options.field, options.value);
      let humanMsg = '';
      if (!options.json) {
        const chalk = require('chalk');
        humanMsg = chalk.green(`✔ Plan ${options.id}: Campo '${chalk.bold(options.field)}' actualizado a '${chalk.cyan(result.value)}'`);
        if (result.warning) {
          humanMsg += chalk.yellow(` [Advertencia: ${result.warning}]`);
        }
        humanMsg += `\n  Progreso: ${chalk.green(result.filledCount)} completados, ${result.requiredPendingCount} requeridos pendientes`;
      }
      handleSuccess(result, humanMsg);
    } catch (err) {
      handleError(err.code || 'GSDC_INVALID_FIELD', err.message, err.exitCode || 22, err.details || {});
    }
  });

// plan reset-confirmation
planCmd
  .command('reset-confirmation')
  .description('Permite corregir decisiones confirmadas revirtiendo el estado a questions_pending')
  .requiredOption('--id <id>', 'ID del plan secuencial de tres dígitos')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const planManager = require('../lib/plan-manager');
      const result = await planManager.resetConfirmation(options.id);
      let humanMsg = '';
      if (!options.json) {
        const chalk = require('chalk');
        humanMsg = chalk.green(`✔ Plan ${options.id}: Confirmación reseteada. Estado vuelto a questions_pending.`);
        if (result.staleRenameFailed) {
          humanMsg += '\n' + chalk.yellow(`⚠ No se pudo renombrar mockup.html stale: ${result.staleRenameError}`);
        }
      }
      handleSuccess(result, humanMsg);
    } catch (err) {
      handleError(err.code || 'GSDC_INVALID_STATE', err.message, err.exitCode || 13, err.details || {});
    }
  });

// plan confirm-decisions
planCmd
  .command('confirm-decisions')
  .description('Registra la confirmación y congela las decisiones de alineación mediante hash de integridad')
  .requiredOption('--id <id>', 'ID del plan secuencial de tres dígitos (ej: 001)')
  .option('--by <nombre>', 'Nombre del confirmador (ej: user)')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const planManager = require('../lib/plan-manager');
      const result = await planManager.confirmDecisions(options.id, { by: options.by, json: !!options.json });
      handleSuccess(result, `✔ Plan ${options.id}: Confirmación registrada y decisiones congeladas con hash.`);
    } catch (err) {
      handleError(err.code || 'GSDC_QUESTIONS_UNRESOLVED', err.message, err.exitCode || 19, err.details);
    }
  });

// plan resolve-questions
planCmd
  .command('resolve-questions')
  .description('Valida decisiones y protocolo de firma, moviendo el plan a ready_for_html')
  .requiredOption('--id <id>', 'ID del plan secuencial de tres dígitos (ej: 001)')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const planManager = require('../lib/plan-manager');
      const result = await planManager.resolveQuestions(options.id);
      handleSuccess(result, `✔ Plan ${options.id}: Alineación validada criptográficamente. Listo para crear mockup.`);
    } catch (err) {
      handleError(err.code || 'GSDC_QUESTIONS_UNRESOLVED', err.message, err.exitCode || 19, err.details);
    }
  });

// plan submit-mockup
planCmd
  .command('submit-mockup')
  .description('Valida la existencia de mockup.html y el hash criptográfico antes de mover a pending_approval')
  .requiredOption('--id <id>', 'ID del plan secuencial de tres dígitos (ej: 001)')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const planManager = require('../lib/plan-manager');
      const result = await planManager.submitMockup(options.id);
      handleSuccess(result, `✔ Plan ${options.id}: Mockup verificado y enviado para aprobación.`);
    } catch (err) {
      handleError(err.code || 'GSDC_ARTIFACT_MISSING', err.message, err.exitCode || 20, err.details);
    }
  });

// plan approve-mockup
planCmd
  .command('approve-mockup')
  .description('Aprobación de la fase de Mockup y transición a borrador en Canva')
  .requiredOption('--id <id>', 'ID del plan secuencial de tres dígitos (ej: 001)')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const planManager = require('../lib/plan-manager');
      const result = await planManager.transitionState(options.id, 'approve-mockup');
      handleSuccess(result, `✔ Plan ${options.id}: Mockup aprobado. Transicionado a borrador pendiente.`);
    } catch (err) {
      handleError(err.code || 'GSDC_INVALID_STATE', err.message, err.exitCode || 13, err.details);
    }
  });

// plan start-draft
planCmd
  .command('start-draft')
  .description('Inicialización del borrador del plan en Canva')
  .requiredOption('--id <id>', 'ID del plan secuencial de tres dígitos (ej: 001)')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const planManager = require('../lib/plan-manager');
      const result = await planManager.transitionState(options.id, 'start-draft');
      handleSuccess(result, `✔ Plan ${options.id}: Borrador iniciado en Canva.`);
    } catch (err) {
      handleError(err.code || 'GSDC_INVALID_STATE', err.message, err.exitCode || 13, err.details);
    }
  });

// plan approve-draft
planCmd
  .command('approve-draft')
  .description('Aprobación del borrador de Canva y registro de placeholders')
  .requiredOption('--id <id>', 'ID del plan secuencial de tres dígitos (ej: 001)')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const planManager = require('../lib/plan-manager');
      const result = await planManager.transitionState(options.id, 'approve-draft');
      handleSuccess(result, `✔ Plan ${options.id}: Borrador aprobado. Listo para refinamiento.`);
    } catch (err) {
      handleError(err.code || 'GSDC_INVALID_STATE', err.message, err.exitCode || 13, err.details);
    }
  });

// plan start-refine
planCmd
  .command('start-refine')
  .description('Inicialización del ciclo de refinamiento determinista')
  .requiredOption('--id <id>', 'ID del plan secuencial de tres dígitos (ej: 001)')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const planManager = require('../lib/plan-manager');
      const result = await planManager.transitionState(options.id, 'start-refine');
      handleSuccess(result, `✔ Plan ${options.id}: Ciclo de refinamiento iniciado.`);
    } catch (err) {
      handleError(err.code || 'GSDC_INVALID_STATE', err.message, err.exitCode || 13, err.details);
    }
  });

// plan approve-refine
planCmd
  .command('approve-refine')
  .description('Aprobación de refinamientos y transición directa a listo para entrega')
  .requiredOption('--id <id>', 'ID del plan secuencial de tres dígitos (ej: 001)')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const planManager = require('../lib/plan-manager');
      const result = await planManager.transitionState(options.id, 'approve-refine');
      handleSuccess(result, `✔ Plan ${options.id}: Refinamientos aprobados. Listo para entrega de assets.`);
    } catch (err) {
      handleError(err.code || 'GSDC_INVALID_STATE', err.message, err.exitCode || 13, err.details);
    }
  });

// plan deliver
planCmd
  .command('deliver')
  .description('Verificación física de los entregables descargados y cierre del plan')
  .requiredOption('--id <id>', 'ID del plan secuencial de tres dígitos (ej: 001)')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const planManager = require('../lib/plan-manager');
      const result = await planManager.deliver(options.id);
      handleSuccess(result, `✔ Plan ${options.id}: Entregas verificadas con éxito. Plan en estado: DELIVERED.`);
    } catch (err) {
      handleError(
        err.code || 'GSDC_DELIVERY_MISSING',
        err.message,
        err.exitCode || 14,
        err.details
      );
    }
  });

// plan list
planCmd
  .command('list')
  .description('Lista todos los planes locales activos o filtrados por fase')
  .option('--phase <fase>', 'Filtra planes por fase de la máquina de estados')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const planManager = require('../lib/plan-manager');
      const result = await planManager.list({
        phase: options.phase,
        json: !!options.json
      });
      
      let humanMsg = '';
      if (!options.json) {
        const chalk = require('chalk');
        humanMsg = `${chalk.bold('📋 LISTA DE PLANES ACTIVOS:')}\n`;
        if (result.plans.length === 0) {
          humanMsg += '  No se encontraron planes.';
        } else {
          result.plans.forEach(p => {
            humanMsg += `  - ${chalk.yellow(p.id)}: ${chalk.bold(p.name)} [Fase: ${chalk.cyan(p.phase)} | Estado: ${chalk.cyan(p.status)}]\n`;
          });
        }
      }
      handleSuccess(result, humanMsg);
    } catch (err) {
      handleError(
        err.code || 'GSDC_JSON_PARSE_ERROR',
        err.message || 'Fallo al listar los planes.',
        err.exitCode || 15,
        err.details || {}
      );
    }
  });

// plan status
planCmd
  .command('status')
  .description('Muestra el estado detallado de un plan secuencial específico')
  .requiredOption('--id <id>', 'ID del plan secuencial de tres dígitos (ej: 001)')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const planManager = require('../lib/plan-manager');
      const result = await planManager.status(options.id);
      
      let humanMsg = '';
      if (!options.json) {
        const chalk = require('chalk');
        humanMsg = `
${chalk.bold.yellow('📊 ESTADO DEL PLAN ' + options.id)}
  - Nombre: ${chalk.bold(result.plan.name)}
  - Fase actual: ${chalk.cyan(result.plan.phase)}
  - Estado de la fase: ${chalk.cyan(result.plan.status)}
  - ID Canva: ${result.plan.canvaDesignId || chalk.gray('N/A')}
  - Creado: ${result.plan.timestamps.created}
  - Actualizado: ${result.plan.timestamps.updated}
`;
      }
      handleSuccess(result, humanMsg);
    } catch (err) {
      handleError(
        err.code || 'GSDC_JSON_PARSE_ERROR',
        err.message || 'Fallo al obtener estado del plan.',
        err.exitCode || 15,
        err.details || {}
      );
    }
  });

// ==========================================
// GRUPO DE COMANDOS: gesso
// ==========================================
const gessoCmd = program.command('gesso').description('Gestiona lienzos de Gesso / Lienzo en Blanco');

// gesso create
gessoCmd
  .command('create')
  .description('Crea un nuevo lienzo en lienzos/')
  .requiredOption('--name <nombre>', 'Nombre descriptivo del lienzo')
  .requiredOption('--methodology <metodologia>', 'Metodología de exploración creativa')
  .requiredOption('--language <idioma>', 'Idioma de la conversación (es, en, it)')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const gessoManager = require('../lib/gesso-manager');
      const result = await gessoManager.create({
        name: options.name,
        methodology: options.methodology,
        language: options.language,
        json: !!options.json
      });
      let humanMsg = '';
      if (!options.json) {
        const chalk = require('chalk');
        humanMsg = chalk.green(`✔ Lienzo `) + chalk.bold(result.lienzoId) + chalk.green(` creado con éxito en: `) + chalk.cyan(result.lienzoDir);
      }
      handleSuccess(result, humanMsg);
    } catch (err) {
      handleError(
        err.code || 'GSDC_GESSO_INVALID_STATE',
        err.message || 'Fallo al crear el lienzo.',
        err.exitCode || 32,
        err.details || {}
      );
    }
  });

// gesso status
gessoCmd
  .command('status')
  .description('Muestra el estado detallado de un lienzo específico')
  .requiredOption('--id <id>', 'ID del lienzo de tres dígitos (ej: 001)')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const gessoManager = require('../lib/gesso-manager');
      const result = await gessoManager.status(options.id);
      let humanMsg = '';
      if (!options.json) {
        const chalk = require('chalk');
        humanMsg = `
${chalk.bold.yellow('📊 ESTADO DEL LIENZO ' + options.id)}
  - Nombre: ${chalk.bold(result.lienzo.name)}
  - Fase actual: ${chalk.cyan(result.lienzo.phase)}
  - Estado: ${chalk.cyan(result.lienzo.status)}
  - Metodología: ${result.lienzo.methodology}
  - Idioma: ${result.lienzo.language}
  - Creado: ${result.lienzo.timestamps.created}
  - Actualizado: ${result.lienzo.timestamps.updated}
`;
      }
      handleSuccess(result, humanMsg);
    } catch (err) {
      handleError(
        err.code || 'GSDC_GESSO_NOT_FOUND',
        err.message || 'Fallo al obtener estado del lienzo.',
        err.exitCode || 31,
        err.details || {}
      );
    }
  });

// gesso list
gessoCmd
  .command('list')
  .description('Lista todos los lienzos locales')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const gessoManager = require('../lib/gesso-manager');
      const result = await gessoManager.list({ json: !!options.json });
      let humanMsg = '';
      if (!options.json) {
        const chalk = require('chalk');
        humanMsg = `${chalk.bold('🎨 LISTA DE LIENZOS:')}\n`;
        if (result.lienzos.length === 0) {
          humanMsg += '  No se encontraron lienzos.';
        } else {
          result.lienzos.forEach(l => {
            humanMsg += `  - ${chalk.yellow(l.id)}: ${chalk.bold(l.name)} [Fase: ${chalk.cyan(l.phase)} | Estado: ${chalk.cyan(l.status)} | ${l.methodology} | ${l.language}]\n`;
          });
        }
      }
      handleSuccess(result, humanMsg);
    } catch (err) {
      handleError(
        err.code || 'GSDC_JSON_PARSE_ERROR',
        err.message || 'Fallo al listar los lienzos.',
        err.exitCode || 15,
        err.details || {}
      );
    }
  });

// gesso append-turn
gessoCmd
  .command('append-turn')
  .description('Registra un turno conversacional en la sesión del lienzo')
  .requiredOption('--id <id>', 'ID del lienzo de tres dígitos')
  .requiredOption('--role <rol>', 'Rol del turno (user, assistant, system)')
  .requiredOption('--content <contenido>', 'Contenido del turno')
  .option('--tags <tags>', 'Etiquetas opcionales separadas por coma')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const gessoManager = require('../lib/gesso-manager');
      const tags = options.tags ? options.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
      const result = await gessoManager.appendTurn(options.id, options.role, options.content, tags);
      let humanMsg = '';
      if (!options.json) {
        const chalk = require('chalk');
        humanMsg = chalk.green(`✔ Lienzo ${options.id}: Turno #${result.turnCount} agregado con rol '${chalk.bold(options.role)}'`);
      }
      handleSuccess(result, humanMsg);
    } catch (err) {
      handleError(
        err.code || 'GSDC_GESSO_INVALID_STATE',
        err.message || 'Fallo al agregar turno al lienzo.',
        err.exitCode || 32,
        err.details || {}
      );
    }
  });

// gesso update-notes
gessoCmd
  .command('update-notes')
  .description('Actualiza una nota de trabajo estructurada del lienzo')
  .requiredOption('--id <id>', 'ID del lienzo de tres dígitos')
  .requiredOption('--field <campo>', 'Nombre del campo de notas a actualizar')
  .requiredOption('--value <valor>', 'Valor de la nota')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const gessoManager = require('../lib/gesso-manager');
      const result = await gessoManager.updateNotes(options.id, options.field, options.value);
      let humanMsg = '';
      if (!options.json) {
        const chalk = require('chalk');
        humanMsg = chalk.green(`✔ Lienzo ${options.id}: Nota '${chalk.bold(options.field)}' actualizada.`);
      }
      handleSuccess(result, humanMsg);
    } catch (err) {
      handleError(
        err.code || 'GSDC_GESSO_INVALID_STATE',
        err.message || 'Fallo al actualizar notas del lienzo.',
        err.exitCode || 32,
        err.details || {}
      );
    }
  });

// ==========================================
// GRUPO DE COMANDOS: template
// ==========================================
const templateCmd = program.command('template').description('Gestiona las plantillas registradas en el sistema');

// template register
templateCmd
  .command('register')
  .description('Registra un diseño de Canva con sus placeholders en system_templates.json')
  .requiredOption('--id <canvaId>', 'ID de diseño de Canva')
  .requiredOption('--name <nombre>', 'Nombre descriptivo de la plantilla')
  .requiredOption('--plan <planId>', 'ID de tres dígitos del plan asociado (ej: 001)')
  .option('--json', 'Salida estructurada en JSON puro')
  .action(async (options) => {
    try {
      const templateCatalog = require('../lib/template-catalog');
      const result = await templateCatalog.register({
        id: options.id,
        name: options.name,
        planId: options.plan,
        json: !!options.json
      });
      
      let humanMsg = '';
      if (!options.json) {
        const chalk = require('chalk');
        humanMsg = chalk.green(`✔ Plantilla `) + chalk.bold(options.name) + chalk.green(` con ID `) + chalk.bold(options.id) + chalk.green(` registrada con éxito.`);
      }
      handleSuccess(result, humanMsg);
    } catch (err) {
      handleError(
        err.code || 'GSDC_JSON_PARSE_ERROR',
        err.message || 'Fallo al registrar la plantilla en el catálogo.',
        err.exitCode || 15,
        err.details || {}
      );
    }
  });

// Parsear argumentos de la consola
program.parse(process.argv);
