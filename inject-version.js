#!/usr/bin/env node
/**
 * Reads app/version.json and rewrites the inline version-banner JS in
 * app/index.html so the deployed page shows real sha + deployed_at + env
 * instead of the wireframe placeholder.
 *
 * Idempotent: re-running with a new version.json overwrites the previous
 * injection without compounding edits.
 *
 * Usage:
 *   node inject-version.js [--app-dir=app]
 */

const fs = require('node:fs')
const path = require('node:path')

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  }),
)

const appDir = path.resolve(process.cwd(), args['app-dir'] || 'app')
const indexPath = path.join(appDir, 'index.html')
const versionPath = path.join(appDir, 'version.json')

if (!fs.existsSync(indexPath)) {
  console.error(`inject-version: ${indexPath} not found`)
  process.exit(1)
}
if (!fs.existsSync(versionPath)) {
  console.error(`inject-version: ${versionPath} not found`)
  process.exit(1)
}

const version = JSON.parse(fs.readFileSync(versionPath, 'utf8'))
const sha = String(version.sha || 'unknown')
const env = String(version.env || 'unknown')
const deployedAt = String(version.deployed_at || new Date().toISOString())

const escape = s => s.replace(/'/g, "\\'")

const BLOCK_START = '// ── INJECTED VERSION (do not edit by hand) ──'
const BLOCK_END = '// ── END INJECTED VERSION ──'

const injection = [
  BLOCK_START,
  `document.getElementById('sha-display').textContent = '${escape(sha)}';`,
  `(function () {`,
  `  var tsEl = document.getElementById('ts-display');`,
  `  if (tsEl) tsEl.textContent = '${escape(deployedAt)}';`,
  `  var envEl = document.getElementById('env-display');`,
  `  if (envEl) envEl.textContent = '${escape(env)}';`,
  `})();`,
  BLOCK_END,
].join('\n')

let html = fs.readFileSync(indexPath, 'utf8')

const blockRegex = new RegExp(
  `${BLOCK_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${BLOCK_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
)

if (blockRegex.test(html)) {
  html = html.replace(blockRegex, injection)
} else {
  // First injection: replace the wireframe's hardcoded banner block.
  // Matches sha-display + ts-display assignments, plus an optional
  // env-display assignment that follows. Trailing env line is captured so
  // the injected block's env value wins.
  const wireframeBlock =
    /document\.getElementById\(['"]sha-display['"]\)\.textContent\s*=\s*['"][^'"]*['"];\s*[\s\S]*?document\.getElementById\(['"]ts-display['"]\)\.textContent\s*=[\s\S]*?;(\s*document\.getElementById\(['"]env-display['"]\)\.textContent\s*=[\s\S]*?;)?/
  if (wireframeBlock.test(html)) {
    html = html.replace(wireframeBlock, injection)
  } else {
    // Fall back: append before </script> close at end of inline module
    html = html.replace(/<\/script>\s*<\/body>/, `${injection}\n</script>\n</body>`)
  }
}

fs.writeFileSync(indexPath, html)
console.log(`inject-version: sha=${sha} env=${env} deployed_at=${deployedAt}`)
