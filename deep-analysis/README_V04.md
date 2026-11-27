# SCWork — Technical Outline V0.4 / Deep Analysis Lab

**Experimental developer package, not an automatic semantic AI release.** The existing V0.3 tools remain available at `/` and `/structured`. The new lab is `/deep`.

## Run

Python 3.10–3.12 recommended. From the extracted project root:

```sh
python -m pip install -r requirements.txt
python run.py
```

Open http://127.0.0.1:8765/deep. Choose a real-photo sample, then compare **Automatic candidates** with **Load human-reviewed sample hints → Reconstruct reviewed regions**. For new pictures, use the axis canvas to edit cuts and draw overlay polygons; edit names and detail polygons in JSON. The source orientation is preserved at export. This local UI does not require an API key. Optional OCR requires a separate Tesseract executable on PATH (English trained data). The local core never uploads the images. The inherited cloud endpoints retain their separate opt-in consent.

## What actually runs

1. Decode image with EXIF handling, extract a foreground mask (single product / plain contrasting background), identify longitudinal axis by PCA.
2. Analyze cross-axis Lab color transitions, coherence across the product and width changes. These are seam **proposals**, not semantic recognition. OCR optionally processes upscaled 0°/180° views; it only supplies text candidates and does not infer geometry or produce letter paths.
3. Accept ordered seam hints, separate overlay polygons (e.g. clip), optional visible detail polygons. The original image hash binds the hints to that exact source. Partition the observed foreground into disjoint base/overlay masks. Hidden or occluded geometry is not reconstructed.
4. Fit independently editable SVG paths with bounded cubic fitting or source fallback, keep holes in part paths (even-odd fill), emit a clean assembled drawing with single seam strokes plus separate closed visible-region SVG groups and annotations.
5. Export a QA report: outer contour IoU, maximum sampled boundary distance, per-contour checks, raw partition coverage/overlap, provenance of each part, review warnings. The mask coverage is a partition identity, not evidence that semantic part boundaries are correct. Per-contour fitting QA is not a composite vector accuracy or a physical measurement. All results remain `draft_needs_review`.

## Integration API

- `POST /api/deep/analyze` multipart `image`, optional `ocr=true` → axis preview (data URI), `source_sha256`, `axis_size`, `source_to_axis` 2x3 affine matrix, candidate cuts, OCR output.
- `POST /api/deep/reconstruct` multipart `image`, `hints` (JSON string or `null`), optional `ocr`, `tolerance` (0.5–4 working pixels) → `svg`, `parts_svg`, `annotated_svg`, `report`, `mask_preview`.
- `GET /api/status` → version 0.4.0. Legacy routes are retained.

Example:

```sh
curl -s -F image=@examples/deep/gel_source.jpg -F ocr=false http://127.0.0.1:8765/api/deep/analyze
curl -s -F image=@examples/deep/gel_source.jpg -F 'hints=<examples/deep/gel_hints.json' http://127.0.0.1:8765/api/deep/reconstruct
```

A semantic Vision service can supply the hints contract after inspecting the axis image; validate it, do not accept invented geometry. Example files `examples/deep/*_hints.json` are **human-authored** and source-specific. In axis pixels: `cuts` strictly increasing x positions; `names` one per interval; `overlays` list of objects with `name`, `polygon` (array of [x,y]), optional `details` (array of polygons). Keep `source_sha256` unchanged. Unknown regions should stay unclassified, not assigned a guessed part name. No automatic vision-to-hints provider is bundled; this is a deliberate integration boundary.

### Optional prompted segmentation adapter (SAM)

`sc_outline/semantic.py` implements a callable local SAM provider using a user-supplied model checkpoint and installed `segment_anything` / `torch`. It takes an explicit part polygon prompt (box derived from its mask), selects among masks by agreement with the hint, and falls back to the manual hint if agreement is too low. It does not independently discover or name pen parts. No checkpoint is bundled and no model is downloaded implicitly. **Not executed against a real SAM model in this environment**; only the provider interface and fallback were tested using stub masks. The HTTP endpoints use the local engine, not SAM; use the Python CLI for this optional integration.

```sh
python -m sc_outline.deep_cli examples/deep/gel_source.jpg output --hints examples/deep/gel_hints.json --ocr
# Optional after installing model dependencies and obtaining checkpoint:
python -m sc_outline.deep_cli examples/deep/gel_source.jpg output_sam --hints examples/deep/gel_hints.json --sam-checkpoint /path/to/checkpoint.pth --sam-type vit_b --device cpu
```

## Real-photo benchmark

`examples/deep/` contains the two provided photos, axis images, hints, automatic and guided SVG/PNG, individual part SVG, annotation SVG, colored partition previews, overlay with source, JSON and test reports. `benchmark.png` compares them at identical scale per row. Regenerate with `python examples/deep/build_examples.py` after installing `cairosvg` (optional preview-only dependency, requires Cairo). The provided sample hints are manual visual interpretations, not ground truth and not automatically recognized. OCR was actually run but returned no tokens above the configured confidence threshold on either photo. Local runtime is short; no artificial delay. Actual timings are stored in JSON.

## Tests and remaining work

`python -m pip install -r requirements-dev.txt` and `python -m pytest -q`. 28 tests passed locally, including 9 new tests of partitioning, API, source validation and provider stubs; old version assertion updated to 0.4.0. Browser JavaScript syntax checked, but no browser E2E tests. Real SAM and Vectorizer.AI cloud were not tested. No automatic semantic part detection, curved seam fitting or engineering dimension inference in this release. Small tips, holes, transparent surfaces and oblique joints need designer review. For the next experiment, run a real segmentation model with explicit clip/part prompts, compare masks to designer-labeled reference masks, score part IoU and seam deviation separately, and measure designer cleanup time. Do not ship as a professional automatic tracer until real benchmark quality is verified.
