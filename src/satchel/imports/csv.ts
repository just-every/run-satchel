import { insist } from '../model';

/** RFC 4180 fields, including quoted newlines and escaped quotes. */
export function parseCsv(raw: string) {
  const lines: { cells: string[]; line: number }[] = [];
  let cells: string[] = [], field = '', physicalLine = 1, rowLine = 1;
  let state: 'plain' | 'quoted' | 'closed' = 'plain';
  const endField = () => { cells.push(field); field = ''; state = 'plain'; };
  const endRow = () => {
    endField();
    if (cells.some(value => value.trim())) lines.push({ cells, line: rowLine });
    cells = [];
  };
  const input = raw.startsWith('\uFEFF') ? raw.slice(1) : raw;
  for (let n = 0; n < input.length; n++) {
    const c = input[n];
    if (state === 'quoted') {
      if (c === '"') {
        if (input[n + 1] === '"') { field += '"'; n++; }
        else state = 'closed';
      } else {
        field += c;
        if (c === '\n' || (c === '\r' && input[n + 1] !== '\n')) physicalLine++;
      }
    } else if (c === ',') endField();
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && input[n + 1] === '\n') n++;
      endRow(); physicalLine++; rowLine = physicalLine;
    } else {
      insist(state !== 'closed', `Unexpected characters after a closing quote on CSV line ${physicalLine}`);
      if (c === '"') { insist(field === '', `Unexpected quote on CSV line ${physicalLine}`); state = 'quoted'; }
      else field += c;
    }
  }
  insist(state !== 'quoted', 'A quoted CSV field is never closed');
  endRow();
  const headers = (lines.shift()?.cells ?? []).map(value => value.trim());
  insist(headers.length > 0 && headers.every(Boolean) && new Set(headers).size === headers.length, 'The CSV needs unique, nonempty column names');
  return {
    headers,
    rows: lines.map(({ cells, line }) => {
      insist(cells.length === headers.length, `CSV line ${line} has ${cells.length} columns; the header has ${headers.length}`);
      return { line, value: Object.fromEntries(headers.map((header, i) => [header, cells[i]])) };
    }),
  };
}
