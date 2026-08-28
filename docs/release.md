# Release checklist

## Before merging to `main`

- Confirm `git status` contains no reference installation, save, log, DLL,
  executable, source AVI, report output, or local configuration.
- Run `npm run verify:public`, `npm run build`, `npm run build:pages`, and
  `npm test`.
- Run `npm run preview:pages` and inspect `http://localhost:4173/civ2/` so the
  local server uses the same base path as the deployment.
- Confirm the root build and `/civ2/` Pages build contain only the explicit
  runtime allow-list.
- Inspect the project page, ownership terms, original title screen, a new game,
  city screen, research selector, Civilopedia, Wonder movie, and diplomacy
  herald in a real browser.
- Update the README status and changelog.

## GitHub Pages

Repository Settings → Pages must use **GitHub Actions** as its source. A push
to `main` builds both HTML entry points and deploys `dist/`. The deployment is
complete only after the workflow succeeds and the live project and game URLs
are opened and verified.

## Rollback

GitHub Pages deployments can be rolled back by reverting the release commit
and rerunning the Pages workflow. The private reference repository retains
the original development history and local extraction inputs.
