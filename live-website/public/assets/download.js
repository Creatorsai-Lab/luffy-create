import { siteConfig } from './config.js'
import {
  createAuthRedirectUrl,
  createDownloadEvent,
  createDownloadPageUrl,
  getDownloadUrl,
  getRequestedPlatform,
  selectReleaseAssets,
} from './site-core.mjs'

const fallbackRelease = 'https://github.com/Creatorsai-Lab/luffy-create/releases/latest'
const gate = document.getElementById('downloadGate')
const content = document.getElementById('downloadContent')
const message = document.getElementById('downloadMessage')
let release = { version: 'Latest', windows: fallbackRelease, macos: fallbackRelease, linux: fallbackRelease }

function showError(error) {
  gate.textContent = error instanceof Error ? error.message : String(error)
}

async function loadRelease() {
  try {
    const response = await fetch(`https://api.github.com/repos/${siteConfig.repository}/releases/latest`)
    if (!response.ok) throw new Error('Release lookup failed')
    release = selectReleaseAssets(await response.json())
  } catch { /* latest-release page remains a safe fallback */ }
  document.querySelector('[data-release-version]').textContent = release.version || 'Latest'
  document.querySelectorAll('[data-platform]').forEach(link => {
    link.href = getDownloadUrl(release, link.dataset.platform)
  })
}

async function initialize() {
  if (!siteConfig.supabaseUrl || !siteConfig.supabasePublishableKey) {
    throw new Error('Authentication setup is not complete yet.')
  }
  const platform = getRequestedPlatform(location.href)
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
  const supabase = createClient(siteConfig.supabaseUrl, siteConfig.supabasePublishableKey)
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (!data.session) return location.replace(createAuthRedirectUrl(location.href, 'login', platform))

  const user = data.session.user
  document.getElementById('accountName').textContent = user.user_metadata?.full_name || 'Luffy user'
  document.getElementById('accountEmail').textContent = user.email || ''
  gate.hidden = true
  content.hidden = false
  await loadRelease()

  if (platform) {
    history.replaceState({}, '', createDownloadPageUrl(platform))
    document.getElementById(platform)?.scrollIntoView()
  }

  document.getElementById('logoutButton').addEventListener('click', async () => {
    await supabase.auth.signOut()
    location.replace('/')
  })

  document.querySelectorAll('.download-button').forEach(link => link.addEventListener('click', async event => {
    event.preventDefault()
    message.textContent = 'Starting download…'
    try {
      await Promise.race([
        supabase.from('download_events').insert(createDownloadEvent(user.id, link.dataset.platform, release.version)),
        new Promise(resolve => setTimeout(resolve, 1500)),
      ])
    } catch { /* tracking must never block the download */ }
    location.assign(link.href)
  }))
}

initialize().catch(showError)
