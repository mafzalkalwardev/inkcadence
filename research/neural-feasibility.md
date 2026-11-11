# Can a few-shot neural handwriting model run on the Oracle VPS?

Research for issue [#4](https://github.com/mafzalkalwardev/inkcadence/issues/4). Checked 2026-11-12.

**Short answer: no, not at launch.** The open-source models that imitate a hand from a few samples are diffusion or large autoregressive models. On CPU they take **tens of minutes to hours per A4 page**. Almost all of them were trained on handwriting datasets licensed for **non-commercial research only**. Launch on classical glyph harvest. If you want neural output, add it later as an opt-in **GPU-per-job** worker (about $0.01–0.05 per page, estimated). [Emuru](#emuru-cvpr-2025) is the most promising candidate, because its training data is synthetic and its licence is MIT.

**Legend:** **M** = measured, by me or quoted from a primary source. **E** = my estimate, with the reasoning given.

A "page" in this note is one A4 page of handwriting: about 28 lines × 60 characters, or about 300 words.

## Shortlist

| Model | Code / weights licence | Training data (commercial?) | Input to imitate a new writer | Output | Weights | CPU, 1 page: laptop (M, proxy) → A1 4 OCPU (E) | RAM (E) | Rented GPU, 1 page (E) |
|---|---|---|---|---|---|---|---|---|
| [DiffusionPen](#diffusionpen-eccv-2024) | MIT / MIT | IAM (NC) + SD-1.5 VAE (OpenRAIL-M) | 5 word crops, zero-shot | 64×256 word | 680 MB ckpt + 335 MB VAE | **21 min** → 32–53 min | 2–4 GB | 10–30 s warm, ≈ $0.01–0.03 |
| [One-DM](#one-dm-eccv-2024) | MIT / not stated (Google Drive) | IAM + CVL (NC) + SD-1.5 VAE | 1 word crop, zero-shot | word, 64 px high | not stated | same class as DiffusionPen (E) | 2–4 GB | ≈ $0.01–0.03 |
| [DiffBrush](#diffbrush-iccv-2025) | MIT / not stated (Google Drive) | IAM lines (NC) + SD-1.5 VAE | 1 line crop, zero-shot | 64×1024 line | not stated | same order as DiffusionPen (E) | 2–4 GB | ≈ $0.01–0.03 |
| [Emuru](#emuru-cvpr-2025), official code | MIT / MIT | synthetic font renders only | 1 line crop **+ its transcription**, zero-shot | variable-width line, 64 px high | 2.9 GB (0.7 B params) | **2.8 h** → 4–7 h | ≈ 4 GB | 1–3 min, ≈ $0.02–0.05 |
| Emuru, KV-cache patch (≈ 50 lines of code, not written yet) | same | same | same | same | same | **2.4 min** → 4–6 min | ≈ 6 GB | seconds; cost is mostly cold start, ≈ $0.005–0.015 |
| [VATr / HWT](#vatr-vatr-and-hwt-gan--transformer) (GAN class) | MIT / MIT (VATr on HF); HWT weights on Drive | IAM (+CVL) (NC) | 15 word crops, zero-shot | word, **32 px high** | ≈ 0.1 B params | not measured; ≈ 10 s–1 min (E) | < 1.5 GB | not worth a GPU |

NC means the dataset terms say non-commercial research only. See [Licences](#licences).

**Ruled out:**
- WordStylist cannot take a new writer without retraining.
- HiGAN+ is "free for academic research purposes" only.
- HiGAN, GANwriting and SmartPatch have no released weights.
- VATr++ code has no LICENSE file.
- The Mayr et al. paragraph LDM has no LICENSE file and works only on 768×768 squares.
- All stroke-based (online) models are ruled out, for the reasons in [Stroke route](#stroke-route-photo--ink--stroke-model).

## How the CPU numbers were produced

No paper or repo reports CPU timings, and only a few report GPU timings (see below). So I timed the **same architectures with random weights**. Compute cost does not depend on the weight values.

**Setup:**
- Machine: Intel i7-8850H laptop, PyTorch 2.10 CPU, 4 threads. The fp32 GEMM measured **214 GFLOP/s**.
- DiffusionPen-shaped UNet, built with diffusers to match DiffusionPen's `train.py` hyper-parameters:
  - latent 4×8×32
  - 320 channels, channel_mult (1,1), 1 res block, 4 heads, context 320
  - DDIM 50 steps, as in `noise_scheduler.set_timesteps(50)`
  - 35.5 M parameters
- SD-1.5-shaped VAE decoder.
- Emuru:
  - T5-large with a ByT5 vocabulary (705 M parameters), plus the 14 M-parameter Emuru VAE built from its HF `config.json`.
  - Run with the official `_generate` loop from `modeling_emuru.py`. That loop re-runs the whole T5 encoder and decoder, without a KV cache, for every new latent column.
  - Also run with a KV-cached variant.
  - Example line: 1,000 px style line (125 latent columns) plus 50 style characters, generating 60 characters as 190 columns. That assumes about 24 px per character at 64 px height.

| Component (M, laptop, 4 threads) | Time | FLOPs (M, `torch` FlopCounter) |
|---|---|---|
| DiffusionPen-class UNet step, batch 32 | 67 ms per word-step, so **3.4 s/word** for 50 steps | 9.5 GFLOP per word-step |
| SD-1.5 VAE decode, 64×256 | 0.85 s/word | 155 GFLOP/word |
| → DiffusionPen-class page (300 words) | **≈ 1,265 s ≈ 21 min** | ≈ 190 TFLOP |
| Emuru, official loop, 1 line | **≈ 359 s/line**, so ≈ 2.8 h/page | 46 TFLOP/line, ≈ 1,300 TFLOP/page |
| Emuru, KV-cached, 28 lines batched | 119 s + 25 s VAE = **≈ 2.4 min/page** | ≈ 7 TFLOP/page |
| Emuru VAE decode, 64×2520 line | 0.9 s/line | — |

**Converting to Oracle A1 (E):**
- A1 runs on an Ampere Altra Q80-30 (Neoverse N1, 3.0 GHz), where 1 OCPU is 1 core ([Oracle compute shapes](https://docs.oracle.com/en-us/iaas/Content/Compute/References/computeshapes.htm)).
- N1 peaks at 16 fp32 FLOP per cycle, about 48 GFLOP/s per core. 4 OCPUs therefore reach about 190 GFLOP/s at peak, and realistically about 130–150.
- Measured: a 4-core A1 scores Geekbench 6 1092 single-core / 3472 multi-core ([VPSBenchmarks, Sept 2026](https://www.vpsbenchmarks.com/yabs/oracle_cloud-4c-23gb-20260910-95d043)).
- I therefore scale the laptop numbers by **×1.5–2.5 for 4 OCPU** and **×3–5 for 2 OCPU**.

**Check your allowance:** Oracle's docs now say the Always Free A1 allowance is "1,500 OCPU hours and 9,000 GB hours per month … equivalent to 2 OCPUs and 12 GB of memory" ([Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)). That is half of the 4 OCPU / 24 GB the issue assumes, so check the account. Idle Always Free instances (95th-percentile CPU < 20% over 7 days) "may be reclaimed".

**Small x86 VM (E):** a typical 2–4 vCPU VM has 1–2 physical cores, because a vCPU is usually one hyperthread. The laptop on 2 threads measured **26 min/page** for DiffusionPen-class and **2.8 min/page** for Emuru-cached ([Appendix A](#appendix-a-two-thread-run)). Expect these on a small VM:
- 4 vCPU (2 cores): about 25–40 min/page for DiffusionPen-class, about 3–5 min/page for Emuru-cached.
- 2 vCPU: roughly double that.
- Emuru needs an 8 GB VM.

## (a) Personalising to one user

- **No shortlisted model needs per-user training.** Each one takes the writer's style zero-shot, from 1 to 15 crops passed through a style encoder. Computing that once costs under a second even on A1 (E).
  - DiffusionPen's style encoder is a 2.7 M-parameter MobileNetV2 ([paper](https://arxiv.org/abs/2409.06065)).
- **The real work is producing clean crops from phone photos:** word crops (DiffusionPen, One-DM, VATr, HWT) or line crops (DiffBrush, Emuru).
  - Every one of these models was trained on IAM-style scans: grey, clean, height-normalised to 32 or 64 px. Photos need deskewing, background flattening and normalisation first.
  - Inkcadence's existing harvest pipeline already segments pages, so it can feed the crops.
- **Emuru also needs the transcription of the style line.** The existing `/recognize` endpoint or a user confirmation step can supply it.
- **Optional fine-tuning per user** (One-DM issue #35 asks about this) would need a GPU: about 10–30 min, roughly $0.15–0.50 (E). On A1 it is impractical (days, E). It is not needed for launch.

## (b) Generating one page

The per-page numbers are in the shortlist table.

**Why the cost is so high:**
- **Word-level diffusion** (DiffusionPen, One-DM): 300 words × 50 denoising steps is 15,000 UNet passes, plus 300 decodes by the heavy SD-1.5 VAE.
- **Emuru's released loop** recomputes the whole prefix for every new 8-px column. That makes its cost quadratic in line length. A KV cache makes it linear and is mathematically equivalent (E), but nobody has published that patch.

**What the papers measured (GPU only):**
- WordStylist: "about 12 seconds per image at T=600" ([arXiv 2303.16576](https://arxiv.org/abs/2303.16576)).
- Mayr et al. paragraph LDM: about 9.06 s per paragraph on an NVIDIA A40 ([arXiv 2409.00786](https://arxiv.org/abs/2409.00786)).
- Emuru: word-by-word generation adds "a computational overhead of 29.5% (2.24s)". That implies about 7.6 s per sample on its GPU, which is my inference; the GPU is unnamed, and training used one RTX 4090 ([arXiv 2503.17074](https://arxiv.org/abs/2503.17074), App. E).

**GPU per job (E):**
- The FLOPs above at roughly 15–30 TFLOP/s effective on an L4/A10-class GPU give these compute times:
  - DiffusionPen-class: about 6–13 s.
  - Emuru with the official loop: 1–3 min.
  - Emuru with a KV cache: seconds.
- Add 20–60 s of cold start (loading roughly 1–3 GB of weights).
- Prices, measured on 2026-11-12:
  - [Modal](https://modal.com/pricing): L4 at $0.000222/s (about $0.80/h), billed per second, with a default 60 s idle keep-alive. The Starter plan includes $30/month of credits.
  - [RunPod serverless](https://www.runpod.io/pricing): 24 GB tier at $0.75/h; 16 GB tier at $0.58/h.
- That works out to **≈ $0.005–0.03 per page** for DiffusionPen-class or cached Emuru, and **≈ $0.02–0.05** for Emuru's stock loop. $30 of Modal credit covers roughly 1,000–5,000 pages a month (E).

## Per-model notes

### DiffusionPen (ECCV 2024)

**Sources:** [repo](https://github.com/koninik/DiffusionPen) (MIT), [paper](https://arxiv.org/abs/2409.06065), [weights](https://huggingface.co/konnik/DiffusionPen) (HF `license: mit`).

**How it works:**
- It is a latent diffusion model on 64×256 word images: 4×8×32 latent, DDIM 50 steps.
- The VAE and scheduler come from Stable Diffusion 1.5 ([CreativeML OpenRAIL-M](https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5)).
- The text encoder is CANINE-c ([Apache-2.0](https://huggingface.co/google/canine-c)).
- The `ema_ckpt.pt` file is 680 MB, about 170 M fp32 parameters. It probably includes CANINE (E).

**Style input:** 5 word crops of the writer.

**Quality:** IAM FID 22.54, against WordStylist 34.20 and GANwriting 43.97 (paper).

**Training data:** IAM words.

**Caveats:**
- One word per call, so a page needs layout and baseline logic. Inkcadence already has this for glyphs.
- No ONNX export and no HF Space.

### One-DM (ECCV 2024)

**Sources:** [repo](https://github.com/dailenson/One-DM) (MIT), [paper](https://arxiv.org/abs/2409.04004). Weights are on Google Drive and Baidu, with no separate licence.

**How it works:** one style word crop (64 px high). Characters are rendered with Unifont, so any Unicode character can be requested.

**Quality:** IAM OOV-U FID 102.75 against VATr 108.76; CER 11.69% against VATr 26.98%.

**Training data:** IAM + CVL.

**Caveats:**
- The paper says digits, punctuation and out-of-charset characters are "sometimes generated incorrectly".
- The README's inference command assumes 4 GPUs.

### DiffBrush (ICCV 2025)

**Sources:** [repo](https://github.com/dailenson/DiffBrush) (MIT), [paper](https://arxiv.org/abs/2508.03256). Weights are on Google Drive.

**How it works:**
- Generates **whole lines** (64×1024) from one style line. DDIM 50 steps, SD-1.5 VAE.
- Built on One-DM. Trained on IAM lines (and CVL, CASIA); the released config is IAM.

**Quality:** best line-level scores in its table: HWD 1.41 against One-DM 1.80, DiffusionPen 1.72 and VATr 1.87.

**Caveats:** training took 8× RTX 4090 for about 4 days. Parameter count is not stated, so the CPU cost is not measured. Expect the same order as DiffusionPen per page (E).

### Emuru (CVPR 2025)

**Sources:** [repo](https://github.com/aimagelab/Emuru-autoregressive-text-img) (MIT), [paper](https://arxiv.org/abs/2503.17074), [weights](https://huggingface.co/blowing-up-groundhogs/emuru) (HF `license: mit`, 2.88 GB safetensors), [VAE](https://huggingface.co/blowing-up-groundhogs/emuru_vae) (MIT, 56 MB).

**How it works:**
- A T5-large decoder predicts the next 8-px latent column of a 1-channel VAE.
- It is **trained only on synthetic renders from over 100k fonts** ([Font-Square v2](https://huggingface.co/datasets/blowing-up-groundhogs/font-square-v2), tagged MIT). It never sees IAM, so it has the cleanest licence story of the group.
- The paper does not document where the fonts came from or what their licences are.

**Style input:** one style line plus its transcription.

**Quality:**
- Best line-level style match in its tables: IAM-lines HWD 1.87, BFID 6.19.
- Weaker on single words: IAM-words FID 63.61 against DiffusionPen 15.54.

**Caveats:**
- Works best at "text lines between 25 and 75 characters". A page fits that if you generate one line at a time.
- The model "does not have any mechanism to ensure the correctness of the generated text" (ΔCER 0.14 against DiffusionPen 0.03). A product would need an OCR check-and-retry loop, which multiplies cost.

**Successor:** Eruku (WACV 2026, [arXiv 2510.23240](https://arxiv.org/abs/2510.23240)) drops the transcription requirement and adds stop tokens and classifier-free guidance. Its [code](https://github.com/Blowing-Up-Groundhogs/Eruku) is MIT, but I could not find released weights yet. Worth watching.

### VATr, VATr++ and HWT (GAN / transformer)

**Sources and licences:**
- VATr: [repo](https://github.com/aimagelab/VATr) (MIT), [paper](https://arxiv.org/abs/2303.15269). Weights are in the [vatrpp HF repo](https://huggingface.co/blowing-up-groundhogs/vatrpp) (`license: mit`, about 0.1 B parameters).
- VATr++: [repo](https://github.com/EDM-Research/VATr-pp) has **no LICENSE file**. Its HF card says MIT and points back to that repo, so ask the authors before relying on it.
- HWT: [repo](https://github.com/ankanbhunia/Handwriting-Transformers) (MIT). Weights are a Google Drive zip. A [HF Space](https://huggingface.co/spaces/ankankbhunia/HWT) runs it on `cpu-basic`.

**How they work:** 15 style word crops; one forward pass per word. Output is **32 px high** words, which is too low-resolution for a printed A4 page without upscaling.

**Quality:**
- In VATr's table: VATr FID 17.79, HWT 19.40.
- In VATr++'s table: VATr++ FID 8.27 and HWD 0.75, against VATr 9.12 / 0.86.

**Training data:** IAM (HWT also uses CVL).

**Fit:** cheapest to run by far, and the only class that is realistic in the browser. No timings are published and I did not measure them. My estimate from about 0.1 B parameters and a single pass is a few GFLOP per word, so about 1 TFLOP/page, or roughly 10 s–1 min on A1.

### Stroke route (photo → ink → stroke model)

- [InkSight](https://github.com/google-research/inksight) (Apache-2.0 code; [weights](https://huggingface.co/Derendering/InkSight-Small-p) Apache-2.0, 340 M parameters, TensorFlow) converts photos to digital ink.
  - It works one word at a time, with up to 1,024 output tokens each. Only GPU throughput is reported.
  - Its training mix includes IAM, RIMES and DeepWriting, which carry non-commercial labels in the paper's own table.
  - The model card warns against uses "such as forging handwriting".
- Stroke-based few-shot generators with weights are not usable here:
  - [DSD](https://github.com/brownvc/decoupled-style-descriptors): its licence excludes "incorporation into a commercial product or service", and its BRUSH data is non-commercial.
  - [SDT](https://github.com/dailenson/SDT) (MIT): generates single characters only, and is mostly Chinese.
  - [DiffInk](https://github.com/awei669/DiffInk) (MIT, ICLR 2026): Chinese only.
  - [sjvasquez/handwriting-synthesis](https://github.com/sjvasquez/handwriting-synthesis): no LICENSE file; trained on IAM-OnDB (non-commercial).
- Not viable at launch.

## Browser (ONNX / WebGPU)

- **No published port.** I found no ONNX, TF.js or WebGPU port of any model above. Building one is engineering work.
- **WebGPU support:** onnxruntime-web WebGPU is on by default in Chrome and Edge. Firefox has it behind a flag; Safari 26 has partial support ([ORT docs](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html), [caniuse](https://caniuse.com/webgpu)).
- **Reference point:** Microsoft reports SD-Turbo in-browser "within one second on an RTX 4090" ([blog](https://opensource.microsoft.com/blog/2024/02/29/onnx-runtime-web-unleashes-generative-ai-in-the-browser-using-webgpu/)). That is vendor-reported and on a high-end GPU.
- **Per model (E):**
  - **GAN class (VATr/HWT):** plausible in-browser. About 400 MB fp32 or about 100 MB int8, and seconds per page even on WASM.
  - **DiffusionPen class:** about 190 TFLOP/page. That is tens of seconds on a good discrete GPU and minutes on integrated or mobile GPUs. The WASM fallback is as slow as the server CPU.
  - **Emuru:** a 1.4–2.9 GB download per user is impractical.

## Licences

- **Code:** MIT for DiffusionPen, One-DM, DiffBrush, Emuru, VATr and HWT. I verified this with the GitHub licence API on 2026-11-12.
- **Weights:** MIT where stated (DiffusionPen, Emuru, VATr HF cards). One-DM, DiffBrush and HWT weights carry no separate licence.
- **Upstream models:** DiffusionPen, One-DM and DiffBrush depend on the SD-1.5 VAE, which is under CreativeML OpenRAIL-M. That licence allows commercial use but carries use restrictions you must pass on.
- **Training data is the real blocker:**
  - IAM: "may be used for non-commercial research purpose only" ([IAM page](https://fki.tic.heia-fr.ch/databases/iam-handwriting-database); the site refused direct fetches, so this wording comes from its search-index text).
  - [CVL](https://cvl.tuwien.ac.at/research/cvl-databases/an-off-line-database-for-writer-retrieval-writer-identification-and-word-spotting/): "This database may be used for non-commercial research purpose only."
  - RIMES: CC BY-NC 4.0 ([Zenodo](https://zenodo.org/records/10812725)).
- Whether a model's weights inherit the terms of its training data is legally unsettled. An MIT label on an IAM-trained checkpoint does not remove the risk for a paid SaaS (see `SAAS.md`).
- **Emuru avoids IAM**, but its font corpus has undocumented provenance. Ask aimagelab before charging for its output. This is not legal advice.

## Recommendation

1. **At launch, do not ship "neural on the VPS".**
   - The best-quality open models (the DiffusionPen class) need about 30–55 min of CPU per page on 4 A1 OCPUs, and 1–2 h on the 2-OCPU allowance Oracle now documents. One page would occupy the VPS for most of an hour.
   - Emuru as released needs hours.
   - Most weights are also trained on non-commercial data.
   - Keep glyph harvest as the product, and keep `ml/` off by default with its existing silent classical fallback.
2. **If neural output is wanted after launch**, make it an opt-in, queued **GPU-per-job worker** (Modal or RunPod serverless), at about $0.01–0.05 per page (E). Emuru is the first candidate, for its licence and line-level output. It needs three additions:
   - a KV-cache patch to its `_generate` loop;
   - line crops plus transcriptions from the harvest pipeline;
   - an OCR verify-and-retry step for wrong words.
3. **The only borderline VPS option** is Emuru with that KV-cache patch, batched per page: about 4–6 min/page on 4 OCPU and about 7–12 min on 2 OCPU (E), with about 6 GB RAM. It would work as a one-at-a-time background job with "we'll email you" UX, not as an interactive feature.
4. **Next spike, before any decision:**
   - Run the real Emuru weights, with the KV-cache patch, on the A1 for one page. That replaces the estimates here with measurements and shows the real quality on phone-photo crops.
   - Email the Emuru authors about commercial use of the weights and Font-Square.

## Appendix A: two-thread run

Same laptop, `torch.set_num_threads(2)`. Everything here is **M**.

| Component | 2 threads | 4 threads |
|---|---|---|
| fp32 GEMM 2048³ | 192 GFLOP/s | 214 GFLOP/s |
| DiffusionPen-class UNet, batch 32 | 84.5 ms per word-step (4.22 s/word) | 67.4 ms (3.37 s/word) |
| SD-1.5 VAE decode, 64×256 | 0.97 s/word | 0.85 s/word |
| → DiffusionPen-class page | ≈ 1,557 s ≈ 26 min | ≈ 1,265 s ≈ 21 min |
| Emuru KV-cached, 28 lines | 127 s + 39 s VAE ≈ 2.8 min | 119 s + 25 s ≈ 2.4 min |

GEMM throughput barely grows from 2 to 4 threads on this thermally limited laptop. That is why the A1 conversion above is based on absolute GFLOP/s, not on thread count.

## Appendix B: benchmark script

<details>
<summary>bench_htg.py (random weights, PyTorch 2.10 CPU, diffusers 0.31, transformers 5.1)</summary>

```python
"""CPU compute benchmark for styled-HTG architectures with RANDOM weights.

Timing does not depend on weight values, so this measures the compute cost of
- a DiffusionPen-shaped latent UNet (proxy built with diffusers) + SD-1.5-shaped VAE decoder
- Emuru (T5-large + Emuru VAE) with the official uncached generate loop, and a KV-cached variant
"""
import sys
import time

import torch
from diffusers import AutoencoderKL, UNet2DConditionModel
from transformers import T5Config, T5ForConditionalGeneration

THREADS = int(sys.argv[1]) if len(sys.argv) > 1 else 4
torch.set_num_threads(THREADS)
torch.manual_seed(0)


def timeit(fn, reps=3, warmup=1):
    for _ in range(warmup):
        fn()
    t0 = time.perf_counter()
    for _ in range(reps):
        fn()
    return (time.perf_counter() - t0) / reps


def nparams(m):
    return sum(p.numel() for p in m.parameters()) / 1e6


print(f"torch {torch.__version__}, threads={torch.get_num_threads()}")

# --- raw FP32 GEMM throughput -------------------------------------------------
a = torch.randn(2048, 2048)
b = torch.randn(2048, 2048)
t = timeit(lambda: a @ b, reps=5)
print(f"GEMM 2048^3 fp32: {2 * 2048**3 / t / 1e9:.0f} GFLOP/s")

with torch.inference_mode():
    # --- DiffusionPen-shaped UNet (latent 4x8x32, 320 ch, mult (1,1), 1 res block, attn both levels)
    unet = UNet2DConditionModel(
        sample_size=(8, 32), in_channels=4, out_channels=4,
        down_block_types=("CrossAttnDownBlock2D", "DownBlock2D"),
        up_block_types=("UpBlock2D", "CrossAttnUpBlock2D"),
        block_out_channels=(320, 320), layers_per_block=1,
        cross_attention_dim=320, attention_head_dim=80,
    ).eval()
    print(f"UNet proxy params: {nparams(unet):.1f}M")
    for bs in (1, 32):
        x = torch.randn(bs, 4, 8, 32)
        ctx = torch.randn(bs, 16, 320)
        tt = torch.full((bs,), 500)
        s = timeit(lambda: unet(x, tt, encoder_hidden_states=ctx).sample, reps=3)
        print(f"UNet step batch={bs}: {s*1000:.1f} ms  -> {s/bs*1000:.1f} ms/word-step; "
              f"50 DDIM steps = {50*s/bs:.2f} s/word")

    # --- SD-1.5-shaped VAE decoder, 4x8x32 latent -> 64x256 image
    sdvae = AutoencoderKL(
        in_channels=3, out_channels=3, latent_channels=4,
        down_block_types=("DownEncoderBlock2D",) * 4, up_block_types=("UpDecoderBlock2D",) * 4,
        block_out_channels=(128, 256, 512, 512), layers_per_block=2,
    ).eval()
    print(f"SD VAE params: {nparams(sdvae):.1f}M")
    z = torch.randn(8, 4, 8, 32)
    s = timeit(lambda: sdvae.decode(z).sample, reps=2)
    print(f"SD VAE decode 64x256: {s/8*1000:.0f} ms/word (batch 8)")

    # --- Emuru: T5-large + small 1-channel VAE ---------------------------------
    cfg = T5Config(d_model=1024, d_ff=4096, d_kv=64, num_layers=24, num_decoder_layers=24,
                   num_heads=16, vocab_size=384, feed_forward_proj="relu")
    t5 = T5ForConditionalGeneration(cfg).eval()
    t5.lm_head = torch.nn.Identity()
    vae_to_t5 = torch.nn.Linear(8, 1024)
    print(f"Emuru T5 params: {nparams(t5):.0f}M")

    # Representative A4 line: style line 1000 px (125 latent cols) + 50 style chars,
    # target 60 chars ~ 1440 px (180 cols) + 10 stop cols.
    TEXT_LEN = 50 + 1 + 60 + 1
    STYLE_COLS, NEW_COLS = 125, 190
    ids = torch.randint(0, 384, (1, TEXT_LEN))

    def step_uncached(dec_len, bs=1):
        emb = torch.randn(bs, dec_len, 1024)
        return lambda: t5(ids.expand(bs, -1), decoder_inputs_embeds=emb).logits

    lens = [STYLE_COLS + 1, STYLE_COLS + 1 + NEW_COLS // 2, STYLE_COLS + 1 + NEW_COLS]
    ts = [timeit(step_uncached(L), reps=2) for L in lens]
    for L, s in zip(lens, ts):
        print(f"Emuru official loop: one step at decoder len {L}: {s*1000:.0f} ms")
    # Simpson-ish average over the line
    avg = (ts[0] + 4 * ts[1] + ts[2]) / 6
    print(f"Emuru official (uncached) loop, 1 line of 60 chars: ~{avg * NEW_COLS:.0f} s")

    # KV-cached variant: encoder once, prefill style columns, then 1 col per step.
    def cached_line(bs):
        enc = t5.encoder(input_ids=ids.expand(bs, -1)).last_hidden_state
        pre = torch.randn(bs, STYLE_COLS + 1, 1024)
        out = t5(encoder_outputs=(enc,), decoder_inputs_embeds=pre, use_cache=True)
        past = out.past_key_values
        t0 = time.perf_counter()
        n = 20
        for _ in range(n):
            out = t5(encoder_outputs=(enc,), decoder_inputs_embeds=torch.randn(bs, 1, 1024),
                     past_key_values=past, use_cache=True)
            past = out.past_key_values
        per_step = (time.perf_counter() - t0) / n
        return per_step

    for bs in (1, 28):
        t0 = time.perf_counter()
        enc = t5.encoder(input_ids=ids.expand(bs, -1)).last_hidden_state
        t5(encoder_outputs=(enc,), decoder_inputs_embeds=torch.randn(bs, STYLE_COLS + 1, 1024))
        prefill = time.perf_counter() - t0
        per_step = cached_line(bs)
        total = prefill + per_step * NEW_COLS
        print(f"Emuru KV-cached batch={bs}: prefill {prefill:.1f} s, {per_step*1000:.0f} ms/step, "
              f"~{total:.0f} s for {bs} line(s) -> {total/bs:.1f} s/line")

    evae = AutoencoderKL(
        in_channels=3, out_channels=1, latent_channels=1,
        down_block_types=("DownEncoderBlock2D",) * 4, up_block_types=("UpDecoderBlock2D",) * 4,
        block_out_channels=(32, 64, 128, 256), layers_per_block=2,
    ).eval()
    print(f"Emuru VAE params: {nparams(evae):.1f}M")
    z = torch.randn(1, 1, 8, (STYLE_COLS + NEW_COLS))
    s = timeit(lambda: evae.decode(z).sample, reps=2)
    print(f"Emuru VAE decode one 64x{8*(STYLE_COLS+NEW_COLS)} line: {s*1000:.0f} ms")
```

</details>
