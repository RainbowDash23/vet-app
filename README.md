# VetApp

Sistema de gestión veterinaria con historial clínico ligado a un llavero NFC.

<!-- capturas y diagrama: pendiente -->

## Qué hace

- Historial clínico por mascota con consultas, constantes vitales y vacunas.
- Lectura NFC que abre una página pública de emergencia con el contacto del dueño.
- Aislamiento entre clínicas con consentimiento de acceso de 24 h.
- App de escritorio con instalador para Windows y actualización automática.

## Stack

NestJS, Prisma, PostgreSQL, Electron, React, TypeScript, pnpm monorepo, Docker y GitHub Actions.

## Seguridad

- Multi-tenant por clínica resuelto a partir de las claims del token JWT.
- Código público de emergencia desacoplado del UID físico del chip.
- Rate limiting y detección de anomalías en lecturas NFC.
- Aviso automático al dueño cuando otra clínica lee la chapa.
- Auditoría inmutable de accesos y escaneo continuo de secretos en CI.
- Riesgo aceptado: el UID del llavero es clonable en hardware físico.

## Probar en local

```bash
pnpm install
pnpm db:up
pnpm --filter @vet-app/api exec prisma migrate deploy && pnpm --filter @vet-app/api exec prisma db seed
pnpm dev:api
pnpm dev:electron
```

## Estado

API desplegada, instalador de Windows con actualizaciones automáticas y hardware NFC real pendiente.
