import { describe, expect, it } from "vitest";
import { parseCiaawTable } from "./import-ciaaw-atomic-weights";

describe("CIAAW table importer", () => {
  it("parses intervals, point values, uncertainty text, and explicit absence deterministically", () => {
    const fixture = `<table><tbody>
      <tr><td>1</td><td>H</td><td><a>hydrogen</a></td><td>&nbsp;[1.007&nbsp;84,&nbsp;1.008&nbsp;11]</td><td></td></tr>
      <tr><td>22</td><td>Ti</td><td><a>titanium</a></td><td>47.867(1)</td><td></td></tr>
      <tr><td>43</td><td>Tc</td><td>technetium</td><td>&mdash;</td><td></td></tr>
    </tbody></table>`;
    expect(parseCiaawTable(fixture)).toEqual([
      { atomicNumber: 1, symbol: "H", name: "hydrogen", value: "[1.00784,1.00811]" },
      { atomicNumber: 22, symbol: "Ti", name: "titanium", value: "47.867(1)" },
      { atomicNumber: 43, symbol: "Tc", name: "technetium", value: "—" },
    ]);
    expect(parseCiaawTable(fixture)).toEqual(parseCiaawTable(fixture));
  });
});
