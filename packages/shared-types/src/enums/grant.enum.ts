export enum GrantSource {
  NFC_TAP = 'NFC_TAP',
  OWNER_SIGNATURE = 'OWNER_SIGNATURE',
  CLINIC_REFERRAL = 'CLINIC_REFERRAL',
  EMERGENCY_OVERRIDE = 'EMERGENCY_OVERRIDE',
}

Object.freeze(GrantSource);

export enum GrantType {
  NFC_TAP = 'NFC_TAP',
  EXPLICIT = 'EXPLICIT',
}

Object.freeze(GrantType);

export enum GrantScope {
  FULL_HISTORY = 'FULL_HISTORY',
  VACCINES_ONLY = 'VACCINES_ONLY',
  MINIMAL = 'MINIMAL',
}

Object.freeze(GrantScope);
