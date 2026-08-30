/**
 * The schema this application owns.
 *
 * `portal`, and only `portal`. The company website owns `company` in the same
 * database and the two are deliberately not joined: the owner's rule on
 * 2026-08-29 was that neither project may break the other, so the portal reads
 * no table belonging to the website and declares no foreign key into it.
 *
 * `clients.lead_id` is the one place they touch, and it is a bare uuid with no
 * constraint — enough to trace an enquiry to the client it became, not enough
 * for a migration over there to fail one over here.
 */
export const DB_SCHEMA = "portal" as const;

/** The cookie prefix Supabase writes. Used to tell "has a session" cheaply. */
export const AUTH_COOKIE_PREFIX = "sb-";
