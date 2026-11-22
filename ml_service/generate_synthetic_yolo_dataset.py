"""
SALTFINE - Synthetic YOLO dataset generator (pipeline smoke test ONLY)

Renders tray images of bright salt crystals with dark/brown insoluble impurity
specks and writes YOLO-format labels. Use it to verify that training, export and
inference work end to end. A model trained on this data will NOT be accurate on
real camera images; replace it with labeled photos from the SALTFINE rig.

Usage:
    python generate_synthetic_yolo_dataset.py --train 200 --val 50
"""

import argparse
import random
from pathlib import Path

import cv2
import numpy as np

CLASS_SALT = 0
CLASS_IMPURITY = 1
DEFAULT_OUT = Path(__file__).resolve().parent / "datasets" / "saltfine"


def _polygon(cx, cy, r, sides, jitter):
    angles = np.sort(np.random.uniform(0, 2 * np.pi, sides))
    radii = r * np.random.uniform(1 - jitter, 1 + jitter, sides)
    pts = np.stack([cx + radii * np.cos(angles), cy + radii * np.sin(angles)], axis=1)
    return pts.astype(np.int32)


def render_image(size: int):
    # Dark conveyor/tray background with mild noise and uneven lighting
    base = np.random.randint(25, 60)
    img = np.full((size, size, 3), base, np.uint8)
    gradient = np.linspace(0, np.random.randint(0, 30), size, dtype=np.float32)
    img = np.clip(img + gradient[None, :, None], 0, 255).astype(np.uint8)
    img = cv2.add(img, np.random.randint(0, 12, img.shape, dtype=np.uint8))

    labels = []

    def place(cls, n, r_range, color_fn, sides_range, jitter):
        for _ in range(n):
            r = random.uniform(*r_range)
            cx = random.uniform(r, size - r)
            cy = random.uniform(r, size - r)
            pts = _polygon(cx, cy, r, random.randint(*sides_range), jitter)
            cv2.fillPoly(img, [pts], color_fn())
            x, y, w, h = cv2.boundingRect(pts)
            x2, y2 = min(x + w, size), min(y + h, size)
            x, y = max(x, 0), max(y, 0)
            if x2 - x < 2 or y2 - y < 2:
                continue
            labels.append((cls, (x + x2) / 2 / size, (y + y2) / 2 / size, (x2 - x) / size, (y2 - y) / size))

    # Salt crystals: bright, low-saturation, angular
    place(
        CLASS_SALT,
        random.randint(25, 60),
        (8, 22),
        lambda: tuple(int(v) for v in np.clip(np.random.normal(220, 15, 3), 170, 255)),
        (4, 7),
        0.25,
    )
    # Insoluble impurities: small dark specks / brown sand / grey grit, drawn on top
    place(
        CLASS_IMPURITY,
        random.randint(1, 8),
        (3, 9),
        lambda: random.choice([
            (20, 20, 20),                                   # black speck
            (40, 80, 130),                                  # brown sand (BGR)
            (90, 95, 100),                                  # grey clay / grit
        ]),
        (5, 9),
        0.4,
    )

    img = cv2.GaussianBlur(img, (3, 3), 0)
    return img, labels


def write_split(out: Path, split: str, count: int, size: int):
    img_dir = out / "images" / split
    lbl_dir = out / "labels" / split
    img_dir.mkdir(parents=True, exist_ok=True)
    lbl_dir.mkdir(parents=True, exist_ok=True)
    for i in range(count):
        img, labels = render_image(size)
        stem = f"synthetic_{split}_{i:05d}"
        cv2.imwrite(str(img_dir / f"{stem}.jpg"), img)
        (lbl_dir / f"{stem}.txt").write_text(
            "\n".join(f"{c} {x:.6f} {y:.6f} {w:.6f} {h:.6f}" for c, x, y, w, h in labels) + "\n"
        )


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--train", type=int, default=200)
    ap.add_argument("--val", type=int, default=50)
    ap.add_argument("--size", type=int, default=640)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)
    write_split(args.out, "train", args.train, args.size)
    write_split(args.out, "val", args.val, args.size)
    print(f"[*] Wrote {args.train} train / {args.val} val synthetic images to {args.out}")


if __name__ == "__main__":
    main()
