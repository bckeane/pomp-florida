export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === ',') pushField();
    else if (char === '\n') pushRow();
    else if (char === '\r') {
      // skip
    } else field += char;
  }
  if (field.length > 0 || row.length > 0) pushRow();

  const filtered = rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
  if (filtered.length === 0) return [];

  const header = filtered[0].map((h) => h.trim());
  return filtered.slice(1).map((r) => {
    const record = {};
    header.forEach((h, idx) => {
      record[h] = (r[idx] ?? '').trim();
    });
    return record;
  });
}
