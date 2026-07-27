import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { calculateEmiDataset, type EmiDataset, type EmiFrequencyPoint } from "@max-stoich/chemistry-engine";
import { calculateEmiElectricalRecord, createEmptyEmiProject, type EmiProjectRecord } from "../../lib/emi/project";
import { createEmiAnalysisXlsx } from "../../lib/emi/xlsx-export";

function dataset(filename: string, frequencies: readonly number[], transmission = 0.5): EmiDataset {
  const point = (frequencyHz: number, index: number): EmiFrequencyPoint => ({ rowNumber: index + 2, frequencyHz, s11: { real: 0.1, imaginary: 0.02 }, s21: { real: transmission, imaginary: 0.01 }, s22: { real: 0.12, imaginary: 0.03 }, s12: { real: transmission - 0.02, imaginary: 0.01 } });
  return { filename, headers: [], metadata: { comments: [] }, parsingIssues: [], points: frequencies.map(point) };
}

function decode(value: string): string { return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&amp;", "&"); }
function rows(source: string): readonly (readonly (string | number | null)[])[] {
  return [...source.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => [...String(row[1]).matchAll(/<c\s+([^>]*)>([\s\S]*?)<\/c>|<c\s+([^>]*)\/>/g)].map((cell) => {
    const attributes = cell[1] ?? cell[3] ?? ""; const body = cell[2] ?? ""; const inline = /t="inlineStr"/.test(attributes);
    const content = inline ? /<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1] : /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    return content === undefined ? null : inline ? decode(content) : Number(content);
  }));
}

describe("EMI XLSX authoritative export round trip", () => {
  it("round-trips sheets, numeric values, unequal lengths, electrical data, and Simon values", () => {
    const first = dataset("first.csv", [10e9, 11e9, 12e9]); const second = dataset("second.csv", [9e9, 10e9]); const third = dataset("historical.csv", [10e9]);
    const files = [first, second, third].map((source, index) => ({ id: String(index + 1), dataset: source, calculation: calculateEmiDataset(source), issues: [] }));
    const base = createEmptyEmiProject("Workbook audit", "2026-07-27T00:00:00.000Z");
    const project: EmiProjectRecord = { ...base, datasets: [
      { id: "1", originalFilename: first.filename, parsedDataset: first, sampleMetadata: { displayName: "Valid sample", sampleId: "S-1", thickness: 10, thicknessUnit: "um" }, importedAt: base.createdAt, parserVersion: "test", electricalProperties: calculateEmiElectricalRecord({ thicknessMicrometers: 10, rawResistanceReadingsOhm: [1, 2] }) },
      { id: "2", originalFilename: second.filename, parsedDataset: second, sampleMetadata: { displayName: "Partial sample", thickness: 10, thicknessUnit: "um" }, importedAt: base.createdAt, parserVersion: "test", electricalProperties: calculateEmiElectricalRecord({ thicknessMicrometers: 10, rawResistanceReadingsOhm: [1, null] }) },
      { id: "3", originalFilename: third.filename, parsedDataset: third, sampleMetadata: { displayName: "No electrical metadata" }, importedAt: base.createdAt, parserVersion: "test" },
    ] };
    const archive = unzipSync(createEmiAnalysisXlsx(project, files, ["forward", "reverse"], { minimumHz: 9e9, maximumHz: 12e9 }));
    const workbook = strFromU8(archive["xl/workbook.xml"] as Uint8Array);
    for (const name of ["Frequency Data", "Directional Data", "Summary Statistics", "Electrical Properties"]) expect(workbook).toContain(`name="${name}"`);

    const frequencyRows = rows(strFromU8(archive["xl/worksheets/sheet1.xml"] as Uint8Array));
    expect(frequencyRows).toHaveLength(7);
    expect(frequencyRows[0]).toContain("Simon theoretical EMI SE (dB)");
    expect(frequencyRows[0]).toContain("Forward physical validity");
    expect(frequencyRows[1]?.[3]).toBe(10e9);
    expect(typeof frequencyRows[1]?.[3]).toBe("number");
    const simonColumn = frequencyRows[0]!.indexOf("Simon theoretical EMI SE (dB)");
    expect(frequencyRows[1]?.[simonColumn]).toBeCloseTo(33.73804444676175, 10);
    expect(frequencyRows[4]?.[simonColumn]).toBeNull();
    expect(frequencyRows[6]?.[simonColumn]).toBeNull();
    const frequencySheet = strFromU8(archive["xl/worksheets/sheet1.xml"] as Uint8Array);
    expect(frequencySheet).toContain('state="frozen"');
    expect(frequencySheet).toContain("<autoFilter");
    expect(frequencySheet).toContain("<cols>");

    const electricalRows = rows(strFromU8(archive["xl/worksheets/sheet4.xml"] as Uint8Array));
    expect(electricalRows[0]).toEqual(expect.arrayContaining(["Raw resistance (Ω)", "Conductivity (S/m)", "Calculation version"]));
    expect(electricalRows).toHaveLength(6);
    expect(electricalRows[1]?.[5]).toBe(1);
    expect(electricalRows[1]?.[6]).toBe(4.532);
    expect(typeof electricalRows[1]?.[9]).toBe("number");
    for (const [name, bytes] of Object.entries(archive).filter(([name]) => name.endsWith(".xml"))) expect(strFromU8(bytes), name).not.toMatch(/>NaN<|>Infinity<|>-Infinity</);
  });

  it("exports a readable empty workbook with required sheets and headers", () => {
    const archive = unzipSync(createEmiAnalysisXlsx(createEmptyEmiProject("Empty"), [], ["forward"], {}));
    expect(Object.keys(archive)).toEqual(expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]));
    expect(rows(strFromU8(archive["xl/worksheets/sheet1.xml"] as Uint8Array))).toHaveLength(1);
  });

  it("preserves raw invalid power values while leaving unavailable decomposition cells blank with reasons", () => {
    const baseSource = dataset("passivity.csv", [10e9]);
    const source: EmiDataset = { ...baseSource, points: [{ ...baseSource.points[0]!, s11: { real: Math.sqrt(1.00582), imaginary: 0 } }] };
    const file = { id: "invalid", dataset: source, calculation: calculateEmiDataset(source), issues: [] };
    const base = createEmptyEmiProject("Passivity audit");
    const project: EmiProjectRecord = { ...base, datasets: [{ id: file.id, originalFilename: source.filename, parsedDataset: source, sampleMetadata: { displayName: "Invalid measured point" }, importedAt: base.createdAt, parserVersion: "test" }] };
    const archive = unzipSync(createEmiAnalysisXlsx(project, [file], ["forward"], {}));
    const sourceXml = strFromU8(archive["xl/worksheets/sheet1.xml"] as Uint8Array);
    expect(Number(/<c r="Q2"><v>([^<]+)<\/v><\/c>/.exec(sourceXml)?.[1])).toBeCloseTo(1.00582, 12);
    expect(sourceXml).toContain('<c r="O2"/>');
    expect(sourceXml).toContain("SER is unavailable");
  });
});
