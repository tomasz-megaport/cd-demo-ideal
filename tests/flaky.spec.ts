import { expect, test } from '@playwright/test'

// IDEAL DEMO ONLY:
// This test is deliberately marked `@flaky` and fails ~30% of the time.
// In the demo, an E2E run that hits a flake-tagged failure should:
//   1. continue without blocking the pipeline
//   2. add or update an entry in the flake-registry branch
//   3. surface in the dashboard's quarantine table
//
// Real Megaport infra would replace this with a Playwright test annotation
// that the runner reads to skip + report. Here, the pseudo-randomness is
// enough to demonstrate the workflow plumbing.

test('@flaky resolves the flaky environment variable', async () => {
  test.skip(!process.env.RUN_FLAKY, 'set RUN_FLAKY=1 to exercise the flake-quarantine demo')
  const seed = Number(process.env.FLAKE_SEED || Date.now())
  const flake = (seed % 10) < 3
  expect(flake, '@flaky test deliberately unstable for the demo').toBe(false)
})
