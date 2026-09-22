import { describe, expect, it } from "vitest";
import { csvCell } from "@/lib/admin";

describe("csvCell", () => {
  it("passes plain values through", () => {
    expect(csvCell("PG-014")).toBe("PG-014");
    expect(csvCell(null)).toBe("");
  });

  it("quotes commas, quotes, and newlines (RFC 4180)", () => {
    expect(csvCell("Rivera, Maria")).toBe('"Rivera, Maria"');
    expect(csvCell('the "best" bench')).toBe('"the ""best"" bench"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralizes spreadsheet formulas in visitor-supplied text", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell("+1 555")).toBe("'+1 555");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });
});
