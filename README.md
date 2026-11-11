# SALTFINE Dashboard

Web dashboard for **SALTFINE**, the 3-way automated sea salt sorting system
(crush → image → classify → sort into Fine / Medium / Coarse containers).

Built with Vite, React, Tailwind CSS, Recharts and Lucide icons. It runs on
built-in mock data out of the box and is ready to be pointed at the
Express + SQLite backend described in Chapter 2 of the manuscript.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5180.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run dev -- --host` | Same, but reachable from a tablet or the Raspberry Pi display on the same network |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serves the production build locally |

## The three tabs

1. **Live Classification Result** — the current sorting cycle: batch ID and
   timestamp, captured image, predicted grade, confidence, estimated size
   fractions, particle characteristics, the container the salt was routed to,
   the mass from the load cell, and the processing time. It polls for the newest
   record every 2 seconds.
2. **Salt-Record Log** — every classification record in a table. Filter by date
   range, grade, and sample / batch ID; sort by record, date, confidence or
   mass; page through the results; open any row to preview its image and
   details.
3. **Reports** — totals for a chosen period (batches, sorted mass in kg,
   average confidence, average processing time), two charts (batches per grade,
   sorted mass per container), a per-grade table, and CSV / PDF downloads.

Units are mass only (g and kg). The legacy sieve-gated recirculation features
are not part of this dashboard.

## Project structure

```
src/
  main.jsx, App.jsx        App shell and tab routing (#/live, #/records, #/reports)
  navigation.js            The three tabs
  config.js                Grades, size ranges, colors, polling intervals
  index.css                Tailwind import and design tokens
  pages/                   LiveResult, SaltRecordLog, Reports
  components/
    layout/                Sidebar, TopNav (tablet), Header
    live/                  Cards on the Live tab
    records/               Filters, table, record detail modal
    reports/               Report controls, summary tiles, chart, table
    ui/                    Card, Button, Modal, Pagination, Toast, form fields
    SaltImage.jsx          Captured image (real photo or simulated frame)
  mockData/                Record generator and in-memory mock "database"
  services/
    api.js                 The only place that reads data (mock or backend)
    exportReport.js        CSV and PDF downloads
  hooks/                   Polling, clock, hash routing
  utils/                   Formatting, filters, report statistics, image drawing
```

## Mock mode (default)

- About three weeks of history is generated on load, and a new simulated
  sorting cycle arrives every 24 seconds (`SIMULATION_INTERVAL_MS` in
  `src/config.js`). Use **Pause** in the header to freeze the feed during a
  presentation.
- The header says "Simulated feed" and captured images are labelled
  "Simulated image", so mock output is never mistaken for real measurements.
- All mock values are made up. They are not experimental results.

## Connecting the real backend

1. Copy `.env.example` to `.env` and set the backend address:

   ```
   VITE_API_BASE_URL=http://localhost:3000
   ```

2. Make the Express backend serve these endpoints (JSON):

   | Endpoint | Returns |
   | --- | --- |
   | `GET /api/records/latest` | The newest record, or `null` |
   | `GET /api/records?from=&to=&grade=&q=&limit=` | Matching records, newest first |
   | `GET /api/images/:image_id` | The captured image file |

   `from` / `to` are `YYYY-MM-DD` (inclusive), `grade` is `Fine`, `Medium` or
   `Coarse`, and `q` is matched against the sample and batch ID.

Each record is one joined row across the SQLite tables in Figure 2.4. The field
names are the column names, so no mapping is needed:

| Table | Fields used |
| --- | --- |
| `classifications` | `record_id` (= `classification_id`), `model_name`, `predicted_grade`, `confidence` (0–1), `est_fine_pct`, `est_medium_pct`, `est_coarse_pct`, `inference_ms`, `classified_at` |
| `batches` | `batch_id`, `sample_code`, `supplier` |
| `images` | `image_id`, `file_path`, `captured_at` |
| `particle_features` | `particle_count`, `mean_area_mm2`, `mean_ecd_mm`, `median_ecd_mm`, `glcm_*` |
| `sorting_records` | `sorting_id`, `container_grade`, `mass_g`, `processing_time_s`, `sorted_at` |

Timestamps are ISO 8601 text. Not shown in the dashboard: the `sieve_results`
table, `batches.crushing_cycles` and `images.dataset_split`.

Only `src/services/api.js` needs to change if the endpoints end up different.

## Notes

- Fonts and icons are bundled, so the dashboard works without internet access.
- Layout: fixed sidebar from 1280 px wide; below that the tabs move to a bar
  across the top (landscape and portrait tablets).
- This project uses Vite 7. Vite 8's bundler ships a native binary that some
  Windows Application Control / Smart App Control policies block.
