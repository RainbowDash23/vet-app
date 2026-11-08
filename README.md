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

Para iniciar el sistema de manera íntegra, ejecute los siguientes pasos en este **orden exacto**:

```bash
# PASO 1: Levantar el contenedor PostgreSQL en Docker
pnpm db:up
# o directamente: docker compose up -d

# PASO 2: Desplegar las migraciones de base de datos en PostgreSQL
pnpm --filter @vet-app/api exec prisma migrate deploy

# PASO 3: Ejecutar la siembra inicial (Seed) de clínicas y usuarios RBAC
pnpm --filter @vet-app/api exec prisma db seed

# PASO 4: Iniciar el servidor Backend API (NestJS en http://localhost:3000)
pnpm dev:api

# PASO 5: Iniciar la aplicación de escritorio Electron (con Vite dev server)
pnpm dev:electron
```

> [!IMPORTANT]
> **Credenciales Iniciales de Acceso (Semilla - Solo desarrollo, nunca usar en producción)**
> La siembra genera automáticamente los usuarios RBAC iniciales con la contraseña por defecto `Password123!` (solo desarrollo, nunca usar en producción; configurable mediante la variable `SEED_DEFAULT_PASSWORD` en el archivo `.env`).
> 
> Usuarios de prueba disponibles:
> - **Administrador:** `admin@vetapp.com` / `Password123!` (Rol `ADMIN`, Clínica Veterinaria Central `CLINIC-01`)
> - **Veterinario:** `vet@vetapp.com` / `Password123!` (Rol `VET`, Clínica Veterinaria Central `CLINIC-01`, Licencia: `VET-98765`)
> - **Recepcionista:** `reception@vetapp.com` / `Password123!` (Rol `RECEPTION`, Clínica Veterinaria Central `CLINIC-01`)
> - **Veterinario Urgencias (Segunda clínica):** `vet2@hospitalvet24.com` / `Password123!` (Rol `VET`, Hospital Veterinario 24 Horas `CLINIC-02`, Licencia: `VET-11223`)

---

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
| `SEED_DEFAULT_PASSWORD` | String | Contraseña asignada a usuarios de prueba en la siembra (solo desarrollo, nunca usar en producción) | `Password123!` |
| `SERIAL_PORT` | String | Puerto COM a conectar (ej: `COM3`, `/dev/ttyUSB0`) | Autodetección por VID/PID |
| `SERIAL_DRIVER` | `serialport` \| `memory` | Controlador serie del lector (`memory` para desarrollo/simulación) | `serialport` |
| `VITE_DEV_TOOLS` | Booleano | Muestra botón de simulación de llavero NFC en barra lateral | `false` (desactivado por defecto) |

---

## 5. Conexión y Operación del Lector NFC (ESP32-WROOM + RC522)

### 5.1 Guía Rápida para Probar el ESP32 con la Aplicación
1. **Identificar el puerto COM asignado:**
   - En Windows, presiona `Win + X` y abre el **Administrador de Dispositivos**.
   - Despliega la categoría **Puertos (COM y LPT)** y conecta la placa ESP32 por USB. Observa qué puerto aparece (por ejemplo, `COM3`, `COM4`, o `Silicon Labs CP210x USB to UART Bridge (COM5)`).
2. **Cerrar monitores serie en segundo plano:**
   - Si tienes abierto **Thonny IDE**, el monitor serie de Arduino IDE o PuTTY, **ciérralo por completo** o desconecta el puerto. En Windows un puerto COM solo puede ser abierto por un proceso a la vez.
3. **Configurar el puerto (Opcional):**
   - El sistema autodetecta automáticamente los chips USB-Serial CP210x (`10C4:EA60`) y CH340 (`1A86:7523`).
   - Si deseas forzar un puerto específico, agrega `SERIAL_PORT=COM3` (reemplazando por tu puerto) en el archivo `.env`.
4. **Iniciar la aplicación:**
   ```bash
   pnpm dev:electron
   ```
5. **Verificar el indicador en la barra superior:**
   - El indicador de hardware en la cabecera mostrará un punto verde y el texto **Conectado (COMX)**.
   - También puedes seleccionar manualmente el puerto detectado en el desplegable de la barra lateral y pulsar **Conectar puerto**.
6. **Probar el escaneo físico:**
   - Acerca una tarjeta o llavero NFC al transceptor RC522.
   - La pantalla reaccionará inmediatamente resolviendo el paciente o abriendo el modal de asignación si el llavero aún no ha sido vinculado a una mascota.

### 5.2 Comunicación Serial USB
El lector de mostrador utiliza una placa **ESP32-WROOM** conectada por cable USB a la computadora de la clínica:
- **Velocidad y Formato:** 115200 baudios, 8 bits de datos, sin paridad, 1 bit de parada (8N1).
- **Protocolo de Trama:** El firmware emite exclusivamente tramas en formato `UID:XXXXXXXX\r\n` (o 14 caracteres hexadecimales para tags de 7 bytes).
- **Autodetección:** El proceso principal de Electron autodetecta el dispositivo examinando los identificadores de fabricante y producto comunes de adaptadores USB-Serial (Silicon Labs CP210x `10C4:EA60` y WCH CH340 `1A86:7523`).
- **Selección Manual:** Si existen múltiples puertos, la barra lateral permite seleccionarlo mediante los canales IPC `serial:list-ports` y `serial:connect`.
- **Resiliencia:** Reintenta la conexión automáticamente cada 3000 ms hasta 10 intentos consecutivos; si el enlace no responde o el puerto está ocupado, el indicador de hardware en la cabecera muestra el estado `DESCONECTADO` con alerta visual accesible.

### 5.3 Advertencia: Bloqueo Exclusivo de Puerto COM en Windows
En Windows, los puertos serie (`COM3`, `COM4`, etc.) operan bajo **acceso exclusivo a nivel de sistema operativo**:
- **Conflicto con Thonny IDE:** Si el IDE Thonny está abierto o conectado al microcontrolador para programar o depurar MicroPython, la app Electron **no podrá abrir el puerto** y reportará colisión (`EBUSY` o `Access Denied`).
- **Instrucción obligatoria:** Cierra completamente Thonny IDE o haz clic en su botón de desconexión antes de iniciar la aplicación de escritorio.

### 5.4 Simulación de Llaveros en Desarrollo
Para realizar pruebas sin hardware físico conectado:
1. Activa la variable `VITE_DEV_TOOLS=true` en `.env.local` o define `SERIAL_DRIVER=memory` en `.env`.
2. En la barra lateral aparecerá el botón **"Simular lectura NFC"**.
3. Al pulsarlo, el sistema emitirá un UID de prueba para verificar los flujos de interfaz de usuario.

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


---

## 8. Despliegue en la Nube (Render + Neon PostgreSQL)

La API del sistema está preparada para su despliegue en contenedores Docker sobre infraestructuras cloud modernas bajo esquemas serverless y de bajo consumo.

### 8.1 Arquitectura de Despliegue
- **Backend API (`apps/api`):** Alojado en **Render** como servicio web Docker (plan Free). Se construye a partir del `Dockerfile` multi-stage optimizado (base `node:22-slim`, usuario no privilegiado `node` y binarios mínimos de producción). La infraestructura se declara como código mediante el archivo de Blueprint `render.yaml`.
- **Base de Datos Relacional:** **Neon Serverless PostgreSQL 16**. Opera con arquitectura desacoplada de almacenamiento y cómputo:
  - `DATABASE_URL`: Conexión hacia el pooler de conexiones (PgBouncer) de Neon con parámetros `?pgbouncer=true&connect_timeout=15` para la operación continua de la aplicación.
  - `DIRECT_URL`: Conexión directa a la instancia de cómputo para la ejecución de migraciones DDL (`prisma migrate deploy`).

### 8.2 Variables de Entorno para Producción

En el panel de Render, configure las siguientes variables de entorno (ningún secreto ni credencial real debe registrarse en el repositorio):

| Variable | Descripción |
| :--- | :--- |
| `NODE_ENV` | Entorno de ejecución; debe fijarse en `production`. |
| `PORT` | Puerto de escucha HTTP asignado por el host (Render lo inyecta automáticamente). |
| `DATABASE_URL` | Cadena de conexión al pooler de conexiones de Neon. |
| `DIRECT_URL` | Cadena de conexión directa de Neon para migraciones de esquema. |
| `JWT_SECRET` | Clave criptográfica para firma de Access Tokens (mínimo 32 caracteres generados aleatoriamente). |
| `JWT_REFRESH_SECRET` | Clave criptográfica para Refresh Tokens (mínimo 32 caracteres, distinta de `JWT_SECRET`). |
| `CORS_ORIGIN` | Lista de orígenes autorizados separados por coma. Se prohíbe el comodín `*` en producción. |
| `TRUST_PROXY` | Número de saltos de proxy confiables (fijar en `"1"` en Render). Protege el rate limit contra falsificación en `X-Forwarded-For`. |
| `NOTIFICATIONS_CRON_ENABLED` | Establecer en `false` para evitar ejecuciones automáticas continuas que consuman cuota serverless. |
| `MAIL_DRIVER` | Canal de transporte de correos (`log` para registro en consola o `smtp` con credenciales externas). |
| `PUBLIC_BASE_URL` | URL pública base del despliegue (ej: `https://TU-SERVICIO.onrender.com`), empleada para generar enlaces QR/NFC `/p/:publicCode`. |

### 8.3 Inicialización del Primer Administrador (`bootstrap:admin`)

> [!WARNING]
> El comando `prisma db seed` contiene datos de prueba para desarrollo local y **nunca debe ejecutarse en entornos de producción**.

Para inicializar la primera clínica y su cuenta de usuario administrador en producción, utilice la herramienta segura de arranque:

```bash
pnpm --filter @vet-app/api bootstrap:admin
```

El script requiere las siguientes variables de entorno al momento de ejecutarse (suministradas mediante la shell de Render o variables temporales):
- `BOOTSTRAP_ADMIN_EMAIL`: Correo electrónico del administrador principal.
- `BOOTSTRAP_ADMIN_PASSWORD`: Contraseña de acceso (mínimo 12 caracteres; cifrada con bcrypt a 12 rondas).
- `BOOTSTRAP_CLINIC_NAME`: Razón social o nombre de la clínica veterinaria.
- `BOOTSTRAP_CLINIC_CODE`: Código alfanumérico identificador único de la clínica.

**Garantías de seguridad del bootstrap:**
- **Idempotencia:** Si la clínica y el administrador ya fueron creados previamente y no existen otros usuarios, finaliza exitosamente sin duplicar registros.
- **Fail-Closed:** Si la base de datos ya contiene otros usuarios registrados, el script aborta inmediatamente la ejecución para prevenir manipulaciones no autorizadas.
- **Cero fugas:** La contraseña nunca se registra en archivos de log ni se imprime en la salida estándar de consola.

### 8.4 Comprobación de Estado (Health Checks)

La API expone dos endpoints de diagnóstico diferenciados:

1. **Liveness Probe (`GET /health`):**
   - Retorna `{ "status": "ok", "timestamp": "...", "uptime": 123 }` con código HTTP 200.
   - **No realiza consultas a la base de datos** y está excluido de la limitación de tasa (*rate limit*).
   - Es el endpoint configurado en Render (`healthCheckPath: /health`) para verificar que el contenedor se encuentra activo sin despertar la base de datos de Neon de su suspensión.

2. **Readiness Probe (`GET /health/ready`):**
   - Ejecuta una consulta ligera `SELECT 1` contra la base de datos PostgreSQL.
   - Retorna `{ "status": "ok", "database": "connected" }` (HTTP 200) si la base de datos responde correctamente.
   - Retorna `{ "status": "error", "database": "disconnected" }` (HTTP 503 Service Unavailable) si la conexión falla o el cómputo de Neon está inaccesible.
   - Cuenta con protección de limitación de tasa (*rate limiting*) para evitar saturaciones accidentales.

### 8.5 Consideraciones y Limitaciones del Plan Gratuito

- **Suspensión de Render Web Service:** Tras 15 minutos sin peticiones entrantes, Render suspende el contenedor (*spin down*). La primera solicitud entrante posterior experimentará un arranque en frío (*cold start*) de 50 a 70 segundos mientras el contenedor se descarga e inicializa.
- **Suspensión de Neon Serverless:** La base de datos de Neon suspende su instancia de cómputo tras 5 minutos de inactividad (el plan gratuito incluye una cuota mensual de 100 Compute Unit-horas). El liveness probe `/health` fue diseñado específicamente para no realizar consultas a la base y preservar esta cuota.
- **Cold Start Combinado:** Si tanto el contenedor de Render como la base de datos de Neon están suspendidos, la primera petición puede tardar entre 60 y 90 segundos en responder. Una vez activos, las peticiones subsiguientes operan a velocidad de producción estándar.
- **Migraciones Automáticas en Arranque:** Al no disponer de la característica de pago `preDeployCommand`, el contenedor Docker ejecuta automáticamente `prisma migrate deploy` como parte de su rutina de arranque previa al inicio de NestJS.


### 8.6 Comprobación de Saltos de Proxy (TRUST_PROXY) en Render

En entornos de producción tras un proxy inverso (como Render), el limitador de tasa (*rate limit* / `UserThrottlerGuard`) utiliza la dirección IP de origen (`req.ip`) para restringir intentos abusivos de peticiones no autenticadas.

#### ¿Por qué usar un número de saltos (`1`) en lugar de `true`?
- Si `TRUST_PROXY` se configura como `true`, Express asume que toda la cadena de proxies es confiable y toma la IP del extremo izquierdo de `X-Forwarded-For`. Un atacante podría eludir el rate limit simplemente inyectando cabeceras arbitrarias: `X-Forwarded-For: <ip_falsa>, <ip_real>`.
- Al configurar `TRUST_PROXY="1"`, Express confía exactamente en **1 salto** (el proxy de entrada de Render) y selecciona la IP inmediatamente anterior al último proxy (`<ip_real>`), ignorando cualquier valor previo falsificado por el cliente.

#### Cómo comprobar la cantidad de saltos reales en Render:
1. **Inspección de cabeceras en ejecución:** En un entorno de prueba o endpoint temporal, inspeccione `req.headers['x-forwarded-for']` y el arreglo `req.ips` generado por Express al recibir una petición externa.
2. **Topología típica de Render:**
   - **Despliegue directo en Render (`onrender.com`):** Existe 1 único nivel de proxy reverso/balanceador de carga antes del contenedor. El valor correcto es `TRUST_PROXY="1"`.
   - **Render con Cloudflare / WAF externo delante:** Si el dominio de la clínica pasa por un proxy de Cloudflare (modo proxy activo) hacia Render, existirán 2 saltos (Cloudflare Edge → Render Load Balancer → Contenedor). En este caso, el valor apropiado es `TRUST_PROXY="2"`.
3. **Prueba de validación con `curl`:**
   Envíe una petición simulando un intento de falsificación:
   ```bash
   curl -H "X-Forwarded-For: 203.0.113.195" https://TU-SERVICIO.onrender.com/health/ready
   ```
   Revise en los logs del servidor que la IP registrada corresponda a su IP pública real y **no** a la IP falsificada `203.0.113.195`.

---

## 9. Aplicación de Escritorio (Desktop) y Distribución

VetApp incluye un cliente de escritorio nativo para Windows empaquetado con **Electron** y distribuido mediante instalador **NSIS** con soporte de actualizaciones automáticas vía **GitHub Releases**.

### 9.1 Compilación Local del Instalador de Windows

Para generar el instalador de Windows (`.exe`):

```bash
# Compilar con la URL de API por defecto (http://localhost:3000)
pnpm --filter @vet-app/desktop package:dist

# Compilar inyectando la URL de producción de la API (sin secretos ni URLs fijas en código)
VITE_API_URL=https://TU-SERVICIO.onrender.com pnpm --filter @vet-app/desktop package:dist
```

> [!TIP]
> **Compilación en `C:\vetapp-release` contra bloqueos en Windows (EBUSY / EPERM):**
> En entornos de desarrollo sobre Windows con indexadores, antivirus o centinelas de archivos activos (como Windows Defender o el watcher de Vite/VSCode), el empaquetado directo sobre `apps/desktop/release` puede fallar ocasionalmente por bloqueos exclusivos de archivos (`EBUSY: resource busy or locked`). Para evitar este problema de concurrencia, compile dirigiendo la salida a una carpeta dedicada fuera del árbol de trabajo del monorepo:
> ```bash
> pnpm --filter @vet-app/desktop exec electron-builder --win --publish never --config.directories.output=C:\vetapp-release
> ```
> El instalador se generará limpiamente en `C:\vetapp-release\VetApp-Setup-<version>.exe` junto con el archivo de manifiesto `latest.yml`.

### 9.2 Asistente de Instalación por Pasos (NSIS Wizard)

El empaquetado utiliza un asistente interactivo por pasos (**NSIS**) sobrio y en español (`language: 1034`, `es_ES`), configurado para ejecutarse estrictamente con privilegios de usuario estándar (`perMachine: false`, `allowElevation: false`, sin elevación de permisos ni prompts de Control de Cuentas de Usuario / UAC):

1. **Página de Bienvenida:** Muestra la carátula gráfica sobria lateral (`installerSidebar.bmp` 164x314) con el logo e identidad visual de VetApp.
2. **Selección de Carpeta de Destino:** Permite al usuario seleccionar el directorio de instalación (`allowToChangeInstallationDirectory: true`), sugiriendo por defecto la ruta de usuario `%LOCALAPPDATA%\Programs\VetApp`.
3. **Página de Opciones Adicionales (`build/installer.nsh`):**
   - **Crear acceso directo en el escritorio:** Casilla activada por defecto. Genera un enlace directo con icono y modelo AUMI (`com.vetapp.desktop`).
   - **Iniciar VetApp al arrancar Windows:** Casilla desactivada por defecto. Si el usuario la activa, registra la clave de inicio automático en `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\VetApp`.
4. **Página de Progreso:** Extrae los archivos de la aplicación y descomprime los módulos nativos seriales (`serialport`).
5. **Página de Finalización:** Permite finalizar la instalación e incluye la casilla interactiva *"Ejecutar VetApp"* (`runAfterFinish: true`), permitiendo iniciar la aplicación de inmediato si el usuario lo desea.

> [!NOTE]
> **Página de Licencia:** La página de términos de licencia solo se inserta automáticamente si existe un archivo formal `LICENSE` en la raíz del repositorio. Al tratarse de un proyecto que no dispone de archivo de licencia, la página se omite deliberadamente para no generar textos jurídicos sintéticos.

### 9.3 Desinstalador Interactivo y Limpieza del Sistema

VetApp incluye un desinstalador interactivo configurable (`build/installer.nsh`):
1. **Confirmación de Desinstalación:** Presenta al usuario una pantalla clara solicitando confirmación para retirar la aplicación del equipo.
2. **Opción de Retención de Datos:** Incluye la casilla *"Eliminar datos de usuario y configuración local"* (desactivada por defecto) para preservar o purgar directorios locales `%APPDATA%\VetApp`, `%APPDATA%\vet-app` y `%LOCALAPPDATA%\VetApp`.
3. **Limpieza Completa de Huella en el Sistema:**
   - Elimina los accesos directos creados en el Escritorio y en el Menú Inicio (`$SMPROGRAMS\VetApp`).
   - Suprime de forma incondicional la clave de inicio automático en el registro de Windows (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run\VetApp`).

### 9.4 Extensibilidad: Cómo Añadir una Opción Nueva al Instalador

Para incorporar una nueva opción de configuración durante el proceso de instalación (por ejemplo, habilitar telemetría o registrar un protocolo URL personalizado):

1. **Definir la variable de estado y control en `apps/desktop/build/installer.nsh`:**
   ```nsis
   !ifndef BUILD_UNINSTALLER
   Var /GLOBAL CheckboxMiOpcion
   Var /GLOBAL MiOpcionState

   !macro customInit
     StrCpy $MiOpcionState "1" ; "1" para activada por defecto, "0" para desactivada
   !macroend
   ```

2. **Añadir el control visual en la página personalizada (`customPageAfterChangeDir`):**
   ```nsis
   !macro customPageAfterChangeDir
     Function CustomOptionsPageCreate
       ; ...
       ${NSD_CreateCheckbox} 10u 60u 100% 12u "Habilitar registro extendido de eventos"
       Pop $CheckboxMiOpcion
       ${NSD_SetState} $CheckboxMiOpcion $MiOpcionState
       ; ...
     FunctionEnd

     Function CustomOptionsPageLeave
       ${NSD_GetState} $CheckboxMiOpcion $MiOpcionState
     FunctionEnd
   !macroend
   ```

3. **Persistir la opción en el Registro de Windows en `customInstall`:**
   ```nsis
   !macro customInstall
     ${If} $MiOpcionState == "1"
       WriteRegStr HKCU "Software\VetApp" "ExtendedLogging" "1"
     ${Else}
       WriteRegStr HKCU "Software\VetApp" "ExtendedLogging" "0"
     ${EndIf}
   !macroend
   ```

4. **Consumir la opción desde la aplicación Electron:**
   En el proceso principal (`apps/desktop/electron/main.ts`), verifique la configuración leyendo el registro de Windows de usuario mediante comandos de PowerShell o bibliotecas nativas de lectura de claves HKCU sin requerir privilegios de administrador:
   ```typescript
   import { execSync } from 'node:child_process';
   function isExtendedLoggingEnabled(): boolean {
     try {
       const stdout = execSync('reg query HKCU\\Software\\VetApp /v ExtendedLogging').toString();
       return stdout.includes('0x1') || stdout.includes('1');
     } catch {
       return false;
     }
   }
   ```

### 9.5 Advertencia de Microsoft Defender SmartScreen

Al no incorporar un certificado comercial de firma de código con Validación Extendida (EV Code Signing), Microsoft Defender SmartScreen mostrará una advertencia preventiva en la primera ejecución:
- **Pantalla azul de aviso:** *"Windows protegió su PC"* (*Windows protected your PC*).
- **Procedimiento de desbloqueo:**
  1. Haga clic en el enlace **"Más información"** (*More info*).
  2. Presione el botón **"Ejecutar de todas formas"** (*Run anyway*).
- Al ser una instalación confinada a nivel de usuario (`perMachine: false`, `asInvoker`), la aplicación no altera directorios protegidos del sistema (`Program Files` o `HKLM`) ni requiere privilegios administrativos.

### 9.6 Lista de Verificación Manual (Checklist de Validación)

Para auditorías manuales previas al lanzamiento en entornos Windows reales:

#### A. Verificación del Asistente de Instalación (Instalador):
- [ ] **Página de Bienvenida:** Se visualiza la ilustración lateral sobria (`installerSidebar.bmp`) con el logo de VetApp y texto de bienvenida en español.
- [ ] **Página de Selección de Carpeta:** La ruta por defecto apunta a `%LOCALAPPDATA%\Programs\VetApp`. El botón *Examinar* permite cambiar la ruta a una carpeta secundaria de usuario.
- [ ] **Página de Opciones Adicionales:**
  - Casilla *"Crear acceso directo en el escritorio"* está marcada por defecto.
  - Casilla *"Iniciar VetApp al arrancar Windows"* está desmarcada por defecto.
  - Al marcar el inicio automático, se comprueba que tras finalizar la instalación la clave `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\VetApp` apunta a `"$INSTDIR\VetApp.exe"`.
- [ ] **Página de Progreso:** La barra de avance completa la copia de archivos sin diálogos de error de makensis ni prompts UAC.
- [ ] **Página de Finalización:** Se muestra la casilla *"Ejecutar VetApp"*. Al pulsar *Terminar* con la casilla marcada, VetApp arranca de forma inmediata.

#### B. Verificación del Asistente de Desinstalación (Desinstalador):
- [ ] **Acceso:** Iniciar el desinstalador desde *Configuración > Aplicaciones instaladas > VetApp > Desinstalar* o ejecutando `Uninstall VetApp.exe`.
- [ ] **Página de Confirmación y Opciones:** Se despliega la barra lateral `uninstallerSidebar.bmp` y el texto de confirmación en español.
- [ ] **Casilla de Datos de Usuario:** La opción *"Eliminar datos de usuario y configuración local"* aparece desmarcada por defecto. Si se marca, elimina las carpetas de datos de sesión en `%APPDATA%\VetApp`.
- [ ] **Limpieza de Accesos Directos:** Tras desinstalar, el acceso directo en el Escritorio y en la carpeta del Menú Inicio desaparecen.
- [ ] **Limpieza del Registro:** El valor `VetApp` en `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` queda eliminado.

### 9.7 Actualizaciones Automáticas (Auto-Updater con Pantalla Splash)

- **Proveedor:** GitHub Releases con repositorio público (`RainbowDash23/vet-app`).
- **Comportamiento en segundo plano:**
  - Las actualizaciones automáticas invocan `quitAndInstall(true, true)` (`isSilent: true`, `isForceRunAfter: true`), aplicando el parche sin mostrar el asistente de instalación interactivo y preservando la carpeta elegida por el usuario y su estado de inicio automático.
- **Comportamiento al iniciar:** Se despliega una ventana splash sobria y oscura (estilo Discord) que consulta el canal de releases de GitHub:
  - Si hay una nueva versión disponible, descarga la actualización en segundo plano mostrando el progreso porcentual y solicita reiniciar para aplicar la actualización.
  - Si la aplicación está al día, si ocurre un error de red o si la comprobación tarda más de 10 segundos (timeout de seguridad), la ventana de carga se cierra suavemente y se presenta de inmediato la pantalla principal.
- **Seguridad en actualizaciones:** No se permiten versiones preliminares (`allowPrerelease: false`) ni retrocesos de versión no controlados (`allowDowngrade: false`). En modo de desarrollo (`NODE_ENV !== 'production'`), el auto-updater se desactiva automáticamente.

### 9.8 Procedimiento de Lanzamiento y CI en GitHub Actions

El flujo [`.github/workflows/release.yml`](.github/workflows/release.yml) automatiza la compilación del frontend, empaquetado del instalador y publicación en GitHub:

#### 1. Configuración de Variables de Repositorio en GitHub
Antes de ejecutar el pipeline de release, configure la variable de repositorio pública en GitHub:
1. Navegue en el repositorio a: **Settings > Secrets and variables > Actions > Variables**.
2. Presione **New repository variable**.
3. Defina:
   - **Name:** `VITE_API_URL`
   - **Value:** `https://TU-SERVICIO.onrender.com` (URL base de su API backend en producción).
   - *(Opcional)* `VITE_PUBLIC_URL`: URL base pública para el portal de rescate si difiere de la API.

> [!NOTE]
> `VITE_API_URL` se configura como una **Variable de repositorio** (`vars.VITE_API_URL`) y **no como Secreto**, dado que las URLs de conexión pública del frontend y de endpoints de contingencia no representan credenciales secretas. El flujo fallará con un mensaje explícito si `VITE_API_URL` no está definida.

#### 2. Prueba del Instalador sin Publicar (`workflow_dispatch`)
Para verificar el empaquetado y descargar el instalador `.exe` sin crear una etiqueta Git ni publicar un release:
1. En GitHub, ingrese a la pestaña **Actions > Desktop Release**.
2. Haga clic en **Run workflow**.
3. Mantenga la opción `publish: false` y ejecute el workflow.
4. Al finalizar, el instalador generado estará disponible para descarga directa en la sección de **Artifacts** de la ejecución (`VetApp-Windows-Installer`).

#### 3. Publicación Oficial de Release (Git Tag)
Para publicar una versión oficial en GitHub Releases:
1. Incrementar la versión en `apps/desktop/package.json` (ejemplo: `"version": "0.1.1"`).
2. Crear y enviar la etiqueta Git correspondiente:
   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```
3. El workflow validará la coincidencia exacta de la etiqueta con `apps/desktop/package.json`, ejecutará la compilación de la app con `VITE_API_URL`, superará las quality gates y publicará los binarios (`VetApp-Setup-0.1.1.exe`, `latest.yml`, `.blockmap`) en GitHub Releases.

### 9.5 Verificación de Módulos Nativos y Hardware (Lector NFC)

El módulo de comunicación por puerto serial (`serialport` / `@serialport/bindings-cpp`) está empaquetado fuera del archivo `.asar` mediante la directiva `asarUnpack`, cargando los binarios precompilados de Node-API (`npmRebuild: false`):
- Al conectar una placa lectora ESP32 por USB, la aplicación autodetecta los chips CP210x o CH340 (`10C4:EA60` o `1A86:7523`) y los lista en la interfaz sin requerir compiladores de C++ ni dependencias externas.
- Los manejadores de simulación (`nfc:simulate-tag`) permanecen deshabilitados en la aplicación empaquetada para prevenir inyecciones artificiales en entornos de producción, salvo activación explícita mediante la variable de desarrollo `VITE_DEV_TOOLS=true`.
