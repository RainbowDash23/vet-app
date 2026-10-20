import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClinicsModule } from './modules/clinics/clinics.module';
import { UsersModule } from './modules/users/users.module';
import { OwnersModule } from './modules/owners/owners.module';
import { PetsModule } from './modules/pets/pets.module';
import { TagsModule } from './modules/tags/tags.module';
import { VisitsModule } from './modules/visits/visits.module';
import { AuditModule } from './modules/audit/audit.module';
import { EmergencyModule } from './modules/emergency/emergency.module';
import { VaccinationsModule } from './modules/vaccinations/vaccinations.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    HealthModule,
    AuthModule,
    ClinicsModule,
    UsersModule,
    OwnersModule,
    PetsModule,
    TagsModule,
    VisitsModule,
    AuditModule,
    EmergencyModule,
    VaccinationsModule,
    AttachmentsModule,
    NotificationsModule,
  ],
})
export class AppModule {}
