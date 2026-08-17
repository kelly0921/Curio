# Curio mobile

The Expo app is Curio's primary capture and browsing experience. It keeps the existing Next.js app as the processing backend and web companion instead of embedding that website in a WebView.

## What works in this iteration

- Native React Native saved-library UI with search and automatic topic collections
- One-field link capture with optional source context
- Incoming iOS Share Extension and Android share intents through `expo-sharing`
- Automatic handling for a shared URL or a shared audio/video file
- Existing provenance-first Learning Cards, source-only states, and source receipts
- Reliable exact-Reel viewing inside Curio through Instagram's public embed, avoiding cold-start redirects into the generic Reels feed
- A For You surface that ranks learning cards against automatically synchronized context
- A per-card context receipt showing which domain-scoped signals influenced its priority and next step
- LAN API discovery during development and an explicit production API URL override
- EAS development, preview, and production profiles

Incoming sharing is experimental in Expo SDK 57. On iOS, the share extension opens the main Curio app to finish processing. Test this behavior on each iOS release before shipping broadly.

## Prerequisites

- Node.js LTS
- An Expo account for cloud development builds
- The deployed Curio processor, or the local processor running from `apps/learning-library`
- An Apple Developer account for an installable iPhone development build, or an Android phone for the Android internal build

## Processor connection

The personal beta is deployed at:

```text
https://curio-processor.kellychenmeiyi.workers.dev
```

The Git-ignored `apps/mobile/.env.local` contains this URL and the matching personal-beta token. The Expo `development`, `preview`, and `production` environments are also configured, so the app can reach Curio without the computer running.

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

Both devices must be on the same Wi-Fi network and Windows Firewall must allow the Node development servers. `EXPO_PUBLIC_` values are bundled into the app and should never contain OpenAI or database credentials; this token is only a temporary personal-beta gate.

## Visual preview

The web preview verifies layout and navigation, but it does not install Curio in the Instagram/TikTok share sheet:

```powershell
Set-Location apps/mobile
npm install
npm run web
```

## Build the real mobile app

The share target requires native configuration, so use a development build rather than Expo Go.

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

## Test the share flow

1. Start Metro in `apps/mobile`. Start the local processor only if you changed the API URL back to the LAN address.
2. Open Instagram or TikTok on the phone.
3. Tap **Share** on a post and choose **Curio**. You may need to add Curio through the share sheet's **More** action the first time.
4. Curio should open, show the automatic processing state, and then show the saved source or Learning Card.
5. Share a short screen recording from Photos/Gallery to verify the uploaded-media transcription path. The current processor accepts supported media up to 20 MB.
6. Return to **Saved** and pull down to refresh if another device added an item.

A bare restricted Instagram/TikTok URL may result in a source-only card. That is intentional: Curio does not generate a summary unless it received a caption, transcript, visible text, or media it could transcribe.

## Quality commands

```powershell
npm run typecheck
npm run lint
npm run export:web
node node_modules/expo/bin/cli config --type public
```

## Production gates still open

- Replace the personal prototype identifiers (`com.kelly.curio`) before store submission if needed.
- Add real user authentication and user-scoped storage before inviting external testers.
- Replace the labeled mock context connection with user-authorized Notion sync.
- Replace the personal-beta bearer gate before distributing the binary.
- Move uploaded media to signed R2 uploads and processing to a Queue.
- Add job status, retries, idempotency, rate limits, crash reporting, privacy policy, export, and account deletion.
- Replace the template app icon and finalize store metadata.

Current implementation follows the official Expo SDK 57 guidance for [monorepos](https://docs.expo.dev/guides/monorepos/), [incoming sharing](https://docs.expo.dev/versions/v57.0.0/sdk/sharing/), and [development builds](https://docs.expo.dev/build/setup/).
