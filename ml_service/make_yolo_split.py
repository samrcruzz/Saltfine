"""
SALTFINE - assemble an Ultralytics train/val dataset from ALL registered batches

Reads dataset/batches.json. Splits by SOURCE PHOTO, not at random: each photo
listed under "holdout" -- plus every augmented image made from it -- goes to val,
everything else to train. A random split would put near-copies of training
images into val and give a falsely high score. The holdout list stays fixed as
batches are added, so every model version is scored on the same photos.

Usage:
  python make_yolo_split.py                    # -> datasets/saltfine-real/data.yaml
  python make_yolo_split.py --holdout IMG_0688 IMG_1203   # override holdout list
"""

import argparse
import json
import shutil
from pathlib import Path

import yaml

BASE = Path(__file__).resolve().parent
REPO = BASE.parent
REGISTRY = REPO / "dataset" / "batches.json"
DEFAULT_OUT = BASE / "datasets" / "saltfine-real"
CLASS_NAMES = {0: "salt_crystal", 1: "impurity"}


def load_registry(path: Path = REGISTRY) -> dict:
    return json.loads(path.read_text())


def save_registry(reg: dict, path: Path = REGISTRY) -> None:
    path.write_text(json.dumps(reg, indent=2) + "\n")


def is_holdout(stem: str, holdout) -> bool:
    """Real photo 'IMG_0688' or augmented 'paste_003_IMG_0688'."""
    return any(stem == h or stem.endswith("_" + h) for h in holdout)


def collect_pairs(batch: dict):
    pairs = []
    img_dir, lbl_dir = REPO / batch["images"], REPO / batch["labels"]
    if img_dir.exists():
        pairs += [(p, lbl_dir / f"{p.stem}.txt") for p in sorted(img_dir.glob("*.jpg"))]
    aug = batch.get("augmented")
    if aug and (REPO / aug).exists():
        for cls_dir in ("with_impurities", "without_impurities"):
            d = REPO / aug / cls_dir
            pairs += [(p, d / "labels" / f"{p.stem}.txt") for p in sorted((d / "images").glob("*.jpg"))]
    return pairs


def build_split(out: Path = DEFAULT_OUT, holdout=None, registry: Path = REGISTRY, quiet=False) -> Path:
    reg = load_registry(registry)
    holdout = list(holdout or reg.get("holdout", []))
    if out.exists():
        shutil.rmtree(out)
    for split in ("train", "val"):
        (out / "images" / split).mkdir(parents=True)
        (out / "labels" / split).mkdir(parents=True)

    counts = {"train": [0, 0], "val": [0, 0]}
    for name, batch in reg["batches"].items():
        for img, lbl in collect_pairs(batch):
            if not lbl.exists():
                print(f"[!] skipping {img.name}: no label file (run pipeline.py prelabel first)")
                continue
            split = "val" if is_holdout(img.stem, holdout) else "train"
            dst = f"{name}__{img.stem}"  # batch prefix avoids name clashes between batches
            shutil.copy2(img, out / "images" / split / f"{dst}.jpg")
            shutil.copy2(lbl, out / "labels" / split / f"{dst}.txt")
            counts[split][0] += 1
            counts[split][1] += sum(1 for line in lbl.read_text().splitlines() if line.startswith("1 "))

    if counts["val"][0] == 0:
        raise SystemExit("No validation images: add a photo name to 'holdout' in dataset/batches.json")
    data_yaml = out / "data.yaml"
    data_yaml.write_text(yaml.safe_dump(
        {"path": str(out.resolve()), "train": "images/train", "val": "images/val", "names": CLASS_NAMES},
        sort_keys=False))
    if not quiet:
        for split, (n, imp) in counts.items():
            print(f"[*] {split:<5} {n:4d} images  {imp:4d} impurity boxes")
        print(f"[*] {data_yaml}  (holdout: {', '.join(holdout)})")
    return data_yaml


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--holdout", nargs="*", default=None, help="override the registry's holdout photo list")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()
    build_split(args.out, args.holdout)


if __name__ == "__main__":
    main()
