import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgDir = path.resolve(__dirname, '..');

describe('T02: @vet-app/shared-types Data Contracts, DTOs and Shared Enums', () => {
  const packageJsonPath = path.join(pkgDir, 'package.json');
  const tsconfigJsonPath = path.join(pkgDir, 'tsconfig.json');
  const srcDir = path.join(pkgDir, 'src');
  const distDir = path.join(pkgDir, 'dist');

  describe('1. Workspace and Package Configuration', () => {
    test('package.json exists and defines correct package metadata', () => {
      assert.ok(fs.existsSync(packageJsonPath), 'package.json must exist in packages/shared-types');
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      assert.equal(pkg.name, '@vet-app/shared-types');
      assert.equal(pkg.version, '0.1.0');
      assert.equal(pkg.private, true);
      assert.equal(pkg.main, 'dist/index.js');
      assert.equal(pkg.types, 'dist/index.d.ts');
      assert.ok(pkg.scripts && pkg.scripts.build, 'build script must be defined');
      assert.ok(pkg.scripts && pkg.scripts.test, 'test script must be defined');
    });

    test('tsconfig.json exists, extends @vet-app/tsconfig/base.json and enables declarations', () => {
      assert.ok(fs.existsSync(tsconfigJsonPath), 'tsconfig.json must exist');
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigJsonPath, 'utf8'));
      assert.ok(
        tsconfig.extends === '@vet-app/tsconfig/base.json' ||
        tsconfig.extends === '../tsconfig/base.json',
        'tsconfig must extend base.json'
      );
      assert.equal(tsconfig.compilerOptions?.declaration, true, 'declaration must be true');
      assert.equal(tsconfig.compilerOptions?.outDir, './dist', 'outDir must be ./dist');
    });
  });

  describe('2. Source File Structure and No Any / No @ts-ignore', () => {
    const requiredFiles = [
      'src/index.ts',
      'src/enums/role.enum.ts',
      'src/enums/species.enum.ts',
      'src/enums/tag-status.enum.ts',
      'src/enums/visit-status.enum.ts',
      'src/enums/access-action.enum.ts',
      'src/enums/grant.enum.ts',
      'src/enums/clinic-patient-source.enum.ts',
      'src/dtos/auth.dto.ts',
      'src/dtos/clinic.dto.ts',
      'src/dtos/user.dto.ts',
      'src/dtos/owner.dto.ts',
      'src/dtos/pet.dto.ts',
      'src/dtos/tag.dto.ts',
      'src/dtos/emergency.dto.ts',
      'src/dtos/visit.dto.ts',
      'src/dtos/vitals.dto.ts',
      'src/dtos/visit-note.dto.ts',
      'src/dtos/pagination.dto.ts',
      'src/interfaces/electron-api.interface.ts',
      'src/interfaces/access-grant.interface.ts',
    ];

    test('all required enum, DTO and interface source files exist', () => {
      for (const relPath of requiredFiles) {
        const fullPath = path.join(pkgDir, relPath);
        assert.ok(fs.existsSync(fullPath), `Source file missing: ${relPath}`);
      }
    });

    test('source files contain zero "any" types and zero "@ts-ignore" comments (RNF-1 & Constitution Principle 4)', () => {
      function checkDir(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const res = path.resolve(dir, entry.name);
          if (entry.isDirectory()) {
            checkDir(res);
          } else if (entry.name.endsWith('.ts')) {
            const content = fs.readFileSync(res, 'utf8');
            assert.ok(!content.includes('@ts-ignore'), `File ${entry.name} contains @ts-ignore`);
            assert.ok(!content.includes('@ts-nocheck'), `File ${entry.name} contains @ts-nocheck`);
            // Check for explicit "any" type usage (: any, as any, <any>)
            const anyRegex = /:\s*any\b|\bas\s+any\b|<any>/;
            assert.ok(!anyRegex.test(content), `File ${entry.name} contains loose 'any' type: ${content.match(anyRegex)?.[0]}`);
          }
        }
      }
      assert.ok(fs.existsSync(srcDir), 'src directory must exist');
      checkDir(srcDir);
    });
  });

  describe('3. Build and Declaration Output Verification', () => {
    test('TypeScript compilation produces dist/index.js and dist/index.d.ts without errors', () => {
      assert.ok(fs.existsSync(path.join(distDir, 'index.js')), 'dist/index.js must be generated');
      assert.ok(fs.existsSync(path.join(distDir, 'index.d.ts')), 'dist/index.d.ts must be generated');
    });
  });

  describe('4. Enumerations Integrity & Values Verification', async () => {
    test('enums have required values and members', async () => {
      const distIndex = path.join(distDir, 'index.js');
      assert.ok(fs.existsSync(distIndex), 'dist/index.js must exist to test runtime exports');
      const exported = await import(`file://${distIndex.replace(/\\/g, '/')}`);

      // Role
      assert.ok(exported.Role, 'Role enum must be exported');
      assert.equal(exported.Role.ADMIN, 'ADMIN');
      assert.equal(exported.Role.VET, 'VET');
      assert.equal(exported.Role.RECEPTION, 'RECEPTION');

      // Species / PetSpecies
      assert.ok(exported.PetSpecies || exported.Species, 'PetSpecies enum must be exported');
      const SpeciesEnum = exported.PetSpecies || exported.Species;
      assert.equal(SpeciesEnum.CANINE, 'CANINE');
      assert.equal(SpeciesEnum.FELINE, 'FELINE');
      assert.equal(SpeciesEnum.AVIAN, 'AVIAN');
      assert.equal(SpeciesEnum.EQUINE, 'EQUINE');
      assert.equal(SpeciesEnum.RODENT, 'RODENT');
      assert.equal(SpeciesEnum.REPTILE, 'REPTILE');
      assert.equal(SpeciesEnum.OTHER, 'OTHER');

      // PetSex
      assert.ok(exported.PetSex, 'PetSex enum must be exported');
      assert.equal(exported.PetSex.MALE, 'MALE');
      assert.equal(exported.PetSex.FEMALE, 'FEMALE');
      assert.equal(exported.PetSex.UNKNOWN, 'UNKNOWN');

      // ReproductiveStatus
      assert.ok(exported.ReproductiveStatus, 'ReproductiveStatus enum must be exported');
      assert.equal(exported.ReproductiveStatus.INTACT, 'INTACT');
      assert.equal(exported.ReproductiveStatus.NEUTERED, 'NEUTERED');
      assert.equal(exported.ReproductiveStatus.SPAYED, 'SPAYED');
      assert.equal(exported.ReproductiveStatus.UNKNOWN, 'UNKNOWN');

      // TagStatus
      assert.ok(exported.TagStatus, 'TagStatus enum must be exported');
      assert.equal(exported.TagStatus.ACTIVE, 'ACTIVE');
      assert.equal(exported.TagStatus.INACTIVE, 'INACTIVE');
      assert.equal(exported.TagStatus.LOST, 'LOST');
      assert.equal(exported.TagStatus.DAMAGED, 'DAMAGED');

      // VisitStatus
      assert.ok(exported.VisitStatus, 'VisitStatus enum must be exported');
      assert.equal(exported.VisitStatus.PENDING, 'PENDING');
      assert.equal(exported.VisitStatus.SCHEDULED, 'SCHEDULED');
      assert.equal(exported.VisitStatus.CANCELLED, 'CANCELLED');

      // AccessAction
      assert.ok(exported.AccessAction, 'AccessAction enum must be exported');
      assert.equal(exported.AccessAction.NFC_SCAN, 'NFC_SCAN');
      assert.equal(exported.AccessAction.MANUAL_LOOKUP, 'MANUAL_LOOKUP');
      assert.equal(exported.AccessAction.HISTORY_VIEW, 'HISTORY_VIEW');
      assert.equal(exported.AccessAction.EMERGENCY_SCAN, 'EMERGENCY_SCAN');
      assert.equal(exported.AccessAction.ROSTER_ADD, 'ROSTER_ADD');

      // ClinicPatientSource
      assert.ok(exported.ClinicPatientSource, 'ClinicPatientSource enum must be exported');
      assert.equal(exported.ClinicPatientSource.REGISTERED, 'REGISTERED');
      assert.equal(exported.ClinicPatientSource.ADDED_AFTER_SCAN, 'ADDED_AFTER_SCAN');

      // GrantSource & GrantType & GrantScope
      assert.ok(exported.GrantSource, 'GrantSource enum must be exported');
      assert.equal(exported.GrantSource.NFC_TAP, 'NFC_TAP');
      assert.equal(exported.GrantSource.OWNER_SIGNATURE, 'OWNER_SIGNATURE');
      assert.equal(exported.GrantSource.CLINIC_REFERRAL, 'CLINIC_REFERRAL');
      assert.equal(exported.GrantSource.EMERGENCY_OVERRIDE, 'EMERGENCY_OVERRIDE');

      assert.ok(exported.GrantScope, 'GrantScope enum must be exported');
      assert.equal(exported.GrantScope.FULL_HISTORY, 'FULL_HISTORY');
      assert.equal(exported.GrantScope.VACCINES_ONLY, 'VACCINES_ONLY');
    });

    test('enums are immutable at runtime (Object.freeze check)', async () => {
      const distIndex = path.join(distDir, 'index.js');
      const exported = await import(`file://${distIndex.replace(/\\/g, '/')}`);
      assert.throws(() => {
        // Enums should not allow mutation in strict mode if frozen or sealed
        exported.Role.NEW_ROLE = 'HACKED';
      }, /Cannot add property|is not extensible/);
    });
  });

  describe('5. Physiological Vitals Limits Contract', async () => {
    test('VITALS_LIMITS constants match physiological validation boundaries (RF-44)', async () => {
      const distIndex = path.join(distDir, 'index.js');
      const exported = await import(`file://${distIndex.replace(/\\/g, '/')}`);
      assert.ok(exported.VITALS_LIMITS, 'VITALS_LIMITS must be exported');
      assert.equal(exported.VITALS_LIMITS.WEIGHT.MIN, 0.05);
      assert.equal(exported.VITALS_LIMITS.WEIGHT.MAX, 150.0);
      assert.equal(exported.VITALS_LIMITS.TEMPERATURE.MIN, 32.0);
      assert.equal(exported.VITALS_LIMITS.TEMPERATURE.MAX, 43.0);
      assert.equal(exported.VITALS_LIMITS.HEART_RATE.MIN, 30);
      assert.equal(exported.VITALS_LIMITS.HEART_RATE.MAX, 300);
      assert.equal(exported.VITALS_LIMITS.RESPIRATORY_RATE.MIN, 10);
      assert.equal(exported.VITALS_LIMITS.RESPIRATORY_RATE.MAX, 120);
      assert.equal(exported.VITALS_LIMITS.CAPILLARY_REFILL_TIME.MIN, 1);
      assert.equal(exported.VITALS_LIMITS.CAPILLARY_REFILL_TIME.MAX, 5);
    });
  });

  describe('6. Multi-tenancy DTO Safety Rules (RF-9)', () => {
    test('CreateVisitDto, CreateUserDto and CreatePetDto do not expose clinicId to prevent multi-tenant spoofing', () => {
      const visitDtoPath = path.join(pkgDir, 'src/dtos/visit.dto.ts');
      const userDtoPath = path.join(pkgDir, 'src/dtos/user.dto.ts');
      const petDtoPath = path.join(pkgDir, 'src/dtos/pet.dto.ts');

      const visitContent = fs.readFileSync(visitDtoPath, 'utf8');
      const userContent = fs.readFileSync(userDtoPath, 'utf8');
      const petContent = fs.readFileSync(petDtoPath, 'utf8');

      // CreateVisitDto should not have clinicId
      const createVisitBlock = visitContent.match(/export (interface|class) CreateVisitDto\s*\{[^}]*\}/s);
      assert.ok(createVisitBlock, 'CreateVisitDto must be defined');
      assert.ok(!createVisitBlock[0].includes('clinicId'), 'CreateVisitDto must NOT contain clinicId (RF-9)');

      // CreateUserDto should not have clinicId
      const createUserBlock = userContent.match(/export (interface|class) CreateUserDto\s*\{[^}]*\}/s);
      assert.ok(createUserBlock, 'CreateUserDto must be defined');
      assert.ok(!createUserBlock[0].includes('clinicId'), 'CreateUserDto must NOT contain clinicId (RF-9)');

      // CreatePetDto should not have clinicId
      const createPetBlock = petContent.match(/export (interface|class) CreatePetDto\s*\{[^}]*\}/s);
      assert.ok(createPetBlock, 'CreatePetDto must be defined');
      assert.ok(!createPetBlock[0].includes('clinicId'), 'CreatePetDto must NOT contain clinicId (RF-9)');
    });
  });

  describe('7. Emergency DTO Data Sanitization (RF-36)', () => {
    test('EmergencyPetProfileDto does not expose medical data, owner address or internal database IDs', () => {
      const emergencyDtoPath = path.join(pkgDir, 'src/dtos/emergency.dto.ts');
      const content = fs.readFileSync(emergencyDtoPath, 'utf8');
      const emergencyBlock = content.match(/export (interface|class) EmergencyPetProfileDto\s*\{[^}]*\}/s);
      assert.ok(emergencyBlock, 'EmergencyPetProfileDto must be defined');
      const block = emergencyBlock[0];
      assert.ok(!block.includes('medicalHistory'), 'Must NOT expose medicalHistory');
      assert.ok(!block.includes('diagnosis'), 'Must NOT expose diagnosis');
      assert.ok(!block.includes('treatment'), 'Must NOT expose treatment');
      assert.ok(!block.includes('address'), 'Must NOT expose owner address');
      assert.ok(!block.includes('documentId'), 'Must NOT expose owner documentId');
      assert.ok(!block.includes('petId:'), 'Must NOT expose petId');
      assert.ok(!block.includes('ownerId:'), 'Must NOT expose ownerId');
      assert.ok(!block.includes('clinicId:'), 'Must NOT expose clinicId');
    });
  });
});
