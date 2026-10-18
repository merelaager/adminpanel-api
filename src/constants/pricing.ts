export const SHIFT_PRICES = [250, 360, 360, 360];
export const SENIORITY_DISCOUNTS = [10, 20, 20, 20];

export const REGISTRATION_FEE = 100;

// List price in euros. Shift numbers start at 1.
export const computePrice = (shiftNr: number, isOld: boolean): number => {
  const price = SHIFT_PRICES[shiftNr - 1];
  if (price === undefined) throw new Error(`No price for shift ${shiftNr}`);
  return isOld ? price - SENIORITY_DISCOUNTS[shiftNr - 1] : price;
};
