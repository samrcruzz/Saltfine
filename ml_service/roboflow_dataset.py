"""
SALTFINE - Roboflow dataset sync

Roboflow project: SaltFine Impurities (object detection)
  https://app.roboflow.com/samuels-workspace-uendm/saltfine-impurities

Classes to label in Roboflow (use exactly these names):
  salt_crystal   -> drawn GREEN by highlight.py
  impurity       -> drawn RED   by highlight.py

Setup: put your PRIVATE Roboflow API key in ml_service/.env (gitignored):
  ROBOFLOW_API_KEY=xxxxxxxx

Usage:
  python roboflow_dataset.py upload path/to/photos --batch "batch-2026-11-22"
  # ...label the batch in Roboflow, then Generate a dataset version...
  python roboflow_dataset.py download --version 1
  python train_yolo.py --data datasets/saltfine-roboflow/data.yaml
"""

import argparse
import os
import sys
from pathlib import Path

import yaml

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_OUT = BASE_DIR / "datasets" / "saltfine-roboflow"
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def _project():
    try:
        from dotenv import load_dotenv

        load_dotenv(BASE_DIR / ".env")
    except ImportError:
        pass
    key = os.getenv("ROBOFLOW_API_KEY")
    if not key:
        sys.exit("ROBOFLOW_API_KEY is not set. Add it to ml_service/.env (see .env.example).")
    from roboflow import Roboflow

    rf = Roboflow(api_key=key)
    ws = os.getenv("ROBOFLOW_WORKSPACE", "samuels-workspace-uendm")
    proj = os.getenv("ROBOFLOW_PROJECT", "saltfine-impurities")
    return rf.workspace(ws).project(proj)


def upload(folder: Path, batch: str, split: str):
    files = sorted(p for p in folder.rglob("*") if p.suffix.lower() in IMAGE_EXTS)
    if not files:
        sys.exit(f"No images found in {folder}")
    project = _project()
    for i, f in enumerate(files, 1):
        project.upload(image_path=str(f), batch_name=batch, split=split, num_retry_uploads=2)
        print(f"[{i}/{len(files)}] uploaded {f.name}")
    print(f"[*] Done. Label batch '{batch}' at https://app.roboflow.com/ "
          "with classes salt_crystal and impurity.")


def download(version: int, out: Path):
    project = _project()
    ds = project.version(version).download("yolov8", location=str(out), overwrite=True)
    _fix_data_yaml(Path(ds.location))


def _fix_data_yaml(root: Path):
    """Roboflow writes `train: ../train/images` (relative to a parent dir).
    Rewrite with an absolute `path:` so train_yolo.py / Ultralytics resolve it."""
    data_yaml = root / "data.yaml"
    cfg = yaml.safe_load(data_yaml.read_text())
    cfg["path"] = str(root.resolve())
    for split, folder in (("train", "train"), ("val", "valid"), ("test", "test")):
        if (root / folder / "images").exists():
            cfg[split] = f"{folder}/images"
        else:
            cfg.pop(split, None)
    data_yaml.write_text(yaml.safe_dump(cfg, sort_keys=False))
    print(f"[*] Dataset ready: {data_yaml}  classes={cfg.get('names')}")
    print(f"    Train: python train_yolo.py --data {data_yaml}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    up = sub.add_parser("upload", help="upload a folder of photos to Roboflow")
    up.add_argument("folder", type=Path)
    up.add_argument("--batch", default="saltfine-batch")
    up.add_argument("--split", default="train", choices=["train", "valid", "test"])
    dl = sub.add_parser("download", help="download a labeled dataset version in YOLOv8 format")
    dl.add_argument("--version", type=int, required=True)
    dl.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()

    if args.cmd == "upload":
        upload(args.folder, args.batch, args.split)
    else:
        download(args.version, args.out)


if __name__ == "__main__":
    main()
