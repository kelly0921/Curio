# Curio mobile

The Expo app is Curio's primary capture and browsing experience. It keeps the existing Next.js app as the processing backend and web companion instead of embedding that website in a WebView.

## What works in this iteration

- Native React Native saved-library UI with search and automatic topic collections
- Living guides, glossaries, playbooks, and watchlists that consolidate related saves while retaining source provenance
- A secondary source archive for opening each original Reel or card
- One-field link capture with optional source context
- One-field paste capture that works in Expo Go and static phone previews
- Native iOS and Android **Share to Curio** registration for links, text, images, and videos, with automatic routing into the existing retry-safe capture flow
- Existing provenance-first Learning Cards, source-only states, and source receipts
- Reliable exact-Reel viewing inside Curio through Instagram's public embed, avoiding cold-start redirects into the generic Reels feed
- A For You surface that ranks learning cards against automatically synchronized context
- A per-card context receipt showing which domain-scoped signals influenced its priority and next step
- LAN API discovery during development and an explicit production API URL override
- EAS development, preview, and production profiles
- Durable background processing with resumable job status and manual retry
- Account data export and confirmed deletion controls
- Installable web app metadata, safe app-shell caching, offline fallback, and in-app update prompts

The native app uses stable Expo SDK 57 and configures `expo-sharing` as an incoming iOS Share Extension and Android share intent target. A signed development or preview build can appear as **Curio** in the system share sheet and accept a source link, accompanying text, image, or video without asking the user to choose folders or tags. Expo Go cannot contain Curio's custom native extension, so use it only for ordinary UI previewing; validate incoming sharing in an installable build before inviting testers.

## Prerequisites

- Node.js LTS
- An Expo account for cloud development builds
- The deployed Curio processor, or the local processor running from `apps/learning-library`
- An Apple Developer account for an installable iPhone development build, or an Android phone for the Android internal build

## Processor connection

The processor is deployed at:

```text
https://curio-processor.kellychenmeiyi.workers.dev
```

The Git-ignored `apps/mobile/.env.local` contains this URL. When `EXPO_PUBLIC_CURIO_AUTH_ENABLED=true`, Curio uses Google sign-in through the processor's Better Auth routes and keeps the native session cookie in secure storage. No Google or database secret belongs in the mobile app. The retired personal-beta token is ignored whenever Better Auth is configured on the processor.

To use the local processor instead, update `EXPO_PUBLIC_CURIO_API_URL`, then run:

In terminal one:

```powershell
Set-Location apps/learning-library
npm install
npm run dev
```

Leave it running on port 3031. Without an explicit URL, the mobile app derives the LAN host from Metro and uses the same machine on port 3031.

If the app shows **Processor not connected**, create `apps/mobile/.env.local`:

```dotenv
EXPO_PUBLIC_CURIO_API_URL=http://YOUR_COMPUTER_LAN_IP:3031
EXPO_PUBLIC_CURIO_API_TOKEN=YOUR_PERSONAL_BETA_TOKEN
```

Both devices must be on the same Wi-Fi network and Windows Firewall must allow the Node development servers. `EXPO_PUBLIC_` values are bundled into the app and should never contain OpenAI, database, Better Auth, or Google OAuth secrets.

For Google sign-in in Expo Go, add the exact Metro callback origin (for example `exp://192.168.0.231:8081`) to the processor's `CURIO_NATIVE_AUTH_ORIGINS` before deployment. Curio deliberately rejects wildcard Expo origins. An installable development build uses the stable `curio://` scheme and does not need that temporary LAN origin.

## Install and test the PWA

Build and preview the production web export:

```powershell
Set-Location apps/mobile
npm install
npm run export:web:beta
npm run preview:web
```

Open `http://localhost:8082` on the same computer. Localhost is treated as a secure PWA origin, so browser developer tools can verify the manifest, service worker, offline fallback, and install prompt. A phone needs a deployed HTTPS URL; a LAN `http://192.168...` preview cannot install a service worker.

The initial HTTPS beta is deployed at [curio-app.pages.dev](https://curio-app.pages.dev). Run `npm run export:web:beta`, then publish the static output with `npx wrangler pages deploy dist --project-name curio-app --branch main`. Deploy from `apps/mobile` so the `functions/api/[[path]].js` same-origin proxy is included. The beta export always enables auth, clears Metro's cache, and removes legacy public token/database variables from the build environment. Google must allow the exact callback `https://curio-app.pages.dev/api/auth/callback/google`.

On iPhone, open the deployed URL in Safari, tap **Share**, then **Add to Home Screen**. On supporting desktop and Android browsers, use Curio's **Install** prompt. The PWA does not register as an iOS share-sheet destination; **Share to Curio** is supplied by the separately installed native development, preview, or production build.

## Build the native mobile client

Use a development build for native behavior that Expo Go cannot provide. The SDK 57 configuration generates Curio's iOS Share Extension, App Group entitlement, and Android `ACTION_SEND`/`ACTION_SEND_MULTIPLE` intent filters during the native build.

```powershell
Set-Location apps/mobile
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --profile development --platform android
```

For an iPhone build, use:

```powershell
npx eas-cli@latest build --profile development --platform ios
```

EAS will guide you through device registration and signing. Install the resulting build, then start Metro:

```powershell
npm start
```

Open the installed Curio development client and connect to Metro.

## Test the phone capture flow

1. Start Metro in `apps/mobile`. Start the local processor only if you changed the API URL back to the LAN address.
2. Open Instagram or TikTok on the phone.
3. Tap **Share**, choose **Curio**, and confirm Curio opens directly to its receipt screen without a folder, tag, or note prompt.
4. Curio should confirm the save quickly. Close the app from the processing screen, reopen it, and confirm the Library resumes the job before opening the matching resource or source card.
5. Repeat with a copied link pasted into **Add** to verify the fallback still works.
6. Return to the Library and confirm the resource can be found by a remembered idea, not only its title.
7. Open the original source and confirm Curio retains the exact post or Reel permalink.

A bare restricted Instagram/TikTok URL may result in a source-only card. That is intentional: Curio does not generate a summary unless it received a caption, transcript, visible text, or media it could transcribe.

### Native incoming-share release gate

Before telling testers to choose Curio from the Instagram or TikTok share sheet:

1. Build an installable development client; Expo Go cannot validate a custom share target.
2. Test URL-only, URL-plus-caption, video, image, cold-start, signed-out, retry, and duplicate-share behavior on physical iOS and Android devices.
3. Verify Instagram, TikTok, LinkedIn, Safari/Chrome, and the Photos app each provide the payload Curio expects.
4. Only then advertise **Share to Curio** to external testers; keep paste as the universal fallback.

## Quality commands

```powershell
npm run typecheck
npm run lint
npm test
npm run export:web:beta
node node_modules/expo/bin/cli config --type public
```

## Production gates still open

- Replace the personal prototype identifiers (`com.kelly.curio`) before store submission if needed.
- Configure and validate the Google callback in the PWA and each installable preview build before inviting external testers.
- Physically validate the configured native incoming-share target on signed iOS and Android builds before advertising it to testers.
- Replace the labeled mock context connection with user-authorized Notion sync.
- Replace the bounded Worker-staged upload with a signed direct-to-R2 upload before increasing the 20 MB limit.
- Add automated alert delivery; structured Cloudflare logs, readiness checks, a dead-letter queue, per-user beta rate limits, privacy notice, export, and deletion are now present.
- Replace the template app icon and finalize store metadata.

Current implementation uses stable Expo SDK 57 and follows the official Expo guidance for [monorepos](https://docs.expo.dev/guides/monorepos/), [SDK 57 incoming sharing](https://docs.expo.dev/versions/v57.0.0/sdk/sharing/), and [development builds](https://docs.expo.dev/build/setup/). Expo currently marks incoming sharing experimental, so physical-device testing remains a release gate—especially on iOS, where the extension opens the main app to finish capture.
