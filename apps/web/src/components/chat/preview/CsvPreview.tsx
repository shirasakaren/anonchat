import { useMemo } from "react";

interface Props {
  bytes: Uint8Array<ArrayBuffer>;
  fullScreen?: boolean;
}

const MAX_ROWS = 500;

/** Minimal RFC 4180 parser: handles quoted fields, escaped `""`, and both
 *  \n and \r\n line endings. Deliberately hand-rolled instead of a
 *  dependency - full RFC 4180 support is a small, well-understood grammar,
 *  and rendering into React elements (never dangerouslySetInnerHTML) means
 *  there's no sanitization surface to get wrong either. */
function parseCsv(text: string, maxRows: number): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  function pushField() {
    row.push(field);
    field = "";
  }
  function pushRow() {
    pushField();
    rows.push(row);
    row = [];
  }

  while (i < text.length && rows.length < maxRows) {
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
      i += 1;
      continue;
    }
    if (char === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) pushRow();

  return { rows, truncated: rows.length >= maxRows && i < text.length };
}

export function CsvPreview({ bytes, fullScreen = false }: Props) {
  const { rows, truncated } = useMemo(() => {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return parseCsv(text, MAX_ROWS);
  }, [bytes]);

  if (rows.length === 0) {
    return <p className="text-xs text-[var(--text-muted)]">This CSV file is empty.</p>;
  }

  // rows.length === 0 already returned above, so this is always defined -
  // TS can't see that guarantee through the destructure itself.
  const header = rows[0]!;
  const body = rows.slice(1);

  return (
    <div
      className={`w-full min-w-0 max-w-full overflow-auto overscroll-contain rounded-lg border border-[var(--border)] text-[var(--text)] ${fullScreen ? "min-h-full" : "max-h-96"}`}
    >
      <table className="w-max min-w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-[var(--surface-muted)]">
          <tr>
            {header.map((cell, i) => (
              <th key={i} className="border-b border-[var(--border)] px-2 py-1.5 text-left font-semibold">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, ri) => (
            <tr key={ri} className="odd:bg-[var(--surface)] even:bg-[var(--surface-muted)]">
              {r.map((cell, ci) => (
                <td key={ci} className="border-b border-[var(--border)] px-2 py-1 whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && (
        <p className="border-t border-[var(--border)] px-2 py-1.5 text-xs text-[var(--text-muted)]">
          Showing the first {MAX_ROWS} rows - download the file to see the rest.
        </p>
      )}
    </div>
  );
}
