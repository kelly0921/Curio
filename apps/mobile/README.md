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
- The Curio processor running from `apps/learning-library`
- An Apple Developer account for an installable iPhone development build, or an Android phone for the Android internal build

## Run the processor

In terminal one:

```powershell
Set-Location apps/learning-library
npm install
npm run dev
```

Leave it running on port 3031. The mobile app derives the LAN host from Metro and uses the same machine on port 3031.

If the app shows **Processor not connected**, create `apps/mobile/.env.local`:

```dotenv
EXPO_PUBLIC_CURIO_API_URL=http://YOUR_COMPUTER_LAN_IP:3031
```

Both devices must be on the same Wi-Fi network and Windows Firewall must allow the Node development servers. Use a deployed HTTPS Worker URL for EAS preview and production builds.

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

1. Start the Next processor on the computer and Metro in `apps/mobile`.
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
- Add Supabase Auth and user-scoped RLS before inviting external testers.
- Replace the labeled mock context connection with user-authorized Notion sync.
- Deploy the API over HTTPS; do not use a LAN URL in a production binary.
- Move uploaded media to signed R2 uploads and processing to a Queue.
- Add job status, retries, idempotency, rate limits, crash reporting, privacy policy, export, and account deletion.
- Replace the template app icon and finalize store metadata.

Current implementation follows the official Expo SDK 57 guidance for [monorepos](https://docs.expo.dev/guides/monorepos/), [incoming sharing](https://docs.expo.dev/versions/v57.0.0/sdk/sharing/), and [development builds](https://docs.expo.dev/build/setup/).
