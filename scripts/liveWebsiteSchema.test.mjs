import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const sql = await readFile(new URL('../live-website/supabase/schema.sql', import.meta.url), 'utf8')

for (const required of [
  'create table if not exists public.profiles',
  'create table if not exists public.download_events',
  'enable row level security',
  'hook_restrict_signup_by_email_domain',
  'gmail.com',
  'proton.me',
]) assert.ok(sql.toLowerCase().includes(required), `missing SQL contract: ${required}`)

assert.match(sql, /auth\.uid\(\)\)\s*=\s*user_id/)
assert.ok(sql.includes('revoke all on public.download_events from anon'))
assert.ok(sql.includes('revoke select on public.download_events from authenticated'))

console.log('live website schema tests passed')
