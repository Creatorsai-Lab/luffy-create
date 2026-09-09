import { siteConfig } from './config.js'
import {
  authViewFromUrl,
  createAuthRedirectUrl,
  createDownloadEvent,
  getDownloadUrl,
  getSessionNav,
  isAllowedEmail,
  selectReleaseAssets,
} from './site-core.mjs'

const modal = document.getElementById('authModal')
const dialog = modal?.querySelector('.auth-dialog')
const tabs = document.getElementById('authTabs')
const status = document.getElementById('authMessage')
const captcha = document.getElementById('authCaptcha')
const views = [...document.querySelectorAll('[data-auth-view]')]
const fallbackRelease = 'https://github.com/Creatorsai-Lab/luffy-create/releases/latest'
const authConfigured = Boolean(siteConfig.supabaseUrl && siteConfig.supabasePublishableKey && siteConfig.turnstileSiteKey)

let client
let activeSession
let previousFocus
let captchaId
let captchaToken = ''
let pendingPlatform = ''
let lastSignupEmail = ''
let releaseAssets = { version: 'Latest', windows: '', macos: '', linux: '' }

function setSessionUi(session) {
  const button = document.querySelector('.auth-nav-button')
  const nav = getSessionNav(session)
  activeSession = session
  button.textContent = nav.label
  button.dataset.authOpen = nav.view
}

function setMessage(text = '', ok = false) {
  status.textContent = text
  status.classList.toggle('ok', ok)
  // mirror into the login form's status slot when it's visible
  const mirror = document.querySelector('.auth-message-mirror')
  if (mirror) { mirror.textContent = text; mirror.classList.toggle('ok', ok) }
}

async function getClient() {
  if (!authConfigured) throw new Error('Authentication setup is not complete yet.')
  if (!client) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
    client = createClient(siteConfig.supabaseUrl, siteConfig.supabasePublishableKey)
  }
  return client
}

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = () => resolve(window.turnstile)
    script.onerror = () => reject(new Error('Could not load verification.'))
    document.head.append(script)
  })
}

async function placeCaptcha(view) {
  const slot = document.querySelector(`[data-auth-view="${view}"] [data-captcha-slot]`)
  captcha.hidden = !slot
  if (!slot || !authConfigured) return
  slot.append(captcha)
  captchaToken = ''
  const turnstile = await loadTurnstile()
  if (captchaId === undefined) {
    captchaId = turnstile.render(captcha, {
      sitekey: siteConfig.turnstileSiteKey,
      theme: 'light',
      callback: token => { captchaToken = token },
      'expired-callback': () => { captchaToken = '' },
    })
  } else {
    turnstile.reset(captchaId)
  }
}

export function openAuthModal(view = 'signup', platform = '') {
  if (!modal) return
  previousFocus = document.activeElement
  pendingPlatform = platform || pendingPlatform
  modal.hidden = false
  document.body.classList.add('auth-open')
  views.forEach(item => { item.hidden = item.dataset.authView !== view })
  tabs.hidden = !['signup', 'login'].includes(view)
  tabs.querySelectorAll('.auth-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.authOpen === view))
  setMessage(authConfigured ? '' : 'Add the public Supabase and Turnstile values in assets/config.js to enable accounts.')
  placeCaptcha(view).catch(error => setMessage(error.message))
  requestAnimationFrame(() => (document.querySelector(`[data-auth-view="${view}"] input`) || dialog).focus())
}

export function closeAuthModal() {
  if (!modal) return
  modal.hidden = true
  document.body.classList.remove('auth-open')
  previousFocus?.focus?.()
}

function setPending(form, value) {
  form.querySelectorAll('button,input').forEach(control => { control.disabled = value })
}

function requireCaptcha() {
  if (!captchaToken) throw new Error('Wait! Let Captacha verification check first.')
  return captchaToken
}

async function showDownloads(session) {
  const user = session?.user
  if (!user) return openAuthModal('login')
  document.getElementById('authUserName').textContent = user.user_metadata?.full_name || 'Luffy user'
  document.getElementById('authUserEmail').textContent = user.email || ''
  setSessionUi(session)
  openAuthModal('download', pendingPlatform)
}

async function submit(form, operation) {
  setPending(form, true)
  setMessage('')
  try {
    await operation(new FormData(form))
  } catch (error) {
    setMessage(error instanceof Error ? error.message : String(error))
  } finally {
    setPending(form, false)
  }
}

document.getElementById('signupForm')?.addEventListener('submit', event => {
  event.preventDefault()
  submit(event.currentTarget, async data => {
    const email = String(data.get('email') || '').trim()
    const fullName = String(data.get('fullName') || '').trim()
    if (fullName.length < 2) throw new Error('Please enter your full name (at least 2 characters).')
    if (!isAllowedEmail(email)) throw new Error('Please use a Gmail, Yahoo, Outlook/Microsoft, or Proton email address.')
    lastSignupEmail = email
    const supabase = await getClient()
    const { error } = await supabase.auth.signUp({
      email,
      password: String(data.get('password') || ''),
      options: {
        data: { full_name: fullName },
        captchaToken: requireCaptcha(),
        emailRedirectTo: createAuthRedirectUrl(location.href, 'verified'),
      },
    })
    if (error) throw error
    openAuthModal('check-email')
  })
})

document.getElementById('loginForm')?.addEventListener('submit', event => {
  event.preventDefault()
  submit(event.currentTarget, async data => {
    const supabase = await getClient()
    const { data: result, error } = await supabase.auth.signInWithPassword({
      email: String(data.get('email') || '').trim(),
      password: String(data.get('password') || ''),
      options: { captchaToken: requireCaptcha() },
    })
    if (error) throw error
    await showDownloads(result.session)
  })
})

document.getElementById('forgotForm')?.addEventListener('submit', event => {
  event.preventDefault()
  submit(event.currentTarget, async data => {
    const supabase = await getClient()
    const { error } = await supabase.auth.resetPasswordForEmail(String(data.get('email') || '').trim(), {
      captchaToken: requireCaptcha(),
      redirectTo: createAuthRedirectUrl(location.href, 'recovery'),
    })
    if (error) throw error
    openAuthModal('check-email')
    setMessage('Password reset link sent.', true)
  })
})

document.getElementById('recoveryForm')?.addEventListener('submit', event => {
  event.preventDefault()
  submit(event.currentTarget, async data => {
    const supabase = await getClient()
    const { error } = await supabase.auth.updateUser({ password: String(data.get('password') || '') })
    if (error) throw error
    const { data: session } = await supabase.auth.getSession()
    await showDownloads(session.session)
    setMessage('Password updated.', true)
  })
})

document.getElementById('resendConfirmation')?.addEventListener('click', async () => {
  try {
    if (!lastSignupEmail) throw new Error('Return to signup and enter your email again.')
    const supabase = await getClient()
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: lastSignupEmail,
      options: { emailRedirectTo: createAuthRedirectUrl(location.href, 'verified') },
    })
    if (error) throw error
    setMessage('Verification email sent again.', true)
  } catch (error) {
    setMessage(error instanceof Error ? error.message : String(error))
  }
})

document.getElementById('logoutButton')?.addEventListener('click', async () => {
  try { await (await getClient()).auth.signOut() } finally { setSessionUi(null); openAuthModal('login') }
})

document.querySelectorAll('[data-auth-open]').forEach(button => button.addEventListener('click', () => {
  const view = button.dataset.authOpen || 'signup'
  view === 'download' ? showDownloads(activeSession) : openAuthModal(view)
}))
document.querySelectorAll('[data-auth-close]').forEach(button => button.addEventListener('click', closeAuthModal))

for (const [selector, platform] of Object.entries({ '.js-dl-win': 'windows', '.js-dl-mac': 'macos', '.js-dl-linux': 'linux' })) {
  document.querySelectorAll(selector).forEach(link => link.addEventListener('click', async event => {
    event.preventDefault()
    pendingPlatform = platform
    try {
      const supabase = await getClient()
      const { data } = await supabase.auth.getSession()
      data.session ? showDownloads(data.session) : openAuthModal('signup', platform)
    } catch (error) {
      openAuthModal('signup', platform)
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }))
}

document.querySelectorAll('.auth-download').forEach(button => button.addEventListener('click', async () => {
  const platform = button.dataset.platform
  const url = getDownloadUrl(releaseAssets, platform)
  setMessage('Starting download…', true)
  try {
    const supabase = await getClient()
    const { data } = await supabase.auth.getSession()
    if (!data.session) return openAuthModal('login', platform)
    await Promise.race([
      supabase.from('download_events').insert(createDownloadEvent(data.session.user.id, platform, releaseAssets.version)),
      new Promise(resolve => setTimeout(resolve, 1500)),
    ])
  } catch { /* tracking must never block a public download */ }
  location.assign(url)
}))

modal?.addEventListener('keydown', event => {
  if (event.key === 'Escape') return closeAuthModal()
  if (event.key !== 'Tab') return
  const focusable = [...dialog.querySelectorAll('button:not([disabled]),input:not([disabled])')]
    .filter(element => !element.closest('[hidden]'))
  if (!focusable.length) return
  const first = focusable[0], last = focusable.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
})

async function loadRelease() {
  try {
    const response = await fetch(`https://api.github.com/repos/${siteConfig.repository}/releases/latest`)
    if (!response.ok) throw new Error('Release lookup failed')
    releaseAssets = selectReleaseAssets(await response.json())
    document.querySelectorAll('[data-release-version]').forEach(element => {
      element.textContent = releaseAssets.version || 'Latest'
    })
  } catch {
    releaseAssets = { version: 'Latest', windows: fallbackRelease, macos: fallbackRelease, linux: fallbackRelease }
  }
}

async function initializeAuth() {
  await loadRelease()
  const requestedView = authViewFromUrl(location.href)
  if (!authConfigured) {
    if (requestedView) openAuthModal(requestedView)
    return
  }
  try {
    const supabase = await getClient()
    supabase.auth.onAuthStateChange((event, session) => {
      setSessionUi(session)
      if (event === 'PASSWORD_RECOVERY') openAuthModal('recovery')
      else if (event === 'SIGNED_IN' && requestedView === 'download') showDownloads(session)
    })
    const { data } = await supabase.auth.getSession()
    setSessionUi(data.session)
    if (requestedView === 'recovery') openAuthModal('recovery')
    else if (requestedView === 'download') data.session ? showDownloads(data.session) : openAuthModal('login')
    if (requestedView) {
      const clean = new URL(location.href)
      clean.searchParams.delete('auth')
      history.replaceState({}, '', clean.pathname + clean.search)
    }
  } catch (error) {
    if (requestedView) openAuthModal('login')
    setMessage(error instanceof Error ? error.message : String(error))
  }
}

initializeAuth()
