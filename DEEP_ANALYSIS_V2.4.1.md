# SC Barcodezy Official V2.4.1 — Grounded Deep Analysis Integration

Base: supplied V2.4.0 Real Photo Tracing Fully Package. Standard/Structured/Guided/Auto tracing and other modules are preserved. V0.6 research engine is bundled in `deep-analysis/`, with upstream source provenance and license references in `deep-analysis/SOURCES.md`.

## Quick start (local development)
1. Extract the full ZIP. Open Terminal at the SCBarcodezyOfficial folder.
2. `cd deep-analysis`
3. Create an isolated Python environment (Python 3.11 recommended; choose a PyTorch build appropriate to your hardware).
   - macOS/Linux: `python3 -m venv .venv` then `source .venv/bin/activate`
   - Windows PowerShell: `py -3.11 -m venv .venv` then `.\.venv\Scripts\Activate.ps1`
4. `python -m pip install -r requirements-grounded.txt`
5. The first model download requires network and disk space. Explicitly enable it:
   - macOS/Linux: `SC_ALLOW_DOWNLOAD=1 python barcodezy_service.py`
   - Windows PowerShell: `$env:SC_ALLOW_DOWNLOAD='1'; python barcodezy_service.py`
   For already cached models: `python barcodezy_service.py` (default no downloads). Set `SC_DEVICE=cpu` (default), or `cuda` for compatible GPU/PyTorch installations. `SC_DINO` and `SC_SAM` may point to local model directories. Install Tesseract separately if OCR is required; OCR is optional and does not identify part geometry.
6. Open `http://127.0.0.1:8766/carton.html` in your browser. Box Studio > Product Trace > choose an image > Open Deep Analysis > Start Deep Analysis. Check the model service status, actual pass history, source/overlay/vector and report. A blocked result remains downloadable as draft, but cannot enter the carton. A draft that clears the engine gate requires user review before adding to the library.

No images are sent before clicking Start Deep Analysis; this service is bound to loopback and does not use a third-party inference API. Model files are downloaded only when explicitly enabled. Jobs run in a single local worker; in-memory history holds at most 3 jobs and is lost on restart. Closing the modal does not cancel a running job. Do not expose this development service publicly. Hosted use needs a private GPU/CPU worker, authentication, a durable job store, origin/security configuration, rate limits, and production deployment testing. The ordinary static Barcodezy deployment remains functional; the new mode reports service unavailable without the same-origin API. Do not put model weights or API secrets in the static website.

## Integration
`barcodezy_service.py` serves static files from allowlisted pages and assets, `/api/deep/health`, POST `/api/deep/jobs` (multipart `file`, `ocr`, header `X-SC-Deep: 1`), GET `/api/deep/jobs/{id}`, GET `/api/deep/jobs/{id}/result`. The engine retains V0.6 six main passes and two conditional retries. Missing dependencies or weights are explicit failures; no fallback to fast tracing. The UI offers Draft SVG, Parts SVG, QA JSON and gated add-to-carton; the new UI does not provide a part-anchor editor or automatic callout generation. The source is decoded with EXIF correction and downsampled to at most 1600 px by the inherited V0.6 engine; this is not engineering-scale geometry. Add-to-carton uses initial longest artboard side 100 mm, not measured dimensions. Adjust actual placement and confirm production conversion before printing. Shared mask boundaries may still create duplicate strokes. New mode's K/CMYK/spot PDF export, RIP behavior, hosted E2E and actual AI quality are NOT verified.

## Verification
- 39 inherited engine tests plus 4 API integration tests (43 passed). API tests use explicitly named test doubles, including actual geometry/empty detection, failed model initialization, invalid upload and cross-origin blocking.
- Chromium direct-script injection (browser navigation to HTTP and test domain was blocked by sandbox administrator): Guided tracing, missing dependencies display, blocked result gate, draft SVG download, reviewed test fixture add to library, no page errors. Test fixtures are not model inference. See `deep-analysis/tests/browser_integration.py`.
- Python local HTTP health endpoint returned successfully from a non-browser client; Transformers unavailable, Model Weights not present, model inference not run. No claims of visual quality improvement.
- Existing production engine not changed. Regression tests for all Barcodezy modules were not rerun. See prior base report for prior checks.
