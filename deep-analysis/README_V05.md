# SCWork — Technical Outline V0.5 / Semantic Recognition Experiment

**Research package, not a quality-approved automatic tracing release.** Built directly on V0.4, keeping all legacy UI and APIs unchanged (the existing web server still reports V0.4). New V0.5 entry point is Python CLI / importable functions, not a UI replacement.

## Honest test result

Environment: CPU-only PyTorch, no Transformers, no cached Grounding DINO or SAM2 weights, model host DNS unavailable. The foundation adapter was implemented against the published Transformers interfaces but **has not run actual inference here**. The only executed learned model is a scikit-learn random forest trained using approximate manually authored V0.4 masks. It is a small supervised semantic baseline, not a deep network or foundation model. No manual target mask is used during held-out inference. No artificial delay. No cloud uploads.

Two real photos, train on one and test on the other, using six coarse part categories (upper housing includes push button; grip steps merged; nose cone and nib grouped). The target manual masks are approximate axis partitions, not independently verified physical ground truth. At 0.65 vote threshold: fountain part mIoU 13.71%, unknown 91.35%; gel part mIoU 12.18%, unknown 48.81%. Without rejection: 41.94%, 26.28% respectively. **Both fail visual and semantic quality.** Geometry lock cannot compensate for incorrect labels. Do not use these outputs for production. Unknown pixels are intentionally not assigned a guessed part. This experiment establishes the need for pretrained part models or more varied labeled training images, not a claim that the output improved.

## Run the local learned baseline

Python 3.10–3.12 recommended, use a clean virtualenv. From package root:

```sh
python -m pip install -r requirements-semantic.txt
python -m sc_outline.recognition_cli examples/deep/gel_source.jpg out/gel --backend local --training examples/deep/fountain_source.jpg examples/deep/fountain_hints.json
```

Repeat `--training IMAGE HINTS` for additional labeled samples. The current local baseline assumes the elongated axis has consistent orientation (top to tip in the two supplied photos); other orientations and product types are unvalidated. Train and evaluate on different SKUs. The reference masks merge fine part types into coarse roles. Model trains in memory (no serialized untrusted model objects).

## Run pretrained Grounding DINO + SAM2 (external machine)

```sh
python -m pip install -r requirements-foundation.txt
python -m sc_outline.recognition_cli examples/deep/gel_source.jpg out/foundation --backend foundation --device cpu --allow-download
```

`--allow-download` explicitly permits model downloads only; image inference stays on that machine. Without it, weights must already be cached or use `--dino /local/model-dir --sam /local/model-dir`. Defaults: `IDEA-Research/grounding-dino-tiny`, `facebook/sam2.1-hiera-tiny`. GPU with `--device cuda` recommended if available. Model downloads can be large; check licenses and dependencies before commercial integration. No API key required for public weights; networking may be required to obtain them. No silent local fallback. The adapter asks the detector for class-specific boxes, calls SAM2 for candidate masks, rejects low mask score or poor foreground overlap, rejects masks covering most of the pen, resolves competing classes conservatively and leaves unresolved pixels unknown. It does not guarantee the models recognize fine-grained pen parts. Confidence thresholds are uncalibrated. Actual foundation inference and quality are unverified.

Official implementation references:
- https://huggingface.co/docs/transformers/v4.57.0/model_doc/grounding-dino
- https://huggingface.co/docs/transformers/v4.57.0/model_doc/sam2
- https://huggingface.co/facebook/sam2.1-hiera-tiny

## Integration

`sc_outline.recognition.run_local(data, model, training_hashes, threshold)` returns SVG and report plus label maps, aligned image and source. `sc_outline.foundation.run_foundation(data, provider)` returns result, source label map, source image. `vectorize_labels(labels, mask, contour)` accepts source-space uint8 labels from an external segmentation model, using the V0.4 bounded curve fitting. Label IDs are declared in `NAMES`. 0 background; 1 unknown; 2–7 coarse classes. Outputs are `svg.svg` (assembled draft), `parts_svg.svg` (editable grouped visible-region closed paths), `label_ids.png` (raw integer labels), `parts_preview.png` and `report.json`. No hidden geometry, no physical dimensions, no fine labels. Unknown regions and overlaps require user review. Shared boundaries may have duplicate strokes and some tiny mask components can be omitted from vector output. Raw mask QA is not proof of SVG accuracy; no approved-export claim is made. The older `/deep` UI and API remain as documented in `README_V04.md`.

## Reproduce tests

```sh
python -m pip install -r requirements-semantic.txt -r requirements-dev.txt
python -m pytest -q
python -m pip install cairosvg
python examples/semantic/build_benchmark.py
```

See `examples/semantic/benchmark.png`, `benchmark_report.json`, per-image reports and the raw masks, not a hand-polished drawing. Tests include legacy regression, label source validation, competing-class ambiguity, unknown regions, and actual local learned inference. Foundation adapter's mask conflict resolver is tested; model runtime is not.

## Next quality gate

Use real foundation weights on the same images, inspect detections before vectorization, compare to independently marked per-part masks (clip silhouette, tip, grip, ring; finer taxonomy), add 20–30 diverse held-out photos and measure per-part IoU and cleanup time. No UI expansion until model passes. If generic open-vocabulary models fail small parts, use designer-reviewed masks to fine-tune a dedicated pen-part segmentation model. Do not reduce quality requirements to silhouette overlap alone.
