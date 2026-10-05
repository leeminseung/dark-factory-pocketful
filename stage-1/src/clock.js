// Response timestamps: RFC 3339 in UTC with an explicit "+00:00" offset (§3.4).

/** Formats epoch milliseconds, e.g. 2026-09-24T11:04:03.120+00:00. */
export const formatTimestamp = (ms) => new Date(ms).toISOString().replace('Z', '+00:00');

export const RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
