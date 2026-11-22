# Batch pipeline in the web app (design)

## Intent

Today a new batch of photos means running `python pipeline.py auto <folder> --batch <name>` by hand
in `ml_service/`. The goal is to do the same from the SALTFINE web app so the workflow is faster:
pick the photo folder, press one button, and watch which phase the batch is in.

## Goals

- New **Model Training** page in the existing React app (sidebar entry next to Reports).
- Pick a folder of photos in the browser, name the batch, optionally pick 1 holdout photo, press **Run**.
- A phase tracker that shows where the batch is: Archive → Auto-label → Your review → Augment → Fine-tune & compare,
  and the result (promoted / kept the live model).
- At the review phase, an **Open review** button for the existing review page (`http://127.0.0.1:8765`).
  After *Finish review* the run continues by itself.
- Live progress during the slow phases: photo `i/n` while auto-labelling, epoch `i/N` while training.
- A log panel with the last lines of the run's output.
- **Resume** for a batch that stopped (crash, backend restart, closed review) and **Stop** for a running one.

## Non-goals

- Rewriting the review page in React (it works; it stays in `review_server.py`).
- Running several batches at once (training is CPU-bound and the review page uses one fixed port).
- Remote/multi-user access. Everything runs on this PC.
- Promote/rollback/versions UI (still on the command line).

## Anti-goals

- The web flow must not behave differently from `pipeline.py auto`: same stages, same `state.json`,
  same resume rules, same "promote only if better" decision.
- A failure must never look like progress: a crashed run shows as failed with its log, not as "running".

## Approaches

- **A. Express backend runs `pipeline.py auto` as a child process (picked).** Minimal Python changes
  (progress written to `state.json`), no new service to start.
- B. A new Python job server in `ml_service`. Finer control, but a third service and a rewrite around it.
- C. Review screen rebuilt in React. Most seamless, but rewrites a working tool without making the workflow faster.

## Decisions (Claude's calls; the user handed over the how)

- Folder picking uses `<input webkitdirectory>`; only top-level image files are uploaded (same rule as `ingest`).
  Files go to `backend/uploads/pipeline/<batch>/` (already git-ignored), which is passed to `auto` and deleted when the run exits.
- The backend spawns `ml_service/.venv` Python: `pipeline.py auto <staging> --batch <b> --no-browser [--holdout X] [--no-promote] --epochs N`.
  Resume spawns `pipeline.py auto --batch <b> --no-browser`.
- Progress lives in `dataset/batches/<b>/state.json` under a new `activity` key; the page polls the backend every 2 s.
- Output goes to `dataset/batches/<b>/pipeline.log`; the PID to `pipeline.pid` so a backend restart can still tell a live run from a dead one.
- One run at a time; starting a second returns 409.
- Options on the form: epochs (default 25) and auto-promote (default on, same as `auto`).
- In mock mode (no `VITE_API_BASE_URL`) the page shows that it needs the backend.
