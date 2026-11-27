# V2.4.2 test report
- Python pytest: 46 passed (inherited 43 plus new health/model failure state, remote config validation and authenticated CORS/API tests).
- Actual local HTTP: health and carton.html returned V2.4.2. Health truthfully reported missing transformers and models not loaded in test environment.
- Chromium (direct script injection, fixture API): legacy Guided Tracing, missing dependencies, Quality Gate, draft SVG download, reviewed fixture add to library, invalid HTTP endpoint rejection, remote authorization header, separate model state, no page errors. Not a real model inference or hosted E2E test.
- JavaScript syntax, Python syntax and macOS shell syntax checked. Mac/Windows launcher install execution, OS compatibility and model downloads were not tested on actual target devices.
- V0.6 model inference, hosted HTTPS deployment, visual accuracy and new production PDF remain unverified. No remote server provisioned.
- Source comparison: no V2.4.1 files deleted; core V0.6 and standard tracing unchanged.
