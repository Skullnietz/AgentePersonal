# AgentePersonal — Documentación del Proyecto

> Asistente personal multi-módulo para finanzas, vida personal y vida laboral vía Telegram.

---

## Resumen del Proyecto

AgentePersonal es un bot de Telegram que actúa como agente personal. Utiliza Google Gemini AI para comprensión de lenguaje natural, visión, audio y documentos. Permite registrar gastos, consultar finanzas, gestionar tarjetas y préstamos, crear bitácoras de soporte laboral, y transcribir notas de voz — todo en español con enfoque en México.

Los usuarios interactúan en lenguaje natural (texto, fotos, PDFs, notas de voz) y el agente clasifica la intención, extrae datos estructurados y ejecuta la acción correspondiente.

**Stack tecnológico:** Node.js · Telegram Bot API · Google Gemini AI · MySQL · PM2

---

## Arquitectura General

```
Usuario (Telegram)
      │
      ▼
  src/bot.js (entrada Telegram, /start, /help)
      │
      ▼
  src/router.js (clasifica intención via Gemini)
      │
      ├── texto ───────► routeTextMessage() ──► switch(intent)
      ├── voz/audio ───► audioHandler ──► transcribeAudio ──► routeTextMessage()
      ├── foto ────────► photoHandler ──► analyzeImage ──► registrar gasto(s)
      ├── documento ───► documentHandler ──► analyzeDocument ──► registrar gasto(s)
      │
      ▼
  Handlers ──► Services ──► MySQL
```

### Flujo de Audio (nuevo)

1. Usuario envía nota de voz o archivo de audio.
2. `audioHandler` descarga el archivo desde Telegram.
3. Gemini transcribe el audio con glosario personal (`transcribeAudio`).
4. Se normaliza la transcripción (reemplazos configurables).
5. Si la confianza es baja, se pide confirmación al usuario.
6. La transcripción se inyecta como texto y se enruta por `routeTextMessage`.
7. El router clasifica la intención y despacha al handler correspondiente.

---

## Módulos Funcionales

### 1. Finanzas Personales

| Función | Entrada | Handler | Detalle |
|---|---|---|---|
| Registrar gasto | Texto, foto, PDF, audio | `textHandler`, `photoHandler`, `documentHandler`, `audioHandler` → `textHandler` | Extrae monto, categoría, comerciante, fecha, tarjeta |
| Consultar finanzas | Texto | `queryService` | Análisis contextual con datos reales de la DB |
| Listar gastos | Texto | `expenseManager` | Muestra últimos 15 gastos con IDs |
| Borrar gasto | Texto | `expenseManager` | Por ID, descripción o "último" |
| Gastos recurrentes | Texto | `recurringHandler` | Alta y listado de gastos fijos mensuales |

### 2. Tarjetas

| Función | Entrada | Detalle |
|---|---|---|
| Agregar tarjeta | Texto | Nombre, tipo, banco, últimos 4 dígitos, límite, saldo, día de corte, día de pago |
| Actualizar tarjeta | Texto | Saldo, límite u otros campos por nombre |
| Listar tarjetas | Texto | Barra de utilización, saldo, resumen mensual |

### 3. Préstamos

| Función | Entrada | Detalle |
|---|---|---|
| Agregar préstamo | Texto | Tipo, prestamista, monto original, pagos, tasas, fechas |
| Registrar pago | Texto | Actualiza saldo y número de pagos; auto-desactiva si se liquida |
| Listar préstamos | Texto | Barra de progreso, totales |

### 4. Bitácora de Soporte Laboral

| Función | Entrada | Detalle |
|---|---|---|
| Crear soporte | Texto / Audio | Ticket auto-incremental, solicitante, equipo, ubicación, tipo de servicio, canal, responsable |
| Listar soportes | Texto | Últimos 10 con íconos de estado |
| Actualizar soporte | Texto | Cambia estado, observaciones u otros campos |
| Exportar bitácora | Texto | Genera Excel (xlsx) con plantilla y envía por Telegram y/o correo SMTP |

### 5. Audio General

| Función | Entrada | Detalle |
|---|---|---|
| Transcribir audio | Voz / archivo audio | Gemini transcribe con glosario personal |
| Normalizar texto | Transcripción | Reemplazos configurables (e.g., "coely" → "Coeli") |
| Confirmar si dudoso | Transcripción de baja confianza | Pide al usuario reenviar o corregir |

---

## Estructura de Archivos

```
AgentePersonal/
├── .env.example                          # Variables de entorno (plantilla)
├── .gitignore
├── ecosystem.config.js                   # Configuración PM2
├── package.json
├── sql/
│   ├── init.sql                          # v1: DB, expenses, categories
│   ├── upgrade_v2.sql                    # v2: cards, loans, loan_payments, recurring_expenses
│   └── upgrade_v3.sql                    # v3: support_logs
└── src/
    ├── index.js                          # Punto de entrada
    ├── bot.js                            # Setup del bot Telegram
    ├── router.js                         # Enrutamiento por intención
    ├── handlers/
    │   ├── audioHandler.js               # Transcripción de voz/audio → router
    │   ├── cardHandler.js                # CRUD de tarjetas
    │   ├── documentHandler.js            # PDFs e imágenes como gastos
    │   ├── expenseManager.js             # Listar y borrar gastos
    │   ├── loanHandler.js                # CRUD de préstamos
    │   ├── photoHandler.js               # Fotos de tickets → gastos
    │   ├── recurringHandler.js           # Gastos recurrentes
    │   ├── supportLogHandler.js          # Bitácora de soporte
    │   └── textHandler.js                # Gastos desde texto
    ├── prompts/
    │   ├── expensePrompt.js              # Prompts de gastos e intención
    │   ├── queryPrompt.js                # Prompt de asesor financiero
    │   └── supportLogPrompt.js           # Prompts de soporte laboral
    ├── services/
    │   ├── dbService.js                  # Pool MySQL genérico
    │   ├── financialContext.js            # Constructor de contexto financiero
    │   ├── geminiService.js              # Cliente Gemini con fallback de modelos
    │   ├── queryService.js               # Consultas financieras con contexto
    │   └── supportLogExportService.js    # Exportar Excel + correo SMTP
    └── utils/
        ├── formatters.js                 # Formateo de mensajes, íconos, saludo
        └── validators.js                 # Validación de gastos y control de acceso
```

---

## Base de Datos (MySQL)

### Tablas

| Tabla | Versión | Descripción |
|---|---|---|
| `categories` | v1 | Categorías de gasto (10 categorías seed) |
| `expenses` | v1 | Gastos registrados con montos, categorías, comerciante, fecha, tarjeta |
| `cards` | v2 | Tarjetas de crédito/débito con límites, saldos y días de pago |
| `loans` | v2 | Préstamos con plazos, tasas y progreso de pagos |
| `loan_payments` | v2 | Historial de pagos de préstamos |
| `recurring_expenses` | v2 | Gastos fijos mensuales (Netflix, renta, etc.) |
| `support_logs` | v3 | Bitácora de soporte con ticket, solicitante, equipo, estado, canal |

### Categorías de Gasto

| # | Categoría | Ícono |
|---|---|---|
| 1 | Alimentación | 🍔 |
| 2 | Transporte | 🚗 |
| 3 | Entretenimiento | 🎮 |
| 4 | Salud | 💊 |
| 5 | Educación | 📚 |
| 6 | Hogar | 🏠 |
| 7 | Servicios | 💡 |
| 8 | Ropa | 👕 |
| 9 | Regalos | 🎁 |
| 10 | Otros | 📦 |

---

## Configuración de Variables de Entorno

### Telegram

| Variable | Descripción | Ejemplo |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Token del bot desde @BotFather | `123456:ABC-DEF...` |

### Gemini AI

| Variable | Descripción | Default |
|---|---|---|
| `GEMINI_API_KEY` | API key de Google AI Studio | — |
| `GEMINI_MODEL` | Modelo principal | `gemini-2.5-flash-lite` |
| `GEMINI_MAX_OUTPUT_TOKENS` | Tokens máximos para texto | `500` |
| `GEMINI_MAX_OUTPUT_TOKENS_MULTIMODAL` | Tokens máximos para imagen/documento | `700` |
| `GEMINI_TRANSCRIPTION_MAX_OUTPUT_TOKENS` | Tokens máximos para transcripción de audio | `350` |
| `GEMINI_TEMPERATURE` | Temperatura de generación (determinismo) | `0.1` |

**Cadena de fallback de modelos:**
1. `GEMINI_MODEL` (el configurado)
2. `gemini-2.5-flash-lite`
3. `gemini-2.5-flash`
4. `gemini-1.5-flash`

### MySQL

| Variable | Descripción | Default |
|---|---|---|
| `MYSQL_HOST` | Host de MySQL | `localhost` |
| `MYSQL_USER` | Usuario de MySQL | `finbot` |
| `MYSQL_PASSWORD` | Contraseña de MySQL | — |
| `MYSQL_DATABASE` | Base de datos | `finbot` |

### Acceso

| Variable | Descripción | Ejemplo |
|---|---|---|
| `ALLOWED_USER_IDS` | IDs de Telegram permitidos (separados por coma). Vacío = todos | `123456789,987654321` |

### Bitácora de Soporte

| Variable | Descripción | Default |
|---|---|---|
| `SUPPORT_DEFAULT_RESPONSIBLE` | Responsable por defecto | `Miguel` |
| `SUPPORT_TICKET_START` | Número inicial de tickets | `1001` |
| `SUPPORT_EXPORT_TEMPLATE_PATH` | Ruta a plantilla Excel | `/home/usuario/app/templates/FO-TI-03 Bitacora de Soporte 2026.xlsx` |
| `SUPPORT_EXPORT_DIR` | Directorio de exportación | `/home/usuario/app/exports/support` |
| `SUPPORT_EXPORT_EMAIL_TO` | Correo destinatario de exportaciones | `correo@ejemplo.com` |

### SMTP (Correo)

| Variable | Descripción | Default |
|---|---|---|
| `SMTP_HOST` | Servidor SMTP | `mail.tudominio.com` |
| `SMTP_PORT` | Puerto SMTP | `465` |
| `SMTP_USER` | Usuario SMTP | `soporte@tudominio.com` |
| `SMTP_PASSWORD` | Contraseña o App Password | — |
| `SMTP_FROM` | Remitente del correo | `soporte@tudominio.com` |

### Audio

| Variable | Descripción | Default |
|---|---|---|
| `AUDIO_MAX_MB` | Tamaño máximo de audio en MB | `8` |
| `AUDIO_GLOSSARY` | Términos del glosario separados por coma | `Coeli Admin,Irapuato,URV,BBVA Oro,Jose Moreno,Miguel` |
| `AUDIO_TRANSCRIPT_REPLACEMENTS` | Reemplazos de transcripción (formato `origen=destino` separados por `\|`) | `coely=Coeli\|irapuatoo=Irapuato` |

---

## Despliegue

### Local (desarrollo)

```bash
npm install
cp .env.example .env     # Editar con valores reales
npm run dev               # nodemon con auto-reload
```

### Producción (PM2)

```bash
npm install
cp .env.example .env     # Editar con valores reales
npx pm2 start ecosystem.config.js
```

**Configuración PM2 (`ecosystem.config.js`):**
- Nombre del proceso: `finbot`
- Script: `src/index.js`
- Instancias: 1
- Max memoria: 200 MB
- Auto-restart: habilitado
- Watch: deshabilitado

### Base de Datos

Ejecutar en orden:
1. `sql/init.sql` → crea DB `finbot` y tablas de gastos
2. `sql/upgrade_v2.sql` → agrega tarjetas, préstamos y gastos recurrentes
3. `sql/upgrade_v3.sql` → agrega bitácora de soporte

---

## Dependencias

| Paquete | Versión | Propósito |
|---|---|---|
| `node-telegram-bot-api` | ^0.67.0 | API de Telegram Bot |
| `@google/generative-ai` | ^0.24.1 | Google Gemini AI |
| `mysql2` | ^3.20.0 | MySQL (promises) |
| `dotenv` | ^17.3.1 | Variables de entorno |
| `nodemailer` | ^8.0.7 | Envío de correo SMTP |
| `xlsx-populate` | ^1.21.0 | Generación de Excel |
| `nodemon` | ^3.1.14 | Dev: auto-reload |

---

## Clasificación de Intenciones

El bot clasifica cada mensaje en una de 18 intenciones mediante Gemini:

| Intención | Módulo | Descripción |
|---|---|---|
| `expense` | Finanzas | Registrar un gasto |
| `query` | Finanzas | Consultar finanzas |
| `card_add` | Tarjetas | Agregar tarjeta |
| `card_update` | Tarjetas | Actualizar tarjeta |
| `card_list` | Tarjetas | Listar tarjetas |
| `loan_add` | Préstamos | Agregar préstamo |
| `loan_payment` | Préstamos | Registrar pago |
| `loan_list` | Préstamos | Listar préstamos |
| `recurring_add` | Recurrentes | Agregar gasto fijo |
| `recurring_list` | Recurrentes | Listar gastos fijos |
| `expense_delete` | Finanzas | Borrar gasto(s) |
| `expense_list` | Finanzas | Listar gastos |
| `support_log_create` | Soporte | Crear registro de soporte |
| `support_log_list` | Soporte | Listar soportes |
| `support_log_update` | Soporte | Actualizar soporte |
| `support_log_export` | Soporte | Exportar bitácora |
| `greeting` | General | Saludo inicial |
| *unknown* | General | No reconocido |

---

## Ejemplos de Uso

### Finanzas

- `"gasté 200 en uber"`
- `"gasté 500 en comida con mi tarjeta BBVA"`
- `"¿cuánto llevo este mes?"`
- `"resumen por categoría"`
- `"mis últimas tarjetas"`
- `"tengo un préstamo de 50000 con Bansi"`
- `"pagué 5000 al préstamo de Bansi"`
- `"gasto fijo Netflix $220"`
- `"borra el último gasto"`

### Soporte Laboral

- `"registra soporte de Jose Moreno en Coeli Admin"`
- `"mis últimos soportes"`
- `"actualiza soporte 1001 como realizado"`
- `"genera bitácora de soporte 2026 por Telegram"`
- `"manda bitácora de soporte 2026 por correo"`

### Audio

- Enviar nota de voz: `"registra soporte de Jose Moreno en Coeli Admin"`
- Enviar nota de voz: `"gasté 200 en Uber"`
- Enviar nota de voz: `"¿cuánto llevo gastando este mes?"`

---

## Configuraciones Pendientes y Próximos Pasos

### Pendiente de Configurar en Producción

| Item | Detalle | Prioridad |
|---|---|---|
| **Plantilla Excel de soporte** | Colocar archivo `FO-TI-03 Bitacora de Soporte 2026.xlsx` en la ruta configurada por `SUPPORT_EXPORT_TEMPLATE_PATH` | Alta |
| **Credenciales SMTP** | Configurar correo real en `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` para envío de bitácoras | Alta |
| **IDs de usuario** | Agregar Telegram user IDs reales en `ALLOWED_USER_IDS` | Alta |
| **Glosario de audio** | Personalizar `AUDIO_GLOSSARY` con términos propios del usuario final | Media |
| **Reemplazos de transcripción** | Ajustar `AUDIO_TRANSCRIPT_REPLACEMENTS` con los errores frecuentes del ASR | Media |
| **Modelo Gemini** | Evaluar si `gemini-2.5-flash-lite` es suficiente o se necesita `gemini-2.5-flash` como default | Baja |
| **Límites de tokens** | Ajustar `GEMINI_MAX_OUTPUT_TOKENS`, `GEMINI_TRANSCRIPTION_MAX_OUTPUT_TOKENS` según uso real | Baja |

### Mejoras y Funcionalidades Futuras

| Mejora | Descripción | Prioridad |
|---|---|---|
| **Auditoría / logs** | Guardar log de transacciones y errores en archivo o DB en lugar de solo `console.log` | Alta |
| **Tests unitarios** | Agregar framework de pruebas (Jest o Mocha) para handlers, validadores y servicios | Alta |
| **Migraciones automáticas** | Ejecutar scripts SQL de upgrade automáticamente al iniciar la app | Media |
| **Health check endpoint** | Agregar endpoint HTTP para monitoreo del estado del bot | Media |
| **Backup de DB** | Script o cron para respaldar la base de datos periódicamente | Media |
| **Internacionalización** | Soporte para inglés u otros idiomas | Baja |
| **Webhook mode** | Cambiar de long-polling a webhook para mayor eficiencia en producción | Baja |
| **Métricas de uso** | Registrar estadísticas de uso por módulo y tipo de interacción | Baja |
| **Rate limiting** | Limitar número de peticiones por usuario para evitar abuso | Media |
| **Multi-usuario real** | Migrar de `ALLOWED_USER_IDS` a sistema de autenticación más robusto | Media |

### Decisión de Arquitectura

| Decisión | Estado | Notas |
|---|---|---|
| Long-polling vs Webhook | Long-polling activo | Webhook es más eficiente pero requiere HTTPS y servidor público |
| Modelo de IA | `gemini-2.5-flash-lite` con fallback chain | Se puede ajustar por `GEMINI_MODEL` |
| Almacenamiento | MySQL local | Considerar migración a servicio administrado si escala |
| Formato de respuesta IA | JSON estricto (`responseMimeType: application/json`) | Gemini fuerza JSON; se reintenta con prompt corregido si falla parseo |
| Transcripción de audio | Una sola pasada, sin re-análisis | Minimiza tokens; se pide confirmación solo si la confianza es baja |

---

## Requisitos del Sistema

| Requisito | Detalle |
|---|---|
| **Node.js** | >= 18.x LTS |
| **MySQL** | >= 5.7 con charset `utf8mb4` |
| **Cuenta Gemini** | API key con acceso a `gemini-2.5-flash-lite` |
| **Bot de Telegram** | Token válido desde @BotFather |
| **SMTP** | Servidor de correo para envío de bitácoras (opcional para soporte) |
| **PM2** | Para gestión de proceso en producción |
| **Disk** | Espacio para archivos Excel de exportación y plantilla |
| **RAM** | >= 512 MB (PM2 limitado a 200 MB por proceso) |

---

## Notas de Versiones

| Versión | Cambios |
|---|---|
| **v1** | Gastos por texto, foto y audio. Categorías. DB inicial. |
| **v2** | Tarjetas de crédito/débito, préstamos, gastos recurrentes, gastos múltiples por foto. |
| **v3** | Bitácora de soporte laboral (CRUD + exportación Excel + correo). |
| **v3.1** | Audio generalizado: notas de voz para cualquier intención, glosario personal, reemplazos configurables, transcripción con Gemini dedicada. |

---

## Licencia

ISC — Ver `package.json` para detalles.
