"""Train CharCNN on real human handwriting (neat + messy + mixed).

Primary source: EMNIST ByClass (NIST writers — digits, upper, lower).
Optional: Kaggle A-Z Handwritten Alphabets CSV
  https://www.kaggle.com/datasets/sachinpatel21/az-handwritten-alphabets-in-csv-format
  Place at ml/data/A_Z_Handwritten_Data.csv  OR  set KAGGLE_USERNAME/KAGGLE_KEY
  and pass --kaggle-download.

Heavy augmentations simulate phone photos, thick/thin pens, and messy script.
Exports:
  ml/artifacts/charcnn.pt
  ml/artifacts/charcnn.json          (browser weights)
  assets/charcnn.json               (classic Pages)
  web/public/charcnn.json           (Vite app)
"""

from __future__ import annotations

import argparse
import csv
import os
import random
import shutil
import sys
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import ConcatDataset, DataLoader, Dataset, Subset
from torchvision import datasets, transforms
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
DATA = ROOT / "data"
ART = ROOT / "artifacts"

sys.path.insert(0, str(ROOT))
from char_cnn import (  # noqa: E402
    INPUT_SIZE,
    NUM_CLASSES,
    CharCNN,
    EMNIST_BYCLASS_LABELS,
    export_browser_weights,
    label_to_index,
)


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


class MessyAugment:
    """Neat → messy continuum: blur, shear, thickness, noise, partial wipe."""

    def __init__(self, strength: float = 1.0) -> None:
        self.strength = strength

    def __call__(self, img: Image.Image) -> Image.Image:
        s = self.strength
        # Random rotate / shear (phone skew + slanted hand)
        angle = random.uniform(-18, 18) * s
        shear = random.uniform(-12, 12) * s
        img = img.transform(
            img.size,
            Image.AFFINE,
            (
                1,
                shear * 0.02,
                random.uniform(-2, 2) * s,
                random.uniform(-0.02, 0.02) * s,
                1,
                random.uniform(-2, 2) * s,
            ),
            resample=Image.BILINEAR,
            fillcolor=0,
        )
        img = img.rotate(angle, resample=Image.BILINEAR, fillcolor=0)

        # Thickness via min/max filter (erode/dilate on ink-on-black)
        mode = random.random()
        if mode < 0.33 * s:
            img = img.filter(ImageFilter.MaxFilter(3))  # thicken
        elif mode < 0.55 * s:
            img = img.filter(ImageFilter.MinFilter(3))  # thin / broken

        if random.random() < 0.45 * s:
            img = img.filter(ImageFilter.GaussianBlur(radius=random.uniform(0.4, 1.6) * s))

        arr = np.asarray(img, dtype=np.float32)
        # Speckle / sensor noise
        if random.random() < 0.5 * s:
            arr = arr + np.random.normal(0, 18 * s, arr.shape)
        # Soft paper grain
        if random.random() < 0.35 * s:
            arr = arr + np.random.uniform(-12, 12, arr.shape) * s
        # Partial erasure / incomplete strokes
        if random.random() < 0.25 * s:
            yy, xx = np.ogrid[: arr.shape[0], : arr.shape[1]]
            cy, cx = random.uniform(0, 27), random.uniform(0, 27)
            r = random.uniform(3, 9) * s
            wipe = ((yy - cy) ** 2 + (xx - cx) ** 2) < r * r
            arr = arr.copy()
            arr[wipe] *= random.uniform(0.0, 0.35)
        # Contrast / exposure (phone photos)
        if random.random() < 0.6:
            gain = random.uniform(0.65, 1.45)
            arr = arr * gain
        arr = np.clip(arr, 0, 255).astype(np.uint8)
        return Image.fromarray(arr, mode="L")


def _to_emnist_canvas(img: Image.Image) -> Image.Image:
    """Center glyph on 28x28 ink-on-black (EMNIST convention)."""
    img = ImageOps.invert(img.convert("L")) if _is_mostly_white_bg(img) else img.convert("L")
    # Fit into 20x20 then pad to 28x28 (MNIST-style)
    img = ImageOps.contain(img, (20, 20), Image.Resampling.BILINEAR)
    canvas = Image.new("L", (INPUT_SIZE, INPUT_SIZE), 0)
    ox = (INPUT_SIZE - img.width) // 2
    oy = (INPUT_SIZE - img.height) // 2
    canvas.paste(img, (ox, oy))
    return canvas


def _is_mostly_white_bg(img: Image.Image) -> bool:
    arr = np.asarray(img.convert("L"))
    return float(arr.mean()) > 127


class KaggleAZDataset(Dataset):
    """CSV: first column = label 0-25 (A-Z), remaining 784 = 28x28 pixels."""

    def __init__(
        self, csv_path: Path, train: bool, messy: bool, seed: int = 0, max_rows: int = 80000
    ) -> None:
        self.samples: List[Tuple[np.ndarray, int]] = []
        self.messy = MessyAugment(1.0 if messy else 0.35)
        self.train = train
        rng = random.Random(seed)
        with csv_path.open("r", newline="") as f:
            reader = csv.reader(f)
            for row in reader:
                if not row or not row[0].isdigit():
                    continue
                lab = int(row[0])  # 0=A .. 25=Z
                pixels = np.array([int(x) for x in row[1:785]], dtype=np.uint8).reshape(28, 28)
                # Map uppercase A-Z → EMNIST ByClass indices 10..35
                y = 10 + lab
                self.samples.append((pixels, y))
                if max_rows and len(self.samples) >= max_rows:
                    break
        rng.shuffle(self.samples)
        cut = int(len(self.samples) * 0.9)
        self.samples = self.samples[:cut] if train else self.samples[cut:]

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int):
        pixels, y = self.samples[idx]
        img = Image.fromarray(pixels, mode="L")
        # Kaggle A-Z is often white-on-black already; normalize via canvas helper
        if float(pixels.mean()) > 127:
            img = ImageOps.invert(img)
        if self.train:
            img = self.messy(img)
        t = transforms.ToTensor()(img)  # [0,1], (1,28,28)
        return t, y


def _harvest_jitter(img: Image.Image) -> Image.Image:
    """Simulate harvest crops: random pad/shift, then EMNIST 20-in-28 recenter."""
    arr = np.asarray(img, dtype=np.uint8)
    pad = random.randint(2, 14)
    canvas = Image.new("L", (arr.shape[1] + pad * 2, arr.shape[0] + pad * 2), 0)
    ox = random.randint(0, pad)
    oy = random.randint(0, pad)
    canvas.paste(img, (ox, oy))
    return _to_emnist_canvas(canvas)


class EMNISTWrap(Dataset):
    """Wrap torchvision EMNIST; fix transpose; optional messy branch."""

    def __init__(self, base: Dataset, messy: bool, train: bool) -> None:
        self.base = base
        self.messy = MessyAugment(1.05 if messy else 0.4)
        self.train = train
        self.to_tensor = transforms.ToTensor()

    def __len__(self) -> int:
        return len(self.base)

    def __getitem__(self, idx: int):
        img, y = self.base[idx]
        # torchvision EMNIST is transposed vs visual expectation
        img = img.transpose(Image.TRANSPOSE)
        if self.train:
            img = self.messy(img)
            if random.random() < 0.5:
                img = _harvest_jitter(img)
        return self.to_tensor(img), int(y)


class FontGlyphDataset(Dataset):
    """Render A–Z / a–z / 0–9 with system fonts — closes gap vs neat printed samples."""

    def __init__(self, train: bool, messy: bool, per_char: int = 40, seed: int = 0) -> None:
        self.train = train
        self.messy = MessyAugment(0.9 if messy else 0.25)
        self.to_tensor = transforms.ToTensor()
        self.samples: List[Tuple[str, int, int]] = []  # (font, label_idx, render_seed)
        fonts = _system_fonts()
        rng = random.Random(seed)
        chars = EMNIST_BYCLASS_LABELS
        for ch_i, ch in enumerate(chars):
            for n in range(per_char):
                font = fonts[n % len(fonts)]
                self.samples.append((font, ch_i, rng.randint(0, 10_000_000)))
        rng.shuffle(self.samples)
        cut = int(len(self.samples) * 0.9)
        self.samples = self.samples[:cut] if train else self.samples[cut:]

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int):
        font_path, y, seed = self.samples[idx]
        rng = random.Random(seed + (idx if self.train else 0))
        ch = EMNIST_BYCLASS_LABELS[y]
        size = rng.randint(28, 52)
        try:
            font = ImageFont.truetype(font_path, size=size)
        except Exception:
            font = ImageFont.load_default()
        # Render dark on white then invert to ink-on-black
        big = Image.new("L", (64, 64), 255)
        draw = ImageDraw.Draw(big)
        bbox = draw.textbbox((0, 0), ch, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        x = (64 - tw) // 2 - bbox[0]
        y0 = (64 - th) // 2 - bbox[1]
        draw.text((x, y0), ch, font=font, fill=0)
        img = _to_emnist_canvas(big)
        if self.train:
            img = self.messy(img)
            if rng.random() < 0.6:
                img = _harvest_jitter(img)
        return self.to_tensor(img), y


def _system_fonts() -> List[str]:
    candidates = []
    windir = os.environ.get("WINDIR", r"C:\Windows")
    font_dir = Path(windir) / "Fonts"
    names = [
        "arial.ttf", "arialbd.ttf", "calibri.ttf", "calibrib.ttf",
        "comic.ttf", "comicbd.ttf", "cour.ttf", "courbd.ttf", "georgia.ttf",
        "georgiab.ttf", "impact.ttf", "tahoma.ttf", "tahomabd.ttf", "times.ttf",
        "timesbd.ttf", "verdana.ttf", "verdanab.ttf", "segoeui.ttf", "segoeuib.ttf",
        "consola.ttf", "cascadiamono.ttf", "micross.ttf", "lucon.ttf",
    ]
    for n in names:
        p = font_dir / n
        if p.exists():
            candidates.append(str(p))
    if not candidates:
        candidates.append("")  # default bitmap font
    return candidates


def try_kaggle_download(dest: Path) -> Optional[Path]:
    dest.parent.mkdir(parents=True, exist_ok=True)
    existing = dest if dest.exists() else None
    if existing:
        return existing
    # Alternate common filenames
    for alt in (
        DATA / "A_Z_Handwritten_Data.csv",
        DATA / "Handwritten_Data.csv",
        DATA / "az-handwritten-alphabets-in-csv-format" / "A_Z_Handwritten_Data.csv",
    ):
        if alt.exists():
            return alt
    # Prefer kagglehub (works with browser auth / cached tokens)
    try:
        import kagglehub  # type: ignore
        import shutil

        print("[train] downloading Kaggle A-Z via kagglehub…")
        root = Path(
            kagglehub.dataset_download("sachinpatel21/az-handwritten-alphabets-in-csv-format")
        )
        for alt in root.rglob("*.csv"):
            shutil.copy2(alt, dest)
            print(f"[train] Kaggle CSV → {dest}")
            return dest
    except Exception as exc:
        print("[train] kagglehub skipped:", exc)
    try:
        import kaggle  # type: ignore

        print("[train] downloading Kaggle A-Z handwritten alphabets…")
        kaggle.api.authenticate()
        kaggle.api.dataset_download_files(
            "sachinpatel21/az-handwritten-alphabets-in-csv-format",
            path=str(DATA),
            unzip=True,
        )
        for alt in DATA.rglob("A_Z_Handwritten_Data.csv"):
            return alt
    except Exception as exc:
        print("[train] Kaggle download skipped:", exc)
    return None


def build_loaders(
    batch: int,
    workers: int,
    subset: Optional[int],
    kaggle_csv: Optional[Path],
    seed: int,
) -> Tuple[DataLoader, DataLoader]:
    DATA.mkdir(parents=True, exist_ok=True)

    # Neat-ish branch (light aug) + messy branch (heavy aug) from same EMNIST
    raw_train = datasets.EMNIST(
        root=str(DATA), split="byclass", train=True, download=True, transform=None
    )
    raw_test = datasets.EMNIST(
        root=str(DATA), split="byclass", train=False, download=True, transform=None
    )

    train_sets: List[Dataset] = [
        EMNISTWrap(raw_train, messy=False, train=True),
        EMNISTWrap(raw_train, messy=True, train=True),
        FontGlyphDataset(train=True, messy=False, per_char=36, seed=seed),
        FontGlyphDataset(train=True, messy=True, per_char=36, seed=seed + 7),
    ]
    test_sets: List[Dataset] = [
        EMNISTWrap(raw_test, messy=False, train=False),
        EMNISTWrap(raw_test, messy=True, train=False),
        FontGlyphDataset(train=False, messy=False, per_char=12, seed=seed + 11),
        FontGlyphDataset(train=False, messy=True, per_char=12, seed=seed + 13),
    ]
    print("[train] merged font-rendered glyphs (neat+messy)")

    if kaggle_csv and kaggle_csv.exists():
        print(f"[train] merging Kaggle A-Z from {kaggle_csv}")
        train_sets.append(KaggleAZDataset(kaggle_csv, train=True, messy=False, seed=seed))
        train_sets.append(KaggleAZDataset(kaggle_csv, train=True, messy=True, seed=seed + 1))
        test_sets.append(KaggleAZDataset(kaggle_csv, train=False, messy=False, seed=seed + 2))
        test_sets.append(KaggleAZDataset(kaggle_csv, train=False, messy=True, seed=seed + 3))
    else:
        print("[train] Kaggle CSV not found — EMNIST + fonts only")

    train_ds: Dataset = ConcatDataset(train_sets)
    test_ds: Dataset = ConcatDataset(test_sets)

    if subset and subset > 0:
        g = torch.Generator().manual_seed(seed)
        train_idx = torch.randperm(len(train_ds), generator=g)[:subset].tolist()
        test_idx = torch.randperm(len(test_ds), generator=g)[: max(2000, subset // 10)].tolist()
        train_ds = Subset(train_ds, train_idx)
        test_ds = Subset(test_ds, test_idx)

    train_loader = DataLoader(
        train_ds, batch_size=batch, shuffle=True, num_workers=workers, pin_memory=False
    )
    test_loader = DataLoader(
        test_ds, batch_size=batch, shuffle=False, num_workers=workers, pin_memory=False
    )
    print(f"[train] train={len(train_ds)} test={len(test_ds)} classes={NUM_CLASSES}")
    return train_loader, test_loader


@torch.no_grad()
def evaluate(model: nn.Module, loader: DataLoader, device: torch.device) -> float:
    model.eval()
    correct = 0
    total = 0
    for x, y in loader:
        x, y = x.to(device), y.to(device)
        pred = model(x).argmax(1)
        correct += int((pred == y).sum().item())
        total += y.numel()
    return correct / max(1, total)


def train(args: argparse.Namespace) -> None:
    set_seed(args.seed)
    ART.mkdir(parents=True, exist_ok=True)
    device = torch.device("cuda" if torch.cuda.is_available() and not args.cpu else "cpu")
    print(f"[train] device={device}")

    kaggle_csv = None
    if args.kaggle_csv:
        kaggle_csv = Path(args.kaggle_csv)
    elif args.kaggle_download:
        kaggle_csv = try_kaggle_download(DATA / "A_Z_Handwritten_Data.csv")
    else:
        kaggle_csv = try_kaggle_download(DATA / "A_Z_Handwritten_Data.csv")

    train_loader, test_loader = build_loaders(
        batch=args.batch,
        workers=args.workers,
        subset=args.subset,
        kaggle_csv=kaggle_csv,
        seed=args.seed,
    )

    model = CharCNN(NUM_CLASSES).to(device)
    if args.resume and Path(args.resume).exists():
        ckpt0 = torch.load(args.resume, map_location=device, weights_only=False)
        model.load_state_dict(ckpt0["model"] if isinstance(ckpt0, dict) and "model" in ckpt0 else ckpt0)
        print(f"[train] resumed from {args.resume}")
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max(1, args.epochs))
    crit = nn.CrossEntropyLoss(label_smoothing=0.05)

    best = 0.0
    best_path = ART / "charcnn.pt"
    for epoch in range(1, args.epochs + 1):
        model.train()
        running = 0.0
        n = 0
        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            opt.zero_grad(set_to_none=True)
            logits = model(x)
            loss = crit(logits, y)
            loss.backward()
            opt.step()
            running += float(loss.item()) * y.size(0)
            n += y.size(0)
        sched.step()
        acc = evaluate(model, test_loader, device)
        print(f"[train] epoch {epoch}/{args.epochs} loss={running/max(1,n):.4f} acc={acc:.4f}")
        if acc >= best:
            best = acc
            torch.save(
                {
                    "model": model.state_dict(),
                    "acc": best,
                    "labels": EMNIST_BYCLASS_LABELS,
                    "epoch": epoch,
                },
                best_path,
            )

    print(f"[train] best acc={best:.4f} → {best_path}")
    ckpt = torch.load(best_path, map_location="cpu", weights_only=False)
    model.load_state_dict(ckpt["model"])
    model.eval()

    browser_path = ART / "charcnn.json"
    export_browser_weights(model, str(browser_path))
    print(f"[train] browser weights → {browser_path} ({browser_path.stat().st_size/1e6:.2f} MB)")

    # Ship into classic + Vite public paths
    for dest in (REPO / "assets" / "charcnn.json", REPO / "web" / "public" / "charcnn.json"):
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(browser_path, dest)
        print(f"[train] copied → {dest}")

    # Quick confusion spot-check for Q/a (common mix-up)
    spot_check(model, test_loader, device)


@torch.no_grad()
def spot_check(model: nn.Module, loader: DataLoader, device: torch.device) -> None:
    model.eval()
    q_idx = label_to_index("Q")
    a_idx = label_to_index("a")
    q_total = q_as_a = 0
    for x, y in loader:
        x = x.to(device)
        pred = model(x).argmax(1).cpu()
        for yi, pi in zip(y.tolist(), pred.tolist()):
            if yi == q_idx:
                q_total += 1
                if pi == a_idx:
                    q_as_a += 1
        if q_total >= 200:
            break
    if q_total:
        print(f"[train] spot-check Q→a errors: {q_as_a}/{q_total} ({100*q_as_a/q_total:.1f}%)")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train Inkcadence CharCNN")
    p.add_argument("--epochs", type=int, default=6)
    p.add_argument("--batch", type=int, default=256)
    p.add_argument("--lr", type=float, default=1.5e-3)
    p.add_argument("--workers", type=int, default=0)
    p.add_argument("--subset", type=int, default=0, help="Limit train samples (0=all)")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--cpu", action="store_true")
    p.add_argument("--kaggle-download", action="store_true")
    p.add_argument("--kaggle-csv", type=str, default="")
    p.add_argument("--quick", action="store_true", help="Fast smoke: 1 epoch, 12k samples")
    p.add_argument("--resume", type=str, default="", help="Warm-start from charcnn.pt")
    args = p.parse_args()
    if args.quick:
        args.epochs = 1
        args.subset = 12000
        args.batch = 128
    if not args.resume and (ART / "charcnn.pt").exists():
        args.resume = str(ART / "charcnn.pt")
    return args


if __name__ == "__main__":
    train(parse_args())
