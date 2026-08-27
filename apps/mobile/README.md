# Curio mobile

The Expo app is Curio's primary capture and browsing experience. It keeps the existing Next.js app as the processing backend and web companion instead of embedding that website in a WebView.

## What works in this iteration

- Native React Native saved-library UI with search and automatic topic collections
- Living guides, glossaries, playbooks, and watchlists that consolidate related saves while retaining source provenance
- A secondary source archive for opening each original Reel or card
- One-field link capture with optional source context
- One-field paste capture that works in Expo Go and static phone previews
- Share-payload parsing, retry UI, and routing prepared for a future native incoming-share target
- Existing provenance-first Learning Cards, source-only states, and source receipts
- Reliable exact-Reel viewing inside Curio through Instagram's public embed, avoiding cold-start redirects into the generic Reels feed
- A For You surface that ranks learning cards against automatically synchronized context
- A per-card context receipt showing which domain-scoped signals influenced its priority and next step
- LAN API discovery during development and an explicit production API URL override
- EAS development, preview, and production profiles

The current app intentionally stays on Expo SDK 54 so it remains compatible with the available Expo Go client. In this SDK, `expo-sharing` supports sharing files out of Curio but does not register Curio as an incoming iOS or Android share target. The reliable phone flow today is **Copy link → open Curio → paste**. The `/handle-share` route and parsing code are preparation for a later native beta; do not describe direct Share-to-Curio as enabled in the current build.

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

The Git-ignored `apps/mobile/.env.local` contains this URL and the public Supabase client configuration. The deployed beta uses each person's passwordless session and keeps it in native secure storage. The retired personal-beta token is ignored by the processor whenever Supabase authentication is configured.

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

Both devices must be on the same Wi-Fi network and Windows Firewall must allow the Node development servers. `EXPO_PUBLIC_` values are bundled into the app and should never contain OpenAI, database, or Supabase secret/service-role credentials.

## Visual preview

The web preview verifies layout and navigation, but it does not install Curio in the Instagram/TikTok share sheet:

```powershell
Set-Location apps/mobile
npm install
npm run web
```

## Build the native mobile client

Use a development build for native behavior that Expo Go cannot provide. Building the current SDK 54 project does not by itself enable an incoming share target; that requires a deliberate SDK/native-extension implementation first.

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
3. Use the platform's **Copy link** action.
4. Open Curio, tap **Add**, paste the link, and save it.
5. Curio should show the processing state and then open the matching living resource or source card.
6. Return to the Library and confirm the resource can be found by a remembered idea, not only its title.
7. Open the original source and confirm Curio retains the exact post or Reel permalink.

A bare restricted Instagram/TikTok URL may result in a source-only card. That is intentional: Curio does not generate a summary unless it received a caption, transcript, visible text, or media it could transcribe.

### Native incoming-share release gate

Before telling testers to choose Curio from the Instagram or TikTok share sheet:

1. Select a supported Expo incoming-sharing release or implement explicit iOS Share Extension and Android intent configuration.
2. Build an installable development client; Expo Go cannot validate a custom share target.
3. Test URL-only, URL-plus-caption, video, cold-start, signed-out, retry, and duplicate-share behavior on physical iOS and Android devices.
4. Only then replace the paste instructions in the product UI.

## Quality commands

```powershell
npm run typecheck
npm run lint
npm run export:web
node node_modules/expo/bin/cli config --type public
```

## Production gates still open

- Replace the personal prototype identifiers (`com.kelly.curio`) before store submission if needed.
- Validate the configured Supabase passwordless callback in each installable preview build before inviting external testers.
- Implement and physically validate the native incoming-share target; the current SDK 54 build is paste-first.
- Replace the labeled mock context connection with user-authorized Notion sync.
- Move uploaded media to signed R2 uploads and processing to a Queue.
- Add job status, retries, idempotency, rate limits, crash reporting, privacy policy, export, and account deletion.
- Replace the template app icon and finalize store metadata.

Current implementation uses Expo SDK 54 and follows the official Expo guidance for [monorepos](https://docs.expo.dev/guides/monorepos/), [SDK 54 sharing](https://docs.expo.dev/versions/v54.0.0/sdk/sharing/), and [development builds](https://docs.expo.dev/build/setup/).
