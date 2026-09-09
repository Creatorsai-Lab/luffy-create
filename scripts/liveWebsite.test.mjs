import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  authViewFromUrl,
  createDownloadEvent,
  createAuthRedirectUrl,
  createDownloadPageUrl,
  getDownloadUrl,
  getRequestedPlatform,
  getSessionNav,
  isAllowedEmail,
  normalizeEmailDomain,
  selectReleaseAssets,
} from '../live-website/public/assets/site-core.mjs'

assert.equal(normalizeEmailDomain(' User@GMAIL.com '), 'gmail.com')
assert.equal(normalizeEmailDomain('invalid'), '')
assert.equal(isAllowedEmail('creator@proton.me'), true)
assert.equal(isAllowedEmail('creator@gmail.com.evil.test'), false)
assert.equal(isAllowedEmail('creator@temporary.test'), false)

const assets = selectReleaseAssets({
  tag_name: 'v1.4.0',
  assets: [
    { name: 'Luffy.exe', browser_download_url: 'https://example.test/Luffy.exe' },
    { name: 'Luffy.dmg', browser_download_url: 'https://example.test/Luffy.dmg' },
    { name: 'Luffy.AppImage', browser_download_url: 'https://example.test/Luffy.AppImage' },
  ],
})
assert.deepEqual(assets, {
  version: 'v1.4.0',
  windows: 'https://example.test/Luffy.exe',
  macos: 'https://example.test/Luffy.dmg',
  linux: 'https://example.test/Luffy.AppImage',
})
assert.equal(selectReleaseAssets({ tag_name: 'v1.4.0', assets: [] }).windows, '')

assert.equal(authViewFromUrl('https://luffy.pages.dev/?auth=verified'), 'verified')
assert.equal(authViewFromUrl('https://luffy.pages.dev/?auth=recovery'), 'recovery')
assert.equal(authViewFromUrl('https://luffy.pages.dev/?auth=login&platform=linux'), 'login')
assert.equal(authViewFromUrl('https://luffy.pages.dev/'), null)
assert.equal(createAuthRedirectUrl('https://luffy.pages.dev/?old=1#token', 'verified'), 'https://luffy.pages.dev/?auth=verified')
assert.equal(createAuthRedirectUrl('https://luffy.pages.dev/', 'verified', 'windows'), 'https://luffy.pages.dev/download/?platform=windows')
assert.equal(createAuthRedirectUrl('https://luffy.pages.dev/download/#linux', 'login', 'linux'), 'https://luffy.pages.dev/?auth=login&platform=linux')
assert.equal(createDownloadPageUrl('windows'), '/download/#windows')
assert.equal(createDownloadPageUrl('android'), '/download/')
assert.equal(getRequestedPlatform('https://luffy.pages.dev/download/#linux'), 'linux')
assert.equal(getRequestedPlatform('https://luffy.pages.dev/?auth=login&platform=macos'), 'macos')
assert.equal(getRequestedPlatform('https://luffy.pages.dev/download/#other'), '')

assert.deepEqual(createDownloadEvent('user-1', 'windows', 'v1.4.0'), {
  user_id: 'user-1',
  platform: 'windows',
  version: 'v1.4.0',
})
assert.throws(() => createDownloadEvent('', 'windows', 'v1.4.0'))
assert.throws(() => createDownloadEvent('user-1', 'android', 'v1.4.0'))
assert.equal(getDownloadUrl(assets, 'macos'), 'https://example.test/Luffy.dmg')
assert.equal(getDownloadUrl(assets, 'android'), 'https://github.com/Creatorsai-Lab/luffy-create/releases/latest')
assert.deepEqual(getSessionNav(null), { label: 'Start', view: 'login' })
assert.deepEqual(getSessionNav({ user: { id: 'user-1' } }), { label: 'Download', view: 'download' })

const page = await readFile(new URL('../live-website/public/index.html', import.meta.url), 'utf8')
for (const marker of ['assets/auth.css', 'class="auth-nav-button"', 'id="authModal"', 'assets/auth.js']) {
  assert.ok(page.includes(marker), `live website is missing auth marker: ${marker}`)
}
assert.match(page, /assets\/auth\.js\?v=\d+/)
for (const platform of ['windows', 'macos', 'linux']) {
  assert.ok(page.includes(`href="/download/#${platform}"`), `homepage must link to ${platform} download section`)
}
assert.ok(!page.includes('data-auth-view="download"'), 'download controls must not remain in the auth popup')

const downloadPage = await readFile(new URL('../live-website/public/download/index.html', import.meta.url), 'utf8')
for (const marker of ['id="downloadAccount"', 'id="windows"', 'id="macos"', 'id="linux"', '../assets/download.js']) {
  assert.ok(downloadPage.includes(marker), `download page is missing marker: ${marker}`)
}
const downloadScript = await readFile(new URL('../live-website/public/assets/download.js', import.meta.url), 'utf8')
assert.ok(downloadScript.includes('getSession()'), 'download page must verify the Supabase session')
assert.ok(downloadScript.includes("from('download_events').insert"), 'download page must track installer clicks')
const headers = await readFile(new URL('../live-website/public/_headers', import.meta.url), 'utf8')
const normalizedHeaders = headers.replaceAll('\r\n', '\n')
for (const asset of ['/assets/auth.js', '/assets/config.js', '/assets/site-core.mjs', '/assets/download.js']) {
  assert.ok(normalizedHeaders.includes(`${asset}\n  Cache-Control: no-store`), `${asset} must bypass stale deployment caches`)
}

const auth = await readFile(new URL('../live-website/public/assets/auth.js', import.meta.url), 'utf8')
assert.ok(auth.includes('supabase.auth.signUp'), 'signup must use Supabase email/password authentication')
assert.ok(auth.includes('captchaToken'), 'signup must pass the Turnstile token')
assert.ok(!auth.includes('signInAnonymously'), 'signup must not use anonymous authentication')
const formCaptureAt = auth.indexOf('const data = new FormData(form)')
assert.ok(formCaptureAt >= 0 && formCaptureAt < auth.indexOf('setPending(form, true)'),
  'form data must be captured before inputs are disabled')

console.log('live website tests passed')
