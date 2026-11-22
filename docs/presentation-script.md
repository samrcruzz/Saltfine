# SALTFINE — Presentation Script

**Topic:** How SALTFINE works from the front end to the back end, the AI model, how we built it, and how we optimized it.
**Length:** about 12–15 minutes (times per part are a guide).
**How to read this:** **SAY** = what you speak. **SHOW** = what is on the screen or slide.

---

## Part 1 — Opening (1 min)

**SHOW:** Title slide: *SALTFINE — Automated Sea Salt Impurity & Purity Classification System*

**SAY:**
> Good day. Our project is SALTFINE, a system that checks the quality of sea salt from a photo.
>
> Today, salt quality is checked by eye or in a lab, which is slow. Our system takes a photo of a salt sample, uses AI to find the dirt (sand, clay and dark specks), works out the percentage of impurities, and decides the grade of the salt.
>
> We use two grades, based on Codex CXS 150 and RA 8172:
> - **0.20% impurities or less: Preprocessed Food Goods.** Safe for food, sent to the Food Bin.
> - **More than 0.20%: Industrial Goods.** Used for chemicals, water treatment and de-icing, sent to the Industrial Bin.

---

## Part 2 — The big picture: three parts (1.5 min)

**SHOW:** Architecture diagram:

```
 ┌───────────────────┐   HTTP + cookie    ┌────────────────────┐  runs   ┌──────────────────────┐
 │  FRONT END        │ ─────────────────▶ │  BACK END          │ ──────▶ │  AI / ML SERVICE     │
 │  React + TS +     │ ◀───────────────── │  Node.js +         │ ◀────── │  Python + YOLOv8     │
 │  Vite + Tailwind  │   JSON results     │  Express (TS)      │  JSON   │  (Ultralytics)       │
 │  port 5173        │                    │  port 5000         │         │  predict.py          │
 └───────────────────┘                    └─────────┬──────────┘         └──────────────────────┘
                                                    │
                                          ┌─────────▼──────────┐
                                          │  PostgreSQL        │
                                          │  (or in-memory     │
                                          │   store as backup) │
                                          └────────────────────┘
```

**SAY:**
> The system has three main parts.
>
> 1. The **front end** is the dashboard the operator sees. We built it with React, TypeScript, Vite and Tailwind CSS.
> 2. The **back end** is the server. It uses Node.js and Express with TypeScript. It receives photos, manages sign-in, and saves the results to a PostgreSQL database.
> 3. The **AI service** is written in Python. It runs our trained YOLOv8 model, which finds every salt crystal and every impurity in the photo.
>
> The front end never talks to the AI directly. It always goes through the back end, which keeps the system secure and organized.

---

## Part 3 — The front end: what the user sees (2 min)

**SHOW:** Live demo, or screenshots of each page.

**SAY:**
> First, the user signs in. We have two roles:
> - A **viewer** can see the results, the records and the reports.
> - A **dev** (developer or lab staff) can also upload photos, run the analysis and trigger sorting.
>
> The dashboard has four pages:
>
> 1. **Live Classification Result.** This shows the newest sample: the photo, the predicted grade, the purity percentage, how many salt crystals and impurities were found, and which bin the salt was sent to. It refreshes every 2 seconds, so new results appear by themselves.
> 2. **Lab & Image Analysis.** Lab staff drag and drop one photo or many photos at once. The photos go into a queue and are analyzed one after another. A button switches between the **original photo** and the **AI-highlighted photo**.
> 3. **Salt-Record Log.** Every analyzed sample is saved here. Users can search, filter by grade or date, and open each record for details.
> 4. **Reports.** Summary cards, a bar chart of grades, and a summary table. Reports can be exported.

**SHOW:** The highlighted image. Salt has **green** boxes, impurities have **red** boxes and a red circle.

**SAY:**
> This is what the AI sees. Every green box is a salt crystal and every red box is an impurity. The red circles help the operator spot the small specks quickly.

---

## Part 4 — From front end to back end: step by step (3 min)

**SHOW:** Flow slide with numbered steps.

```
 [1] User drops photo ─▶ [2] POST /api/analyze/upload ─▶ [3] Check sign-in + role
                                                              │
 [8] Dashboard shows  ◀─ [7] JSON response  ◀─ [6] Save  ◀─ [5] Grade  ◀─ [4] Python YOLOv8
     grade + image                              record        ≤0.20% / >0.20%
```

**SAY:**
> Let me walk you through what happens when a user uploads one photo.
>
> **Step 1. The user drops a photo** on the Lab page. The front end adds it to the queue.
>
> **Step 2. The front end sends the photo** to the back end at `POST /api/analyze/upload`. The browser also sends the sign-in cookie.
>
> **Step 3. The back end checks the user.** The sign-in cookie is checked first. Only a **dev** account can analyze photos. A viewer gets "403 Forbidden".
>
> **Step 4. The back end saves the photo and calls the AI.** We use a library called Multer to save the photo in an `uploads` folder (up to 15 MB). Then the back end runs our Python script, `predict.py`, with the photo's path.
>
> **Step 5. The AI analyzes the photo.** YOLOv8 finds each salt crystal and each impurity. Then we compute:
>
> &nbsp;&nbsp;&nbsp;&nbsp;**impurity % = impurity area ÷ total particle area × 100**
>
> If the result is **0.20% or less**, the grade is **Preprocessed Food Goods**. If it is higher, the grade is **Industrial Goods**. The script also saves a copy of the photo with the red and green boxes drawn on it.
>
> **Step 6. Python sends the result back** to the back end as JSON: the grade, purity, impurity count, salt count, confidence and inference time.
>
> **Step 7. The back end saves a record** in PostgreSQL, then sends the result to the front end.
>
> **Step 8. The front end shows the result**: the grade badge, the numbers and the highlighted photo.

**SAY (the camera / sorting cycle):**
> For the actual sorting machine, the flow is the same, but the photo comes from the camera. The camera saves photos into a folder called the **camera inbox**. When a sorting cycle is triggered (`POST /api/cycle/trigger`), the back end takes the **oldest** photo, analyzes it with YOLOv8, saves the record, and returns which bin the salt should go to: Ejector 1 for Food, Ejector 2 for Industrial.

**SHOW (optional):** API table

| Endpoint | What it does | Who can use it |
|---|---|---|
| `POST /api/auth/login`, `/logout`, `GET /me` | Sign in, sign out, who am I | Everyone |
| `GET /api/records/latest` | Newest result (Live page, every 2 s) | Viewer, Dev |
| `GET /api/records` | Record log with filters | Viewer, Dev |
| `POST /api/analyze/upload` | Analyze one photo | Dev |
| `POST /api/analyze/bulk` | Analyze up to 100 photos | Dev |
| `GET /api/cycle/inbox` | How many camera photos are waiting | Viewer, Dev |
| `POST /api/cycle/trigger` | Run one sorting cycle | Dev |

---

## Part 5 — The AI model we used (2.5 min)

**SHOW:** Slide: *YOLOv8n — "You Only Look Once", version 8, nano size*

**SAY:**
> For the AI, we used **YOLOv8** from Ultralytics. YOLO stands for "You Only Look Once". It is an **object detection** model: it looks at the whole image once and draws a box around every object it finds.
>
> We chose the **nano** version, **YOLOv8n**, because it is small and fast:
> - about **3.1 million parameters**,
> - a model file of only **6 MB**,
> - about **7.5 milliseconds** to analyze one image on a normal CPU, with no graphics card needed.
>
> That speed matters, because our goal is to run it on a small computer such as a Raspberry Pi next to the sorting machine. That is why we also export the model to **ONNX** format.
>
> Our model detects **two classes**:
> - `salt_crystal`
> - `impurity`: black specks, sand, clay and shell grit.

**SHOW:** Slide: *How we trained it*

**SAY:**
> We did not train from zero. We used **transfer learning**: we started from a YOLOv8n model that was already trained on general images, and taught it our two classes.
>
> Our training happened in two stages:
> 1. First, we generated **synthetic** salt images to test the whole pipeline.
> 2. Then we trained on our **real salt photos**. We labeled them, and we used **augmentation** to make more training images from each photo. The final real dataset has **98 training images and 7 validation images**. One of those validation images held about **2,880 objects**.
>
> We used **Roboflow** for labeling and the **Supervision** library to draw the red and green highlights.

**SHOW:** Results table

| Metric (validation set) | All classes | Salt crystal | Impurity |
|---|---|---|---|
| Precision | 0.717 | 0.645 | **0.790** |
| Recall | 0.645 | 0.432 | **0.857** |
| mAP@50 | 0.670 | 0.485 | **0.855** |
| mAP@50–95 | 0.366 | 0.203 | 0.529 |

**SAY:**
> These are our validation results. The most important class is **impurity**, because impurities decide the grade. For impurities, we reached **85.5% mAP@50** and **85.7% recall**, so the model finds most of the dirt.
>
> The salt class scores lower. Salt crystals are packed tightly together and touch each other, so the boxes are harder to separate. This affects the count of crystals more than it affects the grade.
>
> **Honest limitation:** our validation set is small, with only **7 impurity samples**, so these numbers will change as we add more photos. That is why we built a pipeline to keep improving the model, which I'll explain next.

---

## Part 6 — Optimizations (3 min)

**SHOW:** Slide: *What we optimized*, grouped into AI, Training, Back end and Front end.

### 6.1 AI accuracy

**SAY:**
> **1. A bigger image size for inference.** We train at 640 pixels, but we analyze photos at **1280 pixels**. At 640 pixels, the model missed small pebbles and specks. At 1280, it finds them.
>
> **2. More detections per photo.** By default, YOLO keeps at most 300 objects per image. One tray of salt can have more than a thousand crystals, so we raised the limit to **3,000**.
>
> **3. Augmentation that matches the real setup.** The camera looks straight down at the salt, so a flipped photo is still a real photo. We use **horizontal and vertical flips**. We keep **color changes mild**, because the dark or brown color of dirt is one of the main ways the model recognizes it.

### 6.2 Training: fine-tuning instead of retraining

**SAY:**
> **4. Fine-tuning instead of retraining.** When we get a new batch of photos, we don't train from zero. We **fine-tune the current model** for about 25 epochs, which takes about 8 minutes on a CPU. We use the AdamW optimizer with a small learning rate of 0.0003.
>
> We found an important detail here: when the optimizer is set to "auto", Ultralytics **ignores** our learning rate. So we set AdamW explicitly.
>
> **5. Auto-labeling.** The current model labels the new photos first: it proposes the impurity boxes, and OpenCV labels the salt. A person then only corrects the mistakes on a review page in the browser, instead of drawing thousands of boxes by hand.
>
> **6. A new model goes live only if it is better.** We keep a fixed set of **holdout** validation photos. After fine-tuning, the system compares the new model with the current one on the same photos at 1280 pixels:
> - If impurity accuracy or recall drops, we **keep the old model**.
> - If impurity accuracy improves, we **promote the new model**.
>
> Every old model is saved as a version (v1, v2 and so on), so we can **roll back** at any time.
>
> **7. No forgetting.** Each fine-tune uses **all** batches, old and new, so the model doesn't forget what it learned before.
>
> **8. Early stopping.** Training stops by itself when the model stops improving, which saves time.

### 6.3 Back end reliability

**SAY:**
> **9. The system never stops working.** The back end first uses the Python environment that has YOLOv8 installed. If that fails, it tries the system Python. If Python is not available at all, it uses a **backup estimate** so the dashboard still runs. The response includes a flag, `is_model_result`, which says whether the numbers came from YOLOv8 or from the backup.
>
> **10. A database with a backup.** If PostgreSQL is not running, the back end switches to an **in-memory store** after 1.5 seconds, so a demo never fails because of the database.
>
> **11. Clean communication with Python.** The AI library prints log messages. We send those logs to a separate output, so the back end only receives one clean JSON result.
>
> **12. Security.** Passwords are stored as **scrypt hashes**, never as plain text. The sign-in cookie is **HttpOnly**, so JavaScript cannot steal it. Every endpoint checks the user's role.

### 6.4 Front end speed and usability

**SAY:**
> **13. A batch queue for the lab.** Users can drag and drop many photos at once. The page analyzes **3 photos at the same time**, and you can retry the ones that failed.
>
> **14. The queue survives a page refresh.** The queue is stored in the browser's database (IndexedDB), so a refresh does not lose the photos or the results.
>
> **15. Smart refreshing.** The Live page asks for new data every 2 seconds, but it only redraws the screen when the result has actually changed. This keeps the page fast.
>
> **16. Original vs. highlighted toggle.** The operator can compare the AI's boxes with the original photo to check the result.

---

## Part 7 — How we built it: the development journey (1.5 min)

**SHOW:** Timeline slide

| Step | What we did |
|---|---|
| 1 | Built the base system: React dashboard, Express API, PostgreSQL database, Python service |
| 2 | Changed the grading to **insoluble impurities**: first three tiers (≤0.20%, 0.20–0.25%, >0.25%) |
| 3 | Simplified it to **two tiers**: ≤0.20% Food, >0.20% Industrial |
| 4 | Built the **YOLOv8 training pipeline** with model versioning |
| 5 | Added **labeling, augmentation and Roboflow** tools, and our labeled real salt photo dataset |
| 6 | Ran **YOLOv8 inference** with **red and green highlighting** |
| 7 | Connected the back end so uploads and camera inbox photos are analyzed by YOLOv8 |
| 8 | Added **sign-in** with viewer and dev roles |
| 9 | Added the **original vs. highlighted toggle** on the dashboard |
| 10 | Added the **batch image queue** (drag and drop many photos) to the Lab page |
| 11 | Added a launch setup for development and the starting user accounts |

**SAY:**
> We started with a full working system that used simulated data, so the dashboard and the database could be built and tested early. Then we aligned the grading with the food-salt standards and simplified it to two clear tiers that match our two sorting bins.
>
> After that, we replaced the simulated analysis with a real AI model. We built the training pipeline, labeled real salt photos, trained YOLOv8, and connected it to the back end. Finally, we improved the user side: sign-in and roles, the highlight toggle, and the batch queue for the lab.

---

## Part 8 — Limitations and future work (45 sec)

**SAY:**
> Our system has some limitations, and we plan to improve them:
> - **More data.** The validation set is still small. Every new batch of photos goes through our fine-tune pipeline and makes the model stronger.
> - **Area vs. weight.** We estimate impurity percentage from the **area** of the boxes in the photo. The standard measures impurities by **weight**. Next, we will calibrate our results against lab weight tests.
> - **Speed on the device.** Right now, each photo starts a new Python process, so the model loads every time. A Python service that stays running would make each analysis faster.
> - **Hardware.** Connecting the real camera and the ejectors to the sorting cycle, and running the ONNX model on a Raspberry Pi.

---

## Part 9 — Closing (30 sec)

**SAY:**
> To summarize: SALTFINE takes a photo of sea salt, uses a YOLOv8 AI model to find the impurities, calculates the purity, grades the salt as Food or Industrial using the 0.20% limit, and shows everything on a live dashboard. Every result is saved for records and reports.
>
> The model can improve safely over time, because a new version only goes live when it is proven better.
>
> Thank you. We are happy to answer your questions.

---

## Backup: likely panel questions

**Q: Why YOLOv8 and not a simple image classifier?**
> A classifier only says "good" or "bad" for the whole photo. YOLO **finds and counts each particle**, so we can calculate a percentage and show the operator where the dirt is.

**Q: Why the nano model?**
> It is fast (about 7.5 ms per image on a CPU) and small (6 MB), so it can run on a Raspberry Pi without a graphics card.

**Q: How is the impurity percentage calculated?**
> Impurity box area divided by the total detected particle area, times 100. If the result is 0.20% or less, the salt is Food grade.

**Q: What happens if the AI fails?**
> The back end tries other Python options, then a backup estimate, so the dashboard keeps working. Each result says whether it came from YOLOv8 (`is_model_result`).

**Q: How do you stop a worse model from going live?**
> After fine-tuning, the new model is tested on the same holdout photos as the current one. It is promoted only if the impurity scores do not drop, and every old version can be restored.

**Q: Why is salt mAP lower than impurity mAP?**
> Salt crystals touch and overlap, so their boxes are hard to separate. Impurities stand out by color, and impurities are what decide the grade.
