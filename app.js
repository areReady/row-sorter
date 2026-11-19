(() => {
  "use strict";

  // Edits are saved encrypted (with the same key) so they stay private on shared computers.
  const STORAGE_KEY = "row-sorter-state-v3";
  // The derived key (never the password) is kept for this browser tab only.
  const SESSION_KEY = "row-sorter-key";

  let payload;      // contents of data.enc.json
  let key;          // AES key derived from the password
  let defaults;     // decrypted { columns, rows }
  let state;
  let saveTimer;

  const $ = (id) => document.getElementById(id);
  const headerRow = $("header-row");
  const tbody = $("rows");

  // ---------- unlock ----------
  async function boot() {
    try {
      payload = await (await fetch("data.enc.json", { cache: "no-store" })).json();
    } catch (_) {
      $("lock-error").textContent = "Could not load the data file.";
      return;
    }
    const cached = sessionGet();
    if (cached) {
      try {
        key = await RowCrypto.importKey(cached);
        defaults = await RowCrypto.decryptWithKey(payload, key);
        return start();
      } catch (_) { sessionSet(null); }
    }
    $("password").focus();
  }

  $("unlock-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("unlock-btn");
    btn.disabled = true;
    btn.textContent = "Unlocking…";
    $("lock-error").textContent = "";
    try {
      ({ data: defaults, key } = await RowCrypto.unlock(payload, $("password").value));
      sessionSet(await RowCrypto.exportKey(key));
      $("password").value = "";
      start();
    } catch (_) {
      $("lock-error").textContent = "Incorrect password.";
      $("password").select();
    } finally {
      btn.disabled = false;
      btn.textContent = "Unlock";
    }
  });

  $("lock-btn").addEventListener("click", () => {
    sessionSet(null);
    location.reload();
  });

  async function start() {
    // Remove unencrypted saves left by earlier versions of the site.
    try { ["row-sorter-state-v1", "row-sorter-state-v2"].forEach((k) => localStorage.removeItem(k)); } catch (_) { /* ignore */ }
    state = (await loadSaved()) || structuredClone(defaults);
    $("lock").hidden = true;
    $("app").hidden = false;
    render();
  }

  function sessionGet() {
    try { return sessionStorage.getItem(SESSION_KEY); } catch (_) { return null; }
  }

  function sessionSet(v) {
    try { v ? sessionStorage.setItem(SESSION_KEY, v) : sessionStorage.removeItem(SESSION_KEY); } catch (_) { /* ignore */ }
  }

  // ---------- persistence ----------
  async function loadSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved) return null;
      const data = await RowCrypto.decryptWithKey(saved, key);
      if (Array.isArray(data.columns) && Array.isArray(data.rows)) return data;
    } catch (_) { /* missing, or saved with an older key */ }
    return null;
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(await RowCrypto.encryptWithKey(state, key))); } catch (_) { /* ignore */ }
    }, 300);
  }

  // ---------- rendering ----------
  function render() {
    headerRow.replaceChildren();
    headerRow.append(th("", "handle"), th("#", "idx"));
    state.columns.forEach((name, c) => {
      const cell = document.createElement("th");
      const wrap = document.createElement("span");
      wrap.className = "col-head";
      const label = editable(name, (v) => { state.columns[c] = v; save(); });
      const del = iconButton("×", `Delete column ${name}`, () => removeColumn(c));
      wrap.append(label, del);
      cell.append(wrap);
      headerRow.append(cell);
    });
    headerRow.append(th("", "ctl"));

    tbody.replaceChildren();
    state.rows.forEach((row, r) => {
      const tr = document.createElement("tr");
      const handle = td("⋮⋮", "handle");
      handle.title = "Drag to reorder";
      tr.append(handle, td(String(r + 1), "idx"));
      state.columns.forEach((_, c) => {
        const cell = document.createElement("td");
        cell.append(editable(row[c] ?? "", (v) => { state.rows[r][c] = v; save(); }));
        tr.append(cell);
      });
      const ctl = td("", "ctl");
      ctl.append(iconButton("×", `Delete row ${r + 1}`, () => removeRow(r)));
      tr.append(ctl);
      tbody.append(tr);
    });
  }

  function th(text, cls) {
    const el = document.createElement("th");
    el.textContent = text;
    if (cls) el.className = cls;
    return el;
  }

  function td(text, cls) {
    const el = document.createElement("td");
    el.textContent = text;
    if (cls) el.className = cls;
    return el;
  }

  function editable(text, onChange) {
    const el = document.createElement("div");
    el.contentEditable = "plaintext-only";
    el.spellcheck = false;
    el.textContent = text;
    el.addEventListener("input", () => onChange(el.textContent));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); el.blur(); }
    });
    return el;
  }

  function iconButton(label, title, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "icon-btn";
    b.textContent = label;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.addEventListener("click", onClick);
    return b;
  }

  // ---------- mutations ----------
  function removeRow(r) {
    state.rows.splice(r, 1);
    save(); render();
  }

  function removeColumn(c) {
    if (state.columns.length <= 1) return;
    if (!confirm(`Delete column "${state.columns[c]}"?`)) return;
    state.columns.splice(c, 1);
    state.rows.forEach((row) => row.splice(c, 1));
    save(); render();
  }

  $("add-row").addEventListener("click", () => {
    state.rows.push(state.columns.map(() => ""));
    save(); render();
    tbody.lastElementChild?.querySelector("[contenteditable]")?.focus();
  });

  $("add-col").addEventListener("click", () => {
    state.columns.push(`Column ${state.columns.length + 1}`);
    state.rows.forEach((row) => row.push(""));
    save(); render();
  });

  $("reset").addEventListener("click", () => {
    if (!confirm("Discard your changes and restore the original rows?")) return;
    state = structuredClone(defaults);
    save(); render();
  });

  // ---------- drag & drop ----------
  Sortable.create(tbody, {
    handle: ".handle",
    animation: 150,
    ghostClass: "sortable-ghost",
    onEnd(evt) {
      if (evt.oldIndex === evt.newIndex) return;
      const [moved] = state.rows.splice(evt.oldIndex, 1);
      state.rows.splice(evt.newIndex, 0, moved);
      save(); render();
    },
  });

  // ---------- CSV ----------
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function stamp() {
    return new Date().toISOString().slice(0, 10);
  }

  $("export-csv").addEventListener("click", () => {
    // BOM so Excel opens UTF-8 correctly
    const blob = new Blob(["﻿" + CSV.stringify([state.columns, ...state.rows])], { type: "text/csv;charset=utf-8" });
    download(blob, `rows-${stamp()}.csv`);
  });

  $("import-csv").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const rows = CSV.parse(await file.text());
    if (!rows.length) { alert("That CSV file is empty."); return; }
    state = CSV.toTable(rows, true);
    save(); render();
  });

  // ---------- PDF ----------
  $("export-pdf").addEventListener("click", () => {
    const { jsPDF } = window.jspdf;
    const landscape = state.columns.length > 5;
    const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt", format: "letter" });
    doc.setFontSize(14);
    doc.text("Row Sorter export", 40, 40);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(new Date().toLocaleString(), 40, 56);
    doc.autoTable({
      startY: 70,
      head: [["#", ...state.columns]],
      body: state.rows.map((r, i) => [i + 1, ...r]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [47, 111, 222] },
      columnStyles: { 0: { cellWidth: 28, halign: "right" } },
      margin: { left: 40, right: 40 },
    });
    doc.save(`rows-${stamp()}.pdf`);
  });

  boot();
})();
