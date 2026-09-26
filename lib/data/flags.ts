/** Per-tract status flag bits, shared by the server (lib/data/status.ts) and the browser. */
export const FLAGS = {
  eligible: 1,
  rural: 2,
  oz2018: 4,
  qct: 8,
  dda: 16,
  nmtc: 32,
  /** A designated 2027 zone. */
  zone2027: 64,
  /** Eligible, with its state's 2027 list not yet published (so zone2027 is not yet known). */
  zone2027Pending: 128,
} as const;
export type Flag = keyof typeof FLAGS;
