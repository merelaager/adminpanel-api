// https://pangaliit.ee/arveldused/viitenumber

const WEIGHTS = [7, 3, 1] as const;

const BASE_PATTERN = /^\d{1,19}$/;
const REFERENCE_PATTERN = /^\d{2,20}$/;

export const getReferenceCheckDigit = (base: string): number => {
  if (!BASE_PATTERN.test(base)) {
    throw new Error(`Reference number base must be 1-19 digits: '${base}'`);
  }

  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    const digit = Number(base[base.length - 1 - i]);
    sum += digit * WEIGHTS[i % WEIGHTS.length];
  }
  return (10 - (sum % 10)) % 10;
};

export const createReferenceNumber = (base: string): string =>
  `${base}${getReferenceCheckDigit(base)}`;

export const isValidReferenceNumber = (reference: string): boolean => {
  if (!REFERENCE_PATTERN.test(reference)) return false;
  const base = reference.slice(0, -1);
  const checkDigit = Number(reference.slice(-1));
  return getReferenceCheckDigit(base) === checkDigit;
};
