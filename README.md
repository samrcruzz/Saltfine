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
│   ├── predict.py                # YOLOv8 inference for one photo (no fallback: errors out if the model cannot run)
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

### Run the website with one command
From the **main folder** (`Saltfine`, not `backend` or `frontend`):
```bash
npm run setup   # once: installs the backend and frontend packages
npm run dev     # starts the backend (port 5000) and frontend (port 5173) together
```
Then open **http://localhost:5173**. Press `Ctrl+C` once to stop both. If the website is already running,
`npm run dev` says so instead of failing. You still need `backend/.env` and the ML service set up (steps below).

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
The dashboard talks to `VITE_API_BASE_URL` (default `http://localhost:5000`). Demo mode (`VITE_DEMO_MODE=true` in
`frontend/.env`) runs without a backend on simulated data instead, so there is no sign-in either; it is off by
default and everything it shows is labelled DEMO. The backend's `SEED_DEMO_DATA=true` likewise pre-fills the
in-memory store with simulated records marked DEMO (off by default).

#### Measured values only
Every grade, impurity percentage, count and timing in a record comes from `ml_service/predict.py` running the
YOLOv8 model on the photo; the batch mass is what the operator enters (default 100 g). If the model cannot run
(missing weights or Python packages) or finds nothing to grade, the upload or cycle fails with an error and no
record is saved. Run `ml_service/.venv/Scripts/python ml_service/predict.py <photo>` to check the model directly.

### 3. Start Frontend Dashboard
```bash
cd frontend
npm install
npm run dev
```
*Dashboard runs on **http://localhost:5173**.*
