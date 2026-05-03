# DYMO GHCR Image Deployment

Before changing or deploying DYMO work, read `DYMO_CONTEXT.md`. That file is the
repo-local source of truth for repository routing, helper ownership, and the
corrected server-side printing architecture.

This fork publishes the custom DYMO label-printing image as:

```text
ghcr.io/guyee/spoolman-dymo
```

Use pinned tags for deployment. The moving branch tag is only for quick testing:

```text
ghcr.io/guyee/spoolman-dymo:0.23.1-dymo
ghcr.io/guyee/spoolman-dymo:0.23.1-dymo-<short-sha>
ghcr.io/guyee/spoolman-dymo:dymo-label-printing
```

Before deploying to `docker-01`, verify the GHCR package is private. An
unauthenticated manifest check should fail:

```bash
docker manifest inspect ghcr.io/guyee/spoolman-dymo:0.23.1-dymo
```

If that command succeeds without `docker login ghcr.io`, the package is public.
Stop and make the package private in GitHub before deploying, unless a public
package has been explicitly accepted for this environment.

## Build

The GitHub Actions workflow `Build DYMO Docker Image` runs on pushes to
`dymo-label-printing` and on manual dispatch. It builds `linux/amd64` only,
which matches `docker-01`.

The workflow:

- builds the Spoolman client with `VITE_APIURL=/api/v1`
- runs frontend lint and format checks
- builds the existing Dockerfile
- publishes to GHCR with `GIT_COMMIT=<short-sha>-dymo`

## Deploy On docker-01

Do not create a fresh volume and do not remove the existing Spoolman data bind
mount.

Preserve these live settings:

```text
container name: spoolman
bind mount: /mnt/docker_data/container_binds/spoolman/config:/home/app/.local/share/spoolman
port: 7912:8000
env: TZ=America/Toronto
restart policy: unless-stopped
```

Before deployment, capture the current state:

```bash
curl -fsS http://192.168.11.31:7912/api/v1/info
docker inspect spoolman > spoolman_before_ghcr.json
docker exec spoolman tar -C /home/app/.local/share -cf - spoolman > spoolman_data_before_ghcr.tar
```

Pull the pinned image tag:

```bash
docker pull ghcr.io/guyee/spoolman-dymo:0.23.1-dymo-<short-sha>
```

Preserve the previous working container:

```bash
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
docker stop spoolman
docker rename spoolman "spoolman-before-ghcr-${stamp}"
```

Create the replacement container with the same runtime settings:

```bash
docker create \
  --name spoolman \
  --restart unless-stopped \
  -e TZ=America/Toronto \
  -p 7912:8000 \
  -v /mnt/docker_data/container_binds/spoolman/config:/home/app/.local/share/spoolman \
  ghcr.io/guyee/spoolman-dymo:0.23.1-dymo-<short-sha>

docker start spoolman
```

## Verify

```bash
curl -fsS http://192.168.11.31:7912/api/v1/info
curl -I http://192.168.11.31:7912
curl -I https://spoolman.pirhonet.duckdns.org
```

Expected `/api/v1/info`:

```text
version: 0.23.1
git_commit: <short-sha>-dymo
data_dir: /home/app/.local/share/spoolman
db_type: sqlite
```

Verify inventory endpoints still return data:

```bash
curl -fsS http://192.168.11.31:7912/api/v1/vendor
curl -fsS http://192.168.11.31:7912/api/v1/filament
curl -fsS http://192.168.11.31:7912/api/v1/spool
```

Verify the deployed frontend includes the DYMO print UI. For the corrected
server-side implementation, the deployed frontend should not require a browser
helper URL such as `127.0.0.1:43191`; the browser should call Spoolman's backend.

```bash
asset="$(curl -fsS http://192.168.11.31:7912 | grep -o '/assets/[^"]*spoolQrCodePrintingDialog[^"]*\.js' | head -n 1)"
curl -fsS "http://192.168.11.31:7912${asset}" | grep -E 'Print Dymo'
```

The printer-side helper still needs to be reachable from the Spoolman backend.
The production helper URL is documented in `DYMO_CONTEXT.md` as:

```text
http://192.168.10.91:43191
```

The printer-side agent can test locally on the DYMO computer with:

```powershell
Invoke-RestMethod http://127.0.0.1:43191/printers
```

The physical print check remains manual from Spoolman's print dialog.

## Rollback

If the replacement fails, remove the new container and restore the preserved
working one:

```bash
docker stop spoolman || true
docker rm spoolman || true
docker rename spoolman-before-ghcr-<timestamp> spoolman
docker start spoolman
```

Only restore the data archive if the bind-mounted data itself was corrupted.
