"""
SALTFINE - YOLOv8 Salt Crystal & Insoluble Impurity Detector Trainer

Fine-tunes a pretrained YOLOv8 model to detect two classes:
  0: salt_crystal
  1: impurity  (black specks, sand, clay, shell grit)

Outputs:
  models/saltfine_yolov8.pt    best PyTorch weights
  models/saltfine_yolov8.onnx  ONNX export for onnxruntime / Raspberry Pi (unless --no-onnx)

Usage:
  python train_yolo.py                                   # defaults: yolov8n, 100 epochs, auto device
  python train_yolo.py --model yolov8s.pt --epochs 150 --batch 16 --device 0
  python train_yolo.py --epochs 3 --device cpu           # quick smoke test
"""

import argparse
import shutil
from pathlib import Path

import yaml
from ultralytics import YOLO

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"
DEFAULT_DATA = BASE_DIR / "yolo" / "saltfine.yaml"
RUNS_DIR = BASE_DIR / "runs"


def parse_args():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=DEFAULT_DATA, help="Ultralytics dataset YAML")
    ap.add_argument("--model", default="yolov8n.pt", help="yolov8n/s/m/l/x.pt (pretrained) or a .yaml to train from scratch")
    ap.add_argument("--epochs", type=int, default=100)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--batch", type=int, default=16, help="-1 = auto batch size (GPU only)")
    ap.add_argument("--device", default=None, help="'cpu', '0' (first GPU), or omit for auto")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--patience", type=int, default=30, help="early-stop after N epochs without improvement")
    ap.add_argument("--name", default="saltfine_yolov8")
    ap.add_argument("--max-det", type=int, default=1000, help="max detections per image (salt photos have 300-800 crystals)")
    ap.add_argument("--no-onnx", action="store_true", help="skip ONNX export")
    ap.add_argument("--no-install", action="store_true",
                    help="leave the result in runs/<name> only (then: pipeline.py compare/promote --run runs/<name>)")
    return ap.parse_args()


def resolve_data_yaml(data_yaml: Path) -> Path:
    """Ultralytics resolves a relative `path:` against its global datasets dir;
    resolve it against the YAML's own folder instead so the repo layout just works."""
    data_yaml = data_yaml.resolve()
    cfg = yaml.safe_load(data_yaml.read_text())
    root = Path(cfg.get("path") or ".")
    if root.is_absolute():
        return data_yaml
    cfg["path"] = str((data_yaml.parent / root).resolve())
    resolved = RUNS_DIR / f"{data_yaml.stem}.resolved.yaml"
    resolved.parent.mkdir(parents=True, exist_ok=True)
    resolved.write_text(yaml.safe_dump(cfg, sort_keys=False))
    return resolved


def main():
    args = parse_args()
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    args.data = resolve_data_yaml(args.data)

    model = YOLO(args.model)
    model.train(
        data=str(args.data),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        workers=args.workers,
        patience=args.patience,
        project=str(RUNS_DIR),
        name=args.name,
        exist_ok=True,
        max_det=args.max_det,
        # Salt trays are viewed top-down: orientation is arbitrary, so flips are safe.
        flipud=0.5,
        fliplr=0.5,
        # Keep colour shifts mild: impurity colour (dark/brown) is a key signal.
        hsv_h=0.005,
        hsv_s=0.3,
        hsv_v=0.3,
    )

    best = Path(model.trainer.best)
    metrics = YOLO(str(best)).val(data=str(args.data), imgsz=args.imgsz, device=args.device, plots=False,
                                  max_det=args.max_det)
    print(f"[*] Validation  mAP50={metrics.box.map50:.4f}  mAP50-95={metrics.box.map:.4f}")
    for i, name in metrics.names.items():
        if i < len(metrics.box.ap50):
            print(f"    {name:<14} AP50={metrics.box.ap50[i]:.4f}")

    if args.no_install:
        print(f"[*] Candidate left in {best.parent.parent}. Compare: python pipeline.py compare --run {best.parent.parent}")
        return

    pt_out = MODELS_DIR / "saltfine_yolov8.pt"
    if pt_out.exists():  # never lose the live model: archive it in models/versions/ first
        from pipeline import archive_live

        e = archive_live("replaced by train_yolo.py (from-scratch training)")
        print(f"[*] Previous live model archived as {e['version']}: {e['file']}")
    shutil.copy2(best, pt_out)
    print(f"[*] Saved weights: {pt_out}")

    if not args.no_onnx:
        onnx_path = Path(YOLO(str(best)).export(format="onnx", imgsz=args.imgsz, simplify=False))
        onnx_out = MODELS_DIR / "saltfine_yolov8.onnx"
        shutil.copy2(onnx_path, onnx_out)
        print(f"[*] Saved ONNX:    {onnx_out}")


if __name__ == "__main__":
    main()
