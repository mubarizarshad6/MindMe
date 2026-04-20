## MindMe

A voice-first reminder app for React Native. Speak or type what you need to remember; an LLM parses it into a structured reminder (time-based, location-based, or recurring) and schedules a notification. Locations are stored as user-defined places (Home, Gym, Mom's House, etc.) and watched in the background with geofencing.

### Stack

- Expo SDK 54, Expo Router, React Native 0.81
- Groq SDK — Llama 3.3 70B for parsing, Whisper Large v3 for transcription
- `expo-location` for geofencing, `expo-notifications` for scheduled alerts
- `expo-av` for voice recording, `expo-speech` for text-to-speech
- AsyncStorage for local persistence

### Setup

```bash
git clone <repo-url>
cd mindme
npm install
cp .env.example .env
# paste your Groq key into .env
npx expo start
```

Grab a Groq API key from [console.groq.com](https://console.groq.com). The free tier is more than enough for personal use.

### Android build

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

APK lands at `android/app/build/outputs/apk/release/app-release.apk`.

### How the parsing works

Each user message is sent to Groq with a system prompt that forces JSON output and conversation history (last 20 turns) for context. The response is either a single reminder or a `reminders` array when the user lists several with different triggers. See [services/groq.ts](services/groq.ts) for the prompt and [context/ReminderContext.tsx](context/ReminderContext.tsx) for how reminders are scheduled and persisted.

### Permissions

Microphone, fine and background location, notifications, foreground service. Background location is required for geofencing to fire when the app is closed.

### Author

Tasawar Iqbal — [github.com/github6616](https://github.com/github6616)
