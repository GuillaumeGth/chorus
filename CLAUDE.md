# Chørus – CLAUDE.md

## Project overview
React Native app (Expo 54, expo-router) for sharing music between friends across streaming platforms. The user shares a link from any streaming app, Chørus converts it to the recipient's preferred platform and sends it via an in-app chat.

**Core flow:** Alice (Spotify) shares a track → chooses Bob in Chørus → Chørus converts to Bob's platform (YouTube Music) → sends the converted link in a chat → Bob opens it directly in his app.

## Tech stack
- **Expo 54** with **expo-router 6** (file-based routing, `"main": "expo-router/entry"`)
- **Firebase** (JS SDK v12) – Firestore (users, chats, messages) + Auth (Google Sign-In)
- **@react-native-google-signin/google-signin** – native Google Sign-In (not expo-auth-session)
- **expo-share-intent** – receives shared URLs from the OS share sheet
- **expo-clipboard** – clipboard detection for music links
- **@react-native-async-storage/async-storage** – persists platform preference locally
- **TypeScript strict mode**
- No state management library – plain React hooks

## File structure
```
app/
  _layout.tsx          # Root layout: ShareIntentProvider + AuthGate (redirect to /auth if not logged in)
  auth.tsx             # Google Sign-In screen
  index.tsx            # Main screen: mosaic reçus / contact picker / loading / success / error
  settings.tsx         # Platform picker + sign out
  chats.tsx            # Chat list (real-time via Firestore)
  chat/[id].tsx        # Chat conversation (real-time messages)
  contacts.tsx         # Liste des abonnements (following)
  search.tsx           # Recherche d'utilisateurs + follow/unfollow
src/
  config/firebase.ts   # Firebase app init, exports auth + db
  services/odesli.ts   # Odesli API call → OdesliResult
  services/firestore.ts # Firestore CRUD: users, chats, messages, following
  hooks/useAuth.ts     # onAuthStateChanged wrapper
  hooks/usePlatformPreference.ts  # AsyncStorage read/write (@chorus/platform)
  hooks/useFollowing.ts           # Liste des abonnements avec platform fraîche
  hooks/useReceivedMessages.ts    # Morceaux reçus cross-chats (mosaïque accueil)
google-services.json   # Firebase Android config (must have client_type: 1 with SHA-1)
eas.json               # EAS Build config (preview → APK, production → AAB)
.npmrc                 # legacy-peer-deps=true (résout conflits peer deps)
assets/                # Icons and splash
```

## Commands
```bash
npx expo start           # Start Metro bundler (JS hot reload, no rebuild)
npx expo run:android     # Build + install on Android (required after native changes)
npx expo prebuild --clean && npx expo run:android  # Full native rebuild
```

**Rebuild required** when changing: `app.json`, `google-services.json`, adding native modules.
**Hot reload only** for all `.tsx` / `.ts` changes.

## Key conventions
- **No class components** – only function components with hooks
- **StyleSheet.create** for all styles – no inline style objects
- Dark theme throughout: background `#0d0d0d`, accent `#1db954`
- Supported platforms: `spotify | appleMusic | youtubeMusic | deezer | tidal`
- AsyncStorage key: `@chorus/platform`

## Authentication
- Google Sign-In via `@react-native-google-signin/google-signin` (native dialog, no redirect URI)
- After sign-in: creates/updates user in Firestore, navigates to `/`
- `AuthGate` in `_layout.tsx` redirects to `/auth` if not logged in
- Platform not set → redirected to `/settings` from `index.tsx`

## Firestore data model

### `users/{uid}`
```ts
{ uid, displayName, displayNameLower, email, photoURL, platform }
```
- `displayNameLower` enables prefix search (`>=` / `<=` + `\uf8ff`)

### `chats/{chatId}`
```ts
{ participants: string[], participantInfo: Record<uid, {displayName, photoURL}>, lastMessage, updatedAt }
```
- `chatId` is deterministic: `[uid1, uid2].sort().join('_')`
- Requires composite index: `participants (array) + updatedAt (desc)`

### `chats/{chatId}/messages/{msgId}`
```ts
{ senderId, senderName, originalUrl, convertedUrl, title, artist, thumbnailUrl, targetPlatform, createdAt }
```

### `users/{uid}/following/{followedUid}`
```ts
{ uid, displayName, photoURL, platform, followedAt }
```
- Snapshot au moment du follow – platform est toujours rafraîchie depuis `getUserProfile` à l'affichage

## Home screen (index.tsx)
- **Mosaïque** (grille 3 colonnes) si des morceaux ont été reçus → tap = ouvre le morceau dans l'app musicale
- **Guide "comment ça marche"** si aucun morceau reçu
- **Contact picker** quand un share intent est détecté (liste des abonnements)
- `useReceivedMessages` : agrège tous les messages cross-chats où `senderId !== uid`, rafraîchi au focus + au changement d'auth

## Odesli API
```
GET https://api.song.link/v1-alpha.1/links?url=<encoded-url>
```
- Metadata: `entitiesByUniqueId[firstKey]` → title, artistName, thumbnailUrl
- Links: `linksByPlatform.<provider>.url`

## Android setup (critical)
- Debug keystore: `android/app/debug.keystore` (NOT `~/.android/debug.keystore`)
- SHA-1 to register: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
- SHA-1 must be registered in both Firebase Console (Android app) AND Google Cloud Console (Android OAuth client)
- `google-services.json` must contain `client_type: 1` entry for Google Sign-In to work
- Plugin config in `app.json`: `"@react-native-google-signin/google-signin"` with NO options (reads `googleServicesFile` from `android` section)
- `app.json` → `android.googleServicesFile: "./google-services.json"`

## Build
```bash
eas build --local --platform android --profile preview   # APK local
eas build --local --platform android --profile production # AAB local
```
- Nécessite Android SDK + Java installés en local
- `eas init` doit être lancé une fois pour lier le projet à un compte Expo
- Si `npm ci` échoue : vérifier `.npmrc` contient `legacy-peer-deps=true`
- Supprimer les `experimental.ios.appExtensions` dupliqués de `app.json` si `expo-share-intent` remonte une erreur de doublon ShareExtension

## Important notes
- `expo-share-intent` requires a native build – does not work in Expo Go
- `app/_layout.tsx` must not navigate before auth/platform state is `loaded` to avoid redirect flashes
- `convertingRef` in `index.tsx` prevents double conversion when share intent + clipboard trigger simultaneously
- Platform preference saved to both AsyncStorage (local) and Firestore (so contacts see your platform)
- `useFocusEffect` callback must be synchronous – wrap async calls inside a void function
- `auth.currentUser` peut être null au premier render : utiliser `onAuthStateChanged` en complément de `useFocusEffect`
