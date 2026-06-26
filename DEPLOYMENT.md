# KSFDC Central App Deployment

The central app is a standalone Next.js application. It does not require the repository root, npm workspaces, `packages/shared`, or the local theatre app during deployment.

## Create a new central-only GitHub repository

The files currently inside `central-app` must become the root of the new repository. Do not upload the outer `film-lsa-plan` folder and do not include `local-theatre-app`.

From PowerShell:

```powershell
cd D:\film-lsa-plan

# Include the latest central changes in the subtree history before running this.
git subtree split --prefix=central-app -b central-only-main

# Create an empty GitHub repository first, without README, .gitignore, or license.
git remote remove new-central 2>$null
git remote add new-central https://github.com/YOUR_GITHUB_USER/YOUR_NEW_REPOSITORY.git
git push -u new-central central-only-main:main
```

This keeps central history while excluding the local application. If you want completely fresh history instead, copy the contents of `central-app` into a new empty folder, run `git init -b main`, commit, add the new remote, and push.

Never commit these files or folders:

- `.env.local`
- `.vercel`
- `.next`
- `node_modules`
- database exports containing production data

## Deploy to Vercel

1. Push the central-only repository to your Git provider.
2. In Vercel, create a new project.
3. Import the new central-only GitHub repository.
4. Leave **Root Directory** blank because `package.json` is at repository root.
5. Keep the framework preset as **Next.js**.
6. Use the default commands unless you need custom settings:
   - Install Command: `npm install`
   - Build Command: `npm run build`
   - Output Directory: `.next`
7. Add the required environment variables below.
8. Deploy.

## Required Vercel environment variables

Set these variables in Vercel for Production, Preview, and Development as appropriate:

```env
DATABASE_URL=
LOCAL_THEATRE_API_URL=https://tvm001-local-api.webtestingonline.com
LOCAL_THEATRE_SHARED_SECRET=
CLOUDFLARE_ACCESS_CLIENT_ID=
CLOUDFLARE_ACCESS_CLIENT_SECRET=
NEXT_PUBLIC_APP_NAME=KSFDC Central Booking
AUTH_COOKIE_SECRET=
SESSION_SECRET=
JWT_SECRET=
```

If you do not use `DATABASE_URL`, configure the MySQL fallback variables instead:

```env
MYSQL_HOST=
MYSQL_PORT=3306
MYSQL_USER=
MYSQL_PASSWORD=
MYSQL_DATABASE=ksfdc_central
```

`LOCAL_THEATRE_SHARED_SECRET`, `CLOUDFLARE_ACCESS_CLIENT_ID`, and `CLOUDFLARE_ACCESS_CLIENT_SECRET` are server-only values. Do not expose them with `NEXT_PUBLIC_` names.

## Local API communication

The central server calls the local theatre server through HTTP APIs only. For local authority bookings, central sends:

- `x-authority-secret`
- `CF-Access-Client-Id`
- `CF-Access-Client-Secret`
- signed `X-KSFDC-*` HMAC headers for protected booking endpoints

## Dynamic theatre/movie/show administration

The central database is now the management source for theatre metadata, screens, seat-map versions, movies, and show schedules. Use:

- `/admin/theatre-management` for theatres, screens, seat-map JSON upload/versioning, show creation, show edits, and cancellation.
- `/admin/movie-management` for movie catalogue and poster metadata.
- `/api/admin/management` for authenticated JSON administration actions.

Seat-map JSON is validated server-side before a new layout version is stored. Existing shows keep referencing their original `layout_id`, so later layout versions do not corrupt confirmed bookings.

Show scheduling exposes only these administrator-selectable authority modes:

- `LOCAL_AUTHORITY_ONLINE`: Both Centralised and Local Server Booking
- `CENTRAL_AUTHORITY`: Centralised Booking Only
- `LOCAL_AUTHORITY_OFFLINE`: Local Server Booking Only

Local-authority show edits and cancellations are blocked server-side when the theatre heartbeat is stale/offline, untrusted, has failed/pending local events, or when local sequence numbers are not fully synced.

## Schedule synchronization

Schedule metadata changes are written to an idempotent outbox:

```text
GET  /api/sync/schedule-events?theatreId=THEATRE_ID&afterSequence=0
POST /api/sync/schedule-events
```

Both endpoints use the same HMAC/shared-secret sync verification as the existing central/local sync APIs. Local servers should poll events, apply theatre/screen/movie/show metadata updates without overwriting local ticket sales, then acknowledge processed events with:

```json
{
  "theatreId": "THEATRE_KAVITHA_KOCHI",
  "events": [
    { "eventId": "...", "localSequenceNo": 123, "status": "ACKED" }
  ]
}
```

For local-authority shows, central retains pending schedule sync state until acknowledgement arrives.

## Test local health from central

After deployment, open:

```text
https://central.webtestingonline.com/api/debug/local-health
```

Expected successful response fields:

```json
{
  "success": true,
  "statusCode": 200,
  "localResponse": {
    "status": "ONLINE",
    "dbStatus": "AVAILABLE"
  }
}
```

If the response is `502`, verify `LOCAL_THEATRE_API_URL`, `LOCAL_THEATRE_SHARED_SECRET`, Cloudflare Access service-token settings, and the local theatre tunnel/domain.

## Test booking for SHOW_TODAY_001

1. Confirm local health succeeds at `/api/debug/local-health`.
2. Open the central booking page for the show:

   ```text
   https://central.webtestingonline.com/book/SHOW_TODAY_001
   ```

3. Select available seats and hold them.
4. Confirm the booking.
5. For `LOCAL_AUTHORITY_ONLINE` shows, verify the central API forwards hold/confirm requests to the local theatre HTTP API instead of using local code directly.

## Standalone checklist

- `central-app/package.json` has direct app dependencies only.
- `central-app/package-lock.json` is generated inside this folder by `npm install`.
- `central-app/app`, `central-app/lib`, `central-app/sql`, config files, and `.env.example` are all inside this folder.
- There are no imports from `../shared`, `../../shared`, `@ksfdc/shared`, root `packages/`, or the local theatre app.
