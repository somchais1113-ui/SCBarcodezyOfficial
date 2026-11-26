# SC Barcodezy Official V2.3.8 — Typography & Single-row Toolbar

Baseline: V2.3.7 Advanced Artwork Tools. Changes confined to Carton Studio.

- Text tool (T), multiline dialog, double-click or AV > Edit to edit an existing object.
- Helvetica family: Regular, Light, Bold, Oblique, Bold Oblique, Compressed, Rounded Bold. Derived limited Latin outline geometry from user-supplied reference files; no raw font binaries added. Unsupported characters are reported, not substituted. Thai input is not supported by the supplied Helvetica faces.
- Font size in physical points, alignment, tracking in points, line spacing in percent. Typography controls disabled unless exactly one text object is selected. New text uses previous formatting (initial 36 pt Regular); placed on the selected wall and fitted if necessary. Actual size reflects scaling.
- Glyph outlines are generated as SVG paths and compatible with existing object controls, history and production export. Basic glyph advances, no advanced shaping/kerning engine.
- Single-row toolbar, with More menu for narrower viewports. Ink controls moved to header to the left of Export; Spot settings in a popover. Existing production engine and other modules untouched.

## Tests performed
Chromium via direct local source injection (local URL navigation blocked by test environment): no page errors observed. New multiline text, change Bold/48 pt, all seven outline generators, text alignment/tracking, double-click edit dialog, copy/paste, undo/redo, header ink controls, responsive width checks (390, 768, 1024, 1184, 1440 px), SVG and production PDF export. The tested SVG contains no text or image elements. PDF exports in all three color modes measured 1435 x 550 mm with zero image objects; Spot PDF contains a Separation colorspace. No physical RIP or hosting test performed. Full regression of other modules not rerun; original files preserved byte-for-byte.
