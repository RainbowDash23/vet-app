/**
 * Utilidad clínica para cálculo y formateo de la edad biológica de una mascota (RF-17).
 * Si la fecha de nacimiento no está registrada o es inválida, retorna "Edad no registrada".
 * Si isApproximate es true, añade el sufijo "(aprox.)".
 */
export function formatPetAge(
  birthDate?: string | Date | null,
  isApproximate?: boolean,
  now: Date = new Date(),
): string {
  if (!birthDate) return 'Edad no registrada';
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return 'Edad no registrada';

  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) {
    months--;
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  // Si la fecha es en el futuro
  if (years < 0) {
    return 'Edad no registrada';
  }

  let text = '';
  if (years === 0 && months === 0) {
    const diffTime = Math.abs(now.getTime() - birth.getTime());
    const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    text = days <= 1 ? '1 día' : `${days} días`;
  } else if (years === 0) {
    text = months === 1 ? '1 mes' : `${months} meses`;
  } else if (months === 0) {
    text = years === 1 ? '1 año' : `${years} años`;
  } else {
    text = `${years} ${years === 1 ? 'año' : 'años'}, ${months} ${months === 1 ? 'mes' : 'meses'}`;
  }

  return isApproximate ? `${text} (aprox.)` : text;
}
