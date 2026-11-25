# Unicode patch heading validation

The screenshots show the actual Forge HTTP application with an in-memory fixture record and a real Git-generated UTF-8 text-file patch, in Chromium at 390 px.

Before serves public/app.js from upstream 28a1e16f2cab409faf64a3475189c5b972acd462. After serves the reviewed fix. The in-memory run status and checks are fixture data, not a real runner execution.

The patch region receives keyboard focus and responds to ArrowRight. Neither page overflows horizontally. Both downloads match the original patch bytes, SHA-256 0e2cacaa47aedc11f60b597b97a2dfdffedcbc7e0c5def0f846ae84df4657e89. No live GitHub workload was used.
