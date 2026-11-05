# Configuration

Forge requires Node.js 24.19+ and Git. No npm runtime dependencies. Environment variables must be supplied by your shell/process manager; `.env.example` is documentation, not an automatically loaded file.

| Variable | Default / purpose |
| --- | --- |
| `PORT` | `4317`, loopback HTTP port |
| `FORGE_DB` | `data/forge.sqlite`, SQLite database path |
| `FORGE_LOCAL_REPOSITORIES` | Optional JSON object mapping project names to operator-controlled local Git paths |
| `GITHUB_WEBHOOK_SECRET` | Required to accept incoming signed GitHub webhooks |
| `GITHUB_APP_ID` | Optional GitHub App ID |
| `GITHUB_INSTALLATION_ID` | Optional installation ID |
| `GITHUB_PRIVATE_KEY_PATH` | Protected PEM outside the repository |

## Local source demo

`npm run demo:runner` initializes `data/demo-repository`, registers the explicitly local `local/runner-demo` project and starts the server with its mapping enabled. It is not a GitHub repository. Re-running does not replace an existing demo repository.

For your own mapping, use a project already registered in the workspace. Example JSON value:

```json
{"owner/repository":"/absolute/path/to/local/repository"}
```

The runner reads committed HEAD only; dirty/untracked files are ignored. A mapping selects local HEAD, which may differ from GitHub's current branch. Source paths cannot be supplied through the browser API. Private source checkout currently needs this local mirror even if App authentication can read its metadata.

## GitHub App

Public metadata and public-source execution work without auth, within GitHub's rate limits. Private metadata can use an App installed on selected repositories. Grant **Contents: read** and **Pull requests: read**; metadata read is implicit. The token request narrows permissions to these read-only grants. No write permissions are needed or implemented.

Supply the App ID, installation ID and private key path. The adapter signs an RS256 JWT, exchanges it for an installation token and caches it until near expiry. Never put the PEM, token or key contents in a commit or issue.

## Webhooks

Endpoint: `POST /api/webhooks/github`. Subscribe to Push and Pull request events and configure the same secret on both sides. Forge verifies HMAC-SHA256 over the original body and deduplicates delivery IDs.

The server intentionally validates loopback Host. Public webhook ingress, trusted proxy handling and hosted identity are not configured. Do not open a public tunnel and assume this is a hosted-ready service. PR events before registration are not backfilled. Push SHA is the latest received default-branch event; execution resolves its own fresh authoritative revision.

## Runtime limits

One active run per server process; no durable queue. Overall deadline 60 seconds; subprocess deadline 30 seconds; source API requests have a 15-second bound. Snapshots contain 1–200 tracked regular files, up to 1 MiB per file and 10 MiB total content. Runs accept 1–20 edits and up to 256 KiB of UTF-8 text across all `before` and `after` strings combined (`before: null` contributes zero bytes). These bounds are inclusive. Git fetch precedes tree-size inspection and is not protected by a disk quota.

`GET /api/state` exposes these bounds in `runner.limits` before a run starts:

| Capability field | Meaning | Current value |
| --- | --- | --- |
| `snapshot.minFiles`, `snapshot.maxFiles` | Tracked file count | 1, 200 |
| `snapshot.maxFileBytes` | Bytes per source file | 1048576 (1 MiB) |
| `snapshot.maxTotalBytes` | Total source content bytes | 10485760 (10 MiB) |
| `edits.minCount`, `edits.maxCount` | File edit count | 1, 20 |
| `edits.maxTextBytes` | Combined UTF-8 bytes in edit text | 262144 (256 KiB) |

The snapshot and edit validators supply the same constants to `Runner.capabilities()`; these are existing enforcement limits, not new configuration options. The run dialog reads this metadata and `runner.timeoutMs` to explain limits before submission. It also identifies the static syntax/JSON/conflict/whitespace checks: project tests and AI generation remain disabled (`projectTests: false`, `aiAgent: false`).

Use [SECURITY.md](../SECURITY.md) and the [runner notes](RUNNER-2026-10-28.md) before changing these boundaries.
