import { strToU8, zipSync } from "fflate";
import type { EmiDirection, EmiFrequencyRange } from "@max-stoich/chemistry-engine";
import type { EmiAnalysisFile } from "./analyzer";
import { buildEmiExportTables, type EmiExportCell, type EmiExportTable } from "./export-model";
import type { EmiProjectRecord } from "./project";

function xml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function columnName(index: number): string { let value = index + 1; let output = ""; while (value > 0) { value -= 1; output = String.fromCharCode(65 + value % 26) + output; value = Math.floor(value / 26); } return output; }
function cellXml(value: EmiExportCell, row: number, column: number): string {
  const reference = `${columnName(column)}${row}`;
  if (value === null) return `<c r="${reference}"/>`;
  if (typeof value === "number") return Number.isFinite(value) ? `<c r="${reference}"><v>${value}</v></c>` : `<c r="${reference}"/>`;
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}
function worksheet(table: EmiExportTable): string {
  const rows = [table.columns.map((column) => column.header), ...table.rows.map((row) => table.columns.map((column) => row[column.key] ?? null))];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => cellXml(value, rowIndex + 1, columnIndex)).join("")}</row>`).join("")}</sheetData></worksheet>`;
}

/** Produce a standards-based XLSX workbook whose cells come only from canonical typed export tables. */
export function createEmiAnalysisXlsx(project: EmiProjectRecord, files: readonly EmiAnalysisFile[], directions: readonly EmiDirection[], range: EmiFrequencyRange): Uint8Array {
  const tables = buildEmiExportTables(project, files, directions, range);
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${tables.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${tables.map((table, index) => `<sheet name="${xml(table.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`;
  const workbookRelationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${tables.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${tables.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const filesMap: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelationships),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Arial"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf xfId="0"/></cellXfs></styleSheet>`),
  };
  tables.forEach((table, index) => { filesMap[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(worksheet(table)); });
  return zipSync(filesMap, { level: 6 });
}

