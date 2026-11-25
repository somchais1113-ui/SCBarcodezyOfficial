# Carton Studio V2.3.4 — Compact Workspace / Rendering Hotfix

Base: official V2.3.3. Changes are Carton-only.

- Reset the Canvas transform, alpha and composite mode and clear all pixels before every 3D frame. Restore transforms in a finally block even if an artwork draw fails.
- Preserve the hidden ink mode select when moving its visual controls into the structure panel; the renderer and production engine use this same select.
- Resize the Canvas backing store to match the actual displayed aspect ratio (DPR capped at 2). No changes to exported physical geometry.
- Preview height on desktop: clamp(120px,17vh,205px), approximately half of the prior flat workspace height. 2D and 3D previews are aligned above a full-width, three-column tools row. Mobile layout stacks the previews and tools.
- Export CTA opens a modal with all existing output options and preflight/confirmation controls. Workspace status remains visible outside the dialog.
- Corrected inherited keyboard shortcut null-selection error and internal copy/paste handler; retained image paste via paste event when internal paste is not intercepted. No placeholder written to OS clipboard.

## Verified in Chromium (local HTML/CSS/script injection, bundled PDF dependencies loaded directly)
- No page errors on initialization and the exercised interactions.
- Default K-only mode, automatic size width 156 mm, standard symbol set and editable country.
- At 1440x1000 viewport, both previews 170 CSS px high; tools span full width.
- 100 successive 3D frames: last frame exactly equals fresh offscreen render at same angles; context transform identity after rendering. Actual pointer rotation also exercised.
- Ctrl and Meta copy/paste both create a new object (simulated key events in Chromium, not native macOS/Windows hardware).
- Ink icon selection, Export dialog open/close, preflight and PDF downloads in black, spot, CMYK; each PDF has expected page dimensions (1435 x 550 mm in test).
- Production ZIP in CMYK contains 8 entries. 390px viewport has no horizontal page overflow.
- JS syntax and archive CRC verified. No changes to other modules or production color engine.

## Limits
- No deployed-hosting or real machine/RIP test in this revision. Prior color-engine constraints remain (no specific ICC or PDF/X validation). At compact preview height, use Zoom when editing small artwork. Copy/paste is internal to the current page; external clipboard availability is browser-dependent.
