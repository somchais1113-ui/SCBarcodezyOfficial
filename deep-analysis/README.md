# SCWork — Grounded Technical Drafting Engine V0.6

**Developer research package. NOT a production-approved engine.**

Direction: Understand First. Draft Part by Part. Verify Before Export.

V0.6 extends V0.5 without changing the existing web UI or API; the old FastAPI server intentionally remains 0.4.0. Use the new Python CLI or importable `sc_outline.grounded` module. All previous engines and examples are retained. See README_V05.md / README_V04.md / README_V03.md for legacy integration.

## What is new

- Official Grounded-SAM-2 image demo source included in `vendor/Grounded-SAM-2/`; Git blob SHA verified against the retrieved upstream source. The demo requires its upstream repository and is reference material only.
- New adapter using Grounding DINO text-conditioned detection and Transformers SAM2 box-conditioned masks. No new model trained. Both models are loaded once per CLI process.
- Six analysis views: original image, tight object crop, axis-aligned full view, and three overlapping axis crops. Every candidate mask is mapped back to the original decoded-image coordinates. Cropping may increase relative part size for the detector, but cannot restore missing pixels.
- Six coarse semantic roles: upper housing/cap/button, clip, barrel, grip, tip/nib/nose, ring/collar. Each has separate prompts and alternative retry prompts. Fine sub-parts are not separated yet.
- Selects SAM mask candidates by quality score, rejects poor foreground support, near-whole-product masks, and cropped masks touching tile edges. A minimum of two different view families must agree before the mask is used. Same-class repeated prompts do not count as independent views.
- Cross-class disagreement and insufficient consensus stay Unknown; no fabricated seams. Retry unresolved classes only, on two views. Scores are heuristics and uncalibrated; repeated views are correlated, not proof of correct semantics.
- Existing V0.5/V0.4 vector engine generates assembled and grouped visible-region SVG drafts, preserving source pose. Shared boundaries may have duplicate strokes; tiny details may be omitted. Outer geometry QA compares the extracted mask, not true geometry or real-world dimensions.
- Machine-readable report: model IDs, settings, per-pass timings, candidate provenance, consensus and conflicts, unknown fraction, per-class vector QA, blocking reasons. Export always needs review; `blocked_needs_review` when excess unknown area (>20% default), fewer than three confirmed coarse classes, or outer geometry guard fails. These heuristic thresholds are not validated production standards. Draft SVGs are still saved for inspection, not approved for manufacture.

## Actual test status

39 tests passed (33 legacy + 6 new). The new tests exercise crop-to-source transforms on the two real pen photographs, agreement logic, ambiguous pixels, mask quality and retry with explicit test doubles. They do not measure foundation-model accuracy. Real-photo preflight images and reports are provided in `examples/grounded/`. No new AI-generated tracing is claimed.

Foundation model live attempt fails here: `ModuleNotFoundError: No module named 'transformers'`. Model weights are also unavailable and direct network access to GitHub fails. No fallback to manual hints, Random Forest, or fake AI results. No actual Grounding DINO/SAM2 accuracy result or timing is available. `examples/grounded/live_attempt/failure.json` records the failure. The model API adapter was checked against published docs and upstream code but remains unvalidated at runtime. Do not market this as working automatic semantic tracing yet.

## Run on a connected computer

Use Python 3.10–3.12 in a clean virtual environment. CPU is supported by the intended code path; NVIDIA CUDA is preferable for multi-pass. Apple Silicon users may start with CPU (MPS not tested). Ensure sufficient disk/RAM for model downloads; install matching torch/torchvision builds from PyTorch if GPU-specific installation is required.

```sh
python -m venv .venv
# macOS/Linux: source .venv/bin/activate
# Windows: .venv\Scripts\activate
python -m pip install -r requirements-grounded.txt
python -m sc_outline.grounded_cli examples/deep/gel_source.jpg out/gel_v06 --device cpu --allow-download
python -m sc_outline.grounded_cli examples/deep/fountain_source.jpg out/fountain_v06 --device cpu
```

`--allow-download` allows downloading public model files, not uploading product images. The second command uses cached files. Change to `--device cuda` if configured. Provide local model directories using `--dino /path/to/model --sam /path/to/model` for offline inference. Default model IDs are IDEA-Research/grounding-dino-tiny and facebook/sam2.1-hiera-tiny. Model revisions are not pinned; record tested revisions before production. `--ocr` enables optional Tesseract analysis if installed; OCR metadata does not determine mask geometry. `--no-retry` disables the two conditional retry views. All paths for output must be new/empty.

No artificial waiting is inserted. Runtime depends on the model, hardware, and number of detections. Terminal prints real per-pass timings. Without model weights use preflight only:

```sh
python -m pip install -r requirements.txt
python -m sc_outline.grounded_cli examples/deep/gel_source.jpg out/gel_preflight --preflight
```

Optional download of upstream source (does not install/execute it):

```sh
python scripts/fetch_upstream.py --dest upstream
# add --clone to download the full three upstream repositories
```

The included reference demo is already verified, so this step is optional. See SOURCES.md for provenance and licenses.

## Integrate in SCWork app

```python
from sc_outline.grounded import HFBackend, Settings, process
backend = HFBackend(device='cpu', allow_download=False)  # reuse one instance
result, labels, source_rgb = process(image_bytes, backend, Settings(), progress=print)
svg_draft = result['svg']
parts_svg_draft = result['parts_svg']
qa = result['report']
# review QA and overlay before accepting any draft
```

Use a Python worker service, not a browser-only static frontend. Inference is synchronous; queue heavy jobs and serialize access to a shared GPU model when integrating. V0.6 does not expose a new HTTP endpoint or modify the old UI. `grounded_cli` saves `draft_svg.svg`, `draft_parts_svg.svg`, `label_ids.png`, `parts_preview.png`, `source_overlay.png`, and `report.json`; on failure it saves `failure.json` and exits nonzero. Use the source-space label map for further component splitting. Existing labels are 0 background, 1 unknown, 2–7 roles (see `NAMES`).

## Reproduce and evaluate

```sh
python -m pip install -r requirements-semantic.txt -r requirements-dev.txt
python -m pytest -q
python scripts/evaluate_run.py examples/deep/gel_source.jpg examples/deep/gel_hints.json out/gel_v06
```

The evaluation script compares source-coordinate labels with approximate manually marked V0.4 reference masks, checks source hash and provider, and reports part IoU/unknown. It is not independent ground truth; do not train on the target reference. Benchmark real foundation model output on both images, then 20–30 diverse held-out products and a designer-marked reference set. Compare actual clip / grip / tip boundaries and cleanup time. Proceed to UI integration only after human review. Model quality has not yet been shown to exceed V0.2.
