# Walkthrough: Bucle de Discusión, Criptografía y Yield Gate Auditable (Fase 1 Mockup - Rev. 16 Final)

He completado e implementado con éxito absoluto la especificación de la **Rev. 16 del Yield Gate de Discusión** en `gsd-canva`. Esta mejora transforma el Yield Gate de una mera regla de comportamiento del agente en una **barrera dura, programática y auditable criptográficamente** controlada por el CLI y los archivos físicos de estado.

---

## 🛠 Cambios Implementados

### 1. Robustez en la Máquina de Estados (`plan.json`)
Dividimos y protocolizamos la fase de mockup en el gestor de planes para incorporar los estados transaccionales precisos:
*   `mockup:questions_pending` (Estado Inicial): El plan inicia bloqueado mientras se formulan y discuten las preguntas.
*   `mockup:ready_for_html`: Alcanzado tras el comando de resolución una vez verificado el protocolo. Habilita al agente a codificar `mockup.html`.
*   `mockup:pending_approval`: El agente subió el boceto físico para revisión del usuario.
*   `mockup:approved`: Mockup aprobado formalmente. Habilita la transición formal a `draft:pending`.

### 2. Criptografía e Integridad vía `decisions.json`
*   **Decisiones Estructuradas**: Introdujimos un archivo `decisions.json` en cada plan secuencial para almacenar de forma rígida los 6 campos estéticos (vertical, audiencia, formato, paleta, copy, cta) y un objeto de confirmación de auditoría.
*   **Hash Criptográfico de Integridad**: El comando `confirm-decisions` genera un hash SHA-256 a partir de una serialización canónica estricta de las decisiones normalizadas mediante Unicode `normalize('NFC')` sensible a mayúsculas y minúsculas:
    ```js
    const payload = JSON.stringify({
      vertical: normalize(vertical),
      audiencia: normalize(audiencia),
      formato: normalize(formato),
      paleta: normalize(paleta),
      copy: normalize(copy),
      cta: normalize(cta)
    });
    ```
*   **Detección de Tampering (Alteración)**: Tanto `resolve-questions` como `submit-mockup` recalculan y contrastan el hash en tiempo real. Si detectan que un solo carácter cambió después de la confirmación explícita del usuario, abortan lanzando el nuevo error `GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION` (Exit Code `21`).

### 3. Nuevos Comandos en el CLI de `gsd-canva`
*   `gsd-canva plan confirm-decisions --id <id> [--by <nombre>]`: Registra la confirmación y congela las decisiones de alineación mediante hash de integridad. Solo ejecutable en `questions_pending` y repetible mientras el plan esté en ese estado.
*   `gsd-canva plan resolve-questions --id <id>`: Valida la completitud y placeholders de `decisions.json`, comprueba la confirmación y verifica el hash. Transiciona a `ready_for_html`.
*   `gsd-canva plan submit-mockup --id <id>`: Valida existencia y tamaño de `mockup.html` (arroja error `GSDC_ARTIFACT_MISSING` si falta) y re-verifica el hash de integridad. Transiciona a `pending_approval`.

---

## 🧪 Pruebas de Calidad e Integridad de la Suite

La suite de pruebas automatizadas locales (`node tests/run.js`) se ejecutó exitosamente con **100% de aprobaciones**, cubriendo todos los escenarios críticos de la máquina de estados, colisiones, placeholders, tampering criptográfico y artefactos faltantes:

```text
==================================================
🧪 INICIANDO SUITE DE PRUEBAS DE GSD-CANVA (FASE 1)
==================================================

--- 1. Pruebas de Instalador e Integridad ---
  - Test 1: Ejecutando init limpio...
  - Test 2: Idempotencia de init...
  - Test 3: Conflicto ante modificación local...
  - Test 4: Sobrescritura con --force-all...
  - Test 5: Actualización controlada (upgrade) con respaldo fechado...
  - Test 6: Diagnóstico y validación estructural (doctor)...
🟢 Pruebas de Instalador completadas con éxito.

--- 2. Pruebas de Máquina de Estados y Concurrencia ---
  - Test 1: Creando planes e inicializando decisiones...
  - Test 2: Validación de placeholders e intentos ilegales de resolución...
  - Test 3: Confirmación de decisiones y validación del hash criptográfico...
  - Test 4: Detección de tampering antes de resolver preguntas...
  - Test 5: Validación de artefactos faltantes y tampering en submit-mockup...
  - Test 6: Aprobación de mockup y desacoplamiento de borrador...
  - Test 7: Registro técnico en system_templates.json...
🟢 Pruebas de Planes y Lockfile completadas con éxito.

==================================================
🎉 ¡TODAS LAS PRUEBAS PASARON EXITOSAMENTE!
```

---

## 🚀 Flujo de Trabajo para el Agente e Interacción en el Chat

Con este nuevo sistema, la interacción en la fase de mockup se regirá bajo un protocolo riguroso:

1.  **Levantamiento inicial**:
    El agente crea el plan (`gsd-canva plan create`) e investiga. Rellena los datos conocidos en `decisions.json` y formula las preguntas faltantes en `preguntas.md`.
2.  **Yield Gate**:
    El agente presenta en el chat el resumen estético de las decisiones propuestas y pide confirmación explícita. **Detiene su generación de inmediato**.
3.  **Confirmación**:
    Tú respondes confirmando el diseño.
4.  **Congelamiento y Transición**:
    *   El agente ejecuta:
        ```bash
        gsd-canva plan confirm-decisions --id 001
        ```
    *   El agente ejecuta la transición de estado:
        ```bash
        gsd-canva plan resolve-questions --id 001
        ```
5.  **Codificación del Mockup**:
    Solo ahora el plan está en `mockup:ready_for_html`. El agente diseña `mockup.html`.
6.  **Entrega y Cierre**:
    *   El agente ejecuta `gsd-canva plan submit-mockup --id 001` para certificar la existencia del archivo físico y verificar la integridad del hash.
    *   Te presenta el boceto en el chat.
    *   Una vez que estés conforme, ejecutas o el agente ejecuta:
        ```bash
        gsd-canva plan approve-mockup --id 001
        ```
