# Luffy Create Live Website

This folder is the isolated production website. It stays independent from the Electron application and uses no frontend framework or custom backend.

## Architecture

- `public/`: static Cloudflare Pages output.
- `public/assets/auth.js`: popup authentication, session restoration, release lookup, and download-click recording.
- `public/assets/site-core.mjs`: dependency-free, tested website rules.
- `public/assets/config.js`: public browser identifiers only.
- `supabase/schema.sql`: profiles, download events, RLS, and the signup-domain hook.
- GitHub Releases: public Windows, macOS, and Linux installers.

The website records account details and download-button clicks. The desktop editor remains local-first and sends no telemetry. Because release assets are public, someone with the GitHub URL can bypass the website login.

## 1. Create Supabase Free project

1. Create a Free project without upgrading or adding paid usage.
2. Open SQL Editor and run `supabase/schema.sql`.
3. Run `supabase/schema.test.sql`; it should finish without an exception.
4. Under Authentication → Providers → Email, enable email/password and Confirm email.
5. Under Authentication → Hooks, select Before User Created and choose the Postgres function `public.hook_restrict_signup_by_email_domain`.
6. Under Authentication → URL Configuration, set the site URL to your Cloudflare Pages URL and allow `https://YOUR_PROJECT.pages.dev/**` as a redirect URL.
7. Copy the project URL and publishable key into `public/assets/config.js`. Never use the service-role key in the website.

## 2. Configure Brevo Free SMTP

1. Create the single owner Brevo account; website users never visit Brevo.
2. Verify a dedicated sender email. Use a custom-domain sender with SPF/DKIM after you own a domain.
3. In Supabase Authentication → Emails → SMTP Settings, enter Brevo's SMTP host, port, username, password, sender email, and sender name.
4. Disable link tracking in Brevo so verification URLs are not rewritten.
5. Keep Brevo on Free with no payment method. Its free daily limit stops sends rather than upgrading the account.

## 3. Configure free Turnstile

1. Create a Turnstile widget for the Cloudflare Pages hostname.
2. Put its public site key in `public/assets/config.js`.
3. In Supabase Authentication → Bot and Abuse Protection, enable Turnstile and enter its secret key.
4. Keep the secret key only in Supabase; never commit it.

## 4. Test locally

```powershell
npm run test:website
npm run dev:website
```

Open the Vite URL. Until `config.js` is populated, the modal deliberately displays a setup message and does not submit credentials.

Test signup, email confirmation, login, logout, password recovery, session restoration, all three download buttons, and rejected email domains. In Supabase, check `profiles` for user totals and `download_events` for clicks:

```sql
select count(*) as registered_users from public.profiles;
select platform, version, count(*) as clicks
from public.download_events
group by platform, version
order by version desc, platform;
```

### * Commit and push main:

git add -A
git commit -m "Release v1.4.0"
git push origin main
Wait for the Validate workflow to pass (gh run watch, or the Actions tab). This is the first run with the fixed tests.

* Merge into production and push:

git checkout production
git pull origin production
git merge main --no-ff -m "Release v1.4.0"
git push origin production

3. Tag that commit and push only the tag:

git tag -a v1.4.0 -m "Release v1.4.0"
git push origin v1.4.0
git checkout main
4. Wait for the build (about 6 minutes; gh run watch). You should get a draft release with 8 files: Windows .exe, macOS .dmg, Linux .AppImage, two .blockmap files and three latest*.yml files.
