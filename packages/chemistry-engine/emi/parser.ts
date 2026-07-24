import type {
  EmiDatasetMetadata,
  EmiFrequencyPoint,
  EmiParseResult,
  EmiValidationIssue,
  KeysightInstrumentMetadata,
  SParameter,
} from "./types";

const REQUIRED_HEADERS = [
  "frequencyHz",
  "s11Real", "s11Imaginary",
  "s21Real", "s21Imaginary",
  "s22Real", "s22Imaginary",
  "s12Real", "s12Imaginary",
] as const;

export const EMI_PARSER_VERSION = "1.0.0-keysight-complex-csv" as const;

type RequiredHeader = typeof REQUIRED_HEADERS[number];

function csvRow(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(current.trim()); current = "";
    } else current += character;
  }
  values.push(current.trim());
  return values;
}

function normalizedHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function classifyHeader(value: string): RequiredHeader | undefined {
  const normalized = normalizedHeader(value);
  if (normalized === "freqhz" || normalized === "frequencyhz") return "frequencyHz";
  const match = /^s(11|21|22|12)(real|imag|imaginary)$/.exec(normalized);
  if (!match) return undefined;
  const parameter = `s${match[1]}` as SParameter;
  return `${parameter}${match[2] === "real" ? "Real" : "Imaginary"}` as RequiredHeader;
}

function issue(filename: string, code: EmiValidationIssue["code"], message: string, rowNumber?: number): EmiValidationIssue {
  return { severity: "error", code, message, filename, rowNumber };
}

function parseMetadata(lines: readonly string[], beginIndex: number): EmiDatasetMetadata {
  const comments = lines.slice(0, beginIndex).map((line) => line.trim()).filter((line) => line.startsWith("!")).map((line) => line.slice(1).trim());
  const csvVersionLine = comments.find((line) => /^CSV\s+/i.test(line));
  const dateLine = comments.find((line) => /^Date:/i.test(line));
  const sourceLine = comments.find((line) => /^Source:/i.test(line));
  const instrumentLine = comments.find((line) => /^Keysight Technologies(?:,|$)/i.test(line));
  let instrument: KeysightInstrumentMetadata | undefined;
  if (instrumentLine) {
    const [manufacturer, model, serialNumber, firmwareVersion] = csvRow(instrumentLine);
    instrument = { manufacturer, model, serialNumber, firmwareVersion };
  }
  const begin = lines[beginIndex]?.trim() ?? "";
  return {
    csvVersion: csvVersionLine?.replace(/^CSV\s+/i, "").trim(),
    date: dateLine?.replace(/^Date:\s*/i, "").trim(),
    source: sourceLine?.replace(/^Source:\s*/i, "").trim(),
    channel: begin.replace(/^BEGIN\s+/i, "").trim() || undefined,
    instrument,
    comments,
  };
}

/** Parse a Keysight PNA-X CSV export without depending on header order. */
export function parseKeysightCsv(text: string, filename: string): EmiParseResult {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const issues: EmiValidationIssue[] = [];
  const beginIndex = lines.findIndex((line) => /^BEGIN(?:\s|$)/i.test(line.trim()));
  if (beginIndex < 0) return { ok: false, filename, issues: [issue(filename, "DATA_SECTION_NOT_FOUND", "No Keysight data-section BEGIN marker was found.")] };

  const endIndex = lines.findIndex((line, index) => index > beginIndex && /^END(?:\s|$)/i.test(line.trim()));
  if (endIndex < 0) return { ok: false, filename, issues: [issue(filename, "DATA_SECTION_END_NOT_FOUND", "The Keysight data section has no END marker.")] };

  const headerIndex = lines.findIndex((line, index) => index > beginIndex && index < endIndex && line.trim() !== "" && !line.trim().startsWith("!"));
  if (headerIndex < 0) return { ok: false, filename, issues: [issue(filename, "HEADER_NOT_FOUND", "No column-header row was found inside the Keysight data section.")] };

  const headers = csvRow(lines[headerIndex] ?? "");
  const columns = new Map<RequiredHeader, number>();
  headers.forEach((header, index) => {
    const classified = classifyHeader(header);
    if (classified !== undefined && !columns.has(classified)) columns.set(classified, index);
  });
  for (const required of REQUIRED_HEADERS) {
    if (!columns.has(required)) issues.push(issue(filename, "MISSING_REQUIRED_COLUMN", `Required column ${required} is missing from the Keysight data header.`, headerIndex + 1));
  }
  if (issues.length > 0) return { ok: false, filename, issues };

  const column = (name: RequiredHeader): number => columns.get(name) as number;
  const points: EmiFrequencyPoint[] = [];
  for (let lineIndex = headerIndex + 1; lineIndex < endIndex; lineIndex += 1) {
    const line = lines[lineIndex]?.trim() ?? "";
    if (line === "" || line.startsWith("!")) continue;
    const values = csvRow(line);
    const parsed = new Map<RequiredHeader, number>();
    let malformed = false;
    for (const name of REQUIRED_HEADERS) {
      const raw = values[column(name)]?.trim() ?? "";
      const numeric = raw === "" ? Number.NaN : Number(raw);
      if (Number.isNaN(numeric)) {
        malformed = true;
        issues.push(issue(filename, "UNPARSEABLE_NUMERIC_VALUE", `Row ${lineIndex + 1} has an unparseable numeric value for ${name}.`, lineIndex + 1));
      } else parsed.set(name, numeric);
    }
    if (malformed) continue;
    const complex = (parameter: SParameter) => ({
      real: parsed.get(`${parameter}Real` as RequiredHeader) as number,
      imaginary: parsed.get(`${parameter}Imaginary` as RequiredHeader) as number,
    });
    points.push({
      rowNumber: lineIndex + 1,
      frequencyHz: parsed.get("frequencyHz") as number,
      s11: complex("s11"), s21: complex("s21"), s22: complex("s22"), s12: complex("s12"),
    });
  }
  if (points.length === 0) {
    issues.push(issue(filename, "MISSING_DATA_ROWS", "The Keysight data section contains no fully parseable measurement rows."));
    return { ok: false, filename, issues };
  }
  return {
    ok: true,
    dataset: { filename, metadata: parseMetadata(lines, beginIndex), headers, points, parsingIssues: issues },
  };
}
