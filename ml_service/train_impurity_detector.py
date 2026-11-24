"""
SALTURE - Sea Salt Insoluble Impurities & Purity Model Trainer
Trains Random Forest classifier to identify pure salt crystals vs. foreign matter (dirt, sand, clay, shell grit).
Outputs model to: models/salt_impurity_rf.joblib
"""

import os
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
import joblib

def train_and_export():
    print("[*] Generating calibrated physical feature dataset (Optical Salt vs Insoluble Impurities)...")
    np.random.seed(42)

    # Pure Salt: High luminance/brightness (V), low saturation (S), low color contrast
    X_salt = np.column_stack([
        np.random.normal(215, 18, 1200),  # Mean Brightness (0-255)
        np.random.normal(18, 10, 1200),   # Saturation (0-255)
        np.random.normal(28, 8, 1200),    # Contrast / Variance
        np.random.normal(120, 40, 1200),  # Area in px
        np.random.normal(1.1, 0.2, 1200), # Aspect Ratio
    ])
    y_salt = np.zeros(1200)

    # Insoluble Impurities (black specks, sand, dirt, clay, shells): Low brightness, higher saturation
    X_impurity = np.column_stack([
        np.random.normal(85, 25, 400),    # Low Brightness (Dark specks)
        np.random.normal(80, 25, 400),    # Higher Saturation (Sand/dirt)
        np.random.normal(48, 12, 400),    # Contrast
        np.random.normal(70, 30, 400),    # Area
        np.random.normal(1.3, 0.3, 400),  # Aspect Ratio
    ])
    y_impurity = np.ones(400)

    X = np.vstack([X_salt, X_impurity])
    y = np.concatenate([y_salt, y_impurity])

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    print("[*] Training Random Forest Classifier (100 Decision Trees)...")
    clf = RandomForestClassifier(n_estimators=100, max_depth=6, random_state=42)
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"[*] Model Accuracy: {acc * 100:.2f}%")
    print(classification_report(y_test, y_pred, target_names=["Pure Salt", "Insoluble Impurity"]))

    output_dir = os.path.join(os.path.dirname(__file__), "models")
    os.makedirs(output_dir, exist_ok=True)
    model_path = os.path.join(output_dir, "salt_impurity_rf.joblib")
    joblib.dump(clf, model_path)
    print(f"✅ Trained model successfully saved to: {model_path}")

if __name__ == "__main__":
    train_and_export()
