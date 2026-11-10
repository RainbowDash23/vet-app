import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
  escapeHtml,
  formatSpeciesLabel,
  formatSexLabel,
  isValidPhoneNumber,
  isValidInternationalPhone,
  getWhatsAppNumber,
  getTelUri,
  renderRescueHtml,
  renderNotFoundHtml,
} from '../../src/modules/emergency/public-rescue.controller';
import { PetSpecies, PetSex } from '@vet-app/shared-types';
import type { EmergencyPetProfileDto } from '../../src/modules/emergency/dto/emergency-pet-profile.dto';

describe('PublicRescueController & SSR HTML Helper Suite (RF-64 / feat/rescue-page-polish)', () => {
  describe('1. Sanitización estricta contra XSS (escapeHtml)', () => {
    it('debe escapar correctamente caracteres peligrosos &, <, >, ", y \'', () => {
      const hostile = `<script>alert("XSS & 'pwned'")</script>`;
      const escaped = escapeHtml(hostile);

      assert.strictEqual(escaped.includes('<script>'), false);
      assert.strictEqual(escaped.includes('&lt;script&gt;'), true);
      assert.strictEqual(escaped.includes('&quot;'), true);
      assert.strictEqual(escaped.includes('&#039;'), true);
      assert.strictEqual(escaped.includes('&amp;'), true);
    });

    it('maneja valores vacíos, nulos y undefined de forma segura', () => {
      assert.strictEqual(escapeHtml(null), '');
      assert.strictEqual(escapeHtml(undefined), '');
      assert.strictEqual(escapeHtml(''), '');
    });
  });

  describe('2. Traducción de especie y sexo a español natural', () => {
    it('traduce todos los enums de especie biológica a términos cálidos en español sin mostrar el enum crudo', () => {
      assert.strictEqual(formatSpeciesLabel(PetSpecies.CANINE), 'Perro');
      assert.strictEqual(formatSpeciesLabel(PetSpecies.FELINE), 'Gato');
      assert.strictEqual(formatSpeciesLabel(PetSpecies.AVIAN), 'Ave');
      assert.strictEqual(formatSpeciesLabel(PetSpecies.EQUINE), 'Caballo');
      assert.strictEqual(formatSpeciesLabel(PetSpecies.RODENT), 'Roedor');
      assert.strictEqual(formatSpeciesLabel(PetSpecies.REPTILE), 'Reptil');
      assert.strictEqual(formatSpeciesLabel(PetSpecies.OTHER), 'Otro');
      assert.strictEqual(formatSpeciesLabel('UNKNOWN_SPECIES'), 'Otro');
      assert.strictEqual(formatSpeciesLabel(null), 'Otro');
    });

    it('traduce sexo biológico a Macho / Hembra y retorna null para desconocidos', () => {
      assert.strictEqual(formatSexLabel(PetSex.MALE), 'Macho');
      assert.strictEqual(formatSexLabel(PetSex.FEMALE), 'Hembra');
      assert.strictEqual(formatSexLabel(PetSex.UNKNOWN), null);
      assert.strictEqual(formatSexLabel(null), null);
      assert.strictEqual(formatSexLabel(undefined), null);
    });
  });

  describe('3. Normalización y validación de números telefónicos (E.164 y detección de placeholders)', () => {
    it('isValidPhoneNumber reconoce números válidos y descarta números vacíos o demasiado cortos', () => {
      assert.strictEqual(isValidPhoneNumber('+593991234567'), true);
      assert.strictEqual(isValidPhoneNumber('+34 612 345 678'), true);
      assert.strictEqual(isValidPhoneNumber('987654321'), true);
      assert.strictEqual(isValidPhoneNumber('12345'), false); // Menos de 7 dígitos
      assert.strictEqual(isValidPhoneNumber(''), false);
      assert.strictEqual(isValidPhoneNumber(null), false);
    });

    it('isValidPhoneNumber descarta placeholders con puros ceros', () => {
      assert.strictEqual(isValidPhoneNumber('+000000000'), false);
      assert.strictEqual(isValidPhoneNumber('0000000000'), false);
      assert.strictEqual(isValidPhoneNumber('+0000000'), false);
      assert.strictEqual(isValidPhoneNumber('000-000-0000'), false);
    });

    it('isValidInternationalPhone valida que inicie con + y formato E.164', () => {
      assert.strictEqual(isValidInternationalPhone('+593991234567'), true);
      assert.strictEqual(isValidInternationalPhone('+34612345678'), true);
      assert.strictEqual(isValidInternationalPhone('+12025550123'), true);
      assert.strictEqual(isValidInternationalPhone('987654321'), false); // Falta prefijo internacional +
      assert.strictEqual(isValidInternationalPhone('+000000000'), false); // Placeholder
      assert.strictEqual(isValidInternationalPhone('+012345678'), false); // Código de país no puede iniciar con 0
    });

    it('getWhatsAppNumber genera el número limpio sin + ni espacios para enlaces wa.me', () => {
      assert.strictEqual(getWhatsAppNumber('+593991234567'), '593991234567');
      assert.strictEqual(getWhatsAppNumber('+34 612-34-56-78'), '34612345678');
      assert.strictEqual(getWhatsAppNumber('987654321'), null); // No es formato internacional
      assert.strictEqual(getWhatsAppNumber('+000000000'), null);
    });

    it('getTelUri formatea la URI adecuada para tel:', () => {
      assert.strictEqual(getTelUri('+593 99 123 4567'), '+593991234567');
      assert.strictEqual(getTelUri('02 298-7654'), '022987654');
    });
  });

  describe('4. Generación del documento HTML de rescate (renderRescueHtml)', () => {
    const baseProfile: EmergencyPetProfileDto = {
      petName: 'Rocky',
      species: PetSpecies.CANINE,
      breed: 'Golden Retriever',
      sex: PetSex.MALE,
      ownerName: 'Laura Morales',
      ownerPhone: '+593991234567',
      clinicName: 'Clínica Veterinaria Central',
      clinicPhone: '+59322987654',
    };

    it('cumple con los textos warm & sober: título, subtítulo, etiqueta MASCOTA y pie con llavero NFC', () => {
      const html = renderRescueHtml(baseProfile);

      assert.ok(html.includes('<h1>Esta mascota tiene dueño</h1>'));
      assert.ok(html.includes('<p>Ayúdala a volver a casa: contacta a su dueño</p>'));
      assert.ok(html.includes('MASCOTA'));
      assert.ok(html.includes('Identificación de mascotas con llavero NFC'));

      // Textos eliminados
      assert.strictEqual(html.toLowerCase().includes('paciente'), false, 'NO debe contener la palabra Paciente');
      assert.strictEqual(html.includes('Mascota Extraviada'), false, 'NO debe contener encabezado Mascota Extraviada');
      assert.strictEqual(html.includes('Sistema Veterinario de Rescate e Identificación'), false);

      // Cero emojis
      const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]/u;
      assert.strictEqual(emojiRegex.test(html), false, 'El HTML no debe contener ningún emoji');
    });

    it('muestra especie y sexo en español y NUNCA enums crudos', () => {
      const html = renderRescueHtml(baseProfile);

      assert.ok(html.includes('Perro'));
      assert.ok(html.includes('Macho'));
      assert.strictEqual(html.includes('CANINE'), false, 'NO debe exponer el enum crudo CANINE');
      assert.strictEqual(html.includes('MALE'), false, 'NO debe exponer el enum crudo MALE');
    });

    it('muestra raza solo si existe y no es "No especificada"', () => {
      const withBreed = renderRescueHtml(baseProfile);
      assert.ok(withBreed.includes('Golden Retriever'));

      const withoutBreed = renderRescueHtml({
        ...baseProfile,
        breed: null,
      });
      assert.strictEqual(withoutBreed.includes('No especificada'), false);
      assert.ok(withoutBreed.includes('Perro &bull; Macho'));

      const emptyBreed = renderRescueHtml({
        ...baseProfile,
        breed: 'No especificada',
      });
      assert.strictEqual(emptyBreed.includes('No especificada'), false);
    });

    it('genera botones de Llamar y Escribir por WhatsApp cuando el teléfono del dueño es internacional válido', () => {
      const html = renderRescueHtml(baseProfile);

      assert.ok(html.includes('href="tel:+593991234567"'));
      assert.ok(html.includes('Llamar'));
      assert.ok(html.includes('href="https://wa.me/593991234567"'));
      assert.ok(html.includes('Escribir por WhatsApp'));
    });

    it('si el teléfono del dueño es nacional (sin +), muestra botón Llamar pero NO botón WhatsApp', () => {
      const html = renderRescueHtml({
        ...baseProfile,
        ownerPhone: '0991234567',
      });

      assert.ok(html.includes('href="tel:0991234567"'));
      assert.ok(html.includes('Llamar'));
      assert.strictEqual(html.includes('wa.me'), false, 'No debe mostrar botón de WhatsApp si no es internacional');
      assert.strictEqual(html.includes('Escribir por WhatsApp'), false);
    });

    it('si el teléfono del dueño es inválido o placeholder, NO muestra botones de contacto rotos', () => {
      const html = renderRescueHtml({
        ...baseProfile,
        ownerPhone: '+000000000',
        clinicPhone: null,
      });

      assert.strictEqual(html.includes('href="tel:'), false);
      assert.strictEqual(html.includes('wa.me'), false);
      assert.ok(html.includes('Teléfono de contacto no disponible'));
    });

    it('bloque de clínica de referencia se muestra si la clínica tiene teléfono válido', () => {
      const html = renderRescueHtml(baseProfile);

      assert.ok(html.includes('Clínica de referencia'));
      assert.ok(html.includes('Clínica Veterinaria Central'));
      assert.ok(html.includes('href="tel:+59322987654"'));
      assert.ok(html.includes('Llamar a la clínica'));
    });

    it('bloque de clínica de referencia se OMITE COMPLETAMENTE si tiene teléfono placeholder (+000000000)', () => {
      const html = renderRescueHtml({
        ...baseProfile,
        clinicPhone: '+000000000',
      });

      assert.strictEqual(html.includes('Clínica de referencia'), false);
      assert.strictEqual(html.includes('+000000000'), false);
      assert.strictEqual(html.includes('Llamar a la clínica'), false);
    });

    it('incluye meta robots noindex, nofollow y título exacto de la página', () => {
      const html = renderRescueHtml(baseProfile);

      assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'));
      assert.ok(html.includes('<title>Mascota registrada - contacto de emergencia</title>'));
      assert.ok(html.includes('<html lang="es">'));
    });

    it('escapa datos hostiles para prevenir ataques XSS', () => {
      const hostileProfile: EmergencyPetProfileDto = {
        ...baseProfile,
        petName: '<script>alert("XSS")</script>',
        ownerName: 'Hacker "><img src=x onerror=alert(1)>',
        breed: '<b>Mestizo</b>',
      };

      const html = renderRescueHtml(hostileProfile);

      assert.strictEqual(html.includes('<script>'), false);
      assert.strictEqual(html.includes('<img src=x'), false);
      assert.strictEqual(html.includes('<b>Mestizo</b>'), false);
      assert.ok(html.includes('&lt;script&gt;'));
      assert.ok(html.includes('&lt;b&gt;Mestizo&lt;/b&gt;'));
    });
  });

  describe('5. Generación del documento HTML 404 (renderNotFoundHtml)', () => {
    it('incluye meta robots noindex, nofollow, lang="es", diseño sobrio y cero emojis', () => {
      const html = renderNotFoundHtml();

      assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'));
      assert.ok(html.includes('<html lang="es">'));
      assert.ok(html.includes('Código de rescate no encontrado o inactivo'));

      const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]/u;
      assert.strictEqual(emojiRegex.test(html), false);
    });
  });
});
