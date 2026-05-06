# cd-demo-ideal

> Gold target — full test → e2e → staging → prod gating, flake quarantine with accountability, live admin dashboard.

This repo demonstrates the **ideal** state of `web-monorepo` continuous delivery: every change runs through a pre-staging "test" env behind sharded E2E, only soaked artifacts promote, flakes are quarantined with assignees + age-based release blocks, and a live admin dashboard surfaces every env at a glance.

Open the GitHub Pages site for the dual-view UI — toggle between the **Walkthrough** (Mermaid stepper with change/gain callouts) and the **Dashboard** (live env cards + activity feed + flake board + 1-click rollback).

## Changes vs. cd-demo-mvp

| Dimension | MVP | Ideal |
|---|---|---|
| Pre-staging env | none | `test` env, internal-only access |
| E2E gate | none | sharded Playwright E2E on `test`, `test-passed/<sha>` tag |
| Concurrency | per-workflow group | `cancel-in-progress: true` on test deploy + e2e (newer sha cancels older) |
| Merge ordering | none | GitHub Merge Queue serializes main |
| Flake handling | implicit | `@flaky` failures recorded in `flake-registry` branch with first_seen + assignee; pipeline stays green |
| Stale flake enforcement | none | release-blocking badge on entries >21d |
| Admin surface | Slack messages | live dashboard (env cards + activity + quarantine board) |
| Rollback | workflow_dispatch only | dashboard button → passcode → `repository_dispatch` |

## Pipelines

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | push / PR / merge_group | lint + smoke test |
| `deploy-test.yml` | `workflow_run` on CI success on main | deploy to `test` env, cancel-in-progress |
| `e2e-test.yml` | `workflow_run` on Deploy test success | sharded Playwright; tag `test-passed/<sha>` |
| `promote-staging.yml` | `push` on `test-passed/*` tag | deploy to staging; tag `staging-passed/<sha>` |
| `promote-prod.yml` | cron `*/10` + `workflow_dispatch` + `repository_dispatch:force-promote` | promote newest soaked staging-passed |
| `flake-quarantine.yml` | `workflow_run` on E2E failure + manual | append/update `flake-registry` branch; enforce 21d block |
| `rollback.yml` | `workflow_dispatch` (or `repository_dispatch` from dashboard) | force-push env branch to previous artifact |
| `notify.yml` | `workflow_run` failure on any of above | Slack ping |

## Branches

| Branch | Purpose |
|---|---|
| `main` | source of truth, merge-queue gated |
| `env/test`, `env/staging`, `env/prod` | static GH Pages branches per env (force-pushed by `deploy.sh`) |
| `flake-registry` | JSON registry of quarantined flakes (`registry.json`) |

## Required secrets

- `SLACK_WEBHOOK` — Slack incoming webhook
- `GH_PAT` — only used by the dashboard's repository_dispatch fallback when running outside the repo (passcode-gated)

## Demo flows

- **Auto pipeline:** `git commit && git push` → CI → test → e2e → staging → prod (cron). Watch each env card refresh.
- **Concurrency:** push two commits within 30s — earlier `e2e-test` shard cancels; only newer sha gets `test-passed/<sha>`.
- **Flake quarantine:** push a commit with `RUN_FLAKY=1` set in CI to fail `tests/flaky.spec.ts`. The pipeline stays green; quarantine board shows the new entry.
- **Rollback:** Dashboard view → click `[↺ Rollback]` on prod row → enter passcode → repository_dispatch fires → env/prod resets within 30s.

## Local

```bash
pnpm install
pnpm test            # smoke only (default)
RUN_FLAKY=1 pnpm test # also exercises the flaky test
pnpm serve           # http://127.0.0.1:4173
```

## Deploy (dry-run)

```bash
deploy/deploy.sh staging --dry-run
```

## Sibling demos

- **Current state:** [cd-demo-current](https://tomasz-megaport.github.io/cd-demo-current/) — fully manual, every release is a click
- **MVP target:** [cd-demo-mvp](https://tomasz-megaport.github.io/cd-demo-mvp/) — auto staging + cron-promote prod + 1-click rollback

This demo: <https://tomasz-megaport.github.io/cd-demo-ideal/>
