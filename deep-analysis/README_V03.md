# SCWork Technical Outline V0.3 — geometry-verified structural mode

## Quick start
Python 3.11–3.12 recommended. From this directory:
```sh
python -m pip install -r requirements.txt
python run.py
```
Open http://127.0.0.1:8765/structured and click **Load annotated pen sample**. Structural is the default. Original trace remains at `/`. No API key is needed for structured mode.

## Changes from V0.2
- Outer silhouette: bounded cubic/polygon optimization and raster-sampled quality check against the extracted foreground mask. Default maximum symmetric boundary distance 2 working-image px and minimum IoU 0.98; fallback to source contour if candidates fail. Legacy contour/curve mode reproduces V0.2 for comparison. These are sampled raster metrics, not analytic guarantees or physical tolerances.
- Reviewed V0.2 internal paths and smoothing retained; unreviewed smoothed paths use bounded interpolation. Three detail levels share the same outer path: Minimal (no internal paths or callouts), Structural (default), Technical detail (includes explicitly marked optional paths). Hidden tiers remain in JSON; do not need to redraw.
- Seam suggestions now score coherent transverse color change and width variation, not just median color transition. They remain unnamed, unreviewed suggestions, not automatic clip or part recognition.
- Source silhouette overlay, QA status and JSON export in structured UI. Stroke hierarchy: outer, structural and optional detail widths. No arbitrary surface texture is traced in structural mode.

## Integration (backward-compatible request structure)
`POST /api/structured` multipart `image`, `parts` JSON array or null, `settings` JSON object. Additional settings:
```json
{"detail_level":"structural","contour_style":"optimized","geometry_tolerance":2,"min_iou":0.98,"detail_width":0.7,"annotations":true}
```
`detail_level`: minimal/structural/detail. `contour_style`: optimized/legacy. `geometry_tolerance`: 0.5–4 working pixels. `min_iou`: 0.95–1. `detail_width`: 0.2–5 px. Existing parts default to `tier: structural`; optional parts use `tier: detail`. All parts returned even if hidden. SVG structural groups carry `data-tier`; `paths` counts visible artwork paths, not leaders. New `geometry` object includes mask_iou, max_boundary_error_px, area_change_pct, vertices (contour knots, not control handles), legacy_vertices, source_vertices, method, within_guard, legacy_metrics. Report refers to the segmented image and is not a measure of segmentation accuracy. Source image can be resized to working max side 1600 px, no stretching.

Python: `structured(image_bytes, parts, detail_level='structural', geometry_tolerance=2)`.

## Evidence & limitations
- `examples/comparison_v03.png` actual engine render comparison. `pen_v03_structural_annotated.svg/png` editable paths and 8 labels. Original V0.2 files retained unchanged. `pen_parts_v03.json` retains reviewed V0.2 marks and adds two unreviewed optional nib engraving marks manually approximated from photo. No semantic model is trained.
- Fountain pen (571 x 1157 working pixels): default 34 contour knots vs legacy 304; 98.28% mask overlap vs legacy 99.61%, maximum sampled boundary displacement 2 px vs legacy 1 px. Smoothness trades off pixel fidelity; use strict 1 px or legacy when appropriate. Structural paths remain 11, detail 13, minimal 1. The original raw local trace remains available.
- Four synthetic RGBA fixtures (ballpoint, translucent-style gel, mechanical pencil, highlighter) pass default mask QA; these are drawn fixtures, not real product photographs. Real transparent/metal/white-on-white photos still need testing and may segment incorrectly. Candidate count is not a semantic accuracy metric.
- `examples/geometry_report_v03.json` full metrics. 19 automated tests (11 regression + 8 new parametrized cases); JavaScript syntax checked. No live cloud API, browser E2E or Illustrator import validation. No physical dimension verification. The app remains a local development prototype, not a secure public deployment. See retained V0.2/V0.1 documentation below.

---
# SCWork Technical Outline V0.2 — Structured Outline

## New in V0.2
- Structured editor: http://127.0.0.1:8765/structured (original V0.1 trace remains at `/`).
- Extract a locked outer contour from a single object on a plain or transparent background. The outline is derived from the visible image, not reconstructed CAD geometry.
- Internal geometry uses explicitly selected part boundaries, closed outlines, detail lines and label-only anchors. The barrel remains blank unless a designer adds structural lines.
- Optional local PCA-based cross-axis seam suggestions for elongated objects. Candidates are unnamed in semantic terms, unreviewed, and may include reflections or miss actual boundaries. Clip recognition is not automatic.
- Separate SVG groups for the silhouette, named structural paths, and optional callouts. SVG has editable paths, including optional cubic interpolation of manually marked points. Callouts are separate from artwork.
- Import/export normalized part coordinates as JSON; click on source to append points or place an anchor, clear/redraw, rename, delete and undo. Adjust outer/inner stroke independently.

## Run
```bash
python -m pip install -r requirements.txt
python run.py
```
Open `/structured`; click **Load annotated pen sample** to see the reviewed demonstration. For other photos, upload an image, choose **Suggest structural seams** (optional), and review/add/remove part paths before generating. To replace a path, select it, clear its points, and click new points along the source. Use Set label anchor to locate the leader line. Check Reviewed by designer only after verification. Disable Include callouts for clean artwork. Export SVG and parts JSON. Re-import JSON only with the same source image/orientation.

## Integration
`POST /api/structured` multipart form:
- `image`: JPEG/PNG/WebP source (max 15 MB, 24 MP; internal processing scales down to max 1600 px without changing aspect ratio).
- `parts`: JSON array of objects; `null` requests auto seam candidates, `[]` yields only outer contour. Example: `examples/pen_parts.json`.
- `settings`: JSON object, e.g. `{"annotations":true,"outer_width":2,"inner_width":1.15,"background_tolerance":24,"simplify":0.65}`.

Each part: `id` unique ASCII identifier, `name`, `kind` (`seam`, `closed`, `line`, `label`), `points` (normalized [x,y] pairs in 0..1), `anchor` (normalized pair), `label`, `smooth`, `reviewed` (booleans). Coordinates correspond to EXIF-corrected source. The API returns SVG, parts, source width/height, canvas width/height (larger if callouts enabled), number of structural paths excluding annotation paths, and warnings. The original `/api/trace` still supports local/cloud/hybrid; cloud requires credentials and explicit consent. The structured route is local only.

Python: `from sc_outline.structured import structured; result = structured(image_bytes, parts, annotations=False)`.

SVG groups: `outer-contour`, `structural-parts` (subgroups `structure-<id>` with `data-part-name`, `data-reviewed`), `annotations` (subgroups `annotation-<id>`). Groups describe paths and labels, not closed component solids or CAD assemblies. Do not use for dimensional production without calibration and review. Curves may overshoot intermediate clicked points slightly; turn smoothing off if unsuitable.

## Demonstration and testing
- `pen_structured.svg/.png`: original photo-derived silhouette, 11 structural paths including the outer contour, eight named callouts. The sample's part marks were manually selected from the photo; not automated recognition.
- `pen_clean.svg/.png`: same geometry without callouts.
- `pen_candidates.png/.json`: seven automatically suggested seam candidates for this image, unreviewed.
- `pen_technical.svg/.png`: previous V0.1 52-path result retained for comparison.
- Automated tests: `python -m pip install -r requirements-dev.txt`, `python -m pytest -q`. 11 tests passed in development; browser end-to-end and real cloud API not verified. See `examples/test_report_v02.txt`.

---

## Original V0.1 trace documentation (legacy)

# SCWork — Technical Outline Developer Package v0.1.0

Prototype แยกจากแอปหลัก สำหรับสกัด Technical Outline จากภาพสินค้าเป็น SVG path จริง ไม่ใช่ CAD และไม่ใช่โมเดล AI ที่เข้าใจชิ้นส่วนสินค้า

## Quick start (Python 3.11–3.12 แนะนำ)

```sh
python -m venv .venv
# macOS/Linux:
source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python run.py
```
เปิด http://127.0.0.1:8765 แล้วกด Load pen sample > Trace locally > Local SVG. ใช้ภาพ JPG/PNG/WebP ของตัวเองได้ (15 MB, 24 MP, ประมวลผลลดขนาดสูงสุด 1600 px ตามค่าเริ่มต้น). Local ไม่ต้องใช้ API key. Dependencies ต้องดาวน์โหลดในครั้งแรก.

## Engines
- A Local: foreground segmentation จาก alpha หรือสีพื้นหลัง, largest external contour, bilateral filtering, Canny, skeleton graph, polygon simplification, แยก `outer-contour` และ `internal-detail` เป็น SVG groups. ทุก path เป็น M/L/Z (ไม่ใช่ fitted Bézier), ปรับ stroke ได้จริง. เลือก outer, technical, detail.
- B Cloud: ส่งภาพที่ปรับขนาดผ่าน Vectorizer.AI `/api/v1/vectorize` โดยใช้ `stroke_edges` + สีดำ (เส้นระหว่าง shape ไม่ใช่ semantic parts). ใช้ multipart REST ตาม SDK ต้นฉบับใน vendor/; ไม่ต้องติดตั้ง SDK แยก.
- C Hybrid: ใช้ foreground mask + grayscale bilateral preprocessing ก่อนส่ง Cloud, จำกัดสี 8 สี. ไม่ใช่การทำความสะอาด Bézier หลัง cloud และยังไม่ได้พิสูจน์ว่าดีกว่า B. Local settings ที่ไม่เกี่ยวข้องกับ cloud จะไม่ถูกส่งไป (mode, sensitivity, simplify, outer_width); background_tolerance มีผลกับ A และ C. min_length เป็นความยาวพิกเซลใน A แต่ map เป็นพื้นที่ขั้นต่ำ px² ใน B/C.

## Cloud setup (optional; paid API)

macOS/Linux:
```sh
export VECTORIZER_API_ID='your-id'
export VECTORIZER_API_SECRET='your-secret'
python run.py
```
PowerShell:
```powershell
$env:VECTORIZER_API_ID='your-id'
$env:VECTORIZER_API_SECRET='your-secret'
python run.py
```
`.env.example` เป็นตัวอย่างชื่อ environment variables เท่านั้น ไม่โหลดอัตโนมัติ. ต้องยืนยัน checkbox ก่อนกด Cloud/Hybrid; ส่งข้อมูลออกภายนอกและอาจเสียเครดิตทุกครั้ง. ไม่มี retry อัตโนมัติ. ส่ง `policy.retention_days=0` ตาม API แต่ต้องตรวจเงื่อนไขข้อมูลของผู้ให้บริการเอง. ไม่ต้องเปิดเผย key ใน frontend. Cloud SVG บางชนิดอาจถูกปฏิเสธด้วย conservative SVG allowlist (เช่น style); ให้ตรวจตัวอย่างจริงก่อนผ่อนคลายข้อจำกัด. Cloud/hybrid ทดสอบ mock เท่านั้น ไม่ได้ทดสอบ live API.

## Integration into your app

เรียก REST จาก backend หรือ frontend ที่อยู่ origin เดียวกัน; ถ้าแยก origin ใช้ reverse proxy หรือกำหนด CORS เฉพาะ origin ที่อนุญาต. **อย่า deploy public ตามสภาพนี้**: ยังไม่มี user auth, rate limit, quota, CSRF protection, request size enforcement at reverse proxy. เหมาะสำหรับ local dev เท่านั้น. หากใช้ Vercel frontend ให้แยก Python service หรือปรับ deployment ให้รองรับ native dependencies. ไม่ใช่ static-only app.

```js
const form = new FormData();
form.append('image', file);
form.append('engine', 'local'); // local | cloud | hybrid
form.append('settings', JSON.stringify({mode:'technical', sensitivity:45, min_length:16, simplify:1, outer_width:2, inner_width:1, background_tolerance:24}));
// cloud/hybrid only after explicit permission to upload and charge
form.append('consent', 'false');
const res = await fetch('/api/trace', {method:'POST', body:form});
const result = await res.json();
if (!res.ok) throw new Error(JSON.stringify(result.detail));
const svgBlob = new Blob([result.svg], {type:'image/svg+xml'});
// Use isolated <img src=...> preview; revoke object URL when no longer needed.
// Do not inject untrusted SVG using innerHTML; validate/sanitize before importing into an editor.
```
Response: `{svg, engine, paths, vertices, warnings, width?, height?}` (width/height available in Local; use cloud SVG viewBox for B/C). `GET /api/status` returns version and cloud_configured (no secrets). OpenAPI docs `/docs`. `sc_outline.engine.extract(bytes, Settings(...))` can also be imported directly into a Python app.

## CLI / local output

```sh
python -m sc_outline.cli examples/pen.jpg -o outline.svg
python -m pip install -r requirements-export.txt
python -m sc_outline.cli examples/pen.jpg -o outline.pdf
python -m sc_outline.cli examples/pen.jpg -o outline.png --width-mm 80 --dpi 600
```
Optional CairoSVG requires system Cairo (e.g. `brew install cairo` or `apt install libcairo2`); see CairoSVG docs for Windows. Browser UI exports SVG only. CLI exports local vector PDF and PNG. `--width-mm` specifies **page width**, not physical product width. Need calibration and source dimensions for real 1:1. PNG defaults to working pixel dimensions unless width-mm is given.

## Test results / sample

`examples/pen.jpg` cropped from user-supplied screenshot, not high-res original. Default local output: 52 editable paths / 267 polygon vertices; outer-only 1 path / 63 vertices; detail 84 paths / 439 vertices. PNG previews and actual SVGs included. Some seams are incomplete and reflections remain; no semantic part recognition, no automatic curve fitting, no manual editing UI, no anchor editing, no CAD or DXF output. Cloud output not evaluated. On complex backgrounds or multiple objects the largest contour heuristic can fail; white-on-white material and transparency can be lost. Use contrast/plain background, inspect every result.

```sh
python -m pip install -r requirements-dev.txt
python -m pytest -q
```
7 tests passed in authoring environment (local SVG, sample, settings, HTTP endpoint, missing credentials, mocked cloud/hybrid). UI browser interaction not end-to-end tested. No external credits used. See examples/test_report.txt.

## Source / references
- `vendor/vectorizer-ai-python-main.zip`: supplied original SDK archive, unchanged; its Apache 2.0 LICENSE is inside archive. REST field names from `docs/VectorizationApi.md` and `vectorizer_ai/api/vectorization_api.py`.
- https://vectorizer.ai/api/documentation — confirmed `stroke_edges` enum and stroke options.
- https://vectorizer.ai/api/outputOptions — meaning of stroke edges.
- Proposed next phase: test 20–30 source product photos (plastic/metal/transparent), compare A/B/C, implement manual path cleanup and curve fitting only after measuring Draft time savings.
