# V2.3.9 — Structured Product Outline

Baseline: V2.3.8. Scope: Product Trace dialog only; Master Workbench, typography, production color engine and other modules retained.

Source: SC_Technical_Outline_V0.2_Developer_Package(1).zip, particularly `sc_outline/structured.py`, `sc_outline/engine.py`, `examples/pen.jpg`, `examples/pen_parts.json`.

- Added default Structured mode, browser-native port of largest foreground contour, Lab background distance, morphological closing, PCA cross-axis seam candidates and manually authored normalized paths. Original Outline/Standard/Detailed modes remain available.
- Separate outer/inner stroke weights at nominal 100 mm long side, background tolerance, path simplification. Actual final strokes scale with artwork.
- Review, rename, add/delete/edit points, undo last point, closed and smooth paths, label-only parts, label anchors. Unreviewed paths require explicit acknowledgment; incomplete paths block placement and clean export.
- Clean SVG and Parts JSON export/import (same image/orientation). Callouts are preview only; not included in carton artwork. Included original pen sample and its annotated part coordinates, not automatic part recognition.
- No Python runtime, server, cloud or API key required. Browser port uses pixel-boundary contours, nearest-sampled cross-axis color and JS simplification, not identical to OpenCV output. Largest component can miss disconnected or transparent parts. Check visible silhouette and reflections; image geometry is not CAD dimensions. Changing foreground settings recomputes outer contour. No semantic AI or cloud/hybrid integration.

## Validation
- Original Python V0.2 structured test suite: 4 passed.
- Chromium, local script injection: reviewed pen sample 11 structural paths including silhouette, 8 callout labels; outer path unchanged after callout toggling and manual part edit; clean SVG excludes annotations; 6 unreviewed auto seam candidates (Python source example has 7, port is not numerically identical); explicit acknowledgment gate; incomplete path blocked; real mouse clicks add points; original Standard mode works (55 paths for this sample); no page errors.
- Added clean artwork to carton and downloaded K-only production PDF. pdfinfo reports 4067.72 x 1559.06 pt (1435 x 550 mm); pdfimages lists no images. CMYK/Spot production engine untouched, not separately retested in this release.
- Hosting, RIP and varied product images not validated. Parts JSON import/export UI implemented but not round-trip browser tested in this run.
