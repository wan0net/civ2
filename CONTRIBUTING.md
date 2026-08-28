# Contributing

Thank you for helping improve the Civilization II browser recreation.

## Ground rules

- Match Civilization II Multiplayer Gold Edition before introducing a new
  interpretation. The bundled project documentation identifies the relevant
  original screens, formats, and behavior.
- Do not commit original installation media, executables, DLLs, saves, logs,
  or private reference checkouts.
- Do not copy code from GPL or other incompatibly licensed reference projects.
  References may be used to understand observable behavior, file formats, and
  data, but implementations contributed here must be independently written.
- Every behavior change needs a Playwright regression test.
- Keep the two intentional modern accommodations: the unit context menu and
  optional 2× upscaled sprites.

## Development

```bash
npm ci
npx playwright install chromium
npm run dev
npm test
npm run build
```

The game opens at `http://localhost:3000/game.html`. Accept the local ownership
terms once in the browser before testing manually.

## Pull requests

Explain the original MGE behavior being restored, the reference used, the
visible or mechanical difference, and the test that protects it. Do not mix
unrelated cleanup into a parity change.
