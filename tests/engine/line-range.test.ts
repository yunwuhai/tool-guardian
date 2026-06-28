// tests/engine/line-range.test.ts
import { describe, it, expect } from "bun:test";
import {
  rangesOverlap,
  parseLineRange,
  buildLineRange,
} from "../../src/engine/line-range.ts";

describe("rangesOverlap", () => {
  it("fully contained range overlaps", () => {
    expect(rangesOverlap({ begin: 1, end: 100 }, { begin: 1, end: 50 })).toBe(true);
  });

  it("partial overlap at the end", () => {
    expect(rangesOverlap({ begin: 1, end: 100 }, { begin: 50, end: 150 })).toBe(true);
  });

  it("partial overlap at the beginning", () => {
    expect(rangesOverlap({ begin: 50, end: 150 }, { begin: 1, end: 75 })).toBe(true);
  });

  it("no overlap", () => {
    expect(rangesOverlap({ begin: 1, end: 100 }, { begin: 101, end: 200 })).toBe(false);
  });

  it("adjacent ranges (no overlap)", () => {
    expect(rangesOverlap({ begin: 1, end: 100 }, { begin: 101, end: 200 })).toBe(false);
  });

  it("exact same range", () => {
    expect(rangesOverlap({ begin: 10, end: 20 }, { begin: 10, end: 20 })).toBe(true);
  });

  it("single line overlap", () => {
    expect(rangesOverlap({ begin: 10, end: 10 }, { begin: 10, end: 10 })).toBe(true);
    expect(rangesOverlap({ begin: 10, end: 10 }, { begin: 11, end: 11 })).toBe(false);
  });

  describe("unbounded ranges (begin=0)", () => {
    it("unbounded below overlaps with anything above", () => {
      expect(rangesOverlap({ begin: 0, end: 100 }, { begin: 50, end: 150 })).toBe(true);
      expect(rangesOverlap({ begin: 0, end: 100 }, { begin: 1, end: 1 })).toBe(true);
    });

    it("unbounded below does not overlap if ranges are separated", () => {
      expect(rangesOverlap({ begin: 0, end: 100 }, { begin: 101, end: 200 })).toBe(false);
    });
  });

  describe("unbounded ranges (end=0)", () => {
    it("unbounded above overlaps with anything below the start", () => {
      expect(rangesOverlap({ begin: 50, end: 0 }, { begin: 1, end: 100 })).toBe(true);
      expect(rangesOverlap({ begin: 50, end: 0 }, { begin: 75, end: 75 })).toBe(true);
    });

    it("unbounded above does not overlap if below the start", () => {
      expect(rangesOverlap({ begin: 50, end: 0 }, { begin: 1, end: 49 })).toBe(false);
    });
  });

  describe("fully unbounded range (begin=0, end=0)", () => {
    it("overlaps with everything", () => {
      expect(rangesOverlap({ begin: 0, end: 0 }, { begin: 1, end: 1 })).toBe(true);
      expect(rangesOverlap({ begin: 0, end: 0 }, { begin: 1000000, end: 1000000 })).toBe(true);
    });
  });

  describe("commutativity", () => {
    it("rangesOverlap(A, B) === rangesOverlap(B, A)", () => {
      const a = { begin: 10, end: 50 };
      const b = { begin: 30, end: 80 };
      expect(rangesOverlap(a, b)).toBe(rangesOverlap(b, a));

      const c = { begin: 0, end: 100 };
      const d = { begin: 200, end: 0 };
      expect(rangesOverlap(c, d)).toBe(rangesOverlap(d, c));
    });
  });
});

describe("parseLineRange", () => {
  it('parses "1-100"', () => {
    expect(parseLineRange("1-100")).toEqual({ begin: 1, end: 100 });
  });

  it('parses "50-" as begin=50, unbounded end', () => {
    expect(parseLineRange("50-")).toEqual({ begin: 50, end: 0 });
  });

  it('parses "-200" as unbounded begin, end=200', () => {
    expect(parseLineRange("-200")).toEqual({ begin: 0, end: 200 });
  });

  it('parses "42" as single line', () => {
    expect(parseLineRange("42")).toEqual({ begin: 42, end: 42 });
  });

  it("returns unbounded for empty string", () => {
    expect(parseLineRange("")).toEqual({ begin: 0, end: 0 });
  });

  it('returns unbounded for "-"', () => {
    expect(parseLineRange("-")).toEqual({ begin: 0, end: 0 });
  });

  it("handles whitespace", () => {
    expect(parseLineRange(" 10 - 50 ")).toEqual({ begin: 10, end: 50 });
  });

  it("returns unbounded for invalid input", () => {
    expect(parseLineRange("abc-def")).toEqual({ begin: 0, end: 0 });
  });
});

describe("buildLineRange", () => {
  it("returns null for no bounds", () => {
    expect(buildLineRange()).toBeNull();
    expect(buildLineRange(undefined, undefined)).toBeNull();
  });

  it("builds range from begin only", () => {
    expect(buildLineRange(10)).toEqual({ begin: 10, end: 0 });
  });

  it("builds range from end only", () => {
    expect(buildLineRange(undefined, 100)).toEqual({ begin: 0, end: 100 });
  });

  it("builds range from both", () => {
    expect(buildLineRange(10, 100)).toEqual({ begin: 10, end: 100 });
  });
});
