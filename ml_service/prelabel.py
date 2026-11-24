"""
SALTURE - free local pre-labeller (no Roboflow credits)

Makes first-pass YOLO box labels for salt photos taken on a dark background,
using classic OpenCV colour rules measured on the SALTURE rig:
  impurity      brownish, mid brightness, compact (Lab b >= ~134.5, V 60-160)
                grey pebbles are missed by colour: add them to the --impurities JSON
  salt_crystal  bright, low saturation          (V >= ~135, S <= ~45), split with watershed
  background    dark cloth                      (V < ~70, bluish)

Always REVIEW the result (overlay previews are written) before training:
fix boxes in Roboflow's editor after uploading.

Usage:
  python prelabel.py ../dataset/test/jpg --out ../dataset/test/prelabels
  python prelabel.py ../dataset/test/jpg --out ../dataset/test/prelabels       --impurities ../dataset/test/impurities_manual.json   # hand-checked impurity boxes
  -> <out>/labels/*.txt (YOLO), <out>/preview/*.jpg, <out>/classes.txt
"""

import argparse
from pathlib import Path

import cv2
import numpy as np

CLASSES = ["salt_crystal", "impurity"]  # same order as yolo/saltfine.yaml
WORK_W = 2016  # process at this width for speed; boxes are scaled back


def impurity_boxes(bgr, min_area, b_min):
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    b = cv2.GaussianBlur(lab[:, :, 2], (0, 0), 3)
    v = cv2.GaussianBlur(hsv[:, :, 2], (0, 0), 3)
    s = cv2.GaussianBlur(hsv[:, :, 1], (0, 0), 3)
    mask = ((b >= b_min) & (v >= 60) & (v <= 160) & (s >= 12)).astype(np.uint8) * 255
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k, iterations=2)
    out = []
    n, labels, st, _ = cv2.connectedComponentsWithStats(mask)
    b_raw = lab[:, :, 2]
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if a < min_area or not 0.25 <= w / max(h, 1) <= 4:
            continue
        # Lit cloth also turns slightly yellow (b ~131-132) but forms ragged blobs;
        # real pebbles are clearly yellow/brown (b >= ~134.5) and compact.
        m = (labels[y:y + h, x:x + w] == i).astype(np.uint8)
        cnt, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        solidity = a / max(cv2.contourArea(cv2.convexHull(cnt[0])), 1)
        mean_b = b_raw[y:y + h, x:x + w][m > 0].mean()
        if mean_b >= 134.5 and solidity >= 0.55:
            out.append((x, y, w, h))
    return out


def load_manual(path: Path):
    """Hand-checked impurity boxes: {"IMG_0686": [[x1, y1, x2, y2], ...]} in pixels
    at WORK_W (2016 px) width. When an image is listed, these REPLACE the auto rule."""
    if not path or not path.exists():
        return {}
    import json

    data = json.loads(path.read_text())
    return {k: [(x1, y1, x2 - x1, y2 - y1) for x1, y1, x2, y2 in v]
            for k, v in data.items() if not k.startswith("_")}


def salt_boxes(bgr, min_area, max_area, skip):
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    v, s = hsv[:, :, 2], hsv[:, :, 1]
    local = cv2.adaptiveThreshold(cv2.GaussianBlur(v, (5, 5), 0), 255, cv2.ADAPTIVE_THRESH_MEAN_C,
                                  cv2.THRESH_BINARY, 41, -4)
    mask = ((v >= 135) & (s <= 45) & (local > 0)).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=2)
    for x, y, w, h in skip:  # never call an impurity "salt"
        mask[y:y + h, x:x + w] = 0

    # Watershed: split touching crystals at their narrow necks
    dist = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    peaks = (dist >= 0.45 * cv2.dilate(dist, np.ones((25, 25), np.uint8))) & (dist > 6)
    n, markers = cv2.connectedComponents(peaks.astype(np.uint8))
    markers = markers + 1
    markers[(mask > 0) & (markers == 1)] = 0  # unknown region to flood
    markers = cv2.watershed(bgr, markers)

    out = []
    for lbl in range(2, n + 1):
        ys, xs = np.nonzero(markers == lbl)
        if len(xs) < min_area:
            continue
        x, y, x2, y2 = xs.min(), ys.min(), xs.max(), ys.max()
        w, h = x2 - x + 1, y2 - y + 1
        if w * h <= max_area and 0.3 <= w / h <= 3.3:
            out.append((x, y, w, h))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--b-min", type=int, default=131, help="Lab b threshold for brownish impurities")
    ap.add_argument("--impurities", type=Path, default=None,
                    help="JSON of hand-checked impurity boxes (overrides the auto rule per image)")
    args = ap.parse_args()

    (args.out / "labels").mkdir(parents=True, exist_ok=True)
    (args.out / "preview").mkdir(parents=True, exist_ok=True)
    (args.out / "classes.txt").write_text("\n".join(CLASSES) + "\n")

    for f in sorted(p for p in args.src.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}):
        full = cv2.imread(str(f))
        H, W = full.shape[:2]
        k = WORK_W / W
        img = cv2.resize(full, (WORK_W, round(H * k)), interpolation=cv2.INTER_AREA)
        h, w = img.shape[:2]

        manual = load_manual(args.impurities)
        imp = manual[f.stem] if f.stem in manual else impurity_boxes(
            img, min_area=int(1500 * k * k * 4), b_min=args.b_min)
        salt = salt_boxes(img, min_area=150, max_area=int(0.004 * w * h), skip=imp)

        lines, prev = [], img.copy()
        for cls, boxes, color, th in ((0, salt, (0, 200, 0), 1), (1, imp, (0, 0, 230), 3)):
            for x, y, bw, bh in boxes:
                lines.append(f"{cls} {(x + bw / 2) / w:.6f} {(y + bh / 2) / h:.6f} {bw / w:.6f} {bh / h:.6f}")
                cv2.rectangle(prev, (x, y), (x + bw, y + bh), color, th)
        (args.out / "labels" / f"{f.stem}.txt").write_text("\n".join(lines) + "\n")
        cv2.imwrite(str(args.out / "preview" / f"{f.stem}.jpg"), prev)
        print(f"{f.name}: salt_crystal={len(salt)} impurity={len(imp)}")


if __name__ == "__main__":
    main()
