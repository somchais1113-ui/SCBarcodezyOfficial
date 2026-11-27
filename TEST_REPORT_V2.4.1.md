# V2.4.1 test report
- Python pytest: 43 passed (39 inherited + 4 API tests); no actual foundation AI inference.
- JS syntax: new carton-deep.js and changed carton.js checked.
- Chromium script-injection test: legacy Guided tracing, missing-dependencies UI, blocked-result rejection, draft SVG download, reviewed fixture library add, no page errors — passed. Browser's direct HTTP navigation blocked by administrator; browser API results injected as test fixtures. Actual local HTTP health tested using Python HTTP client.
- Production PDF export of new deep SVG, real model weights, hosted deployment, full browser/network E2E and all existing module regressions not tested.
