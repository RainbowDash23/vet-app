# VetApp - Sistema de Gestión Veterinaria con Llavero NFC

Sistema integral de gestión veterinaria multi-tenant para clínicas, pacientes, citas médicas, vacunación, fichas clínicas y control de acceso asistencial mediante llaveros NFC e historial inmutable.

---

## 1. Configuración de Variables de Entorno

El proyecto incluye un archivo de plantilla [.env.example](file:///C:/Users/josea/orca/projects/vet-app/.env.example) en la raíz y en `apps/api/`. Para configurar las variables locales:

```bash
cp .env.example .env
```

### Variables de Base de Datos y Docker Compose

| Variable | Descripción | Valor por Defecto / Ejemplo |
| :--- | :--- | :--- |
| `POSTGRES_USER` | Usuario administrador de PostgreSQL | `vet_admin` |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL (leída por Docker Compose) | `vet_secure_password_123` |
| `POSTGRES_DB` | Nombre de la base de datos de la aplicación | `vet_app_db` |
| `POSTGRES_PORT` | Puerto expuesto en el host por Docker Compose | `5433` (mapeado a 5432) |
| `DATABASE_URL` | Cadena de conexión para Prisma ORM | `postgresql://vet_admin:vet_secure_password_123@localhost:5433/vet_app_db?schema=public` |
| `USE_REAL_DB` | Forzar ejecución de pruebas E2E contra PostgreSQL real | `true` |

> [!IMPORTANT]
> La contraseña de la base de datos se desacopló de [docker-compose.yml](file:///C:/Users/josea/orca/projects/vet-app/docker-compose.yml) y se gestiona mediante la variable de entorno `POSTGRES_PASSWORD`, evitando credenciales en texto plano en el repositorio.

---

## 2. Puesta en Marcha de la Base de Datos

Para levantar el contenedor PostgreSQL de Docker Compose:

```bash
# Iniciar base de datos en segundo plano
pnpm db:up
# o directamente: docker compose up -d

# Detener base de datos
pnpm db:down
```

---

## 3. Ejecución de Pruebas contra PostgreSQL Real (`test:e2e:db`)

Para ejecutar la suite integral de pruebas E2E y de reversión transaccional (rollback) contra el contenedor real de PostgreSQL:

```bash
# Ejecutar suite E2E contra la base de datos real en Docker
pnpm test:e2e:db
```

Este script:
1. Define automáticamente `USE_REAL_DB=true`.
2. Resuelve la cadena de conexión hacia el puerto e instancia activa de Docker Compose (`localhost:5433/vet_app_db`).
3. Ejecuta de forma secuencial (`--test-concurrency=1`):
   - `test/access-policy-leaks.e2e-spec.ts`: Auditoría multi-tenant estricta, prevención de fugas de datos y pruebas de aislamiento (16 tests).
   - `test/rollback.e2e-spec.ts`: Pruebas de reversión atómica de transacciones y consistencia ACID (3 tests).

---

## 4. Otros Scripts Disponibles

- `pnpm test`: Ejecuta todos los tests unitarios en `apps/api` y `apps/desktop`.
- `pnpm test:e2e`: Ejecuta los tests E2E del backend en modo mock en memoria.
- `pnpm typecheck`: Verificación estricta de TypeScript en todo el monorepo sin supresiones (`strict: true`).
- `pnpm build`: Compilación de todos los paquetes y aplicaciones.
- `pnpm audit:security`: Auditoría estática automatizada de seguridad, RNF y aislamiento.
