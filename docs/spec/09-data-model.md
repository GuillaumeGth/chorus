# Modèle de données Firestore

## `users/{uid}`

```ts
{
  uid: string
  displayName: string
  displayNameLower: string     // pour la recherche préfixe
  email: string
  photoURL: string | null
  platform: PlatformKey | null
  expoPushToken?: string
}
```

## `chats/{chatId}`

`chatId` est déterministe : `[uid1, uid2].sort().join('_')`

```ts
{
  participants: string[]
  participantInfo: Record<uid, { displayName: string; photoURL: string | null }>
  lastMessage: {
    title: string
    artist: string
    senderId: string
    createdAt: Timestamp
  } | null
  updatedAt: Timestamp
}
```

**Index composite requis :** `participants (array-contains)` + `updatedAt (desc)`

## `chats/{chatId}/messages/{msgId}`

```ts
{
  senderId: string
  senderName: string
  originalUrl: string           // URL d'origine (Spotify, etc.)
  convertedUrl: string          // URL principale convertie
  platformLinks: Partial<Record<PlatformKey, string>>  // tous les liens disponibles
  title: string
  artist: string
  thumbnailUrl: string
  targetPlatform: PlatformKey   // plateforme du destinataire au moment de l'envoi
  createdAt: Timestamp
  reactions?: Record<uid, ReactionType>
}
```

## `users/{uid}/following/{followedUid}`

```ts
{
  uid: string
  displayName: string
  photoURL: string | null
  platform: PlatformKey | null  // snapshot au moment du follow
  followedAt: Timestamp
}
```
