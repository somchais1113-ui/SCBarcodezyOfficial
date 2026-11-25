# SC Barcodezy Official V2.3.1 — Carton Studio

Baseline: supplied SCBarcodezyOfficial.zip (V2.3). This release changes Carton Studio only.

## Changes
- Drag & drop or click to select multiple PNG, JPEG, WebP, SVG or PDF files. Existing PDF component dialog remains.
- Mandatory framed SIZE on the leftmost lower flap, using entered L × W × H in mm, not the adjusted crease dimensions. Updates automatically; cannot be deleted or dragged. Helvetica Bold text rendered as outlines derived from the supplied reference font; no additional raw font distributed.
- Standard Elements: Stacking Limit (editable 1–99, default 4), Keep Dry, Up Arrow, Handle with Care Thai/English, DHAS Shipping Mark (editable uppercase country per placed object, default CHINA for reference only). Select or drag onto the dieline, move, set width in mm, rotate in 90° increments, duplicate or delete. Reference symbols were traced from the supplied screenshots, not original certified artwork.
- Vector artwork supported in PDF and SVG; monochrome PDF uses existing black/spot ink luminosity-mask engine. Monochrome SVG uses coloured vector paths for new standard assets. Existing imported assets retain the original export logic.

## Defaults awaiting production approval
- SIZE: 60% of usable first bottom flap width, capped at 120 mm; further scales down to fit flap height. Centered in flap. Entered dimensions are printed regardless of the inner/outer/crease selection; check supplier requirement.
- Initial widths: symbols 35 mm, handling text 110 mm, shipping mark 90 mm, reduced when necessary to fit selected panel. Editable through existing width field.
- Confirm actual country of origin and allowable stacking load before release. Check traced artwork against master vector if exact compliance is required.

## Validation
- JavaScript syntax checked for all modified/new scripts.
- Chromium integration test (HTML and scripts injected from exact local files because file/localhost navigation is blocked in test environment): initial render, mandatory size, dimensions 395 × 250 × 400, editable country, independent duplicates, 90° rotation, removal, stack count, standard library, DataTransfer SVG drop, SVG and PDF exports in Original / Black / Blue, physical PDF page size checked (1325 × 650 mm), no browser runtime errors during those tested flows.
- Lazy PDF libraries loaded from original bundled files in test harness. Native PDF import dialog, direct hosting, real Illustrator/RIP/printer acceptance were not re-tested. Other modes unchanged at byte level (excluding release notes). Original Git metadata and macOS packaging metadata excluded from delivery ZIP.

## Usage
Extract the entire ZIP and keep the folder structure. Open index.html or deploy all extracted files as a static site. Go to Carton Studio. For PDF operations use a local HTTP server or static hosting if browser file restrictions apply.
