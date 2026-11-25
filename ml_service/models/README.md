# SALTURE Machine Learning Model Directory

Place your trained MobileNetV2 model files in this folder.

### Supported Model Formats:
1. **ONNX (Recommended for Production & Raspberry Pi):**
   - Filename: `mobilenetv2_saltfine.onnx`
   - Input shape: `[1, 3, 224, 224]`
   - Color format: RGB
   - Normalization:
     - Mean: `[0.485, 0.456, 0.406]`
     - Std: `[0.229, 0.224, 0.225]`

2. **PyTorch Weights:**
   - Filename: `mobilenetv2_saltfine.pt` or `mobilenetv2_saltfine.pth`

### Class Mapping (Section 2.2 of Manuscript):
| Class Index | Fineness Grade | Size Range |
| :---: | :---: | :---: |
| `0` | **Fine** | 0.20 – 0.99 mm |
| `1` | **Medium** | 1.00 – 1.99 mm |
| `2` | **Coarse** | 2.00 – 4.00 mm |

### Automatic Detection:
When `predict.py` executes:
- It loads `saltfine_yolov8.pt` from this directory and runs YOLOv8 detection on the photo.
- If the weights are missing or the model cannot be loaded, it prints `{"error": ...}` and exits non-zero. There is
  no fallback: the backend reports the error and saves no record, so no made-up result is ever recorded.
