"""
SALTURE - continual-learning pipeline: add new photos and FINE-TUNE the current
YOLOv8 model instead of training from zero.

    new photos
      1 ingest    archive originals (read-only) + JPG working copies, register batch
      2 prelabel  current model proposes impurity boxes -> impurities_manual.json;
                  salt boxes from the OpenCV rules; writes YOLO labels + previews
        (review)  fix impurities_manual.json, then:  prelabel --batch X --from-json
      3 augment   optional: 50+50 crops / pasted pebbles from this batch
      4 split     merge ALL batches; fixed holdout photos are always validation
      5 finetune  start from models/saltfine_yolov8.pt, old + new data, low LR.
                  Writes a CANDIDATE in runs/; never touches the live model
      6 compare   live model vs candidate on the same validation set
      7 promote   candidate becomes live; old one kept in models/versions/
        rollback  restore any earlier version

Commands (run from ml_service/):
  python pipeline.py ingest D:\\photos\\batch2 --batch batch-2 --holdout IMG_1203
  python pipeline.py prelabel --batch batch-2
  python pipeline.py prelabel --batch batch-2 --from-json      # after fixing the JSON
  python pipeline.py augment  --batch batch-2 --count 50
  python pipeline.py finetune                                  # = split + fine-tune + compare
  python pipeline.py promote  --run runs/finetune_YYYYMMDD_HHMMSS
  python pipeline.py versions
  python pipeline.py rollback --version v1
"""

import argparse
import hashlib
import json
import os
import shutil
import stat
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

BASE = Path(__file__).resolve().parent
REPO = BASE.parent
sys.path.insert(0, str(BASE))

from augment_dataset import read_any, render_preview  # noqa: E402
from make_yolo_split import DEFAULT_OUT, REGISTRY, build_split, is_holdout, load_registry, save_registry  # noqa: E402
from prelabel import WORK_W, load_manual, salt_boxes  # noqa: E402

LIVE = BASE / "models" / "saltfine_yolov8.pt"
VERSIONS = BASE / "models" / "versions"
HISTORY = VERSIONS / "history.json"
IMG_EXTS = {".jpg", ".jpeg", ".png", ".dng", ".heic", ".tif", ".tiff", ".bmp", ".webp"}
EVAL_IMGSZ = 1280  # same size the app uses for inference
TOL = 0.005        # metric differences smaller than this count as a tie


def rel(p: Path) -> str:
    return Path(os.path.relpath(p, REPO)).as_posix()


def batch_dir(name: str) -> Path:
    return REPO / "dataset" / "batches" / name


def get_batch(name: str) -> dict:
    reg = load_registry()
    if name not in reg["batches"]:
        raise SystemExit(f"Unknown batch '{name}'. Registered: {', '.join(reg['batches'])}")
    return reg["batches"][name]


def clean_stem(p: Path) -> str:
    s = p.stem.replace(" (1)", "").replace(" ", "_")
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in s)


# ------------------------------------------------------------------ 1 ingest
def cmd_ingest(a):
    reg = load_registry()
    if a.batch in reg["batches"]:
        raise SystemExit(f"Batch '{a.batch}' already exists in {rel(REGISTRY)}")
    files = sorted(p for p in a.src.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXTS)
    if not files:
        raise SystemExit(f"No photos in {a.src}")
    d = batch_dir(a.batch)
    (d / "originals").mkdir(parents=True, exist_ok=False)
    (d / "jpg").mkdir()
    known = {p.stem for b in reg["batches"].values() for p in (REPO / b["images"]).glob("*.jpg")}
    for f in files:
        dst = d / "originals" / f.name
        shutil.copy2(f, dst)
        os.chmod(dst, stat.S_IREAD)  # archive: read-only, never modified
        raw = f.read_bytes()
        out = d / "jpg" / f"{clean_stem(f)}.jpg"
        if raw[:3] == b"\xff\xd8\xff":
            out.write_bytes(raw)  # already JPEG data (even with a .DNG name): lossless copy
        else:
            img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
            if img is None:
                raise SystemExit(f"Cannot decode {f.name}. Export it as JPG and ingest again.")
            cv2.imwrite(str(out), img, [cv2.IMWRITE_JPEG_QUALITY, 95])
        if out.stem in known:
            print(f"[!] {out.stem} also exists in another batch (fine: batches are prefixed in the split)")
    reg["batches"][a.batch] = {
        "originals": rel(d / "originals"), "images": rel(d / "jpg"), "labels": rel(d / "labels"),
        "impurities": rel(d / "impurities_manual.json"), "augmented": rel(d / "augmented"),
    }
    for h in a.holdout or []:
        if h not in reg["holdout"]:
            reg["holdout"].append(h)
    save_registry(reg)
    print(f"[*] {len(files)} photos archived (read-only) in {rel(d / 'originals')}")
    print(f"[*] registered '{a.batch}'. Next: python pipeline.py prelabel --batch {a.batch}")


# ------------------------------------------------------------------ 2 prelabel
def dump_boxes(data: dict) -> str:
    """One photo per line so the JSON is easy to review and edit by hand."""
    rows = [f"  {json.dumps(k)}: {json.dumps(v)}" for k, v in data.items()]
    return "{\n" + ",\n".join(rows) + "\n}\n"

def cmd_prelabel(a):
    b = get_batch(a.batch)
    img_dir, lbl_dir = REPO / b["images"], REPO / b["labels"]
    json_path = REPO / b["impurities"]
    prev_dir = lbl_dir.parent / "preview"
    lbl_dir.mkdir(parents=True, exist_ok=True)
    prev_dir.mkdir(parents=True, exist_ok=True)
    photos = sorted(img_dir.glob("*.jpg"))

    if a.from_json:
        if not json_path.exists():
            raise SystemExit(f"{rel(json_path)} not found; run prelabel without --from-json first")
        manual = load_manual(json_path)
    else:
        if json_path.exists() and not a.force:
            raise SystemExit(f"{rel(json_path)} exists (maybe already reviewed). Use --from-json to "
                             "regenerate labels from it, or --force to overwrite with new model proposals.")
        from ultralytics import YOLO

        model = YOLO(str(LIVE))
        data = {"_note": f"Impurity boxes PROPOSED by the model (conf >= {a.conf}). REVIEW: delete wrong "
                         "boxes, add missed ones, then run: pipeline.py prelabel --batch "
                         f"{a.batch} --from-json.  Format [x1, y1, x2, y2] px at {WORK_W} px width."}
        for p in photos:
            full = cv2.imread(str(p))
            k = WORK_W / full.shape[1]
            r = model.predict(full, conf=a.conf, imgsz=EVAL_IMGSZ, max_det=1000, verbose=False)[0]
            boxes = []
            for (x1, y1, x2, y2), c in zip(r.boxes.xyxy.tolist(), r.boxes.cls.tolist()):
                if "impur" in r.names[int(c)]:
                    boxes.append([round(x1 * k), round(y1 * k), round(x2 * k), round(y2 * k)])
            data[p.stem] = boxes
            print(f"    {p.name}: model proposes {len(boxes)} impurities")
        json_path.write_text(dump_boxes(data))
        manual = load_manual(json_path)

    excluded = set(json.loads(json_path.read_text()).get("_excluded", []))
    for p in photos:
        if p.stem in excluded:  # rejected during review: no label file -> split skips it
            (lbl_dir / f"{p.stem}.txt").unlink(missing_ok=True)
            (prev_dir / f"{p.stem}.jpg").unlink(missing_ok=True)
            print(f"    {p.name}: excluded during review (not used)")
            continue
        full = cv2.imread(str(p))
        img = cv2.resize(full, (WORK_W, round(full.shape[0] * WORK_W / full.shape[1])), interpolation=cv2.INTER_AREA)
        h, w = img.shape[:2]
        imp = manual.get(p.stem, [])  # (x, y, w, h)
        salt = salt_boxes(img, min_area=150, max_area=int(0.004 * w * h), skip=imp)
        lines = [f"0 {(x + bw / 2) / w:.6f} {(y + bh / 2) / h:.6f} {bw / w:.6f} {bh / h:.6f}" for x, y, bw, bh in salt]
        lines += [f"1 {(x + bw / 2) / w:.6f} {(y + bh / 2) / h:.6f} {bw / w:.6f} {bh / h:.6f}" for x, y, bw, bh in imp]
        (lbl_dir / f"{p.stem}.txt").write_text("\n".join(lines) + "\n")
        cv2.imwrite(str(prev_dir / f"{p.stem}.jpg"), render_preview(img, lines))
    print(f"[*] labels: {rel(lbl_dir)}   previews: {rel(prev_dir)}")
    if not a.from_json:
        print(f"[*] REVIEW the previews, fix {rel(json_path)}, then: "
              f"python pipeline.py prelabel --batch {a.batch} --from-json")


# ------------------------------------------------------------------ 3 augment
def cmd_augment(a):
    b = get_batch(a.batch)
    cmd = [sys.executable, str(BASE / "augment_dataset.py"), "--src", str(REPO / b["originals"]),
           "--boxes", str(REPO / b["impurities"]), "--out", str(REPO / b["augmented"]),
           "--count", str(a.count), "--seed", str(a.seed)]
    subprocess.run(cmd, check=True, cwd=BASE)


# ------------------------------------------------------------------ versions
def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()[:16]


def load_history():
    return json.loads(HISTORY.read_text()) if HISTORY.exists() else []


def save_history(h):
    VERSIONS.mkdir(parents=True, exist_ok=True)
    HISTORY.write_text(json.dumps(h, indent=2) + "\n")


def archive_live(note: str) -> dict:
    """Store the live model in models/versions/ (once per unique file) and return its entry."""
    hist = load_history()
    digest = sha(LIVE)
    for e in hist:
        if e["sha"] == digest:
            return e
    v = f"v{len(hist) + 1}"
    dst = VERSIONS / f"saltfine_yolov8_{v}.pt"
    VERSIONS.mkdir(parents=True, exist_ok=True)
    shutil.copy2(LIVE, dst)
    e = {"version": v, "file": rel(dst), "sha": digest, "archived": datetime.now().isoformat(timespec="seconds"),
         "note": note}
    hist.append(e)
    save_history(hist)
    return e


def evaluate(weights: Path, data_yaml: Path) -> dict:
    from ultralytics import YOLO

    m = YOLO(str(weights)).val(data=str(data_yaml), imgsz=EVAL_IMGSZ, max_det=1000, device="cpu",
                               plots=False, verbose=False, project=str(BASE / "runs" / "eval"), exist_ok=True)
    names = m.names
    out = {"mAP50": float(m.box.map50), "mAP50-95": float(m.box.map)}
    for i, cls in enumerate(m.box.ap_class_index):
        n = names[int(cls)]
        out[f"{n}_AP50"] = float(m.box.ap50[i])
        out[f"{n}_P"] = float(m.box.p[i])
        out[f"{n}_R"] = float(m.box.r[i])
    return out


def verdict(old: dict, new: dict) -> tuple:
    """Impurities are what grading depends on, so they decide first."""
    di = new.get("impurity_AP50", 0) - old.get("impurity_AP50", 0)
    dr = new.get("impurity_R", 0) - old.get("impurity_R", 0)
    dm = new["mAP50-95"] - old["mAP50-95"]
    if di < -TOL or dr < -0.05:
        return False, "worse at finding impurities"
    if di > TOL:
        return True, "better at finding impurities"
    if dm > TOL:
        return True, "impurities equal, better overall (salt boxes)"
    return False, "no clear improvement"


def print_table(old, new):
    keys = ["impurity_AP50", "impurity_P", "impurity_R", "salt_crystal_AP50", "salt_crystal_R", "mAP50", "mAP50-95"]
    print(f"\n    {'metric':<20}{'live':>9}{'candidate':>11}{'change':>9}")
    for k in keys:
        if k in old or k in new:
            o, n = old.get(k, float('nan')), new.get(k, float('nan'))
            print(f"    {k:<20}{o:9.3f}{n:11.3f}{n - o:+9.3f}")


# ------------------------------------------------------------------ 5 finetune (+ 4 split, 6 compare)
def cmd_finetune(a):
    from ultralytics import YOLO

    data_yaml = build_split(DEFAULT_OUT)
    archive_live("live model before fine-tune")
    name = datetime.now().strftime("finetune_%Y%m%d_%H%M%S")
    print(f"[*] fine-tuning from {rel(LIVE)}: {a.epochs} epochs, lr0={a.lr0} -> runs/{name}")
    model = YOLO(str(LIVE))
    model.train(data=str(data_yaml), epochs=a.epochs, imgsz=a.imgsz, batch=a.batch, device=a.device,
                workers=a.workers, patience=max(10, a.epochs // 2),
                # explicit optimizer: with optimizer="auto" Ultralytics IGNORES lr0 and uses its
                # from-scratch rate (AdamW 0.00167), which overwrites what the model learned
                optimizer="AdamW", lr0=a.lr0, lrf=0.1,
                # gentle warm-up: the default warmup_bias_lr=0.1 scrambles a trained head
                warmup_epochs=1, warmup_bias_lr=a.lr0,
                project=str(BASE / "runs"), name=name, exist_ok=False, max_det=1000,
                flipud=0.5, fliplr=0.5, hsv_h=0.005, hsv_s=0.3, hsv_v=0.3, plots=False)
    run = BASE / "runs" / name
    return run, compare(run, data_yaml)


def compare(run: Path, data_yaml: Path = None):
    data_yaml = data_yaml or build_split(DEFAULT_OUT, quiet=True)
    cand = run / "weights" / "best.pt"
    print(f"\n[*] evaluating on the fixed validation set at {EVAL_IMGSZ} px ...")
    old, new = evaluate(LIVE, data_yaml), evaluate(cand, data_yaml)
    print_table(old, new)
    ok, why = verdict(old, new)
    (run / "compare.json").write_text(json.dumps({"live": old, "candidate": new, "promote": ok, "reason": why}, indent=2))
    if ok:
        print(f"\n[+] RECOMMEND PROMOTE ({why}):  python pipeline.py promote --run {rel(run)}")
    else:
        print(f"\n[-] KEEP the live model ({why}). Candidate stays in {rel(run)}")
    return ok


def cmd_compare(a):
    compare(a.run.resolve())


# ------------------------------------------------------------------ auto: the whole loop
STAGES = ["ingested", "prelabeled", "reviewed", "augmented", "trained"]


def get_stage(name: str):
    f = batch_dir(name) / "state.json"
    return json.loads(f.read_text())["stage"] if f.exists() else None


def set_stage(name: str, stage: str, **extra):
    f = batch_dir(name) / "state.json"
    f.parent.mkdir(parents=True, exist_ok=True)
    st = json.loads(f.read_text()) if f.exists() else {}
    st.update(stage=stage, updated=datetime.now().isoformat(timespec="seconds"), **extra)
    f.write_text(json.dumps(st, indent=2) + "\n")
    print(f"\n==== {name}: {stage} ====")


def reached(name: str, stage: str) -> bool:
    s = get_stage(name)
    return s is not None and STAGES.index(s) >= STAGES.index(stage)


def cmd_auto(a):
    """photos -> labels -> YOUR review -> train. Safe to re-run: resumes where it stopped."""
    ns = argparse.Namespace
    reg = load_registry()
    if a.batch not in reg["batches"]:
        if not a.src:
            raise SystemExit(f"New batch: give the photo folder, e.g.  pipeline.py auto D:\\photos --batch {a.batch}")
        cmd_ingest(ns(src=a.src, batch=a.batch, holdout=a.holdout))
        set_stage(a.batch, "ingested")
    elif get_stage(a.batch) is None:
        set_stage(a.batch, "ingested")  # registered earlier without auto
    print(f"[*] batch '{a.batch}' is at stage: {get_stage(a.batch)}")

    if not reached(a.batch, "prelabeled"):
        cmd_prelabel(ns(batch=a.batch, conf=a.conf, from_json=False, force=True))
        set_stage(a.batch, "prelabeled")

    if not reached(a.batch, "reviewed"):
        if a.no_wait:
            print(f"[*] stopped for review. Continue any time with:  python pipeline.py auto --batch {a.batch}")
            return
        from review_server import run_review

        run_review(get_batch(a.batch), a.batch, a.port, open_browser=not a.no_browser)
        cmd_prelabel(ns(batch=a.batch, conf=a.conf, from_json=True, force=False))
        set_stage(a.batch, "reviewed")

    if not reached(a.batch, "augmented"):
        if a.augment > 0:
            cmd_augment(ns(batch=a.batch, count=a.augment, seed=7))
        set_stage(a.batch, "augmented")

    if reached(a.batch, "trained"):
        print(f"[*] {a.batch} is already trained. To train again on all batches: python pipeline.py finetune")
        return
    run, ok = cmd_finetune(ns(epochs=a.epochs, lr0=a.lr0, imgsz=a.imgsz, batch=8, device="cpu", workers=4))
    if ok and not a.no_promote:
        install(run / "weights" / "best.pt", f"promoted from {rel(run)} (auto, {a.batch})")
        result = "promoted: the app now uses the new model"
    elif ok:
        result = f"candidate is better; promote with: python pipeline.py promote --run {rel(run)}"
    else:
        result = "kept the live model (candidate was not better)"
    set_stage(a.batch, "trained", run=rel(run), result=result)
    print(f"[*] {a.batch}: {result}")


# ------------------------------------------------------------------ 7 promote / rollback
def install(weights: Path, note: str):
    from ultralytics import YOLO

    archive_live("replaced by " + note)
    shutil.copy2(weights, LIVE)
    onnx = Path(YOLO(str(LIVE)).export(format="onnx", imgsz=640, simplify=False))
    if onnx.resolve() != LIVE.with_suffix(".onnx").resolve():  # export already writes next to the .pt
        shutil.copy2(onnx, LIVE.with_suffix(".onnx"))
    e = archive_live(note)
    print(f"[*] live model is now {e['version']} ({note}); previous versions in {rel(VERSIONS)}")


def cmd_promote(a):
    run = a.run.resolve()
    cand = run / "weights" / "best.pt"
    if not cand.exists():
        raise SystemExit(f"No candidate at {cand}")
    cmp_file = run / "compare.json"
    if cmp_file.exists() and not json.loads(cmp_file.read_text())["promote"] and not a.force:
        raise SystemExit("compare said KEEP the live model. Use --force to promote anyway.")
    install(cand, f"promoted from {rel(run)}")


def cmd_rollback(a):
    for e in load_history():
        if e["version"] == a.version:
            install(REPO / e["file"], f"rollback to {a.version}")
            return
    raise SystemExit(f"Unknown version {a.version}; see: python pipeline.py versions")


def cmd_versions(_):
    live = sha(LIVE) if LIVE.exists() else None
    for e in load_history():
        mark = "  <- live" if e["sha"] == live else ""
        print(f"  {e['version']:<4} {e['archived']}  {e['note']}{mark}")
    if not load_history():
        print("  (no versions archived yet; the first fine-tune archives the live model as v1)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("auto", help="ingest -> auto-label -> YOUR review -> augment -> fine-tune -> promote if better")
    s.add_argument("src", type=Path, nargs="?", help="folder of new photos (only needed the first time)")
    s.add_argument("--batch", required=True)
    s.add_argument("--holdout", nargs="*", help="photo name(s) from this batch to keep for validation")
    s.add_argument("--conf", type=float, default=0.2, help="model confidence for proposals (lower = more to review)")
    s.add_argument("--augment", type=int, default=50, help="augmented images per class from this batch (0 = skip)")
    s.add_argument("--epochs", type=int, default=25)
    s.add_argument("--lr0", type=float, default=0.0003)
    s.add_argument("--imgsz", type=int, default=640, help="training size; 1280 matches the app but is ~4x slower")
    s.add_argument("--no-promote", action="store_true", help="never switch the live model automatically")
    s.add_argument("--no-wait", action="store_true", help="stop after auto-labelling; review later")
    s.add_argument("--no-browser", action="store_true", help="don't open the review page automatically")
    s.add_argument("--port", type=int, default=8765)
    s.set_defaults(fn=cmd_auto)

    s = sub.add_parser("ingest", help="archive + register a folder of new photos")
    s.add_argument("src", type=Path)
    s.add_argument("--batch", required=True)
    s.add_argument("--holdout", nargs="*", help="photo name(s) from this batch to keep for validation")
    s.set_defaults(fn=cmd_ingest)

    s = sub.add_parser("prelabel", help="model-assisted labels for a batch")
    s.add_argument("--batch", required=True)
    s.add_argument("--conf", type=float, default=0.2, help="lower = more proposals to review")
    s.add_argument("--from-json", action="store_true", help="regenerate labels from the reviewed JSON")
    s.add_argument("--force", action="store_true", help="overwrite an existing impurities JSON")
    s.set_defaults(fn=cmd_prelabel)

    s = sub.add_parser("augment", help="make with/without-impurity crops for a batch")
    s.add_argument("--batch", required=True)
    s.add_argument("--count", type=int, default=50)
    s.add_argument("--seed", type=int, default=7)
    s.set_defaults(fn=cmd_augment)

    s = sub.add_parser("split", help="merge all batches into datasets/saltfine-real")
    s.set_defaults(fn=lambda _a: build_split(DEFAULT_OUT))

    s = sub.add_parser("finetune", help="split + fine-tune from the live model + compare")
    s.add_argument("--epochs", type=int, default=25)
    s.add_argument("--lr0", type=float, default=0.0003,
                   help="AdamW learning rate; ~1/5 of the from-scratch rate (0.00167) to keep old knowledge")
    s.add_argument("--imgsz", type=int, default=640)
    s.add_argument("--batch", type=int, default=8)
    s.add_argument("--device", default="cpu")
    s.add_argument("--workers", type=int, default=4)
    s.set_defaults(fn=cmd_finetune)

    s = sub.add_parser("compare", help="live model vs a candidate run")
    s.add_argument("--run", type=Path, required=True)
    s.set_defaults(fn=cmd_compare)

    s = sub.add_parser("promote", help="make a candidate the live model (old one archived)")
    s.add_argument("--run", type=Path, required=True)
    s.add_argument("--force", action="store_true")
    s.set_defaults(fn=cmd_promote)

    s = sub.add_parser("rollback", help="restore an archived version")
    s.add_argument("--version", required=True)
    s.set_defaults(fn=cmd_rollback)

    s = sub.add_parser("versions", help="list archived model versions")
    s.set_defaults(fn=cmd_versions)

    a = ap.parse_args()
    sys.stdout.reconfigure(line_buffering=True)  # progress shows up live even when logged to a file
    a.fn(a)


if __name__ == "__main__":
    main()
