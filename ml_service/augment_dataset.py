"""
SALTURE - build a balanced augmented dataset from a few real photos

From the ORIGINAL photos (read only, never modified) it creates:
  without_impurities/  N images of pure salt
      real crops that avoid every labelled impurity AND every "uncertain" spot,
      + flips and mild lighting changes
  with_impurities/     N images containing impurities
      ~40% real crops that contain the real pebbles (box fully inside the crop)
      ~60% clean crops with real pebbles cut out (GrabCut) and pasted at new
           positions / sizes / angles  (copy-paste augmentation)

Every image gets YOLO labels: salt_crystal (auto, see prelabel.py) + impurity
(exact, from the hand-checked boxes / paste positions). Preview overlays are
written so the result can be checked by eye.

NOTE: this multiplies 5 scenes; it helps training but does not replace more real
photos. Keep a few real, un-augmented photos aside for validation.

Usage:
  python augment_dataset.py --src ../dataset/test/originals \
      --boxes ../dataset/test/impurities_manual.json --out ../dataset/augmented --count 50
"""

import argparse
import json
import random
import shutil
from pathlib import Path

import cv2
import numpy as np

from prelabel import CLASSES, WORK_W, salt_boxes

OUT_W, OUT_H = 1280, 720
IMG_EXTS = {".jpg", ".jpeg", ".png", ".dng"}


def read_any(path: Path):
    """cv2.imread trusts extensions; decode from bytes so JPEG-in-.DNG works."""
    img = cv2.imdecode(np.frombuffer(path.read_bytes(), np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"cannot decode {path}")
    return img


def stem_key(path: Path) -> str:
    """Same naming as pipeline.py ingest: 'IMG_0686 (1).DNG' -> 'IMG_0686'."""
    s = path.stem.replace(" (1)", "").replace(" ", "_")
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in s)


# ---------------------------------------------------------------- geometry
def inside(box, crop):
    x1, y1, x2, y2 = box
    cx1, cy1, cx2, cy2 = crop
    return x1 >= cx1 and y1 >= cy1 and x2 <= cx2 and y2 <= cy2


def overlaps(box, crop, margin=0):
    x1, y1, x2, y2 = box
    cx1, cy1, cx2, cy2 = crop
    return not (x2 + margin <= cx1 or x1 - margin >= cx2 or y2 + margin <= cy1 or y1 - margin >= cy2)


def random_crop(w, h, frac=(0.5, 0.85)):
    cw = int(w * random.uniform(*frac))
    ch = int(cw * OUT_H / OUT_W)
    x = random.randint(0, w - cw)
    y = random.randint(0, h - ch)
    return (x, y, x + cw, y + ch)


# ---------------------------------------------------------------- photometric / flips
def jitter(img):
    """Mild only: impurity colour (yellow/brown vs white) is the key signal."""
    alpha = random.uniform(0.9, 1.1)      # contrast
    beta = random.uniform(-12, 12)        # brightness
    out = cv2.convertScaleAbs(img, alpha=alpha, beta=beta)
    if random.random() < 0.25:
        out = cv2.GaussianBlur(out, (3, 3), 0)
    return out


def flip(img, boxes, w, h):
    mode = random.choice([None, 0, 1, -1])  # none / vertical / horizontal / both
    if mode is None:
        return img, boxes
    out = cv2.flip(img, mode)
    fb = []
    for x1, y1, x2, y2 in boxes:
        if mode in (1, -1):
            x1, x2 = w - x2, w - x1
        if mode in (0, -1):
            y1, y2 = h - y2, h - y1
        fb.append((x1, y1, x2, y2))
    return out, fb


# ---------------------------------------------------------------- impurity cut-outs
def cut_out(img, box):
    """Segment the pebble inside its hand-drawn box with GrabCut -> (BGR patch, alpha)."""
    x1, y1, x2, y2 = box
    pad = max(8, int(0.25 * max(x2 - x1, y2 - y1)))
    H, W = img.shape[:2]
    X1, Y1, X2, Y2 = max(0, x1 - pad), max(0, y1 - pad), min(W, x2 + pad), min(H, y2 + pad)
    roi = img[Y1:Y2, X1:X2].copy()
    rect = (x1 - X1, y1 - Y1, x2 - x1, y2 - y1)
    mask = np.zeros(roi.shape[:2], np.uint8)
    if min(rect[2], rect[3]) >= 20:
        bgd, fgd = np.zeros((1, 65)), np.zeros((1, 65))
        cv2.grabCut(roi, mask, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)
        fg = np.isin(mask, (cv2.GC_FGD, cv2.GC_PR_FGD)).astype(np.uint8)
        n, lbl, st, _ = cv2.connectedComponentsWithStats(fg)
        if n > 1:  # keep the largest blob
            fg = (lbl == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    else:
        fg = np.zeros(roi.shape[:2], np.uint8)
    rect_area = rect[2] * rect[3]
    if fg.sum() < 0.25 * rect_area:
        # GrabCut lost it (grey pebble on grey cloth / tiny speck): ellipse inside the box,
        # minus bright salt and dark cloth pixels.
        ell = np.zeros(roi.shape[:2], np.uint8)
        cv2.ellipse(ell, (rect[0] + rect[2] // 2, rect[1] + rect[3] // 2),
                    (max(1, rect[2] // 2), max(1, rect[3] // 2)), 0, 0, 360, 1, -1)
        hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        not_salt = ~((hsv[:, :, 2] >= 170) & (hsv[:, :, 1] <= 35))
        not_cloth = hsv[:, :, 2] >= 50
        fg = (ell.astype(bool) & not_salt & not_cloth).astype(np.uint8)
        fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        if fg.sum() < 0.25 * rect_area:
            fg = ell
    ys, xs = np.nonzero(fg)
    if len(xs) < 30:
        return None
    a, b, c, d = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    alpha = cv2.GaussianBlur(fg[b:d, a:c].astype(np.float32), (5, 5), 0)
    return roi[b:d, a:c], alpha


def transform_cutout(patch, alpha, scale):
    angle = random.uniform(0, 360)
    h, w = patch.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, scale)
    cos, sin = abs(M[0, 0]), abs(M[0, 1])
    nw, nh = int(h * sin + w * cos) + 2, int(h * cos + w * sin) + 2
    M[0, 2] += nw / 2 - w / 2
    M[1, 2] += nh / 2 - h / 2
    p = cv2.warpAffine(patch, M, (nw, nh), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    a = cv2.warpAffine(alpha, M, (nw, nh), flags=cv2.INTER_LINEAR, borderValue=0)
    if random.random() < 0.5:
        p, a = cv2.flip(p, 1), cv2.flip(a, 1)
    ys, xs = np.nonzero(a > 0.5)
    a0, b0, c0, d0 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    return p[b0:d0, a0:c0], a[b0:d0, a0:c0]


def paste(img, patch, alpha, taken):
    H, W = img.shape[:2]
    h, w = patch.shape[:2]
    if w >= W or h >= H:
        return None
    for _ in range(50):
        x, y = random.randint(0, W - w), random.randint(0, H - h)
        box = (x, y, x + w, y + h)
        if not any(overlaps(box, t, margin=10) for t in taken):
            a = alpha[..., None]
            roi = img[y:y + h, x:x + w].astype(np.float32)
            img[y:y + h, x:x + w] = (a * patch + (1 - a) * roi).astype(np.uint8)
            return box
    return None


# ---------------------------------------------------------------- output
def save(img, imp_boxes, out_dir, name, preview_dir):
    h, w = img.shape[:2]
    imp_boxes = [(int(round(x1)), int(round(y1)), int(round(x2)), int(round(y2))) for x1, y1, x2, y2 in imp_boxes]
    skip = [(x1, y1, x2 - x1, y2 - y1) for x1, y1, x2, y2 in imp_boxes]
    salt = salt_boxes(img, min_area=int(150 * (w / WORK_W) ** 2), max_area=int(0.004 * w * h), skip=skip)
    lines = [f"0 {(x + bw / 2) / w:.6f} {(y + bh / 2) / h:.6f} {bw / w:.6f} {bh / h:.6f}" for x, y, bw, bh in salt]
    lines += [f"1 {(x1 + x2) / 2 / w:.6f} {(y1 + y2) / 2 / h:.6f} {(x2 - x1) / w:.6f} {(y2 - y1) / h:.6f}"
              for x1, y1, x2, y2 in imp_boxes]
    cv2.imwrite(str(out_dir / "images" / f"{name}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 95])
    (out_dir / "labels" / f"{name}.txt").write_text("\n".join(lines) + "\n")
    cv2.imwrite(str(preview_dir / f"{name}.jpg"), render_preview(img, lines))
    return len(salt)


def render_preview(img, label_lines):
    """Draw YOLO label lines: thin green salt boxes, thick red impurity boxes
    with an 'impurity' tag, and a count banner."""
    h, w = img.shape[:2]
    prev = img.copy()
    imps = []
    n_salt = 0
    for line in label_lines:
        parts = line.split()
        if len(parts) != 5:
            continue
        c, cx, cy, bw, bh = int(parts[0]), *map(float, parts[1:])
        x1, y1 = int((cx - bw / 2) * w), int((cy - bh / 2) * h)
        x2, y2 = int((cx + bw / 2) * w), int((cy + bh / 2) * h)
        if c == 1:
            imps.append((x1, y1, x2, y2))
        else:
            n_salt += 1
            cv2.rectangle(prev, (x1, y1), (x2, y2), (0, 200, 0), 1)
    font = cv2.FONT_HERSHEY_SIMPLEX
    for x1, y1, x2, y2 in imps:  # drawn last so tags sit on top of salt boxes
        cv2.rectangle(prev, (x1, y1), (x2, y2), (0, 0, 230), 3)
        (tw, th), base = cv2.getTextSize("impurity", font, 0.55, 2)
        ty = y1 - 6 if y1 - th - 10 >= 0 else y2 + th + 6  # above the box, or below at the top edge
        tx = min(max(x1, 0), w - tw - 6)
        cv2.rectangle(prev, (tx, ty - th - 4), (tx + tw + 6, ty + base), (0, 0, 230), -1)
        cv2.putText(prev, "impurity", (tx + 3, ty - 2), font, 0.55, (255, 255, 255), 2, cv2.LINE_AA)
    banner = f"salt_crystal: {n_salt}   impurity: {len(imps)}"
    (bw_, bh_), _ = cv2.getTextSize(banner, font, 0.7, 2)
    cv2.rectangle(prev, (0, h - bh_ - 16), (bw_ + 16, h), (0, 0, 0), -1)
    cv2.putText(prev, banner, (8, h - 8), font, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
    return prev


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=Path, required=True, help="folder of ORIGINAL photos (read only)")
    ap.add_argument("--boxes", type=Path, required=True, help="impurities_manual.json")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--count", type=int, default=50, help="images per class")
    ap.add_argument("--real-frac", type=float, default=0.4, help="share of with-impurity images that are real crops")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    random.seed(args.seed)
    np.random.seed(args.seed)

    meta = json.loads(args.boxes.read_text())
    avoid_all = {k: [tuple(b) for b in v] for k, v in meta.get("_uncertain", {}).items() if not k.startswith("_")}
    no_paste = {k: [tuple(b) for b in v] for k, v in meta.get("_no_paste", {}).items() if not k.startswith("_")}

    photos = []
    for p in sorted(q for q in args.src.iterdir() if q.suffix.lower() in IMG_EXTS):
        img = read_any(p)
        img = cv2.resize(img, (WORK_W, round(img.shape[0] * WORK_W / img.shape[1])), interpolation=cv2.INTER_AREA)
        key = stem_key(p)
        if key in meta.get("_excluded", []):
            print(f"[*] skipping {p.name}: excluded during review")
            continue
        imps = [tuple(b) for b in meta.get(key, [])]
        photos.append({"key": key, "img": img, "imps": imps, "avoid": imps + avoid_all.get(key, [])})
    if not photos:
        raise SystemExit(f"no photos in {args.src}")

    cutouts = []
    for ph in photos:
        H, W = ph["img"].shape[:2]
        for box in ph["imps"]:
            x1, y1, x2, y2 = box
            if x1 <= 4 or y1 <= 4 or x2 >= W - 4 or y2 >= H - 4:
                continue  # cut off by the photo edge: would paste as a flat-sided blob
            if min(x2 - x1, y2 - y1) < 25 or box in no_paste.get(ph["key"], []):
                continue  # tiny speck (mask would grab salt) or hand-rejected poor mask
            c = cut_out(ph["img"], box)
            if c is not None:
                cutouts.append(c)
    print(f"[*] {len(photos)} photos, {len(cutouts)} impurity cut-outs")

    dirs = {}
    for cls in ("without_impurities", "with_impurities"):
        d = args.out / cls
        for sub in ("images", "labels", "preview"):
            # start clean: stale images from an earlier run (e.g. of a photo excluded since)
            # would otherwise leak into training
            if (d / sub).exists():
                shutil.rmtree(d / sub)
            (d / sub).mkdir(parents=True)
        (d / "classes.txt").write_text("\n".join(CLASSES) + "\n")
        dirs[cls] = d

    def clean_crop():
        """Random crop containing no impurity/uncertain box. Falls back to smaller crops when
        impurities are spread across the photo; None if the batch has no clean area at all."""
        for frac in ((0.5, 0.85), (0.35, 0.6), (0.25, 0.4)):
            for _ in range(1500):
                ph = random.choice(photos)
                H, W = ph["img"].shape[:2]
                crop = random_crop(W, H, frac)
                if not any(overlaps(b, crop, margin=12) for b in ph["avoid"]):
                    return ph, crop
        return None

    def to_out(img, crop, boxes):
        cx1, cy1, cx2, cy2 = crop
        s = OUT_W / (cx2 - cx1)
        out = cv2.resize(img[cy1:cy2, cx1:cx2], (OUT_W, OUT_H), interpolation=cv2.INTER_AREA)
        ob = [((x1 - cx1) * s, (y1 - cy1) * s, (x2 - cx1) * s, (y2 - cy1) * s) for x1, y1, x2, y2 in boxes]
        return out, ob

    def real_crop():
        """Crop holding whole real impurities, cutting none and touching no uncertain spot."""
        with_imps = [p for p in photos if p["imps"]]
        if not with_imps:
            return None
        for frac in ((0.45, 0.8), (0.3, 0.55), (0.2, 0.4)):
            for _ in range(1500):
                ph = random.choice(with_imps)
                H, W = ph["img"].shape[:2]
                crop = random_crop(W, H, frac)
                inside_b = [b for b in ph["imps"] if inside(b, crop)]
                cut = [b for b in ph["avoid"] if overlaps(b, crop) and not inside(b, crop)]
                unsure = [b for b in avoid_all.get(ph["key"], []) if overlaps(b, crop)]
                if inside_b and not cut and not unsure:
                    return ph, crop, inside_b
        return None

    # ---- pure salt
    stats = {"without_impurities": [0, 0, 0], "with_impurities": [0, 0, 0]}  # images, salt, impurity
    for i in range(args.count):
        found = clean_crop()
        if found is None:
            print(f"[!] no impurity-free area left in these photos: made {i} of {args.count} pure-salt images")
            break
        ph, crop = found
        out, _ = to_out(ph["img"], crop, [])
        out, _ = flip(out, [], OUT_W, OUT_H)
        name = f"pure_{i:03d}_{ph['key']}"
        stats["without_impurities"][1] += save(jitter(out), [], dirs["without_impurities"], name,
                                               dirs["without_impurities"] / "preview")
        stats["without_impurities"][0] += 1

    # ---- with impurities
    n_real = round(args.count * args.real_frac) if cutouts else args.count  # no cut-outs -> real crops only
    for i in range(args.count):
        made = None
        if i >= n_real:  # clean crop + pasted real pebbles
            found = clean_crop()
            if found is not None:
                ph, crop = found
                out, _ = to_out(ph["img"], crop, [])
                s = OUT_W / (crop[2] - crop[0])
                boxes = []
                for _ in range(random.randint(1, 5)):
                    patch, alpha = random.choice(cutouts)
                    patch, alpha = transform_cutout(patch, alpha, s * random.uniform(0.75, 1.3))
                    b = paste(out, patch, alpha, boxes)
                    if b:
                        boxes.append(b)
                if boxes:
                    made = (out, boxes, f"paste_{i:03d}_{ph['key']}")
        if made is None:  # real crop containing whole real pebbles (also the fallback)
            found = real_crop()
            if found is None:
                print(f"[!] could not make more images with impurities: made {i} of {args.count}")
                break
            ph, crop, inside_b = found
            out, boxes = to_out(ph["img"], crop, inside_b)
            made = (out, boxes, f"real_{i:03d}_{ph['key']}")
        out, boxes, name = made
        out, boxes = flip(out, boxes, OUT_W, OUT_H)
        stats["with_impurities"][1] += save(jitter(out), boxes, dirs["with_impurities"], name,
                                            dirs["with_impurities"] / "preview")
        stats["with_impurities"][0] += 1
        stats["with_impurities"][2] += len(boxes)

    for cls, (n, salt, imp) in stats.items():
        print(f"[*] {cls:<20} {n} images  salt_crystal={salt}  impurity={imp}  -> {dirs[cls]}")


if __name__ == "__main__":
    main()
