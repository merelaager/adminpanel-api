import { computePrice, REGISTRATION_FEE } from "#app/constants/pricing";
import { addUTCDays, startOfUTCDay, subUTCMonths } from "#app/lib/date";

const BOOKING_FEE_DAYS = 3;

export type BillableRegistration = {
  id: number;
  childName: string;
  shiftNr: number;
  isOld: boolean;
  priceToPay: number;
};

export type BillShift = {
  startDate: Date;
  length: number;
};

export type BillItemContent = {
  position: number;
  registrationId: number | null;
  childName: string;
  shiftNr: number;
  description: string;
  amount: number; // In cents
  bookingFee: number;
};

export type BillContent = {
  items: BillItemContent[];
  bookingFeeDue: Date;
  campFeeDue: Date;
};

const toCents = (euros: number): number => euros * 100;

const shiftDescription = (length: number, isOld: boolean): string =>
  `${length}päevane vahetus ${isOld ? "vanale olijale" : "uuele tulijale"}`;

export const buildBillContent = (
  registrations: readonly BillableRegistration[],
  shifts: ReadonlyMap<number, BillShift>,
  issuedAt: Date,
): BillContent => {
  if (registrations.length === 0) {
    throw new Error("A bill needs at least one registration");
  }

  const getShift = (shiftNr: number): BillShift => {
    const shift = shifts.get(shiftNr);
    if (!shift) throw new Error(`No shift info for shift ${shiftNr}`);
    return shift;
  };

  const sorted = [...registrations].sort(
    (a, b) =>
      a.shiftNr - b.shiftNr || a.childName.localeCompare(b.childName, "et"),
  );

  const items: BillItemContent[] = [];
  for (const registration of sorted) {
    const { childName, shiftNr, isOld } = registration;
    const listCents = toCents(computePrice(shiftNr, isOld));
    const priceCents = toCents(registration.priceToPay);

    items.push({
      position: items.length + 1,
      registrationId: registration.id,
      childName,
      shiftNr,
      description: shiftDescription(getShift(shiftNr).length, isOld),
      amount: listCents,
      bookingFee: Math.min(toCents(REGISTRATION_FEE), priceCents),
    });

    if (priceCents !== listCents) {
      items.push({
        position: items.length + 1,
        registrationId: null,
        childName,
        shiftNr,
        description: priceCents < listCents ? "Soodustus" : "Juurdehindlus",
        amount: priceCents - listCents,
        bookingFee: 0,
      });
    }
  }

  const bookingFeeDue = addUTCDays(startOfUTCDay(issuedAt), BOOKING_FEE_DAYS);
  const firstStart = Math.min(
    ...sorted.map((r) => getShift(r.shiftNr).startDate.getTime()),
  );
  const campFeeDue = subUTCMonths(new Date(firstStart), 1);

  return {
    items,
    bookingFeeDue,
    campFeeDue: campFeeDue < bookingFeeDue ? bookingFeeDue : campFeeDue,
  };
};
