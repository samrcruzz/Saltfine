# Batch Pipeline UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Model Training page in the SALTFINE web app that uploads a folder of photos, runs `pipeline.py auto` and shows the live phase, progress and log.

**Architecture:** `pipeline.py` writes a live `activity` record to each batch's `state.json`. The Express backend uploads the photos, spawns `pipeline.py auto` from the ML venv (one run at a time), logs to a file and turns `state.json` + process state into a list of phases. The React page polls that endpoint every 2 s and renders a phase tracker, an Open review button and a log tail.

**Tech Stack:** Python 3 + Ultralytics (ml_service), Express 5 + multer + TypeScript via tsx (backend), React 19 + Tailwind 4 + lucide-react (frontend). Tests: Python `unittest`, Node's built-in `node:test` through `tsx --test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-22-batch-pipeline-ui-design.md`

## Global Constraints

- No new npm or pip dependencies.
- **Dev-only.** Sign-in already exists (`backend/src/auth/`, roles `viewer` | `dev`). Mount `/api/pipeline` behind `requireDev` from `backend/src/auth/middleware.ts`. The nav entry gets `minRole: 'dev'`. Every browser request sends `credentials: 'include'` and calls `notifyUnauthorized()` from `frontend/src/services/auth.ts` on a 401.
- Do not modify `backend/src/routes/analyze.ts` or `frontend/src/services/api.ts`: both have uncommitted user work.
- Commit only the files a task names (`git add <paths>`, never `git add -A`). `ml_service/pipeline.py` and `review_server.py` are untracked, so their first commit adds the whole file. Confirm with the user before that first commit.
- Python runs from `ml_service/` with `.venv\Scripts\python.exe` (Windows) or `.venv/bin/python`.
- Batch names match `^[A-Za-z0-9_-]{1,40}$`.
- Only one pipeline run at a time. Review page port: `8765`.
- Accepted image extensions (same as `pipeline.IMG_EXTS`): `.jpg .jpeg .png .dng .heic .tif .tiff .bmp .webp`.
- Upload limits: 60 MB per file, 500 files.
- Poll interval on the page: 2000 ms (reuse `LIVE_POLL_INTERVAL_MS`).
- CLI behavior of `pipeline.py` must not change: the new progress hooks are optional and off unless called.

## Review Focus

1. **Batch name already used** (in `dataset/batches.json` or as a `dataset/batches/<name>` folder) → 409 with "Batch 'x' already exists", nothing uploaded, nothing overwritten. Test in Task 3.
2. **Second Run while one is going** → 409 "Batch 'y' is still running", the first run is unaffected. Test in Task 3.
3. **Backend restarted mid-run** (process still alive in review or training) → the batch still shows as running (PID check), and Resume is refused rather than starting a second process on port 8765. Test in Task 2.
4. **Run crashes** (port 8765 busy, decode error, exception) → the phase it was in shows `failed`, the log tail shows the error, Resume is offered. Test in Task 2.
5. **Folder with no usable photos or duplicate names after flattening** → the client shows the count of usable photos and disables Run at 0. The server returns 400 for 0 images or duplicate file names. Test in Task 3.

---

### Task 1: Progress reporting in `pipeline.py`

**Files:**
- Modify: `ml_service/pipeline.py` (state helpers ~L300-322, `cmd_prelabel` ~L124, `cmd_finetune` ~L262, `compare` ~L283, `install` ~L373, `cmd_auto` ~L325)
- Create: `ml_service/tests/__init__.py` (empty), `ml_service/tests/test_progress.py`

**Interfaces:**
- Produces (on disk): `dataset/batches/<b>/state.json` = `{"stage": <STAGES item>|absent, "updated": iso, "activity": {"phase": str, "detail": str, "progress": float|null, "url": str|null, "updated": iso}, "run"?: str, "result"?: str}`
- `activity.phase` is one of `"ingest" | "prelabel" | "review" | "augment" | "train" | "compare" | "promote" | "done"`.
- `set_activity(name: str, phase: str, detail: str = "", progress: float | None = None, url: str | None = None) -> None`
- `epoch_reporter(name: str) -> Callable[[trainer], None]`: an Ultralytics `on_fit_epoch_end` callback. It writes phase `"train"`, detail `"epoch {trainer.epoch + 1}/{trainer.epochs}"`, progress `(epoch+1)/epochs`.
- `cmd_prelabel` reads optional `a.on_photo: Callable[[int, int], None]`. `cmd_finetune` reads optional `a.on_epoch` (a trainer callback), both via `getattr(a, ..., None)`.

- [ ] **Step 1: Write the failing tests** in `ml_service/tests/test_progress.py` (`unittest`, `setUp` patches `pipeline.batch_dir` to return a `tempfile.TemporaryDirectory` path):

```python
def test_set_activity_writes_activity_and_keeps_stage(self):
    pipeline.set_stage("b", "prelabeled")
    pipeline.set_activity("b", "review", "waiting for you", url="http://127.0.0.1:8765/")
    st = self.read_state()
    self.assertEqual(st["stage"], "prelabeled")
    self.assertEqual(st["activity"]["phase"], "review")
    self.assertEqual(st["activity"]["url"], "http://127.0.0.1:8765/")
    self.assertIsNone(st["activity"]["progress"])

def test_set_stage_keeps_activity(self):
    pipeline.set_activity("b", "augment", "making 50 + 50 images")
    pipeline.set_stage("b", "augmented")
    self.assertEqual(self.read_state()["activity"]["phase"], "augment")

def test_epoch_reporter(self):
    pipeline.epoch_reporter("b")(SimpleNamespace(epoch=4, epochs=25))
    a = self.read_state()["activity"]
    self.assertEqual((a["phase"], a["detail"], a["progress"]), ("train", "epoch 5/25", 0.2))

def test_set_activity_creates_batch_folder(self):
    pipeline.set_activity("new", "ingest", "copying 3 photos")
    self.assertEqual(self.read_state("new")["activity"]["phase"], "ingest")
```

- [ ] **Step 2: Run the tests and check that they fail**

Run: `.venv\Scripts\python.exe -m unittest tests.test_progress -v` (from `ml_service/`)
Expected: FAIL with `AttributeError: module 'pipeline' has no attribute 'set_activity'`

- [ ] **Step 3: Implement**
  - Add `_update_state(name, **fields)`, a read-merge-write of `state.json`. `set_stage` and `set_activity` both use it. `set_stage` keeps its current printout.
  - `set_activity` stores `progress` rounded to 3 decimals.
  - `epoch_reporter` as in Interfaces.
  - In `cmd_prelabel`, after each photo's prediction, call `a.on_photo(i, len(photos))` if present.
  - In `cmd_finetune`, call `model.add_callback("on_fit_epoch_end", a.on_epoch)` if present.
  - Make `compare` and `install` take no new arguments. `cmd_auto` sets the activity around them instead.
  - In `cmd_auto`, call `set_activity` before each step:
    - `ingest`: "copying N photos"
    - `prelabel`: "photo i/n", with progress, through `on_photo`
    - `review`: "waiting for you", with `url=f"http://127.0.0.1:{a.port}/"`
    - `augment`: "making {a.augment} + {a.augment} images", or "skipped"
    - `train`: "starting", with `on_epoch=epoch_reporter(a.batch)` passed in the finetune namespace
    - `compare`: "live vs candidate". The comparison runs inside `cmd_finetune`, so set it from `cmd_finetune` when `a.on_epoch` is present, just before `return run, compare(...)`.
    - `promote`: "installing new model", only when installing
    - `done`: detail = the final `result` string. Also on the "already trained" early return.
  - With `--no-wait`, set `review` with detail "review later" and `url=None`.

- [ ] **Step 4: Run the tests and check that they pass**

Run: `.venv\Scripts\python.exe -m unittest tests.test_progress -v`
Expected: 4 tests, OK

- [ ] **Step 5: Smoke-test the CLI path** with a throwaway batch built from 2 photos copied out of `dataset/test/jpg` into the scratchpad:
Run: `.venv\Scripts\python.exe pipeline.py auto <scratch>\two --batch smoke-1 --no-wait`
Expected: exits after auto-labelling. `dataset/batches/smoke-1/state.json` has `"stage": "prelabeled"` and `activity.phase == "review"`. Then remove `smoke-1` from `dataset/batches.json`, delete `dataset/batches/smoke-1` (originals are read-only: clear the attribute first).

- [ ] **Step 6: Commit** (confirm with the user first, see Global Constraints)

```bash
git add ml_service/pipeline.py ml_service/tests/__init__.py ml_service/tests/test_progress.py
git commit -m "feat(ml): write live pipeline activity to state.json"
```

### Task 2: Backend run manager and phase status

**Files:**
- Create: `backend/src/pipeline/paths.ts`, `backend/src/pipeline/status.ts`, `backend/src/pipeline/jobs.ts`, `backend/src/pipeline/status.test.ts`
- Modify: `backend/package.json` (add `"test": "tsx --test \"src/**/*.test.ts\""`)

**Interfaces:**
- Consumes: the `state.json` shape from Task 1.
- `paths.ts`:
  - `ML_DIR`: the same lookup as `analyze.ts`, `cwd/ml_service`, else `cwd/../ml_service`
  - `REPO_DIR = dirname(ML_DIR)`, `REGISTRY_FILE = REPO_DIR/dataset/batches.json`
  - `STAGING_DIR = cwd/uploads/pipeline`
  - `batchDir(b)`, `stateFile(b)`, `logFile(b)`, `pidFile(b)`
  - `pythonExecutable(): string`: the venv python if it exists, else `'python'`
- `status.ts` (pure, no fs):
  - `type PhaseId = 'ingest' | 'prelabel' | 'review' | 'augment' | 'train'`
  - `type PhaseStatus = 'done' | 'active' | 'waiting' | 'failed' | 'pending'`
  - `interface PhaseView { id: PhaseId; label: string; status: PhaseStatus; detail: string; progress: number | null }`
  - `interface BatchState { stage?: string; updated?: string; activity?: { phase: string; detail: string; progress: number | null; url: string | null; updated: string }; run?: string; result?: string }`
  - `type RunState = 'running' | 'failed' | 'idle'`
  - `derivePhases(state: BatchState | null, run: RunState): PhaseView[]`
  - `isValidBatchName(name: string): boolean`
  - `buildAutoArgs(o: { batch: string; src?: string; holdout?: string; epochs?: number; autoPromote?: boolean }): string[]`: returns `['pipeline.py', 'auto', ...(src ? [src] : []), '--batch', batch, '--no-browser', ...]`. It adds `--holdout X` only when given, `--epochs N` only when given, and `--no-promote` when `autoPromote === false`.
- Labels: ingest "Archive photos", prelabel "Auto-label", review "Your review", augment "Augment", train "Fine-tune & compare".
- `jobs.ts`:
  - `startRun(batch: string, args: string[], onExit?: () => void): void`. It spawns `pythonExecutable()` with `cwd: ML_DIR` and env `PYTHONUNBUFFERED=1`, `PYTHONIOENCODING=utf-8`. stdout and stderr are appended to `logFile(batch)`, and the PID goes to `pidFile(batch)`. It throws `BusyError` with the message `Batch '<active>' is still running` if any run is alive.
  - `stopRun(batch): boolean`. On win32 it runs `taskkill /PID <pid> /T /F`, otherwise `process.kill(-pid)`.
  - `runState(batch): RunState`. It is `'running'` if the in-memory child is alive, or if `pidFile` holds a live PID (`process.kill(pid, 0)`). It is `'failed'` if the last exit code for this batch (kept in memory, plus `exit` code written to `pidFile` as `{"pid":..,"exit":..}`) is non-zero. Otherwise `'idle'`.
  - `activeBatch(): string | null`
  - `tailLog(batch, lines = 200): string[]`

`derivePhases` rule: stage index `s` (`ingested`=0 … `trained`=4; absent = -1). Phases `0..s` are `done`. Phase `s+1` (if it exists) is:
- `waiting` if it is review and `run === 'running'`
- `active` if running
- `failed` if `run === 'failed'`
- else `pending`

All later phases are `pending`. The "next" phase takes `detail`/`progress` from `activity` when `activity.phase` maps to it (`compare` and `promote` map to `train`). When the stage is `trained`, the train phase's detail is `state.result`.

- [ ] **Step 1: Write the failing tests** in `backend/src/pipeline/status.test.ts` (`node:test` + `node:assert/strict`):

```ts
test('fresh batch running ingest', () => {
  const p = derivePhases({ activity: act('ingest', 'copying 3 photos') }, 'running')
  assert.deepEqual(p.map((x) => x.status), ['active', 'pending', 'pending', 'pending', 'pending'])
  assert.equal(p[0].detail, 'copying 3 photos')
})
test('review is waiting while the run is alive', () => {
  const p = derivePhases({ stage: 'prelabeled', activity: act('review', 'waiting for you') }, 'running')
  assert.deepEqual(p.map((x) => x.status), ['done', 'done', 'waiting', 'pending', 'pending'])
})
test('training progress maps to train phase', () => {
  const p = derivePhases({ stage: 'augmented', activity: act('train', 'epoch 5/25', 0.2) }, 'running')
  assert.equal(p[4].status, 'active'); assert.equal(p[4].progress, 0.2)
})
test('compare maps to train phase', () => {
  assert.equal(derivePhases({ stage: 'augmented', activity: act('compare', 'live vs candidate') }, 'running')[4].detail, 'live vs candidate')
})
test('crash marks the next phase failed', () => {
  assert.equal(derivePhases({ stage: 'reviewed', activity: act('augment', '') }, 'failed')[3].status, 'failed')
})
test('stopped run is pending, not active', () => {
  assert.equal(derivePhases({ stage: 'prelabeled', activity: act('review', 'waiting for you') }, 'idle')[2].status, 'pending')
})
test('trained shows result', () => {
  const p = derivePhases({ stage: 'trained', result: 'kept the live model (candidate was not better)', activity: act('done', '') }, 'idle')
  assert.ok(p.every((x) => x.status === 'done')); assert.match(p[4].detail, /kept the live model/)
})
test('batch names', () => {
  assert.ok(isValidBatchName('batch-2')); assert.ok(!isValidBatchName('../x')); assert.ok(!isValidBatchName('')); assert.ok(!isValidBatchName('a'.repeat(41)))
})
test('auto args', () => {
  assert.deepEqual(buildAutoArgs({ batch: 'b', src: 'C:/s', holdout: 'IMG_1', epochs: 10, autoPromote: false }),
    ['pipeline.py', 'auto', 'C:/s', '--batch', 'b', '--no-browser', '--holdout', 'IMG_1', '--epochs', '10', '--no-promote'])
  assert.deepEqual(buildAutoArgs({ batch: 'b' }), ['pipeline.py', 'auto', '--batch', 'b', '--no-browser'])
})
```

(`act(phase, detail, progress = null)` is a local helper that builds an activity object.)

- [ ] **Step 2: Run the tests and check that they fail**

Run: `npm test` (in `backend/`)
Expected: FAIL, cannot find module `./status`

- [ ] **Step 3: Implement `paths.ts`, `status.ts` and `jobs.ts`** as in Interfaces. `jobs.ts` deletes the staging folder `STAGING_DIR/<batch>` (`fs.rmSync(..., { recursive: true, force: true })`) in the child's `exit` handler, after recording the exit code. In `runState`, a PID file whose process is not alive and has no `exit` code counts as `'failed'`: the backend died and the run went with it.

- [ ] **Step 4: Add the Review Focus #3 and #4 tests** to `status.test.ts` for `runState`. Write a `pidFile` with `process.pid` (alive) → `'running'`. Write one with PID `999999` and no exit → `'failed'`. Write `{"pid": 999999, "exit": 0}` → `'idle'`. Point `paths` at a temp dir by setting `process.env.SALTFINE_REPO_DIR`, which `paths.ts` honors as an override of `REPO_DIR` (add that override).

- [ ] **Step 5: Run the tests and check that they pass**

Run: `npm test` then `npm run typecheck`
Expected: all tests pass, no type errors

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/src/pipeline
git commit -m "feat(backend): pipeline run manager and phase status"
```

### Task 3: Backend `/api/pipeline` routes

**Files:**
- Create: `backend/src/routes/pipeline.ts`, `backend/src/routes/pipeline.test.ts`
- Modify: `backend/src/app.ts` (mount `app.use('/api/pipeline', requireDev, pipelineRouter)` in the "Dev only" block)

**Interfaces:**
- Consumes: everything in Task 2.
- `interface BatchSummary { batch: string; stage: string | null; run: RunState; updated: string | null; result: string | null }`
- `interface BatchStatus extends BatchSummary { phases: PhaseView[]; reviewUrl: string | null; activity: BatchState['activity'] | null; log: string[] }`. `reviewUrl` is `activity.url` only while `run === 'running'` and `activity.phase === 'review'`.
- `GET /api/pipeline/batches` → `{ active: string | null; batches: BatchSummary[] }`: every key in `batches.json`, newest `updated` first.
- `GET /api/pipeline/batches/:batch` → `BatchStatus` (404 if unknown and no folder)
- `POST /api/pipeline/batches` (multipart: `photos[]`, `batch`, optional `holdout`, `epochs`, `autoPromote` = `'true' | 'false'`) → `202 BatchStatus`. multer `diskStorage` into `STAGING_DIR/<batch>`, keeping `path.basename(originalname)`.
- `POST /api/pipeline/batches/:batch/resume` → `202 BatchStatus`
- `POST /api/pipeline/batches/:batch/stop` → `200 BatchStatus`
- Errors are `{ error: string }`:
  - 400: invalid name, 0 accepted images, duplicate names, holdout not among the uploaded stems
  - 404: unknown batch on resume/stop
  - 409: batch exists, `BusyError`

Validate the name and existence before multer writes anything: use a `fileFilter` that checks `req.body.batch`. That requires the client to append `batch` before `photos` in the FormData. Task 4 does this, so note it in the code. On any 400 after upload, delete the staging folder.

- [ ] **Step 1: Write the failing tests** in `pipeline.test.ts`. Start `createApp()` on an ephemeral port (`listen(0)`), with `SALTFINE_USERS_FILE` pointing at a temp file holding a `dev` and a `viewer` user. Sign in through `/api/auth/login` and send the cookie, following `backend/src/auth/auth.test.ts`. Also set with `SALTFINE_REPO_DIR` pointing at a temp repo that has a `dataset/batches.json` with batch `old`. Stub the spawn: `jobs.ts` exports `setSpawnForTests(fn)`, and the test passes a fake that records args and returns an `EventEmitter` with a `pid`. Tests:
  - viewer cookie → 403 on `GET /api/pipeline/batches`; no cookie → 401.
  - `POST` with `batch=old` → 409 `/already exists/`, and `uploads/pipeline/old` does not exist.
  - `POST` with `batch=new` + 2 jpg blobs → 202, the fake spawn got `['pipeline.py','auto', <STAGING_DIR/new>, '--batch','new','--no-browser']`.
  - A second `POST` with `batch=other` while the first fake is alive → 409 `/still running/`.
  - `POST` with only `notes.txt` → 400 `/no photos/i`.
  - `POST` with two files both named `a.jpg` → 400 `/duplicate/i`.
  - `GET /batches/new` → `phases.length === 5`, `run === 'running'`.

- [ ] **Step 2: Run the tests and check that they fail**

Run: `npm test`
Expected: FAIL, cannot find module `./pipeline`

- [ ] **Step 3: Implement the routes and mount them** in `app.ts`. Use the multer `limits` from Global Constraints. Accepted extensions are checked in `fileFilter`.

- [ ] **Step 4: Run the tests and check that they pass**

Run: `npm test` then `npm run typecheck`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/pipeline.ts backend/src/routes/pipeline.test.ts backend/src/app.ts
git commit -m "feat(backend): /api/pipeline routes to upload, run, resume and stop batches"
```

### Task 4: Model Training page

**Files:**
- Create: `frontend/src/types/pipeline.ts` (copies of `PhaseView`, `PhaseStatus`, `RunState`, `BatchSummary`, `BatchStatus` from Tasks 2–3)
- Create: `frontend/src/services/pipeline.ts`
- Create: `frontend/src/components/training/NewBatchForm.tsx`, `PhaseTracker.tsx`, `LogPanel.tsx`, `BatchList.tsx`
- Create: `frontend/src/pages/ModelTraining.tsx`
- Modify: `frontend/src/navigation.ts` (lazy page, id `'training'`, label `'Model Training'`, shortLabel `'Training'`, status `'Pipeline ready'`, icon `BrainCircuit`, `minRole: 'dev'`, placed after Reports)

**Interfaces:**
- Consumes: the Task 3 endpoints.
- `services/pipeline.ts`:
  - `PIPELINE_AVAILABLE: boolean`, true when `VITE_API_BASE_URL` is set (read it the same way `api.ts` does; don't import from `api.ts`)
  - `listBatches(): Promise<{ active: string | null; batches: BatchSummary[] }>`
  - `getBatch(b): Promise<BatchStatus>`
  - `startBatch(input: { batch: string; files: File[]; holdout?: string; epochs: number; autoPromote: boolean }): Promise<BatchStatus>`. It appends `batch` first, then the other fields, then the `photos`.
  - `resumeBatch(b)`, `stopBatch(b)`
  - All requests use `credentials: 'include'`. A 401 calls `notifyUnauthorized()`. Non-2xx responses throw `Error(body.error)`.
- `NewBatchForm` props: `{ disabled: boolean; onStarted(batch: string): void }`. It uses `<input type="file" webkitdirectory multiple>` (set the attribute through a ref or spread, since React's types lack it). It keeps files whose `webkitRelativePath` has exactly one `/` and an accepted extension, and shows "N photos (X MB), M skipped". The batch name defaults to `batch-<n>`, where n is 1 + the highest existing `batch-<n>`. It validates live against the name rule and existing names. The holdout `<select>` lists the photo stems, with a "none" option and a hint that 1 is recommended. It also has epochs (number input, 1–200, default 25) and an auto-promote checkbox (default on). Run is disabled at 0 photos, with an invalid name, or when `disabled`.
- `PhaseTracker` props: `{ phases: PhaseView[]; reviewUrl: string | null }`. It shows a vertical stepper with an icon per status:
  - done: `CheckCircle2`
  - active: spinning `Loader2`, plus a progress bar when `progress != null`
  - waiting: `Hand`, plus a primary **Open review** button (`<a target="_blank" rel="noreferrer">` to `reviewUrl`)
  - failed: `XCircle`
  - pending: `Circle`
- `LogPanel` props: `{ lines: string[] }`. Monospace, max height about 18rem, sticks to the bottom unless the user has scrolled up.
- `BatchList` props: `{ batches: BatchSummary[]; selected: string | null; onSelect(b): void }`
- `ModelTraining`:
  - left column: `NewBatchForm` + `BatchList`; right column: the selected batch's `PhaseTracker`, actions and `LogPanel`
  - actions: **Stop** when `run === 'running'`; **Resume** when the run is `failed`, or `idle` with stage ≠ `trained`
  - polls `getBatch(selected)` and `listBatches()` every `LIVE_POLL_INTERVAL_MS` with `usePolledQuery`
  - after a successful start, selects the new batch
  - errors go to `useToast`
  - when `!PIPELINE_AVAILABLE`, renders a `PageState` message: "Model training needs the backend: set VITE_API_BASE_URL and start backend + ml_service venv."
- Use the existing `Card`, `Button` and `Field` components and the Tailwind tokens already in use (`bg-panel`, `border-line`, `text-ink-*`, `bg-navy-800`).

- [ ] **Step 1: Implement types and service; run `npm run typecheck`** (in `frontend/`). Expected: no errors.
- [ ] **Step 2: Implement the four components and the page, and register them in `navigation.ts`; run `npm run typecheck`**. Expected: no errors.
- [ ] **Step 3: Check in the browser** with the backend (`npm run dev` in `backend/`) and frontend (`npm run dev` in `frontend/` with `VITE_API_BASE_URL=http://localhost:5000`) running, using a 2-photo scratch folder:
  - Pick the folder → "2 photos" shows. A name already used (`batch-1`) shows the inline error, and Run is disabled.
  - Run with epochs = 1 and auto-promote **off** → the tracker goes Archive ✓ → Auto-label `photo i/2` → Your review **waiting** with Open review. The review page opens on 8765.
  - Finish review → Augment → Fine-tune `epoch 1/1` → done with the result text. The log panel follows along.
  - Start a run, press Stop during Auto-label → the phase shows pending with Resume. Resume continues from the stage in `state.json`.
- [ ] **Step 4: Clean up the test batch.** Remove it from `dataset/batches.json` and delete `dataset/batches/<name>`. Check with `python pipeline.py versions` that the live model did not change. If it did, roll back to the previous version.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/pipeline.ts frontend/src/services/pipeline.ts frontend/src/components/training frontend/src/pages/ModelTraining.tsx frontend/src/navigation.ts
git commit -m "feat(frontend): Model Training page to run and monitor the batch pipeline"
```

### Task 5: Docs

**Files:**
- Modify: `ml_service/FINETUNE.md` (new top section "From the web app": open **Model Training**, pick folder, Run, Open review when asked. Resume and Stop. The CLI still works the same way.)

- [ ] **Step 1: Write the section** (under 20 lines, same table style as the file)
- [ ] **Step 2: Commit**

```bash
git add ml_service/FINETUNE.md
git commit -m "docs: running the fine-tune pipeline from the web app"
```
