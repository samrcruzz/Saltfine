#!/usr/bin/env python3
"""
SALTURE inference: grades one photo of a sea-salt batch with the trained YOLOv8 detector.

  - Preprocessed Food Goods (<= 0.20% insoluble impurities)
  - Industrial Goods        (>  0.20% insoluble impurities)

Prints ONE JSON object on stdout (the backend parses it). Every number in it is
measured on the given photo. There is no fallback: when the weights or the
Python dependencies are missing, or the model finds nothing to grade, it prints
{"error": "..."} and exits non-zero, so no made-up result can reach a record.

Usage: python predict.py <path_to_image>
"""

import contextlib
import json
import os
import sys
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
YOLO_WEIGHTS = BASE_DIR / "models" / "saltfine_yolov8.pt"
FOOD_GRADE_MAX_IMPURITY_PCT = 0.20

EXIT_USAGE = 1          # no image path, or the file does not exist
EXIT_MODEL_UNAVAILABLE = 2  # weights or dependencies missing / cannot load
EXIT_ANALYSIS_FAILED = 3    # unreadable image, or nothing detected to grade


class AnalysisError(Exception):
    def __init__(self, message: str, exit_code: int):
        super().__init__(message)
        self.exit_code = exit_code


def fail(message: str, exit_code: int) -> None:
    print(json.dumps({"error": message}))
    sys.exit(exit_code)


def analyze_with_yolo(image_path: str) -> dict:
    """YOLOv8 detection + red/green highlight. Raises AnalysisError when it cannot grade the photo."""
    if not YOLO_WEIGHTS.exists():
        raise AnalysisError(
            f"YOLOv8 weights not found: {YOLO_WEIGHTS}. Train or copy the model first (see ml_service/models/README.md).",
            EXIT_MODEL_UNAVAILABLE,
        )

    # Keep stdout clean: the backend parses it as a single JSON object.
    with contextlib.redirect_stdout(sys.stderr):
        try:
            from highlight import highlight_file, load_model

            model = load_model(YOLO_WEIGHTS)
        except Exception as exc:  # missing deps, blocked DLLs, bad weights...
            raise AnalysisError(f"YOLOv8 could not be loaded: {exc}", EXIT_MODEL_UNAVAILABLE) from exc

        src = Path(image_path)
        dst = src.with_name(f"{src.stem}_highlighted{src.suffix or '.jpg'}")
        try:
            r = highlight_file(src, dst, model)
        except Exception as exc:  # unreadable image, inference error...
            raise AnalysisError(f"YOLOv8 could not analyze the image: {exc}", EXIT_ANALYSIS_FAILED) from exc

    if r.total == 0:
        # 0 / 0 impurity area: there is nothing to grade, so do not report 0% (= Food Goods).
        raise AnalysisError(
            "YOLOv8 detected no salt crystals or impurities in this image, so it cannot be graded.",
            EXIT_ANALYSIS_FAILED,
        )

    impurity_pct = round(r.impurity_area_pct, 2)
    grade = "Preprocessed Food Goods" if impurity_pct <= FOOD_GRADE_MAX_IMPURITY_PCT else "Industrial Goods"
    return {
        "predicted_grade": grade,
        "quality_tier": grade,
        "purity_pct": round(100.0 - impurity_pct, 2),
        "impurity_pct": impurity_pct,
        # share of detected particle box area that is impurity (see HighlightResult.impurity_area_pct)
        "contamination_area_pct": impurity_pct,
        "impurity_count": r.impurity_count,
        "salt_crystal_count": r.salt_count,
        "particle_count": r.total,
        "confidence": round(r.mean_confidence, 4),
        "inference_ms": round(r.inference_ms, 1),
        "annotated_image": dst.name,
    }


def main():
    if len(sys.argv) < 2:
        fail("No image path provided. Usage: python predict.py <path_to_image>", EXIT_USAGE)

    image_path = sys.argv[1]
    if not os.path.exists(image_path):
        fail(f"Image file not found: {image_path}", EXIT_USAGE)

    start_time = time.perf_counter()
    try:
        result = analyze_with_yolo(image_path)
    except AnalysisError as exc:
        print(f"[predict] {exc}", file=sys.stderr)
        fail(str(exc), exc.exit_code)
    # imports + model load + prediction + drawing/saving the highlighted copy, as measured here
    analysis_ms = round((time.perf_counter() - start_time) * 1000, 1)

    print(json.dumps({
        "model_name": "SALTURE YOLOv8 Impurity Detector",
        "model_source": "yolov8",
        **result,
        "analysis_ms": analysis_ms,
    }))


if __name__ == "__main__":
    main()
