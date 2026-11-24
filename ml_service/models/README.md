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
- If a model file exists in this directory, it loads the model and runs deep learning inference.
- If no model is placed here yet, it automatically falls back to the deterministic Computer Vision heuristic pipeline so the dashboard remains fully operational without throwing errors.
