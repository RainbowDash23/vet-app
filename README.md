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
│  - 7 Índices Parciales (soft-delete + unicidad)        │
└────────────────────────────────────────────────────────┘
```

### Principios Fundamentales de Diseño
1. **Aislamiento Multi-Tenant Estricto:** Cada usuario autenticado pertenece a una única clínica (`clinicId`). Todas las consultas, mutaciones y listados están acotados por dicho tenant. Si un recurso pertenece a otra clínica y no media consentimiento, la API responde uniformemente con `HTTP 404 Not Found` para evitar enumeración y filtración de existencia.
2. **Fallo en Cerrado (Fail-Closed):** Los controladores y servicios exigen obligatoriamente un `clinicId` validado en la sesión. La ausencia del identificador resulta de inmediato en `HTTP 401 Unauthorized` sin fallbacks permisivos.
3. **Procedencia y Vínculos Asistenciales (`ClinicOwner`):**
   - Cada dueño y mascota registran la clínica de origen (`createdByClinicId`).
   - Una clínica ajena únicamente puede acceder al expediente completo o registrar atenciones si media un vínculo asistencial en `ClinicOwner` (establecido mediante escaneo físico del llavero) o un `AccessGrant` vigente.
   - Las consultas ciegas de dueños existentes (`POST /owners/lookup`) no revelan datos personales y solo retornan `{ exists: true, pendingConsent: true }`.
4. **Cero Secretos en el Cliente:** La aplicación Electron opera con `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, exponiendo métodos mínimos a través de `contextBridge` sin fugar módulos nativos ni credenciales.
5. **Transaccionalidad Atómica y Consistencia ACID:** Toda resolución de llavero (`resolveUid`) persiste en una única transacción `$transaction` la traza en `AccessLog`, la concesión `AccessGrant` y el vínculo `ClinicOwner`. Si cualquier paso falla, se revierte la totalidad de las escrituras.

---

## 2. Requisitos Previos

Para ejecutar la plataforma en entorno local o de desarrollo se requiere:
- **Node.js:** Versión 22.x LTS (compatible con `process.loadEnvFile` y motor V8 actualizado).
- **pnpm:** Versión 9.x (`corepack enable && corepack prepare pnpm@9.15.4 --activate`).
- **Docker y Docker Compose:** Para instanciar el servicio de base de datos PostgreSQL 16.
- **Hardware Lector NFC (Opcional):** Placa microcontroladora ESP32-WROOM conectada por USB con transceptor RC522 (o simulador de software integrado para pruebas sin hardware físico).

---

## 3. Puesta en Marcha

### 3.1 Base de Datos (PostgreSQL 16)
```bash
# Iniciar contenedor Docker de PostgreSQL
pnpm db:up
# o directamente: docker compose up -d

# Aplicar las migraciones aditivas de Prisma
pnpm --filter @vet-app/api prisma migrate deploy

# Ejecutar la siembra inicial (clínicas y usuarios RBAC)
pnpm --filter @vet-app/api prisma db seed

# Para detener el contenedor cuando no se use:
# pnpm db:down
```

### 3.2 Backend API (NestJS)
```bash
# Modo desarrollo con recarga en caliente:
pnpm dev:api

# Compilación y arranque en producción:
pnpm build:api
pnpm --filter @vet-app/api start:prod
```
La API estará disponible en `http://localhost:3000`.

### 3.3 Aplicación de Escritorio (Electron + React)
```bash
# Modo desarrollo (abre Vite dev server en localhost:5173 y Electron):
pnpm dev:desktop

# Compilación de producción del cliente de escritorio:
pnpm build:desktop

# Ejecutar el empaquetado de producción:
pnpm --filter @vet-app/desktop start
```

---

## 4. Configuración de Variables de Entorno

Copia el archivo de plantilla [.env.example](.env.example) a la raíz del proyecto como `.env`:

```bash
cp .env.example .env
```

### Tabla de Parámetros de Configuración

| Variable | Tipo / Valores | Descripción | Valor por Defecto / Recomendado |
| :--- | :--- | :--- | :--- |
| `POSTGRES_USER` | String | Usuario administrador de PostgreSQL | `vet_admin` |
| `POSTGRES_PASSWORD` | String | Contraseña de PostgreSQL (utilizada por Docker y pruebas) | `change_me` |
| `POSTGRES_DB` | String | Nombre de la base de datos principal | `vet_app_db` |
| `POSTGRES_PORT` | Número | Puerto expuesto en el host por Docker Compose | `5433` (mapeado a 5432 interno) |
| `DATABASE_URL` | Cadena URL | Cadena de conexión para Prisma ORM | `postgresql://vet_admin:change_me@localhost:5433/vet_app_db?schema=public` |
| `USE_REAL_DB` | Booleano | Si `true`, ejecuta pruebas E2E contra base de datos real | `true` |
| `PORT` | Número | Puerto HTTP de escucha de la API NestJS | `3000` |
| `NODE_ENV` | String | Entorno (`development`, `production`, `test`) | `development` |
| `JWT_SECRET` | String (>=32 chars) | Clave secreta para firma de Access Tokens | Generar con `openssl rand -base64 32` |
| `JWT_EXPIRES_IN` | String | Tiempo de expiración del Access Token | `15m` |
| `JWT_REFRESH_SECRET` | String (>=32 chars) | Clave secreta para Refresh Tokens | Generar con `openssl rand -base64 32` |
| `JWT_REFRESH_EXPIRES_IN` | String | Tiempo de expiración del Refresh Token | `7d` |
| `TRUST_PROXY` | Booleano / String | Activa la confianza en encabezados `X-Forwarded-For` tras proxy | `false` |
| `CORS_ORIGIN` | Lista separada por coma | Orígenes autorizados (no usar comodín `*`) | `http://localhost:5173,http://127.0.0.1:5173,file://,null` |
| `NOTIFICATIONS_CRON_ENABLED` | Booleano | Habilita el cron horario de alertas y recordatorios | `false` |
| `MAIL_DRIVER` | `log` \| `smtp` | Canal de transporte de correos de notificación | `log` |
| `SMTP_HOST` | String | Host del relay SMTP (si `MAIL_DRIVER=smtp`) | `smtp.example.com` |
| `SMTP_PORT` | Número | Puerto del servidor SMTP | `587` |
| `SMTP_USER` | String | Usuario de autenticación SMTP | `usuario@example.com` |
| `SMTP_PASS` | String | Contraseña de autenticación SMTP | `change_me` |
| `SMTP_FROM` | String | Remitente de las notificaciones | `"Vet App <notificaciones@example.com>"` |
| `SMTP_SECURE` | Booleano | TLS directo para puerto 465 (`false` para STARTTLS) | `false` |
| `SERIAL_PORT` | String | Puerto COM a conectar (ej: `COM3`, `/dev/ttyUSB0`) | Autodetección por VID/PID |
| `SERIAL_DRIVER` | `serialport` \| `memory` | Controlador serie del lector (`memory` para desarrollo/simulación) | `serialport` |

---

## 5. Conexión y Operación del Lector NFC (ESP32-WROOM + RC522)

### 5.1 Comunicación Serial USB
El lector de mostrador utiliza una placa **ESP32-WROOM** conectada por cable USB a la computadora de la clínica:
- **Velocidad y Formato:** 115200 baudios, 8 bits de datos, sin paridad, 1 bit de parada (8N1).
- **Protocolo de Trama:** El firmware emite exclusivamente tramas en formato `UID:XXXXXXXX\r\n` (o 14 caracteres hexadecimales para tags de 7 bytes).
- **Autodetección:** El proceso principal de Electron autodetecta el dispositivo examinando los identificadores de fabricante y producto comunes de adaptadores USB-Serial (Silicon Labs CP210x `10C4:EA60` y WCH CH340 `1A86:7523`).
- **Selección Manual:** Si existen múltiples puertos, la barra lateral permite seleccionarlo mediante los canales IPC `serial:list-ports` y `serial:connect`.
- **Resiliencia:** Reintenta la conexión automáticamente cada 3000 ms hasta 10 intentos consecutivos; si el enlace no responde o el puerto está ocupado, el indicador de hardware en la cabecera muestra el estado `DESCONECTADO` con alerta visual accesible.

### 5.2 ⚠️ Advertencia Crítica: Bloqueo Exclusivo de Puerto COM en Windows
En Windows, los puertos serie (`COM3`, `COM4`, etc.) operan bajo **acceso exclusivo a nivel de sistema operativo**:
- **Conflicto con Thonny IDE:** Si el IDE Thonny está abierto o conectado al microcontrolador para programar o depurar MicroPython, la app Electron **no podrá abrir el puerto** y reportará colisión (`EBUSY` o `Access Denied`).
- **Instrucción obligatoria:** Cierra completamente Thonny IDE o haz clic en su botón de desconexión antes de iniciar la aplicación de escritorio.

### 5.3 Simulación de Llaveros en Desarrollo
Para realizar pruebas sin hardware físico conectado:
1. Inicia la aplicación en modo desarrollo (`pnpm dev:desktop`) o define la variable de entorno `SERIAL_DRIVER=memory`.
2. En la barra lateral aparecerá el botón **"🏷️ Simular Lectura NFC"**.
3. Al pulsarlo o acercar un transpondedor, la aplicación procesará el flujo completo de resolución y navegación reactiva.

---

## 6. Ejecución de Pruebas

El monorepo cuenta con una suite integral y estratificada de pruebas que garantizan la ausencia de regresiones:

```bash
# 1. Verificación Estricta de Tipos TypeScript (todos los paquetes)
pnpm typecheck

# 2. Pruebas Unitarias del Monorepo (API NestJS + Desktop)
pnpm test

# 3. Pruebas de Integración de UI en Desktop (Vitest + React Testing Library)
pnpm --filter @vet-app/desktop run test:ui

# 4. Pruebas de Extremo a Extremo en Memoria (Flujos de Negocio)
pnpm run test:e2e

# 5. Pruebas E2E contra Base de Datos PostgreSQL Real (Docker)
pnpm run test:e2e:db
```

---

## 7. Alcance del MVP y Riesgos Conocidos

### 7.1 Alcance Implementado en esta Fase
- **Gestión Clínica Multi-Tenant Completa:** Aislamiento criptográfico y referencial entre clínicas independientes con fail-closed en 100% de los endpoints.
- **Padrón Centralizado con Verificación Ciega:** `POST /owners/lookup` previene registros duplicados informando la existencia sin exponer datos personales del propietario.
- **Ficha Médica y Consultas:** Anamnesis, constantes vitales con validación fisiológica, inmutabilidad tras cierre de visita y notas evolutivas suplementarias.
- **Identificación NFC y Transaccionalidad:** Resolución atómica en < 600 ms, reversión total ante fallo y portal web público de rescate `/p/:publicCode` con protección XSS.
- **Notificaciones Asíncronas:** Cron de recordatorios a 72h con clave de idempotencia SHA-256 y soporte SMTP/log.

### 7.2 Funcionalidades Fuera de Alcance en esta Fase
1. **Aplicación Móvil para Dueños:** La interacción del propietario en esta fase se realiza a través de la página web pública de contingencia y rescate accesible por navegador en `/p/:publicCode`.
2. **Segundo Factor de Autenticación con OTP:** La confirmación fuera de banda (código OTP vía SMS o correo) para autorizar el traspaso o acceso de una nueva clínica ajena queda reservada para la siguiente fase.
3. **Autogestión de Revocación de Consentimiento:** El estado `REVOKED` en `ClinicOwner` está formalmente soportado en el modelo de datos e impide la emisión de nuevos `AccessGrant`, pero la interfaz para que el dueño revoque el acceso se implementará conjuntamente con el portal del propietario con OTP.

### 7.3 Riesgos Conocidos y Limitaciones Físicas
1. **UID NFC Clonable (ISO/IEC 14443A):**
   - Los transpondedores pasivos emiten un UID fijo de fábrica. Un clon presentado físicamente otorga un `AccessGrant` de 24 horas (`FULL_HISTORY`).
   - *Mitigaciones activas:* Trazabilidad inmutable en `AccessLog` (`NFC_SCAN`), límite de tasa por IP/usuario con `@nestjs/throttler` y bloqueo total ante estado `REVOKED`.
2. **Limitación de Lectura de MIFARE Classic en Smartphones:**
   - Las tarjetas y llaveros **MIFARE Classic 1K** son compatibles con el lector de mostrador RC522 de la clínica veterinaria, pero **NO pueden ser leídos por teléfonos celulares modernos** (los iPhone y gran parte de teléfonos Android carecen de hardware compatible con MIFARE Classic).
   - *Requisito para el producto final:* Las medallas para collares destinadas a la vía pública deben fabricarse con chips **NFC Forum Type 2** como **NTAG213** o **NTAG215**, legibles universalmente por cualquier smartphone para abrir la página pública `/p/:publicCode`.
