// Midnight (UTC) of the given instant's calendar day.
export const startOfUTCDay = (date: Date): Date =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

// Same calendar day plus `days`, at UTC midnight. Day/month/year overflow rolls
// over the same way the Date constructor does.
export const addUTCDays = (date: Date, days: number): Date =>
  new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
    ),
  );

// Same calendar day minus `months`, at UTC midnight. If the day of month does
// not exist in the target month it overflows into the next month.
export const subUTCMonths = (date: Date, months: number): Date =>
  new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() - months,
      date.getUTCDate(),
    ),
  );

// Format a calendar date in the UTC frame, so the displayed day matches the UTC
// arithmetic above rather than being shifted by the server's local timezone.
export const formatUTCDate = (
  date: Date,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string => date.toLocaleDateString(locale, { ...options, timeZone: "UTC" });
