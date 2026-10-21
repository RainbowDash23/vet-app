# VetApp - Sistema de Gestión Veterinaria con Llavero NFC

Sistema integral de gestión veterinaria multi-tenant para clínicas veterinarias independientes, pacientes, citas médicas, vacunación, fichas clínicas y control de acceso asistencial mediante llaveros NFC con auditoría inmutable.

---

## 1. Arquitectura del Sistema

VetApp está diseñado bajo un modelo de **aislamiento multi-tenant estricto** y **fallo en cerrado (fail-closed)**:

```
┌────────────────────────────────────────────────────────┐
│                   Electron Desktop App                 │
│  (React + CSS Modules + Radix UI + contextBridge IPC)  │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS / REST (JWT Bearer)
┌───────────────────────────▼────────────────────────────┐
│                    NestJS Backend API                  │
│  ┌──────────────────┐  ┌─────────────────────────────┐ │
│  │ UserThrottler    │  │ AccessGrantGuard            │ │
│  │ (Rate limit/usr) │  │ (Consentimiento 24h)        │ │
│  └──────────────────┘  └─────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Multi-Tenant Isolation & Fail-Closed Controllers  │ │
│  │ (Filtro por clinicId de sesión, vínculo asist.)   │ │
│  └───────────────────────────────────────────────────┘ │
└───────────────────────────┬────────────────────────────┘
                            │ Prisma ORM ($transaction)
┌───────────────────────────▼────────────────────────────┐
│                   PostgreSQL 16 Database               │
│  - Clínicas, Usuarios RBAC, Mascotas, Dueños           │
│  - Vínculos Asistenciales (ClinicOwner)                │
│  - Concesiones Temporales (AccessGrant)                │
│  - Trazabilidad Inmutable Append-Only (AccessLog)      │
│  - Índices Parciales (soft-delete + uniciadad)         │
└────────────────────────────────────────────────────────┘
```

### Principios Fundamentales de Diseño
1. **Aislamiento Multi-Tenant Estricto:** Cada usuario autenticado pertenece a una única clínica (`clinicId`). Todas las consultas, mutaciones y listados están acotados por dicho tenant. Si un recurso pertenece a otra clínica y no media consentimiento, la API responde uniformemente con `HTTP 404 Not Found` para evitar enumeración y filtración de existencia.
2. **Fallo en Cerrado (Fail-Closed):** Los controladores y servicios exigen obligatoriamente un `clinicId` validado en la sesión. La ausencia del identificador resulta de inmediato en `HTTP 401 Unauthorized` sin fallbacks permisivos.
3. **Procedencia y Vínculos Asistenciales (`ClinicOwner`):**
   - Cada dueño y mascota registran la clínica de origen (`createdByClinicId`).
   - Una clínica ajena únicamente puede acceder al expediente completo o registrar atenciones si media un vínculo asistencial en `ClinicOwner` (establecido mediante escaneo físico del llavero) o un `AccessGrant` vigente.
   - Las consultas ciegas de dueños existentes (`POST /owners/lookup`) no revelan datos personales y solo retornan `{ exists: true, pendingConsent: true }`.
4. **Cero Secretos en el Cliente (RNF-2 y RNF-6):** La aplicación Electron opera con `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, exponiendo métodos mínimos a través de `contextBridge` sin fugar módulos nativos ni credenciales.
5. **Transaccionalidad Atómica y Consistencia ACID (RF-56):** Toda resolución de llavero (`resolveUid`) persiste en una única transacción `$transaction` la traza en `AccessLog`, la concesión `AccessGrant` y el vínculo `ClinicOwner`. Si cualquier paso falla, se revierte la totalidad de las escrituras.

---

## 2. Estado Actual del Proyecto

El desarrollo ha cubierto el 100% de los requisitos del plan de especificación (Fases 1 a 10):
- **Autenticación y RBAC (RF-1 a RF-6):** Sesión con Access Token (15m), Refresh Token rotativo en base de datos (7d) y denylist en memoria para revocación inmediata de JTI.
- **Padrón Centralizado y Provenance (RF-14 a RF-20, RF-60):** Registro de dueños, mascotas y vinculación asistencial con integridad referencial restrictiva.
- **Identificación NFC y Portal de Emergencia (RF-27 a RF-38):** Sanitización de tramas seriales, resolución transaccional de tags, emisión de grants de 24h y portal público de rescate sin autenticación con censura de datos sensibles.
- **Historia Clínica y Agenda (RF-39 a RF-50):** Control algorítmico de solapamientos de citas, notas médicas inmutables (`VisitNote`), validación de rangos biológicos de constantes vitales y almacenamiento protegido de adjuntos.
- **Notificaciones Asíncronas (RF-51 a RF-54):** Planificador a 72h con clave de idempotencia SHA-256 y despachador con retroceso exponencial (1m, 5m, 15m).
- **Cliente Desktop Accesible (RF-33, RF-34, RNF-3):** Interfaz clínica con CSS Modules puros y Radix UI, guardia ante formularios sucios (`DirtyStateGuard`) e indicador reactivo del enlace serial.
- **Seguridad y Auditoría Multi-Tenant (RF-58 a RF-63):** Erradicación demostrada de las 12 fugas de aislamiento multi-tenant y tests en verde contra PostgreSQL real.

---

## 3. Riesgos Conocidos y Mitigaciones

### Riesgo: Escaneo de UID Clonable u Obtenido sin Presencia del Dueño
- **Descripción:** El escaneo físico de un UID otorga un `AccessGrant` con alcance `FULL_HISTORY` durante 24 horas y vincula a la clínica con el dueño mediante `ClinicOwner`. Si un actor malicioso clona el UID de un llavero o lo escanea sin autorización, obtiene acceso temporal a la historia médica de la mascota.
- **Clasificación:** Riesgo conocido bajo mitigación activa.
- **Mitigaciones Activas:**
  1. **Límite de tasa por usuario (`UserThrottlerGuard`):** Las peticiones sobre endpoints sensibles como `/owners/lookup` están limitadas a 10 intentos por minuto por usuario con JWT verificado criptográficamente, previniendo ataques de fuerza bruta o barridos masivos de identificaciones.
  2. **Trazabilidad inmutable append-only (`AccessLog`):** Todo escaneo de tag (`NFC_SCAN`) y consulta médica (`HISTORY_VIEW`) registra de forma imborrable la clínica, el usuario, la IP y la marca temporal.
  3. **Aislamiento de dueños no vinculados:** Una clínica sin vínculo previo solo puede verificar la existencia ciega de un dueño, sin ver nombre, teléfono, dirección ni historial.
- **Mitigaciones Planificadas para Fases Posteriores:**
  1. Notificación inmediata (SMS/Push/Email) al dueño alertando sobre el acceso de una nueva clínica a su expediente.
  2. Confirmación obligatoria por factor de autenticación fuera de banda (OTP por SMS o aprobación en app móvil del dueño) para vincular nuevas clínicas.

---

## 4. Configuración de Variables de Entorno

El repositorio contiene el archivo de referencia [.env.example](.env.example). Para crear el entorno local:

```bash
cp .env.example .env
```

### Tabla de Parámetros de Configuración

| Variable | Descripción | Valor por Defecto / Ejemplo |
| :--- | :--- | :--- |
| `POSTGRES_USER` | Usuario administrador de PostgreSQL | `vet_admin` |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL (utilizada por Docker Compose) | `change_me` |
| `POSTGRES_DB` | Nombre de la base de datos | `vet_app_db` |
| `POSTGRES_PORT` | Puerto expuesto en el host por Docker Compose | `5433` (mapeado a 5432) |
| `DATABASE_URL` | Cadena de conexión para Prisma ORM | `postgresql://vet_admin:change_me@localhost:5433/vet_app_db?schema=public` |
| `USE_REAL_DB` | Forzar ejecución de pruebas E2E contra base de datos real | `true` |
| `PORT` | Puerto de escucha de la API NestJS | `3000` |
| `NODE_ENV` | Entorno de ejecución (`development`, `production`, `test`) | `development` |
| `JWT_SECRET` | Clave secreta para firma de Access Tokens (mín. 32 chars) | `change_me_super_secret_jwt_key_must_be_32_chars_long` |
| `JWT_EXPIRES_IN` | Tiempo de vida del Access Token | `15m` |
| `JWT_REFRESH_SECRET` | Clave secreta para Refresh Tokens (mín. 32 chars) | `change_me_super_secret_refresh_jwt_key_32_chars_long` |
| `JWT_REFRESH_EXPIRES_IN` | Tiempo de vida del Refresh Token | `7d` |
| `TRUST_PROXY` | Configuración de proxy inverso (`true`, `false`, o número de saltos) | `false` |
| `CORS_ORIGIN` | Orígenes permitidos (separados por coma; en Electron dev usa `http://localhost:5173` y en build/prod usa `file://,null`) | `http://localhost:5173,http://127.0.0.1:5173,file://,null` |
| `NOTIFICATIONS_CRON_ENABLED` | Activa la ejecución horaria del cron de recordatorios/alertas | `false` |
| `MAIL_DRIVER` | Controlador de transporte de correo (`log` o `smtp`) | `log` |
| `SMTP_HOST` | Servidor SMTP (requerido si `MAIL_DRIVER=smtp`) | `smtp.example.com` |
| `SMTP_PORT` | Puerto del servidor SMTP | `587` |
| `SMTP_USER` | Usuario de autenticación SMTP | `usuario@example.com` |
| `SMTP_PASS` | Contraseña SMTP | `change_me` |
| `SMTP_FROM` | Remitente de los correos salientes | `"Vet App <notificaciones@example.com>"` |
| `SMTP_SECURE` | Conexión TLS directa (`true` para puerto 465, `false` para STARTTLS) | `false` |

---

## 5. Puesta en Marcha

### 5.1 Levantar la Base de Datos con Docker Compose
```bash
# Iniciar contenedor PostgreSQL
pnpm db:up
# o directamente: docker compose up -d

# Detener contenedor PostgreSQL
pnpm db:down
```

### 5.2 Despliegue de Migraciones y Semilla
```bash
# Aplicar migraciones pendientes
pnpm --filter @vet-app/api prisma migrate deploy

# Ejecutar semilla inicial (clínicas y usuarios RBAC)
pnpm --filter @vet-app/api prisma db seed
```

### 5.3 Arranque de la API en Producción
```bash
# Compilar monorepo
pnpm build:api

# Iniciar servidor de producción (dist/main.js)
pnpm --filter @vet-app/api start:prod
```

---

### 5.4 Orígenes de CORS del Cliente Electron
- **Modo Desarrollo (pnpm dev:desktop):** El proceso de renderizado carga la interfaz desde el servidor Vite local en http://localhost:5173.
- **Modo Producción / Empaquetado (pnpm build:desktop && pnpm start):** El proceso principal de Electron carga el bundle compilado mediante loadFile('dist/index.html'), emitiendo peticiones HTTP hacia la API con encabezado de origen ile:// o 
ull.
- **Configuración estricta de CORS_ORIGIN:** http://localhost:5173,http://127.0.0.1:5173,file://,null. Se prohíbe explícitamente abrir CORS a comodín (*) para salvaguardar el aislamiento de las credenciales clínicas y prevenir ataques cross-origin.


## 6. Ejecución de Pruebas

### 6.1 Pruebas E2E contra PostgreSQL Real (`test:e2e:db`)
Ejecuta la suite integral de aislamiento multi-tenant y reversión transaccional contra el contenedor PostgreSQL de Docker Compose:
```bash
pnpm run test:e2e:db
```
- Valida las 12 fugas de seguridad (RF-58 a RF-63) y las pruebas de procedencia y vínculo asistencial (16 tests).
- Valida la reversión total (rollback) atómica en fallo de grants y violaciones de restricciones referenciales (3 tests).

### 6.2 Pruebas Unitarias de Backend y Frontend
```bash
# Ejecutar todas las pruebas unitarias del monorepo
pnpm test

# Ejecutar pruebas unitarias exclusivas de la API
pnpm --filter @vet-app/api test

# Ejecutar pruebas unitarias del cliente Desktop
pnpm --filter @vet-app/desktop test
```

### 6.3 Pruebas E2E en Memoria
```bash
# Ejecutar pruebas E2E con base de datos simulada en memoria
pnpm test:e2e
```

### 6.4 Verificación de Tipos Estricta y Auditoría de Seguridad
```bash
# Verificación estricta de TypeScript en todos los paquetes (strict: true, 0 @ts-ignore)
pnpm typecheck

# Auditoría estática automatizada de seguridad (RNF-1, RNF-2, RNF-3, RNF-6)
pnpm run audit:security
```

