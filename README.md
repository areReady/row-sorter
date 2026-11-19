# Row Sorter

A password-protected static web page that shows a multi-column table whose rows you can drag and drop to reorder, then export as CSV or PDF.

## Features

- Password screen; the table data is encrypted and only decrypted in the browser
- Drag rows by the ⋮⋮ handle to reorder (mouse and touch, via [SortableJS](https://sortablejs.github.io/Sortable/))
- Click any cell or column header to edit it
- Add/remove rows and columns
- Import a CSV (first row is treated as headers)
- Export the current order to CSV or PDF (via [jsPDF](https://github.com/parallax/jsPDF) + jspdf-autotable)
- Edits are saved in the browser's localStorage, encrypted with the same key

## How the password protection works

GitHub Pages can't check passwords on the server, so the protection is done with encryption:

- `data.enc.json` holds the rows, encrypted with AES-256-GCM. The key is derived from the password with PBKDF2-SHA256 (600,000 iterations).
- The page asks for the password, derives the key, and decrypts the rows in the browser. A wrong password fails to decrypt.
- The password itself is never stored in this repository or in the browser. After unlocking, the derived key is kept in `sessionStorage` until the tab is closed or **Lock** is clicked.

The page's code (HTML/JS/CSS) is public; only the data is protected. Anyone with the password can read the data, and someone without it would have to guess it.

## Changing the rows (or the password)

1. Open `tools/encrypt.html` (locally, or at `<site>/tools/encrypt.html`).
2. Paste or choose a CSV, tick whether the first row is headers, enter the password, and click **Encrypt**.
3. Replace `data.enc.json` in the repository with the downloaded file, commit and push.

Never commit the plaintext CSV or the password.

## Running locally

No build step. Serve the folder with any static server, for example:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Files

- `index.html` – lock screen, page markup and library script tags
- `app.js` – unlock flow, table rendering, drag-and-drop, CSV import/export, PDF export
- `crypto.js` – password-based encryption helpers (Web Crypto API)
- `csv.js` – CSV parsing and writing
- `data.enc.json` – the encrypted rows
- `tools/encrypt.html` – makes a new `data.enc.json` from a CSV
- `styles.css` – styling (light and dark mode)
