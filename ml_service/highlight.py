"""
SALTURE - YOLOv8 impurity highlighter

Runs the trained YOLOv8 detector on salt photos and draws the result with OpenCV:
  - salt crystals  -> GREEN
  - impurities     -> RED

Counts and areas come straight from the Ultralytics result (box coordinates in
original-image pixels). Supervision is not used: it imports SciPy, whose
_flapack DLL is blocked by Windows Smart App Control on the Python 3.15 build,
which stopped the model from running at all.

Colours are picked by class NAME, not class id, because Roboflow exports sort
class names alphabetically (impurity=0, salt_crystal=1) while the repo's own
yolo/saltfine.yaml uses salt_crystal=0, impurity=1. Both work.

Usage:
  python highlight.py photo.jpg                       # writes photo_highlighted.jpg next to it
  python highlight.py photos/ --out highlighted/      # whole folder
  python highlight.py photo.jpg --conf 0.35 --labels  # show class + confidence text
"""

import argparse
import sys
import time
import warnings
from dataclasses import dataclass
from pathlib import Path

warnings.filterwarnings("ignore", category=FutureWarning)

import cv2  # noqa: E402
import numpy as np  # noqa: E402

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_WEIGHTS = BASE_DIR / "models" / "saltfine_yolov8.pt"
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}

# OpenCV colours are BGR
GREEN = (0, 200, 0)
RED = (0, 0, 230)
PALETTE = (GREEN, RED)  # index 0 = salt, 1 = impurity
FILL_OPACITY = 0.35


def is_impurity(class_name: str) -> bool:
    name = class_name.lower()
    return "impur" in name or name in {"dirt", "sand", "clay", "grit", "debris", "foreign"}


@dataclass
class HighlightResult:
    salt_count: int
    impurity_count: int
    salt_area_px: float
    impurity_area_px: float
    mean_confidence: float
    annotated: np.ndarray
    #: measured wall-clock time of the YOLOv8 predict() call on this image (ms)
    inference_ms: float = 0.0

    @property
    def total(self) -> int:
        return self.salt_count + self.impurity_count

    @property
    def impurity_area_pct(self) -> float:
        """Share of detected particle area that is impurity (box-area estimate)."""
        total = self.salt_area_px + self.impurity_area_px
        return 0.0 if total <= 0 else 100.0 * self.impurity_area_px / total


_model_cache = {}


def load_model(weights: Path = DEFAULT_WEIGHTS):
    from ultralytics import YOLO

    key = str(Path(weights).resolve())
    if key not in _model_cache:
        _model_cache[key] = YOLO(key)
    return _model_cache[key]


def highlight(image: np.ndarray, model, conf: float = 0.25, imgsz: int = 1280, labels: bool = False) -> HighlightResult:
    started = time.perf_counter()
    result = model.predict(image, conf=conf, imgsz=imgsz, max_det=3000, verbose=False)[0]  # dense trays: >1000 crystals
    inference_ms = (time.perf_counter() - started) * 1000
    names = result.names
    boxes = result.boxes
    xyxy = boxes.xyxy.cpu().numpy().reshape(-1, 4)  # original-image pixels
    class_ids = boxes.cls.cpu().numpy().astype(int)
    confidences = boxes.conf.cpu().numpy()

    impurity_mask = np.array([is_impurity(names[int(c)]) for c in class_ids], dtype=bool)
    areas = (xyxy[:, 2] - xyxy[:, 0]) * (xyxy[:, 3] - xyxy[:, 1])  # box area per detection

    scene = image.copy()
    if len(xyxy):
        thickness = max(1, round(min(image.shape[:2]) / 400))
        corners = [((int(x1), int(y1)), (int(x2), int(y2))) for x1, y1, x2, y2 in xyxy]
        # translucent fill, then a solid outline, in the class colour
        overlay = scene.copy()
        for (p1, p2), imp in zip(corners, impurity_mask):
            cv2.rectangle(overlay, p1, p2, PALETTE[int(imp)], -1)
        cv2.addWeighted(overlay, FILL_OPACITY, scene, 1 - FILL_OPACITY, 0, dst=scene)
        for (p1, p2), imp in zip(corners, impurity_mask):
            cv2.rectangle(scene, p1, p2, PALETTE[int(imp)], thickness)
        # Impurities are tiny specks: ring each one so it stands out at a glance.
        for x1, y1, x2, y2 in xyxy[impurity_mask]:
            center = (int((x1 + x2) / 2), int((y1 + y2) / 2))
            radius = int(max(x2 - x1, y2 - y1) * 0.75) + 6 * thickness
            cv2.circle(scene, center, radius, RED, thickness + 1, cv2.LINE_AA)
        if labels:
            for (p1, _), c, p, imp in zip(corners, class_ids, confidences, impurity_mask):
                text = f"{names[int(c)]} {p:.2f}"
                (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)
                top = max(0, p1[1] - th - 6)
                cv2.rectangle(scene, (p1[0], top), (p1[0] + tw + 6, top + th + 6), PALETTE[int(imp)], -1)
                cv2.putText(scene, text, (p1[0] + 3, top + th + 3), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1, cv2.LINE_AA)

    res = HighlightResult(
        salt_count=int((~impurity_mask).sum()),
        impurity_count=int(impurity_mask.sum()),
        salt_area_px=float(areas[~impurity_mask].sum()),
        impurity_area_px=float(areas[impurity_mask].sum()),
        mean_confidence=float(confidences.mean()) if len(confidences) else 0.0,
        annotated=scene,
        inference_ms=inference_ms,
    )
    _draw_legend(res)
    return res


def _draw_legend(res: HighlightResult) -> None:
    img = res.annotated
    scale = max(0.5, min(img.shape[:2]) / 1000)
    pad, sw = int(10 * scale), int(18 * scale)
    lines = [
        (f"Salt: {res.salt_count}", GREEN),
        (f"Impurities: {res.impurity_count}  ({res.impurity_area_pct:.2f}% area)", RED),
    ]
    font, th = cv2.FONT_HERSHEY_SIMPLEX, max(1, int(2 * scale))
    widths = [cv2.getTextSize(t, font, scale, th)[0][0] for t, _ in lines]
    line_h = int(28 * scale)
    w, h = pad * 3 + sw + max(widths), pad * 2 + line_h * len(lines)
    overlay = img.copy()
    cv2.rectangle(overlay, (0, 0), (w, h), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.55, img, 0.45, 0, dst=img)
    for i, (text, color) in enumerate(lines):
        y = pad + i * line_h
        cv2.rectangle(img, (pad, y + 2), (pad + sw, y + 2 + sw), color, -1)
        cv2.putText(img, text, (pad * 2 + sw, y + sw), font, scale, (255, 255, 255), th, cv2.LINE_AA)


def highlight_file(src: Path, dst: Path, model, **kw) -> HighlightResult:
    image = cv2.imread(str(src))
    if image is None:
        raise ValueError(f"Cannot read image: {src}")
    res = highlight(image, model, **kw)
    dst.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(dst), res.annotated)
    return res


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", type=Path, help="image file or folder of images")
    ap.add_argument("--out", type=Path, default=None, help="output file/folder (default: <name>_highlighted.<ext>)")
    ap.add_argument("--weights", type=Path, default=DEFAULT_WEIGHTS)
    ap.add_argument("--conf", type=float, default=0.25)
    ap.add_argument("--imgsz", type=int, default=1280, help="inference size; 1280 finds small pebbles that 640 misses")
    ap.add_argument("--labels", action="store_true", help="draw class name + confidence on each box")
    args = ap.parse_args()

    if not args.weights.exists():
        sys.exit(f"Weights not found: {args.weights}\nTrain first: python train_yolo.py")
    model = load_model(args.weights)

    if args.source.is_dir():
        files = sorted(p for p in args.source.iterdir() if p.suffix.lower() in IMAGE_EXTS)
        out_dir = args.out or args.source / "highlighted"
        targets = [(f, out_dir / f"{f.stem}_highlighted{f.suffix}") for f in files]
    else:
        src = args.source
        targets = [(src, args.out or src.with_name(f"{src.stem}_highlighted{src.suffix}"))]

    for src, dst in targets:
        r = highlight_file(src, dst, model, conf=args.conf, imgsz=args.imgsz, labels=args.labels)
        print(f"{src.name}: salt={r.salt_count} impurities={r.impurity_count} "
              f"impurity_area={r.impurity_area_pct:.2f}% -> {dst}")


if __name__ == "__main__":
    main()
