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

## 5. Deploy from `production`

### One-time branch setup

Run this once from a clean, tested `main` branch:

```powershell
git switch main
git pull --ff-only origin main
git switch -c production
git push -u origin production
git switch main
```

Then create a Cloudflare **Pages** project using Git integration and select this repository:

1. Set Production branch to `production`.
2. Set Framework preset to `None`.
3. Set Root directory to `live-website`.
4. Leave Build command empty and set Build output directory to `public`.
5. Set Preview branches to None if only production should deploy.
6. Protect `production` in GitHub: require pull requests and successful `Validate` checks; block force pushes and deletion.

If a Cloudflare log says `Executing user deploy command: npx wrangler deploy`, a Workers Build was created instead of a Pages project. A Pages Git project does not need a deploy command. Do not upgrade the editor's Vite dependency to fix that configuration error.

Cloudflare watches `production` directly. GitHub Actions validates pushes to `main` and `production`, plus pull requests targeting `production`.

### Promote tested changes

Keep daily development on `main`. After its checks pass, open a GitHub pull request from `main` into `production`. Review and merge it without deleting either long-lived branch. The production push deploys the website automatically; it does not create an application release.

If branch protection has not been enabled yet, the equivalent local fast-forward promotion is:

`git pull --ff-only origin main` downloads new commits from `origin/main` and advances the local `main` branch only when this can happen without creating a merge commit. If local and remote history have diverged, `--ff-only` stops with an error so you can review the difference instead of Git merging unexpectedly. The same rule applies to the production pull below.

```powershell
git switch main
git pull --ff-only origin main
npm run test:website
npm run test:subtitle
npm run build
git switch production
git pull --ff-only origin production
git merge --ff-only main
git push origin production
git switch main
```

## 6. Publish an application release

1. Update the version in `package.json` on `main` using `npm version VERSION --no-git-tag-version` so the lockfile stays synchronized.
2. Run `npm run test:website`, `npm run test:subtitle`, and `npm run build`.
3. Merge `main` into protected `production` after CI passes.
4. Create an annotated tag on that production commit, for example `git tag -a v1.3.5 -m "Release v1.3.5"`.
5. Push only that tag with `git push origin v1.3.5`. Release CI verifies the version and production ancestry before packaging all operating systems.

The live page reads the newest published GitHub Release at runtime, so it continues showing the previous valid release until the new assets are available.

Do not recreate or move an existing release tag. The website deployment itself needs no tag; create one only when publishing a new application version whose value matches `package.json` exactly.
