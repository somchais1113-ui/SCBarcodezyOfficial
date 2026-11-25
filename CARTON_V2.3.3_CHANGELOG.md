# SC Barcodezy Official — Carton Studio V2.3.3

## Summary
Carton UX compact update focused on workspace efficiency and faster manipulation.

## Added / Changed
- Reduced preview area height for flat layout and folded box display.
- Moved display sections to the top area of the page using a compact two-column desktop layout.
- Moved print ink controls into the carton structure tool area.
- Replaced large ink mode dropdown in the main flow with compact icon-based chips:
  - 1 Colour — Black (K only)
  - 1 Colour — Spot Colour
  - CMYK — 4 Colour
- Added keyboard shortcuts for Windows and macOS:
  - Ctrl/Cmd + C to copy selected artwork object
  - Ctrl/Cmd + V to paste copied artwork object
- Also supports pasting image files from the clipboard into the element library when available.

## Notes
- Existing `inkMode` export logic is preserved; the new icon controls are a UX layer synced to the same engine.
- Copy/paste currently targets artwork objects inside Carton Studio, not the whole carton project.
- System clipboard integration is limited by browser permissions; internal object copy/paste is guaranteed inside the page.
