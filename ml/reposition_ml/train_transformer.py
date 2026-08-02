from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import roc_auc_score
from torch.utils.data import DataLoader, TensorDataset

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models"

AIRPORT_VOCAB = [
    "PAD",
    "SIN",
    "PVG",
    "SHA",
    "PEK",
    "HKG",
    "BKK",
    "TEB",
    "PBI",
    "OPF",
    "VNY",
    "LAS",
    "LBG",
    "GVA",
    "LTN",
    "NCE",
    "UNK",
]
AIRPORT_TO_IDX = {a: i for i, a in enumerate(AIRPORT_VOCAB)}
SEQ_LEN = 6
N_AIRPORTS = len(AIRPORT_VOCAB)


class TripTransformer(nn.Module):
    """Tiny transformer encoder over trip tokens → P(ready_to_return)."""

    def __init__(
        self,
        n_airports: int = N_AIRPORTS,
        d_model: int = 32,
        nhead: int = 4,
        layers: int = 2,
    ):
        super().__init__()
        self.origin_emb = nn.Embedding(n_airports, d_model)
        self.dest_emb = nn.Embedding(n_airports, d_model)
        self.stay_proj = nn.Linear(3, d_model)  # stay_days, days_away, is_homebound_hist
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=64,
            batch_first=True,
            dropout=0.1,
        )
        self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=layers)
        self.head = nn.Sequential(
            nn.Linear(d_model, 16),
            nn.ReLU(),
            nn.Linear(16, 1),
        )

    def forward(
        self,
        origins: torch.Tensor,
        dests: torch.Tensor,
        nums: torch.Tensor,
        key_padding_mask: torch.Tensor | None = None,
    ) -> torch.Tensor:
        x = self.origin_emb(origins) + self.dest_emb(dests) + self.stay_proj(nums)
        enc = self.encoder(x, src_key_padding_mask=key_padding_mask)
        # mean pool over non-pad
        if key_padding_mask is not None:
            mask = (~key_padding_mask).unsqueeze(-1).float()
            pooled = (enc * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1.0)
        else:
            pooled = enc.mean(dim=1)
        return self.head(pooled).squeeze(-1)


def _code(idx_name: str) -> int:
    return AIRPORT_TO_IDX.get(idx_name, AIRPORT_TO_IDX["UNK"])


def generate_trip_dataset(n: int = 4000, seed: int = 21):
    rng = np.random.default_rng(seed)
    homes = ["SIN", "TEB", "LBG"]
    corridors = {
        "SIN": [("PVG", 7.0), ("HKG", 5.0), ("BKK", 4.0)],
        "TEB": [("PBI", 10.0), ("OPF", 6.0), ("LAS", 3.0)],
        "LBG": [("GVA", 3.0), ("NCE", 4.0), ("LTN", 2.0)],
    }

    origins = np.zeros((n, SEQ_LEN), dtype=np.int64)
    dests = np.zeros((n, SEQ_LEN), dtype=np.int64)
    nums = np.zeros((n, SEQ_LEN, 3), dtype=np.float32)
    y = np.zeros(n, dtype=np.float32)
    pad_mask = np.ones((n, SEQ_LEN), dtype=bool)  # True = pad

    for i in range(n):
        home = homes[int(rng.integers(0, len(homes)))]
        dest, typical = corridors[home][int(rng.integers(0, len(corridors[home])))]
        # Build 3 historical round trips + current outbound
        hist = []
        for _ in range(3):
            stay = float(np.clip(rng.normal(typical, 1.2), 2, 16))
            hist.append((home, dest, stay, 0.0, 0.0))
            hist.append((dest, home, 0.0, 0.0, 1.0))

        days_away = float(np.clip(rng.uniform(0.5, typical + 6), 0.5, 20))
        # Current trip still outbound at `dest`
        hist.append((home, dest, typical, days_away, 0.0))

        # Label: ready to return when close to / past typical stay
        delta = days_away - typical
        prob = 1 / (1 + math.exp(-(0.3 + delta * 0.7)))
        # noise
        prob = float(np.clip(prob + rng.normal(0, 0.05), 0, 1))
        y[i] = float(prob >= 0.5)

        # Take last SEQ_LEN events
        hist = hist[-SEQ_LEN:]
        for t, (o, d, stay, away, homebound) in enumerate(hist):
            origins[i, t] = _code(o)
            dests[i, t] = _code(d)
            nums[i, t] = [stay / 14.0, away / 14.0, homebound]
            pad_mask[i, t] = False

    return origins, dests, nums, pad_mask, y


def train(seed: int = 21, epochs: int = 12, batch_size: int = 64) -> dict:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    torch.manual_seed(seed)
    np.random.seed(seed)

    origins, dests, nums, pad_mask, y = generate_trip_dataset(n=4000, seed=seed)
    n = len(y)
    idx = np.arange(n)
    rng = np.random.default_rng(seed)
    rng.shuffle(idx)
    split = int(n * 0.8)
    tr, te = idx[:split], idx[split:]

    def pack(subset):
        return TensorDataset(
            torch.from_numpy(origins[subset]),
            torch.from_numpy(dests[subset]),
            torch.from_numpy(nums[subset]),
            torch.from_numpy(pad_mask[subset]),
            torch.from_numpy(y[subset]),
        )

    train_loader = DataLoader(pack(tr), batch_size=batch_size, shuffle=True)
    test_loader = DataLoader(pack(te), batch_size=256)

    model = TripTransformer()
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    loss_fn = nn.BCEWithLogitsLoss()

    model.train()
    for _ in range(epochs):
        for o, d, num, mask, label in train_loader:
            opt.zero_grad()
            logits = model(o, d, num, key_padding_mask=mask)
            loss = loss_fn(logits, label)
            loss.backward()
            opt.step()

    model.eval()
    probs: list[float] = []
    labels: list[float] = []
    with torch.no_grad():
        for o, d, num, mask, label in test_loader:
            logit = model(o, d, num, key_padding_mask=mask)
            prob = torch.sigmoid(logit).cpu().numpy()
            probs.extend(prob.tolist())
            labels.extend(label.cpu().numpy().tolist())

    auc = float(roc_auc_score(labels, probs))
    torch.save(
        {
            "state_dict": model.state_dict(),
            "airport_vocab": AIRPORT_VOCAB,
            "seq_len": SEQ_LEN,
            "d_model": 32,
        },
        MODEL_DIR / "transformer_return.pt",
    )
    meta = {"model": "transformer_return", "auc": auc, "epochs": epochs}
    (MODEL_DIR / "transformer_metrics.json").write_text(json.dumps(meta, indent=2))
    return meta


if __name__ == "__main__":
    print(json.dumps(train(), indent=2))
