from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, TensorDataset

from .features import FEATURE_DIM, SEQ_LEN
from .synthetic import generate_sequences

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models"


class EmptyLegLSTM(nn.Module):
    def __init__(self, input_dim: int = FEATURE_DIM, hidden: int = 32):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_dim,
            hidden_size=hidden,
            num_layers=1,
            batch_first=True,
        )
        self.head = nn.Sequential(
            nn.Linear(hidden, 16),
            nn.ReLU(),
            nn.Dropout(0.15),
            nn.Linear(16, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out, _ = self.lstm(x)
        last = out[:, -1, :]
        return self.head(last).squeeze(-1)


def train(seed: int = 11, epochs: int = 14, batch_size: int = 64) -> dict:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    torch.manual_seed(seed)
    np.random.seed(seed)

    X, y = generate_sequences(n=3000, seed=seed)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=seed, stratify=y
    )

    train_ds = TensorDataset(
        torch.from_numpy(X_train), torch.from_numpy(y_train.astype(np.float32))
    )
    test_ds = TensorDataset(
        torch.from_numpy(X_test), torch.from_numpy(y_test.astype(np.float32))
    )
    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    test_loader = DataLoader(test_ds, batch_size=256)

    model = EmptyLegLSTM()
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    loss_fn = nn.BCEWithLogitsLoss()

    model.train()
    for _ in range(epochs):
        for xb, yb in train_loader:
            opt.zero_grad()
            logits = model(xb)
            loss = loss_fn(logits, yb)
            loss.backward()
            opt.step()

    model.eval()
    probs: list[float] = []
    labels: list[float] = []
    with torch.no_grad():
        for xb, yb in test_loader:
            logit = model(xb)
            prob = torch.sigmoid(logit).cpu().numpy()
            probs.extend(prob.tolist())
            labels.extend(yb.cpu().numpy().tolist())

    auc = float(roc_auc_score(labels, probs))
    torch.save(
        {
            "state_dict": model.state_dict(),
            "input_dim": FEATURE_DIM,
            "seq_len": SEQ_LEN,
            "hidden": 32,
        },
        MODEL_DIR / "lstm_emptyleg.pt",
    )
    meta = {
        "model": "lstm",
        "auc": auc,
        "epochs": epochs,
        "seq_len": SEQ_LEN,
        "feature_dim": FEATURE_DIM,
        "positive_rate": float(np.mean(y)),
    }
    (MODEL_DIR / "lstm_metrics.json").write_text(json.dumps(meta, indent=2))
    return meta


if __name__ == "__main__":
    metrics = train()
    print(json.dumps({"auc": metrics["auc"], "ok": True}, indent=2))
