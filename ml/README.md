# Inkcadence ML

## CharCNN (alphabet recognition)

Harvest used to fake labels by cycling `FREQ` (`Q` → `a` style mix-ups).  
The browser now classifies each crop with a small CNN trained on **real human handwriting**:

| Source | What it covers |
|--------|----------------|
| **EMNIST ByClass** (NIST writers) | Digits + A–Z + a–z, neat and messy writers |
| **Kaggle A–Z Handwritten Alphabets** | Extra uppercase variety (`sachinpatel21/az-handwritten-alphabets-in-csv-format`) |
| **Messy augmentations** | Blur, shear, thick/thin pen, noise, partial erasure, phone-like exposure |

### Train

```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
# optional: pip install kagglehub
python ml/train_char_cnn.py                  # EMNIST + Kaggle if CSV present
python ml/train_char_cnn.py --kaggle-download
python ml/train_char_cnn.py --quick          # smoke test
```

Place the Kaggle CSV at `ml/data/A_Z_Handwritten_Data.csv` if you already have it.

Outputs:

- `ml/artifacts/charcnn.pt` — PyTorch checkpoint  
- `assets/charcnn.json` / `web/public/charcnn.json` — browser weights (base64 float32)

### Browser wiring

- `js/charcnn.js` — inference  
- `js/harvest.js` — `harvestFromPagesAsync()` labels crops with CharCNN  

### API

`POST /recognize` on this service classifies base64 glyph crops server-side when the `.pt` artifact is present.
