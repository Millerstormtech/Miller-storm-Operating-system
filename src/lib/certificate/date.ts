// How a certificate prints its issue date. Pure, and shared by the training
// credentials and the Contract King so no two Miller Storm certificates spell
// the same day differently.

/** "19 August 2026". Hand-built: no locale surprises on a server in another zone. */
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Read in UTC, never the server's local zone.
 *
 * The dev machine is UTC+03:00 and the VPS is elsewhere again. A local read
 * would print the wrong day either side of midnight, which on a dated document
 * is not a rounding error: the Contract King sheet is issued at 09:00 Central
 * on the 1st, and a zone slip there would date it to the last day of the month
 * it is awarding.
 */
export function certificateDate(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
