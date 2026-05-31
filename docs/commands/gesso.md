# Slash Command: gesso / Lienzo en Blanco

Gestión determinista de la Fase 0 de Sinopia: el Lienzo en Blanco.

Este documento es la referencia canónica de todos los subcomandos disponibles bajo `gsd-canva gesso`. Los aliases públicos (`/lienzo-en-blanco`, `/blank-canvas`, `/tela-bianca`, `/gesso`, `/canva-blank-canvas`) convergen en esta misma capacidad conceptual.

## Resumen de Subcomandos

| Subcomando | Propósito |
| :--- | :--- |
| `gesso create` | Crear un nuevo lienzo en blanco |
| `gesso status` | Consultar estado de un lienzo |
| `gesso list` | Listar todos los lienzos |
| `gesso append-turn` | Registrar un turno conversacional |
| `gesso update-notes` | Actualizar notas de trabajo estructuradas |
| `gesso write` | Escribir o reemplazar `gesso.md` |
| `gesso confirm` | Congelar y aprobar el Gesso |
| `gesso verify` | Verificar integridad del Gesso confirmado |
| `gesso link-plan` | Vincular lienzo aprobado a un plan de mockup |
| `gesso archive` | Archivar un lienzo |

---

## `gesso create`

Crea un nuevo lienzo en blanco con la metodología e idioma especificados. Asigna un ID secuencial de tres dígitos independiente de `canva-plans/`.

```bash
gsd-canva gesso create --name "Mi Cafe" --methodology socratic --language es --json
```

### Opciones

| Opción | Requerida | Descripción |
| :--- | :--- | :--- |
| `--name <name>` | Sí | Nombre del lienzo. Se usa para generar el slug de la carpeta. |
| `--methodology <methodology>` | Sí | Metodología de conversación. Valores: `socratic`, `creative_brief`, `jobs_to_be_done`, `design_thinking`, `5w1h`. |
| `--language <language>` | Sí | Idioma de la conversación. Valores: `es`, `en`, `it`. |
| `--json` | No | Salida en JSON puro sin formato humano. |

### JSON de salida

```json
{
  "lienzoId": "001",
  "lienzoDir": "lienzos/lienzo_001_mi-cafe",
  "lienzo": {
    "id": "001",
    "name": "Mi Cafe",
    "slug": "mi-cafe",
    "phase": "gesso",
    "status": "en_blanco",
    "methodology": "socratic",
    "language": "es",
    "linkedPlanId": null,
    "timestamps": {
      "created": "2026-05-31T00:00:00.000Z",
      "updated": "2026-05-31T00:00:00.000Z",
      "approved": null
    },
    "confirmation": {
      "confirmed": false,
      "confirmedAt": null,
      "confirmedBy": null,
      "source": "chat",
      "hashAlgorithm": "sha256-gesso-v1",
      "gessoHash": ""
    },
    "history": [
      {
        "timestamp": "2026-05-31T00:00:00.000Z",
        "action": "created",
        "details": "Lienzo inicializado"
      }
    ]
  }
}
```

### Códigos de error

| Código | Exit | Condición |
| :--- | ---: | :--- |
| `GSDC_INVALID_FIELD` | 22 | `--name`, `--methodology` o `--language` ausente o inválido. |
| `GSDC_GESSO_INVALID_STATE` | 32 | Se alcanzó el límite de 999 lienzos. |

---

## `gesso status`

Consulta el estado y metadata de un lienzo específico.

```bash
gsd-canva gesso status --id 001 --json
```

### Opciones

| Opción | Requerida | Descripción |
| :--- | :--- | :--- |
| `--id <id>` | Sí | ID de tres dígitos del lienzo. |
| `--json` | No | Salida en JSON puro. |

### JSON de salida

```json
{
  "lienzoId": "001",
  "lienzoDir": "lienzos/lienzo_001_mi-cafe",
  "lienzo": {
    "id": "001",
    "name": "Mi Cafe",
    "phase": "gesso",
    "status": "gesso_listo",
    "confirmation": {
      "confirmed": true,
      "gessoHash": "a1b2c3d4..."
    }
  }
}
```

### Códigos de error

| Código | Exit | Condición |
| :--- | ---: | :--- |
| `GSDC_GESSO_NOT_FOUND` | 31 | No existe el lienzo con ese ID. |

---

## `gesso list`

Lista todos los lienzos registrados en el proyecto.

```bash
gsd-canva gesso list --json
```

### Opciones

| Opción | Requerida | Descripción |
| :--- | :--- | :--- |
| `--json` | No | Salida en JSON puro. |

### JSON de salida

```json
{
  "lienzos": [
    {
      "id": "001",
      "name": "Mi Cafe",
      "phase": "gesso",
      "status": "gesso_listo",
      "methodology": "socratic",
      "language": "es",
      "linkedPlanId": null
    },
    {
      "id": "002",
      "name": "Landing Page",
      "phase": "gesso",
      "status": "en_blanco",
      "methodology": "design_thinking",
      "language": "en",
      "linkedPlanId": null
    }
  ]
}
```

---

## `gesso append-turn`

Registra un turno conversacional en `sesion.json` sin editar manualmente el archivo.

```bash
gsd-canva gesso append-turn --id 001 --role user --content "Quiero un café de barrio acogedor" --tags initial_prompt --json
```

### Opciones

| Opción | Requerida | Descripción |
| :--- | :--- | :--- |
| `--id <id>` | Sí | ID de tres dígitos del lienzo. |
| `--role <role>` | Sí | Rol del turno. Valores: `user`, `assistant`, `system`. |
| `--content <content>` | Sí | Contenido textual del turno. |
| `--tags <tag>` | No | Etiquetas separadas por coma para clasificar el turno. |
| `--json` | No | Salida en JSON puro. |

### JSON de salida

```json
{
  "lienzoId": "001",
  "turn": {
    "timestamp": "2026-05-31T00:05:00.000Z",
    "role": "user",
    "content": "Quiero un café de barrio acogedor",
    "tags": ["initial_prompt"]
  },
  "turnCount": 3,
  "lienzo": { "status": "en_blanco", "..." : "..." }
}
```

### Códigos de error

| Código | Exit | Condición |
| :--- | ---: | :--- |
| `GSDC_INVALID_FIELD` | 22 | `--role` inválido. |
| `GSDC_GESSO_NOT_FOUND` | 31 | No existe el lienzo con ese ID. |
| `GSDC_GESSO_INVALID_STATE` | 32 | El lienzo no está en estado `en_blanco` (no editable). |

---

## `gesso update-notes`

Actualiza una nota de trabajo estructurada durante la conversación.

```bash
gsd-canva gesso update-notes --id 001 --field tone --value "Cálido, cercano, artesanal" --json
```

### Opciones

| Opción | Requerida | Descripción |
| :--- | :--- | :--- |
| `--id <id>` | Sí | ID de tres dígitos del lienzo. |
| `--field <field>` | Sí | Campo de nota a actualizar. Valores: `idea`, `audience`, `tone`, `layout`, `context`, `constraints`, `mandatoryElements`, `discardedDirections`. |
| `--value <value>` | Sí | Nuevo valor para el campo. |
| `--json` | No | Salida en JSON puro. |

### JSON de salida

```json
{
  "lienzoId": "001",
  "field": "tone",
  "value": "Cálido, cercano, artesanal",
  "lienzo": { "status": "en_blanco", "..." : "..." }
}
```

### Códigos de error

| Código | Exit | Condición |
| :--- | ---: | :--- |
| `GSDC_INVALID_FIELD` | 22 | `--field` no es un campo de notas válido. |
| `GSDC_GESSO_NOT_FOUND` | 31 | No existe el lienzo con ese ID. |
| `GSDC_GESSO_INVALID_STATE` | 32 | El lienzo no está en estado `en_blanco`. |

---

## `gesso write`

Escribe o reemplaza `gesso.md` desde un archivo fuente validado. No equivale a confirmar: el lienzo permanece en `en_blanco`.

```bash
gsd-canva gesso write --id 001 --file /tmp/gesso.md --json
```

### Opciones

| Opción | Requerida | Descripción |
| :--- | :--- | :--- |
| `--id <id>` | Sí | ID de tres dígitos del lienzo. |
| `--file <path>` | Sí | Ruta al archivo Markdown fuente. |
| `--json` | No | Salida en JSON puro. |

### Validaciones

- El archivo fuente debe existir y no estar vacío.
- El contenido debe incluir las 11 secciones requeridas (ver `gesso.md`).
- La validación se aplica al escribir, no al confirmar.

### JSON de salida

```json
{
  "lienzoId": "001",
  "gessoMdPath": "lienzos/lienzo_001_mi-cafe/gesso.md",
  "lienzo": { "status": "en_blanco", "..." : "..." }
}
```

### Códigos de error

| Código | Exit | Condición |
| :--- | ---: | :--- |
| `GSDC_GESSO_ARTIFACT_MISSING` | 33 | El archivo fuente no existe o está vacío. |
| `GSDC_GESSO_INVALID_ARTIFACT` | 34 | El contenido no incluye todas las secciones requeridas. |
| `GSDC_GESSO_NOT_FOUND` | 31 | No existe el lienzo con ese ID. |
| `GSDC_GESSO_INVALID_STATE` | 32 | El lienzo no está en estado `en_blanco`. |

---

## `gesso confirm`

Valida `gesso.md`, calcula el hash de integridad `sha256-gesso-v1` y congela el Gesso. Transiciona el estado de `en_blanco` a `gesso_listo`.

```bash
gsd-canva gesso confirm --id 001 --by user --json
```

### Opciones

| Opción | Requerida | Descripción |
| :--- | :--- | :--- |
| `--id <id>` | Sí | ID de tres dígitos del lienzo. |
| `--by <by>` | Sí | Quién confirma. Normalmente `user`. |
| `--json` | No | Salida en JSON puro. |

### Validaciones

- `gesso.md` debe existir, no estar vacío y no contener placeholders.
- Debe contener las 11 secciones requeridas.
- El lienzo debe estar en estado `en_blanco`.

### JSON de salida

```json
{
  "lienzoId": "001",
  "confirmed": true,
  "confirmedAt": "2026-05-31T00:10:00.000Z",
  "confirmedBy": "user",
  "gessoHash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "lienzo": {
    "status": "gesso_listo",
    "confirmation": {
      "confirmed": true,
      "confirmedAt": "2026-05-31T00:10:00.000Z",
      "confirmedBy": "user",
      "hashAlgorithm": "sha256-gesso-v1",
      "gessoHash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
    }
  }
}
```

### Códigos de error

| Código | Exit | Condición |
| :--- | ---: | :--- |
| `GSDC_GESSO_NOT_FOUND` | 31 | No existe el lienzo con ese ID. |
| `GSDC_GESSO_INVALID_STATE` | 32 | El lienzo no está en estado `en_blanco`. |
| `GSDC_GESSO_ARTIFACT_MISSING` | 33 | `gesso.md` no existe o está vacío. |
| `GSDC_GESSO_INVALID_ARTIFACT` | 34 | `gesso.md` contiene placeholders sin resolver o le faltan secciones requeridas. |

---

## `gesso verify`

Verifica que `gesso.md` no haya sido modificado desde la confirmación, recalculando el hash y comparándolo con el almacenado en `lienzo.json`.

```bash
gsd-canva gesso verify --id 001 --json
```

### Opciones

| Opción | Requerida | Descripción |
| :--- | :--- | :--- |
| `--id <id>` | Sí | ID de tres dígitos del lienzo. |
| `--json` | No | Salida en JSON puro. |

### JSON de salida

```json
{
  "lienzoId": "001",
  "verified": true,
  "gessoHash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "hashAlgorithm": "sha256-gesso-v1",
  "lienzo": { "status": "gesso_listo", "..." : "..." }
}
```

### Códigos de error

| Código | Exit | Condición |
| :--- | ---: | :--- |
| `GSDC_GESSO_NOT_FOUND` | 31 | No existe el lienzo con ese ID. |
| `GSDC_GESSO_INVALID_STATE` | 32 | El lienzo no ha sido confirmado aún. |
| `GSDC_GESSO_ARTIFACT_MISSING` | 33 | `gesso.md` no existe. |
| `GSDC_GESSO_CHANGED_AFTER_CONFIRMATION` | 35 | El hash actual no coincide con el hash de confirmación. |

---

## `gesso link-plan`

Vincula un lienzo aprobado (`gesso_listo`) a un plan de mockup existente. Escribe el campo `linkedPlanId` en el lienzo y `sourceLienzoId` en el plan.

```bash
gsd-canva gesso link-plan --id 001 --plan 001 --json
```

### Opciones

| Opción | Requerida | Descripción |
| :--- | :--- | :--- |
| `--id <id>` | Sí | ID de tres dígitos del lienzo. |
| `--plan <planId>` | Sí | ID de tres dígitos del plan de mockup. |
| `--json` | No | Salida en JSON puro. |

### Validaciones

- El lienzo debe estar en estado `gesso_listo`.
- El hash de `gesso.md` debe coincidir con el hash de confirmación.
- El plan debe existir y no estar en estado `delivered`.
- El plan no debe estar ya vinculado a otro lienzo.

### JSON de salida

```json
{
  "lienzoId": "001",
  "planId": "001",
  "linked": true,
  "lienzo": {
    "status": "con_mockup",
    "linkedPlanId": "001"
  },
  "plan": {
    "status": "questions_pending",
    "sourceLienzoId": "001"
  }
}
```

### Idempotencia

Si el lienzo ya estaba vinculado al mismo plan, el comando retorna éxito con `idempotent: true`. Si el plan carece del back-link (`sourceLienzoId`), lo repara automáticamente (crash-recovery).

### Códigos de error

| Código | Exit | Condición |
| :--- | ---: | :--- |
| `GSDC_GESSO_NOT_FOUND` | 31 | No existe el lienzo con ese ID. |
| `GSDC_GESSO_INVALID_STATE` | 32 | El lienzo no está en `gesso_listo` o no tiene confirmación válida. |
| `GSDC_GESSO_ARTIFACT_MISSING` | 33 | `gesso.md` no existe. |
| `GSDC_GESSO_CHANGED_AFTER_CONFIRMATION` | 35 | Hash de `gesso.md` no coincide. |
| `GSDC_GESSO_LINK_FAILED` | 36 | El plan no existe, ya está entregado, o ya está vinculado a otro lienzo. |

---

## `gesso archive`

Archiva un lienzo. Solo puede archivarse si está en estado `gesso_listo`.

```bash
gsd-canva gesso archive --id 001 --json
```

### Opciones

| Opción | Requerida | Descripción |
| :--- | :--- | :--- |
| `--id <id>` | Sí | ID de tres dígitos del lienzo. |
| `--json` | No | Salida en JSON puro. |

### JSON de salida

```json
{
  "lienzoId": "001",
  "archived": true,
  "lienzo": { "status": "archivado", "..." : "..." }
}
```

### Códigos de error

| Código | Exit | Condición |
| :--- | ---: | :--- |
| `GSDC_GESSO_NOT_FOUND` | 31 | No existe el lienzo con ese ID. |
| `GSDC_GESSO_INVALID_STATE` | 32 | El lienzo no está en un estado que permita archivado. |

---

## Flujo Típico Completo

```bash
# 1. Inicializar el proyecto
gsd-canva init

# 2. Crear un lienzo en blanco
gsd-canva gesso create --name "Cafe de Barrio" --methodology socratic --language es --json

# 3. Registrar turnos conversacionales
gsd-canva gesso append-turn --id 001 --role user \
  --content "Quiero un café de barrio acogedor, con enfoque artesanal" \
  --tags initial_prompt --json

gsd-canva gesso append-turn --id 001 --role assistant \
  --content "¿Qué sensación debe transmitir el espacio?" \
  --tags methodology_question --json

gsd-canva gesso append-turn --id 001 --role user \
  --content "Calidez, cercanía, autenticidad. Nada de frialdad minimalista." \
  --tags creative_direction --json

# 4. Actualizar notas de trabajo
gsd-canva gesso update-notes --id 001 --field tone --value "Cálido, cercano, artesanal" --json
gsd-canva gesso update-notes --id 001 --field audience --value "Vecinos del barrio, 25-60 años" --json

# 5. Escribir el Gesso completo
gsd-canva gesso write --id 001 --file /tmp/gesso-cafe.md --json

# 6. Confirmar → congela con hash de integridad
gsd-canva gesso confirm --id 001 --by user --json

# 7. Verificar integridad
gsd-canva gesso verify --id 001 --json

# 8. Crear plan de mockup (independiente)
gsd-canva plan create --name "Cafe de Barrio" --json

# 9. Vincular lienzo aprobado al plan
gsd-canva gesso link-plan --id 001 --plan 001 --json

# 10. Continuar con preguntas del plan normalmente
gsd-canva plan questions --id 001 --json
```

### Notas del flujo

- **Gesso es opcional**: se puede crear un plan con `gsd-canva plan create` sin haber creado un lienzo previamente.
- **El plan conserva su propia máquina de estados**: `questions_pending` → `ready_for_html` → `pending_approval` → `delivered`.
- **Gesso no autopobla `decisions.json`**: cada campo de decisión se responde explícitamente con `plan answer`.
- **Después del vínculo**, el plan registra `sourceLienzoId` en `plan.json` para trazabilidad bidireccional.

---

## Catálogo de Errores Gesso

| Código | Exit | Descripción |
| :--- | ---: | :--- |
| `GSDC_GESSO_NOT_FOUND` | 31 | No existe el lienzo solicitado. |
| `GSDC_GESSO_INVALID_STATE` | 32 | Transición ilegal de estado. |
| `GSDC_GESSO_ARTIFACT_MISSING` | 33 | Falta `gesso.md` o está vacío. |
| `GSDC_GESSO_INVALID_ARTIFACT` | 34 | `gesso.md` no cumple el contrato mínimo. |
| `GSDC_GESSO_CHANGED_AFTER_CONFIRMATION` | 35 | Hash de `gesso.md` no coincide con la confirmación. |
| `GSDC_GESSO_LINK_FAILED` | 36 | No se pudo vincular con un plan. |

---

## Véase También

- [Guía de usuario: Gesso / Lienzo en Blanco](../guides/gesso_lienzo_en_blanco.md)
- [Modelo de estados para developers](../developer/gesso_state_model.md)
- [Propuesta v1.5](../PROPOSAL_v1.5_gesso_lienzo_en_blanco_implementation_plan.md)
