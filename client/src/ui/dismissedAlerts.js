// Auto-resurface floor. A kiosk where someone dismisses a severe alert
// and the kiosk goes quiet for the rest of the storm is dangerous —
// after this window the alert reappears regardless of severity. Tuned
// long enough that a user reading the alert detail then collapsing
// the banner doesn't see it re-appear in their next coffee break.
export const AUTO_RESURFACE_MS = 4 * 60 * 60 * 1000;

/**
 * Strip stale dismissal entries. An entry is stale when:
 *   - the upstream `expiresAt` was in the future when dismissed (`exp > entry.ts`)
 *     and has since passed (`exp < now`),
 *   - OR the dismissal is older than `AUTO_RESURFACE_MS`.
 *
 * Checking `exp > entry.ts` ensures an alert whose upstream `expiresAt` was
 * already in the past at dismissal time falls back to `AUTO_RESURFACE_MS`
 * instead of deleting itself immediately when `writeStore` fires `STORAGE_EVENT`.
 *
 * Pure function on a snapshot, returns the cleaned map.
 *
 * @param {object} store dismissal map keyed by alert id
 * @param {number} [now] current epoch ms
 * @returns {object} cleaned dismissal map
 */
export function purgeStale(store, now = Date.now()) {
  const next = {};
  for (const [id, entry] of Object.entries(store || {})) {
    if (!entry || typeof entry.ts !== "number") continue;
    if (now - entry.ts > AUTO_RESURFACE_MS) continue;
    if (entry.expiresAt) {
      const exp = Date.parse(entry.expiresAt);
      if (Number.isFinite(exp) && exp > entry.ts && exp < now) continue;
    }
    next[id] = entry;
  }
  return next;
}
