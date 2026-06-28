// engine/line-range.ts
// ===========================================================================
// Line-range overlap utility for line-level permission checking.
//
// Line ranges use 1-based inclusive semantics.
// begin=0 or undefined means "no lower bound" (start of file).
// end=0 or undefined means "no upper bound" (end of file).
// ===========================================================================

/**
 * A line range with 1-based inclusive boundaries.
 * begin=0 means unbounded below, end=0 means unbounded above.
 */
export interface LineRange {
  begin: number;
  end: number;
}

/**
 * Check if two line ranges overlap.
 * Ranges are inclusive on both ends.
 */
export function rangesOverlap(a: LineRange, b: LineRange): boolean {
  const aStart = a.begin > 0 ? a.begin : 1;
  const aEnd = a.end > 0 ? a.end : Infinity;
  const bStart = b.begin > 0 ? b.begin : 1;
  const bEnd = b.end > 0 ? b.end : Infinity;
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Parse a line range string like "1-100", "50-", "-200", "42".
 * Returns a LineRange with 1-based inclusive boundaries.
 */
export function parseLineRange(raw: string): LineRange {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "-") {
    return { begin: 0, end: 0 };
  }

  const dashIdx = trimmed.indexOf("-");
  if (dashIdx === -1) {
    // Single line number
    const n = parseInt(trimmed, 10);
    if (isNaN(n) || n < 1) return { begin: 0, end: 0 };
    return { begin: n, end: n };
  }

  const before = trimmed.slice(0, dashIdx).trim();
  const after = trimmed.slice(dashIdx + 1).trim();

  const begin = before ? parseInt(before, 10) : 0;
  const end = after ? parseInt(after, 10) : 0;

  return {
    begin: isNaN(begin) || begin < 0 ? 0 : begin,
    end: isNaN(end) || end < 0 ? 0 : end,
  };
}

/**
 * Build a LineRange from optional begin/end numbers.
 * Handles the TOML policy's 0 = unbounded convention.
 */
export function buildLineRange(
  lines_begin?: number,
  lines_end?: number,
): LineRange | null {
  if (lines_begin === undefined && lines_end === undefined) return null;
  return {
    begin: lines_begin ?? 0,
    end: lines_end ?? 0,
  };
}
