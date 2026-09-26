import { describe, it, expect } from "vitest";
import { formatGBP, formatNumber, cn as fcn, deltaLabel, deltaClass, formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";

describe("format", () => {
  it("formats currency + numbers with null handling", () => {
    expect(formatGBP(1000)).toContain("1,000");
    expect(formatGBP(null)).toContain("0");
    expect(formatNumber(1234.5, 1)).toBe("1,234.5");
    expect(formatNumber(null)).toBe("0");
  });
  it("delta label + class across signs", () => {
    expect(deltaLabel(5)).toContain("↑");
    expect(deltaLabel(-5)).toContain("↓");
    expect(deltaLabel(0)).toContain("→");
    expect(deltaLabel(null)).toBe("");
    expect(deltaClass(null)).toBe("text-muted-foreground");
    expect(deltaClass(0)).toBe("text-muted-foreground");
    expect(deltaClass(5)).toBe("delta-up");
    expect(deltaClass(5, true)).toBe("delta-down");
    expect(deltaClass(-5)).toBe("delta-down");
    expect(fcn("a", false, "b")).toBe("a b");
  });
  it("utils cn merges classes", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
  it("formatFileSize shows bytes under 1KB, KB above it", () => {
    expect(formatFileSize(217)).toBe("217 B");
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(20480)).toBe("20 KB");
  });
});
