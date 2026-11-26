# Carton Studio V2.3.6 — Design Workbench

Base: V2.3.5 Balanced Preview. Changes confined to carton.html, assets/carton.css, assets/carton.js and this changelog.

- Dark header with Export CTA, toolbar and live input carton dimensions.
- Desktop three-column workbench (~20/55/25): Box Setup + Ink + Artwork & Symbols, 2D Dieline, 3D Preview + Properties. Responsive stacking below 850 px, with scrollable desktop tools and inspector.
- Toolbar: undo/redo for valid geometry and artwork edits (40 snapshots, not import library or ink settings), zoom, Fit, Grid, Pan and workspace expansion (Esc exits).
- Inspector: X/Y/W/H in mm, aspect-ratio-locked size, left/center/right alignment within current panel, standard-element rotation and existing controls. Existing Copy/Paste retained.
- Five visual ink swatches: C/M/Y collectively select CMYK, K selects single black, Spot selects single named spot; no independent process-ink toggles.
- Production engine, standard artwork, original geometry calculations and other modules unchanged. The PDF/X/ICC and supplier/RIP limitations from V2.3.2 remain.

## Verification
Chromium with local source files injected because navigation is blocked in the test environment. Tested desktop at 1440 and 1184 px, tablet 768 px and mobile 390 px: no document horizontal overflow or runtime errors. Verified dimension display, symbol insertion, X/Y/W/H via inspector, alignment, undo/redo including country change, grid, expanded workspace and all ink mode selectors. Generated a black production PDF through the existing engine with PDF library preloaded and download blob captured in test. Actual deployment, OS-specific browser behavior, PDF import and RIP workflow not retested.
