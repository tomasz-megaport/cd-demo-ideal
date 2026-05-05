// ── dashboard-live.js ──────────────────────────────────────────────────────
// Bridges the wireframe's static dashboard view to live state from GitHub:
//   1. Fetches env/<env>/version.json for each env (test/staging/prod) and
//      patches the wireframe's `cardData` so the env cards show the real
//      sha/timestamp once a deploy has landed.
//   2. Replaces the wireframe's stub `confirmRollback()` with a
//      repository_dispatch call into rollback.yml. A passcode prompt gates
//      the click so live audiences can't accidentally hammer prod.
//
// Configuration is read from <meta> tags on the page so this file stays
// owner-agnostic. setup-github.sh injects the values when each repo is
// created.
;(function () {
  'use strict'

  const repoOwner = readMeta('repo-owner')
  const repoName = readMeta('repo-name')
  const passcode = readMeta('rollback-passcode') || 'rollback'

  if (!repoOwner || !repoName) {
    console.warn('dashboard-live: missing <meta name="repo-owner"> or <meta name="repo-name">; live wiring disabled')
    return
  }

  const envs = ['test', 'staging', 'prod']
  const REFRESH_MS = 30_000

  async function fetchVersionFor(envName) {
    const url = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/env/${envName}/version.json`
    const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`fetch ${envName}: ${res.status}`)
    return res.json()
  }

  async function refreshCards() {
    if (typeof window.cardData !== 'object') return
    const apps = Object.keys(window.cardData)
    await Promise.all(
      envs.map(async envName => {
        try {
          const v = await fetchVersionFor(envName)
          for (const app of apps) {
            if (window.cardData[app] && window.cardData[app][envName]) {
              window.cardData[app][envName].sha = (v.sha || '').toString().slice(0, 7) || window.cardData[app][envName].sha
              window.cardData[app][envName].ver = v.version || window.cardData[app][envName].ver
              window.cardData[app][envName].deployed = v.deployed_at || window.cardData[app][envName].deployed
            }
          }
        } catch (err) {
          console.warn(`dashboard-live: ${envName} refresh failed —`, err.message)
        }
      }),
    )
    if (typeof window.renderDashboard === 'function') window.renderDashboard()
  }

  // Override the wireframe stub. Promotes the existing modal to a real
  // repository_dispatch fire-and-poll flow.
  window.confirmRollback = async function confirmRollbackLive() {
    const entered = window.prompt('Enter rollback passcode:')
    if (entered !== passcode) {
      toast('Passcode incorrect — rollback aborted', 'bad')
      return
    }

    const token = window.localStorage.getItem('CD_DEMO_GH_PAT') || window.prompt('Paste GH PAT (stored locally for this demo):')
    if (!token) {
      toast('No GH PAT supplied — rollback aborted', 'bad')
      return
    }
    window.localStorage.setItem('CD_DEMO_GH_PAT', token)

    const appLabel = document.getElementById('modal-app').textContent.trim()
    const [app, envName] = appLabel.split('·').map(s => s.trim())

    try {
      const res = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/rollback.yml/dispatches`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: { app: app || 'main', env: envName, target: 'previous' },
        }),
      })
      if (!res.ok) throw new Error(`dispatch ${res.status}`)
      toast(`Rollback dispatched for ${envName} — refresh in ~30s`, 'good')
      window.closeModal && window.closeModal()
      setTimeout(refreshCards, 30_000)
    } catch (err) {
      toast(`Rollback failed: ${err.message}`, 'bad')
    }
  }

  function toast(msg, kind) {
    let el = document.getElementById('cd-toast')
    if (!el) {
      el = document.createElement('div')
      el.id = 'cd-toast'
      el.style.cssText =
        'position:fixed;bottom:1.5rem;right:1.5rem;padding:0.75rem 1rem;border-radius:6px;font:0.9rem system-ui;z-index:9999;color:#fff;'
      document.body.appendChild(el)
    }
    el.style.background = kind === 'bad' ? '#b91c1c' : '#047857'
    el.textContent = msg
    el.style.opacity = '1'
    setTimeout(() => {
      el.style.transition = 'opacity 0.4s'
      el.style.opacity = '0'
    }, 4_000)
  }

  function readMeta(name) {
    const el = document.querySelector(`meta[name="${name}"]`)
    return el ? el.getAttribute('content') : null
  }

  refreshCards()
  setInterval(refreshCards, REFRESH_MS)
})()
