# Carton Studio V2.4.0 — Real Photo Guided Tracing

Based on V2.3.9 and the supplied SC_Outline_Real_Photo_Test(1).zip evidence package. The latter contains manually guided paths, automatic reference results, not a new engine. Source images and guided Parts JSON are embedded for Fountain and Gel pen examples only. Auto generates fresh unverified candidates.

Changes:
- Geometry Guard: polygon raster-mask IoU >= 0.98 and no differing foreground pixel farther than one Chebyshev pixel from the other mask; progressively lower simplification if necessary. If even raw polygon fails, export is blocked. Default requested simplification 2 px. This is NOT CAD, measured dimensions or ground-truth segmentation accuracy.
- All structural lines displayed on source, orange unreviewed / green reviewed; click to select, drag existing selected anchors in normal selection mode. Drag invalidates review. Outer contour unchanged by edits to parts.
- Sample chooser with guided and automatic modes. Guided paths remain unreviewed until acknowledged. JSON import accepts arrays and reports with parts arrays; confirm matching original image/orientation.
- Clean SVG excludes annotations. Carton production engine and other modules unchanged.

Chromium test (local scripts injected, not deployed):
- Fountain guided: 15 rendered paths, 99.01% mask IoU, 161/1819 contour points; Gel guided: 7 paths, 99.15%, 100/1507 points. Both guard passes. These browser results differ from Python reference metrics due to segmentation and sampling differences.
- Both: drag point, unchanged outer path, review gate, clean SVG download, Auto (8 candidates each), wrapped JSON import passed.
- Gel: Add to Carton, K-only PDF download passed. No page errors during test. PDF color modes CMYK/Spot, real RIP and hosted deployment not retested. No semantic part detection or physical dimensional accuracy claimed.
