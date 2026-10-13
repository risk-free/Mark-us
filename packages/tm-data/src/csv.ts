/**
 * Minimal RFC 4180 CSV reader (quote-aware, CRLF-tolerant), dependency-free.
 *
 * The researcher case-file export quotes every text field and can contain commas
 * and newlines inside quotes, so a naive `split(",")` is not safe. This parser
 * keeps streaming/short-circuit out of scope: the source decompresses a file into
 * memory first (see `source.ts`), so a whole-text pass is sufficient and simple.
 */

export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      fieldStarted = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      fieldStarted = true;
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      fieldStarted = false;
      i += 1;
      continue;
    }
    field += char;
    fieldStarted = true;
    i += 1;
  }

  if (field.length > 0 || row.length > 0 || fieldStarted) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function rowsToRecords(headers: readonly string[], rows: readonly string[][]): Array<Record<string, string>> {
  return rows.map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });
    return record;
  });
}
