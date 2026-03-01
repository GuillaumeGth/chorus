# Playlists collaboratives cross-plateforme

## Vue d'ensemble

Une playlist Chørus est une collection de morceaux **indépendante de toute plateforme de streaming**, partagée entre plusieurs utilisateurs avec des rôles différents, et exportable vers les vraies apps musicales via OAuth.

**Problème résolu :** Alice (Spotify), Bob (Deezer) et Clara (YouTube Music) veulent construire une playlist ensemble. Aucune plateforme ne leur permet de collaborer nativement. Chørus sert de couche neutre : chacun contribue depuis son app, et chacun exporte le résultat dans la sienne.

---

## Modèle de données Firestore

### `playlists/{playlistId}`

```ts
{
  id: string,
  name: string,
  description?: string,
  coverThumbnailUrl?: string,       // déduit du dernier morceau ajouté
  createdBy: uid,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  members: { [uid]: 'owner' | 'editor' | 'viewer' },
  memberInfo: { [uid]: { displayName: string, photoURL: string } },
  memberUids: string[],             // tableau pour les requêtes array-contains
  trackCount: number,
  inviteCode: string,               // code court unique ex: "k7mz9q"
  inviteLinkActive: boolean,        // l'owner peut désactiver le lien
  inviteRole: 'editor' | 'viewer',  // rôle accordé aux nouveaux via le lien
  lastTrack: {
    title: string,
    artist: string,
    thumbnailUrl: string,
    addedByName: string,
    addedAt: Timestamp
  }
}
```

### `playlists/{playlistId}/tracks/{trackId}`

```ts
{
  id: string,
  addedBy: uid,
  addedByName: string,
  addedByPhoto: string,
  addedAt: Timestamp,
  title: string,
  artist: string,
  thumbnailUrl: string,
  originalUrl: string,              // URL canonique (toute plateforme), passée à Odesli
  platformLinks: {
    spotify?: string,
    appleMusic?: string,
    youtubeMusic?: string,
    deezer?: string,
    tidal?: string
  },
  position: number                  // ordre dans la playlist (= addedAt par défaut)
}
```

### Index Firestore requis

- `playlists` : `memberUids (array-contains)` + `updatedAt (desc)`
- `playlists/{id}/tracks` : `position (asc)`

---

## Rôles et permissions

| Action | Owner | Editor | Viewer |
|--------|:-----:|:------:|:------:|
| Voir les morceaux | ✅ | ✅ | ✅ |
| Écouter un morceau | ✅ | ✅ | ✅ |
| Exporter la playlist | ✅ | ✅ | ✅ |
| Ajouter un morceau | ✅ | ✅ | ❌ |
| Supprimer son propre morceau | ✅ | ✅ | ❌ |
| Supprimer n'importe quel morceau | ✅ | ❌ | ❌ |
| Inviter des membres | ✅ | ❌ | ❌ |
| Changer le rôle d'un membre | ✅ | ❌ | ❌ |
| Retirer un membre | ✅ | ❌ | ❌ |
| Modifier le nom / description | ✅ | ❌ | ❌ |
| Activer / désactiver le lien d'invitation | ✅ | ❌ | ❌ |
| Supprimer la playlist | ✅ | ❌ | ❌ |

---

## Ajout de morceaux — 3 chemins

### Chemin 1 : Share intent OS → playlist

L'utilisateur partage un lien depuis Spotify, Deezer, etc. via le share sheet natif. Chørus reçoit l'URL. Le contact picker existant dans `index.tsx` propose désormais deux sections :

```
┌─────────────────────────────┐
│  Envoyer à un contact       │
│  ─────────────────────────  │
│  👤 Alice                   │
│  👤 Bob                     │
│                             │
│  Ajouter à une playlist     │
│  ─────────────────────────  │
│  🎵 Nos classiques          │
│  🎵 Road trip 2025          │
└─────────────────────────────┘
```

Flow :
1. Share depuis l'app musicale → Chorus reçoit l'URL (share intent existant)
2. Affichage du picker avec les deux sections
3. L'utilisateur sélectionne une playlist
4. Odesli résout l'URL → `platformLinks` complets
5. Track ajouté à la playlist, notification push envoyée aux membres

### Chemin 2 : Recherche catalogue depuis l'écran playlist

Bouton **"+ Ajouter"** dans l'écran playlist → modal de recherche.

**API : Spotify Search avec Client Credentials (pas d'auth utilisateur requise)**

```
[Recherche "Daft Punk Random Access"]
    → Spotify Search API (client_credentials)
    → Résultats : [{title, artist, thumbnail, spotifyUrl}]
    → Tap sur un résultat
    → Odesli(spotifyUrl) → platformLinks complets
    → Track ajouté à la playlist
```

Les credentials Spotify (client_id, client_secret) sont stockés côté app ou via un proxy serverless. Ils sont distincts des tokens OAuth utilisateur (export).

### Chemin 3 : Coller un lien manuellement

Bouton secondaire **"Coller un lien"** dans le modal d'ajout. Détecte le clipboard ou laisse saisir manuellement une URL. Même résolution Odesli que les autres chemins.

---

## Gestion des membres et invitations

### Invitation via contacts Chorus

Depuis l'écran de gestion des membres (owner uniquement) :
1. Recherche parmi tous les utilisateurs Chorus (réutilise `searchUsers()`)
2. Sélection d'un ou plusieurs contacts
3. Choix du rôle à accorder : `editor` ou `viewer`
4. Notification push envoyée : "X t'a invité à rejoindre la playlist Y"
5. Le destinataire voit la playlist dans sa liste dès son prochain chargement

### Invitation via lien / code

Chaque playlist a un `inviteCode` unique (6 caractères alphanumériques). L'owner peut partager :

- **Deep link :** `chorus://playlist/join/k7mz9q`
- **Code court :** à saisir manuellement dans un écran "Rejoindre"

Flow pour le destinataire :
1. Ouvre le deep link → app Chorus ouvre `playlist/join/[code]`
2. Écran de confirmation : nom de la playlist, créateur, rôle accordé
3. Tap "Rejoindre" → ajouté comme membre
4. Si l'app n'est pas installée → redirigé vers le store

L'owner peut :
- Désactiver le lien (`inviteLinkActive: false`) — les nouveaux ne peuvent plus rejoindre
- Changer le rôle d'invitation (`inviteRole`) — les futurs membres auront ce nouveau rôle
- Réinitialiser le code — génère un nouveau code, l'ancien devient invalide

---

## Export OAuth vers les plateformes

### Architecture commune

Un service par plateforme implémente l'interface suivante :

```ts
// src/services/export/base.ts
interface PlatformExporter {
  isAuthenticated(): Promise<boolean>
  authenticate(): Promise<void>            // PKCE via expo-web-browser
  createPlaylist(name: string, description?: string): Promise<string>  // → playlistId
  addTracks(playlistId: string, platformUrls: string[]): Promise<void>
  getPlaylistUrl(playlistId: string): string
}
```

Les tokens OAuth sont stockés dans **Expo SecureStore** (jamais AsyncStorage — données sensibles).

### Flow UX d'export

```
[Exporter vers Spotify]
  → Vérification du token Spotify en SecureStore
  → Si absent ou expiré → WebBrowser OAuth PKCE → token sauvegardé
  → Création de la playlist sur Spotify : "Ma Playlist Chørus — [nom]"
  → Ajout des tracks par batch
  → Barre de progression : "12 / 30 morceaux ajoutés..."
  → Succès → bouton "Ouvrir dans Spotify" → deep link
```

Si un morceau n'est pas disponible sur la plateforme cible (lien absent dans `platformLinks`), il est ignoré et comptabilisé dans un résumé final ("2 morceaux non disponibles sur Spotify").

### Spotify

- OAuth 2.0 PKCE
- Scopes : `playlist-modify-public playlist-modify-private`
- `POST /v1/users/{user_id}/playlists` → création
- `POST /v1/playlists/{id}/tracks` → ajout (max 100 URIs/requête)
- Utilise les URIs `platformLinks.spotify`

### YouTube Music

- Réutilise le compte Google déjà connecté (Firebase Auth)
- Scope supplémentaire à demander lors de l'export : `https://www.googleapis.com/auth/youtube`
- YouTube Data API v3 : `POST /playlists` → création, `POST /playlistItems` → ajout
- Note : la playlist est une playlist YouTube standard, visible dans YouTube Music **et** YouTube.com — indiscernable pour l'utilisateur dans l'app YouTube Music
- Avantage : pas de nouveau compte à créer, le token Google est déjà présent

### Apple Music

- MusicKit avec User Token (JWT signé avec clé privée Apple)
- Nécessite l'entitlement `com.apple.developer.musickit` (Apple Developer)
- `POST /v1/me/library/playlists` → création
- Ajout de tracks : `POST /v1/me/library/playlists/{id}/tracks`
- Contrainte : le JWT de développeur doit être signé côté serveur (ou secret stocké dans l'app)

### Deezer

- OAuth implicite ou Authorization Code
- `POST /user/me/playlists` → création (avec `access_token` en query param)
- `POST /playlist/{id}/tracks?songs={ids}` → ajout par IDs Deezer
- Les IDs Deezer peuvent être extraits des URLs dans `platformLinks.deezer`

### Tidal

- OAuth 2.0 PKCE (API TIDAL ouverte depuis 2023)
- `POST /v2/playlists` → création
- `PUT /v2/playlists/{id}/relationships/items` → ajout de tracks
- IDs extraits des URLs `platformLinks.tidal`

### Fichiers de services

```
src/services/export/
  base.ts          # Interface PlatformExporter
  spotify.ts
  youtubeMusic.ts
  appleMusic.ts
  deezer.ts
  tidal.ts
  index.ts         # getExporter(platform: PlatformKey): PlatformExporter
```

---

## Nouveaux écrans

| Route | Description |
|-------|-------------|
| `playlists.tsx` | Liste de mes playlists (owner + membre), bouton créer |
| `playlist/[id].tsx` | Détail : tracks, bouton ajouter, bouton exporter, accès membres |
| `playlist/new.tsx` | Formulaire création : nom, description, rôle d'invitation par défaut |
| `playlist/[id]/members.tsx` | Liste des membres, gestion des rôles, invitation (owner uniquement) |
| `playlist/join/[code].tsx` | Confirmation avant de rejoindre via un lien d'invitation |

### Modifications des écrans existants

- `index.tsx` — contact picker étendu avec section "Ajouter à une playlist"
- `_layout.tsx` — gestion des deep links `chorus://playlist/join/[code]`
- Navigation principale — entrée "Playlists" à ajouter (onglet ou bouton depuis home)

---

## Nouveaux hooks

| Hook | Rôle |
|------|------|
| `usePlaylists` | Liste temps-réel des playlists dont l'uid est membre (`array-contains`) |
| `usePlaylist(id)` | Détail + tracks temps-réel d'une playlist |
| `usePlaylistRole(id)` | Rôle de l'utilisateur courant dans la playlist (`'owner' \| 'editor' \| 'viewer' \| null`) |
| `useMusicSearch` | Recherche catalogue via Spotify Search API (client credentials) |
| `usePlaylistExport` | Machine d'état de l'export OAuth : `idle → authenticating → creating → adding → done \| error` |

---

## Nouveaux services Firestore (`src/services/playlists.ts`)

```ts
createPlaylist(name, description?, inviteRole?): Promise<string>        // → playlistId
deletePlaylist(playlistId): Promise<void>                               // owner uniquement
subscribeToMyPlaylists(uid, callback): Unsubscribe
subscribeToPlaylistTracks(playlistId, callback): Unsubscribe
addTrackToPlaylist(playlistId, url): Promise<void>                      // résout Odesli + écrit
removeTrackFromPlaylist(playlistId, trackId, requesterId): Promise<void>
updateMemberRole(playlistId, targetUid, newRole): Promise<void>
removeMember(playlistId, targetUid): Promise<void>
inviteMember(playlistId, targetUid, role): Promise<void>                // écrit + notif push
joinPlaylistByCode(code, uid): Promise<string>                          // → playlistId
generateNewInviteCode(playlistId): Promise<string>
setInviteLinkActive(playlistId, active): Promise<void>
```

---

## Notifications push

| Événement | Destinataires | Contenu |
|-----------|--------------|---------|
| Morceau ajouté | Tous les membres sauf l'auteur | "X a ajouté [titre] à [playlist]" |
| Invitation reçue | L'invité | "X t'a invité à rejoindre [playlist]" |
| Rôle modifié | Le membre concerné | "Ton rôle dans [playlist] est maintenant [rôle]" |

---

## Phases de développement

### Phase 1 — Infrastructure core

- Modèle Firestore + index
- `src/services/playlists.ts` (CRUD de base)
- `usePlaylists`, `usePlaylist`, `usePlaylistRole`
- Écrans `playlists.tsx`, `playlist/[id].tsx` (lecture seule), `playlist/new.tsx`

### Phase 2 — Ajout de morceaux

- Extension du contact picker dans `index.tsx` (section playlists)
- Modal de recherche catalogue (`useMusicSearch` + Spotify Search API)
- Bouton "Coller un lien" dans le modal
- `addTrackToPlaylist()` + résolution Odesli

### Phase 3 — Collaboration et invitations

- Invitation via contacts (écran `playlist/[id]/members.tsx`)
- Génération et gestion du code d'invitation
- Deep link `chorus://playlist/join/[code]` + écran `playlist/join/[code].tsx`
- Gestion des rôles (owner controls)
- Notifications push pour les événements collaboratifs

### Phase 4 — Export OAuth

- Interface `PlatformExporter` + `usePlaylistExport`
- Spotify (API la plus documentée — point d'entrée)
- YouTube Music (réutilise le token Google existant)
- Deezer (API la plus simple)
- Tidal
- Apple Music (le plus contraignant — entitlement + JWT)

---

## Points d'attention techniques

- **SecureStore vs AsyncStorage** : les tokens OAuth ne doivent jamais aller dans AsyncStorage — utiliser `expo-secure-store`
- **Client credentials Spotify (recherche)** : secrets à ne pas exposer côté client en production — envisager un proxy serverless (Firebase Function) pour la v1 propre
- **Quota Odesli** : chaque ajout de morceau consomme un appel Odesli — prévoir une gestion d'erreur si le morceau n'est pas trouvé
- **Apple Music** : le JWT développeur doit être renouvelé tous les 6 mois maximum — prévoir la rotation
- **YouTube scopes** : demander le scope `youtube` uniquement au moment de l'export, pas au login initial, pour ne pas effrayer l'utilisateur
- **Batch size** : Spotify accepte max 100 URIs par requête d'ajout, Apple Music max 25 — adapter les batches par plateforme
