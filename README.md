# SALTFINE

Automated Sea Salt Impurity & Purity Classification System

---

## System Overview

SALTFINE is an industrial quality evaluation and sorting platform for sea salt. The system captures optical imagery of sea salt crystals, detects insoluble foreign matter (such as sand, clay, and dark particulate specks) using computer vision and machine learning, calculates physical purity percentage, and automatically routes batches into designated sorting bins.

---

## Impurity Grading Tiers

| Insoluble Impurities | Quality Grade Tier | Standard Compliance & Visual Criteria | Automated Sorter Routing |
| :--- | :--- | :--- | :--- |
| **≤ 0.20%** | **Preprocessed Food Goods** | Food-Grade (Codex CXS 150 & RA 8172 compliant, max 0.20% insoluble matter) | **Food Bin** (Ejector 1) |
| **> 0.20%** | **Industrial Goods** | Industrial-Grade (Chemical / non-food manufacturing applications) | **Industrial Bin** (Ejector 2) |

---

## Project Structure

```
Saltfine/
├── frontend/                     # React 19 + TypeScript + Vite + Tailwind CSS (Port 5173)
│   ├── src/                      # UI Components, Live Result, Lab CV Inspector, Records, Reports
│   ├── package.json
│   └── tsconfig.json
│
├── backend/                      # Express.js 5 + TypeScript + Node.js (Port 5000)
│   ├── src/                      # REST API, PostgreSQL Pool (pg) + Auto-Fallback In-Memory Store
│   ├── uploads/                  # Temporary staging for uploaded/captured crystal images
│   ├── package.json
│   └── tsconfig.json
│
├── ml_service/                   # Python Machine Learning Subsystem
│   ├── models/                   # Location for 'salt_impurity_rf.joblib' weights
│   ├── predict.py                # Python inference script (OpenCV segmentation + ML classification)
│   ├── train_impurity_detector.py# Random Forest classifier training script
│   └── requirements.txt          # Python dependencies
│
└── dataset/                      # Sea Salt Training & Validation Dataset
    ├── README.md
    ├── train/                    # Pure Salt vs. Impurities
    └── val/                      # Validation split
```

---

## Quickstart

### 1. Setup ML Service
```bash
cd ml_service
py -m pip install -r requirements.txt
cd ..
```

### 2. Start Backend API
```bash
cd backend
npm install
npm run dev
```
*API runs on **http://localhost:5000** (auto-connects to PostgreSQL on port 5432 or uses in-memory store).*

### 3. Start Frontend Dashboard
```bash
cd frontend
npm install
npm run dev
```
*Dashboard runs on **http://localhost:5173**.*
