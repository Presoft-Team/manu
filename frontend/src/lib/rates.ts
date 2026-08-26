/**
 * Plant rates. One copy, shared by the planning engine in the store and the
 * actual-cost engine in analytics, so planned and actual are costed the same way.
 * These become a rates table in the backend.
 */
export const LABOUR_RATE_PER_HOUR = 118
export const OVERHEAD_RATE = 0.6
export const SCRAP_ALLOWANCE_PCT = 0.02

/** Yield below this on a finished operation is a quality escalation, not noise. */
export const YIELD_TARGET_PCT = 95
