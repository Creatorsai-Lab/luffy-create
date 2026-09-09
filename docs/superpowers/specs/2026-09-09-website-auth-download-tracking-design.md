# Website Authentication and Download Tracking Design

## Objective

Move the public website into an isolated Cloudflare Pages project and add a lightweight authentication modal that records users and download-button clicks without changing the offline Electron editor or introducing paid infrastructure.

## Architecture

- Keep application development on `main` and deploy only from the protected `production` branch.
- Host the static website from `live-website/public` through Cloudflare Pages Git integration.
- Keep the website in vanilla HTML, CSS, and JavaScript; use the browser Supabase client only for authentication and data writes.
- Use Supabase Free for email/password authentication, user profiles, Row Level Security, email-domain enforcement, CAPTCHA verification, and download events.
- Use Brevo Free as Supabase's SMTP relay. Brevo credentials live only in Supabase settings.
- Keep installers public in GitHub Releases. Authentication gates the website flow and provides analytics, but does not make release URLs private.
- Fetch the latest published version and OS asset URLs from GitHub's latest-release API.

## Repository Structure

```text
live-website/
  public/
    index.html
    assets/
      site.css
      site.js
      auth.js
      config.js
      images/
  supabase/
    schema.sql
  README.md # describing tech stack and architecuture
```

`config.js` contains only public browser configuration: Supabase URL, Supabase publishable key, and Turnstile site key. Service-role and SMTP credentials never enter the repository.

## User Experience

All existing download buttons open one accessible modal instead of immediately navigating to GitHub. Download buttons open the signup view for signed-out visitors; the header login action opens the login view. The modal provides signup, login, check-email, forgotten-password, password-reset, account/download, and error states.

Signup collects full name, email, and password. After signup, the modal asks the user to check their email. Verification and recovery links return to the homepage through query parameters; the browser restores the Supabase session and opens the corresponding modal state. A signed-in user sees their name, email, logout control, latest version, and Windows, macOS, and Linux download buttons.

## Data and Security

`profiles` contains one row per authenticated user: user ID, full name, and creation time. An authenticated user may read only their own profile. A database trigger creates the profile from verified signup metadata.

`download_events` records user ID, platform, release version, and timestamp. Authenticated users may insert only events whose user ID matches `auth.uid()` and cannot enumerate other users' events. Administrative totals are read in the Supabase dashboard; there is no public admin interface.

A Supabase Before User Created Postgres hook normalizes the domain after the final `@` and accepts an explicit allowlist for Gmail, Yahoo, Outlook/Microsoft, and Proton addresses. This rule is enforced server-side. Supabase CAPTCHA protection validates Cloudflare Turnstile tokens for signup, login, and password recovery. Email confirmation remains mandatory. Passwords are handled exclusively by Supabase.

The page updates its privacy text to distinguish website account/download analytics from the editor, which remains offline and contains no telemetry.

## Download Flow

On load, the website requests the latest GitHub release, selects `.exe`, `.dmg`, and `.AppImage` assets, and renders the release tag. If lookup fails, buttons fall back to the general latest-release page. When an authenticated user clicks an OS button, the site records the event and then starts the public GitHub download. A tracking failure does not block the download.

## Versioning and Deployment

- `package.json` is the application version authority.
- Fast CI runs tests and the application build on `main` and pull requests to `production`.
- Cloudflare Pages uses `production` as its production branch and `live-website/public` as its output directory.
- Desktop packaging remains triggered by `v*` tags, not every production push.
- Release CI verifies that the tag matches `package.json` and that the tagged commit is contained in `production` before packaging all operating systems.
- `main` preview deployments are disabled unless explicitly enabled later.

## Failure Handling

The modal provides concise retryable messages for invalid credentials, unverified email, rejected domains, expired links, CAPTCHA failure, network failure, and email quota exhaustion. Controls disable while requests are pending. Existing sessions are restored on reload. Authentication configuration placeholders disable submission with a setup message rather than causing runtime errors.

## Testing

- Unit-test email-domain normalization, release-asset selection, modal state selection, and download event payloads.
- Validate SQL policies with anonymous, authenticated-own-user, and authenticated-other-user cases.
- Test signup, confirmation, login, logout, password recovery, refresh persistence, and download tracking manually against a Supabase test project.
- Validate the static page, keyboard focus containment, Escape handling, responsive modal layout, broken-network fallback, and production build/deployment configuration.

## External Setup

The repository will include exact setup instructions. The owner must create the free Supabase, Brevo, Turnstile, and Cloudflare Pages projects; enter SMTP and CAPTCHA secrets in provider dashboards; run `schema.sql`; configure the Auth hook and redirect URLs; and connect Cloudflare Pages to the repository's `production` branch.
