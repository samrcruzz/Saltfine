# SALTURE

Automated Sea Salt Impurity & Purity Classification System

---

## System Overview

SALTURE is an industrial quality evaluation and sorting platform for sea salt. The system captures optical imagery of sea salt crystals, detects insoluble foreign matter (such as sand, clay, and dark particulate specks) using computer vision and machine learning, calculates physical purity percentage, and automatically routes batches into designated sorting bins.

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

#### Sign-in accounts
The dashboard asks for a sign-in. There are two roles:

| Role | Can do |
|------|--------|
| `viewer` | See Live Result, Salt Records and Reports (and export reports) |
| `dev` | Everything a viewer can, plus Lab & Image Analysis, uploading photos and triggering sorting cycles |

Accounts are stored in `backend/data/users.json` (git-ignored, passwords hashed). On a fresh clone that file is
created on first start from `backend/seed/users.json`, so these accounts already exist:

| Username | Role |
|----------|------|
| `sam` | `dev` |
| `ana` | `viewer` |

Ask the project owner for their passwords, and change them with `npm run users -- passwd <name>` after setup.
Changes made with the CLI only touch `data/users.json`; to change the pre-existing accounts for everyone, copy it
over `backend/seed/users.json` and commit.

Manage accounts from `backend/`:
```bash
npm run users -- add sam --role dev        # asks for the password (min. 8 characters)
npm run users -- add ana --role viewer
npm run users -- list
npm run users -- passwd ana                # also signs ana out everywhere
npm run users -- role ana dev
npm run users -- remove ana
```
Set `AUTH_SECRET` in `backend/.env` (see `.env.example`) so people stay signed in across server restarts.
Open the dashboard at `http://localhost:5173` (not `127.0.0.1`), the same host name as the API, so the sign-in cookie is sent.
Without `VITE_API_BASE_URL` (mock mode) there is no backend, so there is no sign-in either.

### 3. Start Frontend Dashboard
```bash
cd frontend
npm install
npm run dev
```
*Dashboard runs on **http://localhost:5173**.*
