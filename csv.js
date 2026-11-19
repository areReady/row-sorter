// CSV helpers shared by the app and the encryption tool.
const CSV = (() => {
  "use strict";

  function escape(value) {
    const s = String(value ?? "");
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function stringify(rows) {
    return rows.map((row) => row.map(escape).join(",")).join("\r\n");
  }

  function parse(text) {
    text = text.replace(/^﻿/, "");
    const rows = [];
    let row = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else field += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += ch;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((v) => v.trim() !== ""));
  }

  // Turns parsed rows into { columns, rows }, dropping columns that are empty everywhere.
  function toTable(rows, hasHeader) {
    const width = Math.max(0, ...rows.map((r) => r.length));
    let columns = hasHeader ? rows[0] : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
    let data = (hasHeader ? rows.slice(1) : rows).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
    columns = Array.from({ length: width }, (_, i) => columns[i] ?? `Column ${i + 1}`);
    const keep = columns.map((name, i) => name.trim() !== "" || data.some((r) => r[i].trim() !== ""));
    return {
      columns: columns.filter((_, i) => keep[i]).map((n, i) => n.trim() || `Column ${i + 1}`),
      rows: data.map((r) => r.filter((_, i) => keep[i])),
    };
  }

  return { stringify, parse, toTable };
})();
