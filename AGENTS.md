# Spoolman Fork Context

This repository is the working Spoolman fork for DYMO label printing.

Important: all DYMO implementation work belongs in this fork and branch. The
server-to-server printer integration cannot be implemented by changing upstream
`Donkie/Spoolman` alone because the live custom Docker image is built from
`guyee/Spoolman:dymo-label-printing`.

For any DYMO, label printing, helper service, GHCR image, or deployment work,
read `DYMO_CONTEXT.md` first and treat it as the repo-local source of truth.
Do not rely on external session notes as primary memory for this feature.

Repository routing:
- This repo: `/home/devil/development/repo_clones/Spoolman`
- Active feature branch: `dymo-label-printing`
- Writable remote: `guyee` (`git@github.com:guyee/Spoolman.git`)
- Upstream remote: `origin` (`https://github.com/Donkie/Spoolman.git`)
- Do not push DYMO work to `origin`; push this branch to `guyee`.
- `origin` is read-only baseline/upstream context for this feature. It is not
  where DYMO implementation commits or deployment images come from.

The DYMO helper is a separate repo:
- Local path: `/home/devil/development/sudo_sessions/spoolman_dymo_helper`
- Remote: `origin` (`git@github.com:guyee/spoolman-dymo-helper.git`)
- Contract file: `SERVER_CONTRACT.md` in the helper repo

Current intended architecture:
- Spoolman UI calls Spoolman's backend.
- Spoolman's backend calls the DYMO helper on the printer computer.
- The browser must not call the DYMO helper directly.
- Existing browser-to-helper DYMO code is legacy context and should be refactored
  toward the server-side flow, not extended.
