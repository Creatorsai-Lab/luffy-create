import { siteConfig } from './config.js'
import {
  authViewFromUrl,
  createAuthRedirectUrl,
  createDownloadPageUrl,
  getRequestedPlatform,
  getSessionNav,
} from './site-core.mjs'

const modal = document.getElementById('authModal')
const dialog = modal?.querySelector('.auth-dialog')
const tabs = document.getElementById('authTabs')
const status = document.getElementById('authMessage')
const captcha = document.getElementById('authCaptcha')
const views = [...document.querySelectorAll('[data-auth-view]')]
const authConfigured = Boolean(siteConfig.supabaseUrl && siteConfig.supabasePublishableKey && siteConfig.turnstileSiteKey)

let client
let previousFocus
let captchaId
let captchaToken = ''
let pendingPlatform = ''
let lastSignupEmail = ''

function setSessionUi(session) {
  const button = document.querySelector('.auth-nav-button')
  const nav = getSessionNav(session)
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

function finishAuthentication(session) {
  if (!session?.user) return openAuthModal('login', pendingPlatform)
  setSessionUi(session)
  if (pendingPlatform) location.assign(createDownloadPageUrl(pendingPlatform))
  else closeAuthModal()
}

async function submit(form, operation) {
  const data = new FormData(form)
  setPending(form, true)
  setMessage('')
  try {
    await operation(data)
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
    lastSignupEmail = email
    const supabase = await getClient()
    const { error } = await supabase.auth.signUp({
      email,
      password: String(data.get('password') || ''),
      options: {
        data: { full_name: fullName },
        captchaToken: requireCaptcha(),
        emailRedirectTo: createAuthRedirectUrl(location.href, 'verified', pendingPlatform),
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
    finishAuthentication(result.session)
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
    finishAuthentication(session.session)
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
      options: { emailRedirectTo: createAuthRedirectUrl(location.href, 'verified', pendingPlatform) },
    })
    if (error) throw error
    setMessage('Verification email sent again.', true)
  } catch (error) {
    setMessage(error instanceof Error ? error.message : String(error))
  }
})

document.querySelectorAll('[data-auth-open]').forEach(button => button.addEventListener('click', () => {
  const view = button.dataset.authOpen || 'signup'
  if (view === 'download') return location.assign(createDownloadPageUrl())
  if (button.classList.contains('auth-nav-button')) pendingPlatform = ''
  openAuthModal(view)
}))
document.querySelectorAll('[data-auth-close]').forEach(button => button.addEventListener('click', closeAuthModal))

for (const [selector, platform] of Object.entries({ '.js-dl-win': 'windows', '.js-dl-mac': 'macos', '.js-dl-linux': 'linux' })) {
  document.querySelectorAll(selector).forEach(link => link.addEventListener('click', async event => {
    event.preventDefault()
    pendingPlatform = platform
    try {
      const supabase = await getClient()
      const { data } = await supabase.auth.getSession()
      data.session ? location.assign(link.href) : openAuthModal('signup', platform)
    } catch (error) {
      openAuthModal('signup', platform)
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }))
}

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

async function initializeAuth() {
  const requestedView = authViewFromUrl(location.href)
  pendingPlatform = getRequestedPlatform(location.href)
  if (!authConfigured) {
    if (requestedView) openAuthModal(requestedView)
    return
  }
  try {
    const supabase = await getClient()
    supabase.auth.onAuthStateChange((event, session) => {
      setSessionUi(session)
      if (event === 'PASSWORD_RECOVERY') openAuthModal('recovery')
    })
    const { data } = await supabase.auth.getSession()
    setSessionUi(data.session)
    if (requestedView === 'recovery') openAuthModal('recovery')
    else if (requestedView === 'login') data.session
      ? location.assign(createDownloadPageUrl(pendingPlatform))
      : openAuthModal('login', pendingPlatform)
    if (requestedView) {
      const clean = new URL(location.href)
      clean.searchParams.delete('auth')
      clean.searchParams.delete('platform')
      history.replaceState({}, '', clean.pathname + clean.search)
    }
  } catch (error) {
    if (requestedView) openAuthModal('login')
    setMessage(error instanceof Error ? error.message : String(error))
  }
}

initializeAuth()

/* ── password visibility toggle ── */
document.querySelectorAll('.auth-pw-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = btn.closest('.auth-pw-wrap').querySelector('input')
    const showing = input.type === 'text'
    input.type = showing ? 'password' : 'text'
    btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password')
    btn.querySelector('svg').innerHTML = showing
      ? '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>'
      : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
  })
})
