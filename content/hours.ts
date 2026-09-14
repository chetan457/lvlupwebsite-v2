/** PLACEHOLDER HOURS. Replace from the Hours tab of the spreadsheet. */

export type Hours = {
  /** 0 = Sunday, matching Date#getDay. */
  day: number;
  label: string;
  /** 24-hour "HH:MM", or null when closed. */
  opens: string | null;
  closes: string | null;
};

export const hours: Hours[] = [
  { day: 1, label: 'Monday', opens: '13:00', closes: '23:00' },
  { day: 2, label: 'Tuesday', opens: '13:00', closes: '23:00' },
  { day: 3, label: 'Wednesday', opens: '13:00', closes: '23:00' },
  { day: 4, label: 'Thursday', opens: '13:00', closes: '23:00' },
  { day: 5, label: 'Friday', opens: '13:00', closes: '24:00' },
  { day: 6, label: 'Saturday', opens: '11:00', closes: '24:00' },
  { day: 0, label: 'Sunday', opens: '11:00', closes: '23:00' },
];

/** Monday-first, the way a visitor reads a week. */
export const weekOrder: Hours[] = [...hours].sort(
  (a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7),
);
