# cd-demo-ideal

> Gold target — full pre-prod → e2e → **sandbox + prod parallel** gating, flake quarantine with accountability, live admin dashboard.

This repo demonstrates the **ideal** state of `web-monorepo` continuous delivery: every change runs through an internal `pre-prod` env behind sharded E2E, only soaked artifacts promote, sandbox + prod deploy in parallel from the same image, flakes are quarantined with assignees + age-based release blocks, and a live admin dashboard surfaces every env at a glance.

Open the GitHub Pages site for the dual-view UI — toggle between the **Walkthrough** (Mermaid stepper with change/gain callouts) and the **Dashboard** (live env cards + activity feed + flake board + 1-click rollback).

## Env model

| Env | Role | Cadence | Access |
|---|---|---|---|
| **pre-prod** | Tip of main. Auto-deploy + sharded E2E every green merge. Internal only. | Continuous | Internal only |
| **sandbox** | Customer-facing rehearsal. **Mirrors prod exactly** — same image, same window. | Same 8h cron as prod | Public |
| **prod** | Production. | 8h cron — 08:00 / 16:00 / 00:00 AEST | Public |

## Changes vs. cd-demo-mvp

| Dimension | MVP | Ideal |
|---|---|---|
| E2E | smoke only | sharded Playwright E2E on `pre-prod` (4 shards) |
| Concurrency | per-workflow group | `cancel-in-progress: true` on pre-prod deploy + e2e (newer sha cancels older) |
| Merge ordering | none | GitHub Merge Queue serializes main |
| Flake handling | implicit | `@flaky` failures recorded in `flake-registry` branch with first_seen + assignee; pipeline stays green |
| Stale flake enforcement | none | release-blocking badge on entries >21d |
| Admin surface | Slack messages | live dashboard (env cards + activity + quarantine board) |
| Rollback | workflow_dispatch only | dashboard button → passcode → `repository_dispatch` (wraps same image-restore primitive — no blue/green) |

## Pipelines

| Workflow | Trigger | What it does |
|---|---|---|
| `pipeline.yml` | push / PR / merge_group | Single DAG: CI → deploy pre-prod → sharded E2E (4 shards) → tag `pre-prod-passed/<sha>` |
| `promote-sandbox-prod.yml` | cron (`*/10` demo / `0 22,6,14 * * *` UTC real = 08/16/00 AEST) + `workflow_dispatch` + `repository_dispatch:force-promote` | Picks newest soaked `pre-prod-passed/<sha>` and deploys to **sandbox + prod in parallel** |
| `flake-quarantine.yml` | `workflow_run` on Pipeline failure + manual | Append/update `flake-registry` branch; enforce 21d block |
| `rollback.yml` | `workflow_dispatch` (or `repository_dispatch` from dashboard) | Restores env (sandbox / prod) to previous image in seconds |
| `notify.yml` | `workflow_run` failure on Pipeline / Promote / Flake / Rollback | Slack ping |

Tags still emitted from inside the pipeline so external systems (Sentry releases, audit logs, monitoring, customer comms) can subscribe to the immutable artifact identifier — they outlive 90-day workflow run retention. No PAT required because all handoffs use `needs:` not push:tags triggers.

## Branches

| Branch | Purpose |
|---|---|
| `main` | source of truth, merge-queue gated |
| `env/pre-prod`, `env/sandbox`, `env/prod` | static GH Pages branches per env (force-pushed by `deploy.sh`) |
| `flake-registry` | JSON registry of quarantined flakes (`registry.json`) |

## Required secrets

- `SLACK_WEBHOOK` — Slack incoming webhook
- `GH_PAT` — only used by the dashboard's repository_dispatch fallback when running outside the repo (passcode-gated)

## Demo flows

- **Auto pipeline:** `git commit && git push` → CI → pre-prod → e2e → cron promotes to sandbox + prod in parallel. Watch each env card refresh.
- **Concurrency:** push two commits within 30s — earlier `e2e` shard cancels; only newer sha gets `pre-prod-passed/<sha>`.
- **Flake quarantine:** push a commit with `RUN_FLAKY=1` set in CI to fail `tests/flaky.spec.ts`. The pipeline stays green; quarantine board shows the new entry.
- **Rollback:** Dashboard view → click `[↺ Rollback]` on prod row → enter passcode → repository_dispatch fires → env/prod restored within seconds (same primitive on sandbox).

## Local

```bash
pnpm install
pnpm test            # smoke only (default)
RUN_FLAKY=1 pnpm test # also exercises the flaky test
pnpm serve           # http://127.0.0.1:4173
```

## Deploy (dry-run)

```bash
deploy/deploy.sh pre-prod --dry-run
deploy/deploy.sh sandbox --dry-run
deploy/deploy.sh prod --dry-run
```

## Sibling demos

- **Current state:** [cd-demo-current](https://tomasz-megaport.github.io/cd-demo-current/) — fully manual, every release is a click
- **MVP target:** [cd-demo-mvp](https://tomasz-megaport.github.io/cd-demo-mvp/) — auto pre-prod + cron-promote sandbox/prod in parallel + 1-click rollback

This demo: <https://tomasz-megaport.github.io/cd-demo-ideal/>
