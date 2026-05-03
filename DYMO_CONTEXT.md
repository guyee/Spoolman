# Spoolman DYMO Context

This file is the repo-local memory for DYMO label printing work in this Spoolman fork.
Use it before changing code, building images, deploying, or coordinating with the
printer-side helper agent.

## Fork Ownership And Source Of Truth

Yes: this must remain our Spoolman fork for all DYMO implementation.

The custom server-to-server DYMO flow requires Spoolman backend code that is not
in upstream `Donkie/Spoolman`. The backend endpoints, frontend trigger changes,
GitHub Actions workflow, GHCR image, and deployment runbook all belong to this
fork:

```text
guyee/Spoolman:dymo-label-printing
```

Use upstream `origin` only as the baseline source for comparing or rebasing
Spoolman itself. Do not implement DYMO behavior on upstream `origin`, and do not
expect upstream images to contain the backend-to-helper printer integration.

The deployable Spoolman image must be built from this fork and branch:

```text
ghcr.io/guyee/spoolman-dymo:<pinned-dymo-tag>
```

If a future agent sees `origin` in this clone, remember that `origin` is upstream
Donkie, not our implementation target. The implementation target is remote
`guyee`, branch `dymo-label-printing`.

## Repositories

Spoolman fork:
- Local path: `/home/devil/development/repo_clones/Spoolman`
- Active branch: `dymo-label-printing`
- Push target: `guyee/dymo-label-printing`
- Writable remote: `guyee` -> `git@github.com:guyee/Spoolman.git`
- Upstream remote: `origin` -> `https://github.com/Donkie/Spoolman.git`
- `origin` is the upstream Donkie repository, not the user's fork.
- Do not push DYMO work to `origin`.

DYMO helper:
- Local path: `/home/devil/development/sudo_sessions/spoolman_dymo_helper`
- Branch: `main`
- Remote: `origin` -> `git@github.com:guyee/spoolman-dymo-helper.git`
- Contract source of truth: `/home/devil/development/sudo_sessions/spoolman_dymo_helper/SERVER_CONTRACT.md`
- Current pulled helper head when this file was written: `774b0a3`

## Corrected Architecture

The intended flow is server-side printing:

```text
Spoolman UI -> Spoolman backend -> DYMO helper -> local DYMO service -> printer
```

The browser should not call the DYMO helper directly.

Earlier work implemented a browser-to-helper flow because Chromium blocks browser
access to the raw DYMO loopback service. That was the wrong long-term design for
this deployment. Treat the browser-to-helper code as legacy implementation context.
The next implementation should move the helper calls into Spoolman's backend and
leave the UI as a trigger/status surface only.

## DYMO Helper Endpoint

Production helper URL on the printer computer:

```text
http://192.168.10.91:43191
```

The helper runs on the DYMO printer computer and proxies to the local DYMO Label
Software service:

```text
https://127.0.0.1:41951/DYMO/DLS/Printing
```

Printer name:

```text
DYMO LabelWriter 450
```

Network access is expected to be controlled by Windows Firewall on the printer
computer. The helper contract currently assumes trusted LAN reachability and no
application-layer token.

## Helper Contract

The Spoolman backend should call these helper endpoints:

```text
GET  /health
GET  /contract
POST /render
POST /print
```

`POST /print` is the physical print endpoint. Only call it after explicit user
action in the Spoolman UI.

Structured print request body:

```json
{
  "confirmed": true,
  "printerName": "DYMO LabelWriter 450",
  "copies": 1,
  "labels": [
    {
      "qrText": "web+spoolman:s-123",
      "brand": "BAMBU",
      "filamentType": "PLA BASIC",
      "colorCode": "10804",
      "colorName": "COBALT BLUE"
    }
  ]
}
```

`confirmed: true` is required for `/print`; omit it for `/render`.
Each label field is trimmed by the helper and must be 80 characters or fewer.

Expected helper status codes:

```text
200  Request succeeded.
400  Request JSON or validation failed.
403  Origin is forbidden, for browser diagnostic calls only.
404  Endpoint does not exist.
502  Local DYMO web service rejected the proxy request or is unavailable.
500  Unexpected helper error.
```

Treat any non-2xx response or `ok: false` as a Spoolman print failure.

## Spoolman Implementation Direction

Backend:
- Add focused Spoolman API endpoints for DYMO print operations.
- Backend should own the helper base URL and printer name configuration.
- Prefer environment defaults for this local fork:
  - `SPOOLMAN_DYMO_HELPER_URL=http://192.168.10.91:43191`
  - `SPOOLMAN_DYMO_PRINTER_NAME=DYMO LabelWriter 450`
- Use the existing Python `httpx` dependency for backend helper calls.
- Return clear Spoolman API errors when the helper is unreachable or rejects a request.
- Do not make the Spoolman Docker container talk to the raw DYMO loopback service.

Frontend:
- The Spoolman UI should call Spoolman's backend, not the helper URL.
- Remove or hide browser-local helper URL/printer settings once backend endpoints exist.
- Keep the existing selected-spool print workflow and explicit `Print Dymo` action.
- The frontend should send selected spool label data or spool ids to the backend.

Label mapping:
- QR payload: existing Spoolman QR behavior, normally `WEB+SPOOLMAN:S-<spool_id>` or the configured full URL form.
- `brand`: `filament.vendor.name`
- `filamentType`: `filament.material` plus parsed `filament.extra.material_finish` when present
- `colorCode`: `filament.article_number`, falling back to `filament.color_hex`
- `colorName`: `filament.name`

## Current Branch State

Important commits:
- `c298281` added the first DYMO frontend/helper printing flow.
- `2352658` added the GHCR build workflow.
- `db53c0a` updated the frontend to send structured helper `labels`, but it still
  used browser-to-helper transport.

Do not deploy `db53c0a` as the final architecture. It is useful history, but the
next meaningful Spoolman image should include backend-to-helper printing.

Live Spoolman on `docker-01` was previously deployed with:

```text
ghcr.io/guyee/spoolman-dymo:0.23.1-dymo-2352658
```

That deployed image reports:

```text
version: 0.23.1
git_commit: 2352658-dymo
```

## Image And Deployment

Custom images publish to:

```text
ghcr.io/guyee/spoolman-dymo
```

Builds are produced by GitHub Actions from branch `dymo-label-printing`.
Use pinned tags for deployment.

Preserve live data by replacing only the container image and keeping the existing
bind mount:

```text
/mnt/docker_data/container_binds/spoolman/config:/home/app/.local/share/spoolman
```

Current live runtime settings to preserve:

```text
container: spoolman
host: docker-01 / 192.168.11.31
port: 7912:8000
env: TZ=America/Toronto
restart policy: unless-stopped
```

Do not delete the bind mount, do not create a fresh anonymous volume, and do not
use a remove-volumes option during container replacement.

## Coordination Notes

When another agent is working on the printer-side helper, have that agent pull:

```text
/home/devil/development/sudo_sessions/spoolman_dymo_helper
```

When another agent is working on Spoolman, have that agent pull:

```text
/home/devil/development/repo_clones/Spoolman
```

The helper repo owns the helper server and its contract. This Spoolman repo owns
the backend/frontend integration and Docker image publication.
