# Adding new photos: fine-tune instead of retraining from zero

`pipeline.py` grows the dataset batch by batch and **fine-tunes the live model**
(`models/saltfine_yolov8.pt`). A new model only goes live if it beats the current
one on the same validation photos, and every old version is kept so you can roll back.

Run everything from `ml_service/` with the venv:

```powershell
cd C:\Users\Samuel\SaltFine\ml_service
.\.venv\Scripts\Activate.ps1
```

## One command: `auto` (recommended)

```powershell
python pipeline.py auto D:\photos\batch2 --batch batch-2 --holdout IMG_1203
```

1. **Archive**: originals copied read-only to `dataset/batches/batch-2/originals/`
2. **Auto-label**: the current model proposes impurities, OpenCV labels the salt
3. **⏸ Your review**: a review page opens in your browser (`http://127.0.0.1:8765`, local only)
4. **Labels → augment (50 + 50) → fine-tune → compare**, all automatic after you click *Finish review*
5. **Promote**: the new model goes live **only if it beats the current one**; otherwise the old one stays

The command is **safe to stop and re-run**: progress is stored in
`dataset/batches/batch-2/state.json` (`ingested → prelabeled → reviewed → augmented → trained`)
and it continues from where it stopped. Review edits are saved on every change.

### The review page

| Do | How |
|----|-----|
| Add a missed impurity | drag a box on the photo (mode **impurity**, red) |
| Mark "not sure" | press **U** (or *Draw: uncertain*), drag a box (amber). Not trained, and kept out of pure-salt images |
| Remove a wrong box | click it, press **Delete** |
| Zoom / pan / fit | mouse wheel / right-drag or Space+drag / **0** |
| Next / previous photo | **N** / **P** (or arrow keys) |
| Hide/show salt boxes | **S** (salt is labelled automatically; view only) |
| Reject a bad photo | **X** (excluded photos are not used at all) |
| Done | **Finish review ▶ train** |

Useful options: `--no-wait` (label now, review later: re-run `auto --batch batch-2`),
`--no-promote` (never switch the live model automatically), `--augment 0`,
`--epochs 25`, `--imgsz 1280` (matches the app's inference size, ~4× slower).

## Manual steps (what `auto` runs for you)

| # | Command | What it does |
|---|---------|--------------|
| 1 | `python pipeline.py ingest D:\photos\batch2 --batch batch-2 --holdout IMG_1203` | Archives the originals **read-only** in `dataset/batches/batch-2/originals/`, makes JPG working copies, registers the batch in `dataset/batches.json`. `--holdout` (optional, recommended: 1 photo per batch) adds a photo to the fixed validation set. |
| 2 | `python pipeline.py prelabel --batch batch-2` | The **current model** proposes impurity boxes → `impurities_manual.json`; salt boxes come from the OpenCV rules. Writes YOLO labels + tagged previews. |
| 3 | `python review_server.py --batch batch-2` | Opens the review page (above). Or edit `impurities_manual.json` by hand: delete wrong boxes, add missed pebbles/specks (`[x1, y1, x2, y2]` in pixels at 2016 px width). Optional keys `_uncertain` / `_no_paste` work like in batch 1. |
| 4 | `python pipeline.py prelabel --batch batch-2 --from-json` | Regenerates labels from your corrected JSON. |
| 5 | `python pipeline.py augment --batch batch-2 --count 50` | *(optional)* 50 pure-salt + 50 with-impurity images from this batch. |
| 6 | `python pipeline.py finetune` | Merges **all** batches (old + new, so nothing is forgotten), fine-tunes from the live model (25 epochs, AdamW lr 0.0003, ~8 min on CPU), then **compares** live vs candidate on the validation photos at 1280 px. Never touches the live model. |
| 7 | `python pipeline.py promote --run runs/finetune_YYYYMMDD_HHMMSS` | Only if step 6 printed **RECOMMEND PROMOTE**. The old model is archived in `models/versions/` first; ONNX is re-exported. |

The app (`predict.py`, `highlight.py`) always uses `models/saltfine_yolov8.pt`, so a
promoted model is live immediately. No other changes are needed.

## Versions and rollback

```powershell
python pipeline.py versions              # list v1, v2, ... and which is live
python pipeline.py rollback --version v1 # restore an earlier model
```

## How "better" is decided (step 6)

Impurities decide grading, so they are checked first (differences under 0.005 count as a tie):

1. Impurity AP50 drops, or impurity recall drops by more than 0.05 → **keep live model**
2. Impurity AP50 improves → **promote**
3. Impurities tied and overall mAP50-95 improves (better salt boxes) → **promote**
4. Otherwise → keep live model

`promote` refuses a candidate that `compare` rejected unless you add `--force`.

## Rules of thumb

- **Always fine-tune on old + new data** (the pipeline does this). Training on the new
  photos alone makes the model forget the old scenes.
- **Keep the holdout photos fixed.** Change `holdout` in `dataset/batches.json` only when
  you deliberately want a new benchmark. Scores before and after the change are not comparable.
- **Fine-tune ≠ resume.** Ultralytics' `resume` only continues an interrupted run.
- After several batches (or a big change in camera/lighting), a full retrain
  can still beat stacked fine-tunes. Run it without touching the live model, then compare:
  `python train_yolo.py --data datasets/saltfine-real/data.yaml --name retrain --no-install`
  → `python pipeline.py compare --run runs/retrain` → `promote` if recommended.
