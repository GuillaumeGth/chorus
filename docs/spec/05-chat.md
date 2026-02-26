# Chat

## Liste des conversations

**Écran :** `app/chats.tsx`

- Liste en temps réel (abonnement Firestore `onSnapshot`)
- Triée par `updatedAt` décroissant (conversation la plus récente en haut)
- Chaque ligne : avatar (initiale), nom du contact, aperçu du dernier morceau (« Titre — Artiste »)
- Tap → ouverture de la conversation

**État vide :** « Aucune conversation. Partage un morceau pour commencer ! »

## Conversation

**Écran :** `app/chat/[id].tsx`

Messages en temps réel, triés par `createdAt` ascendant (plus ancien en haut).

**Carte de message :**

```
┌─────────────────────────────┐
│  [miniature]  Titre         │
│               Artiste       │
│  [Écouter sur Spotify]  →   │
│                        ❤️   │
└─────────────────────────────┘
```

- Messages de l'utilisateur : alignés à droite
- Messages des autres : alignés à gauche
- Badge de réaction en bas à gauche de la miniature
- Scroll automatique vers le dernier message à l'arrivée de nouveaux messages

## Écoute d'un morceau

1. Tap sur « Écouter sur [Plateforme] »
2. Vérifie si `platformLinks[maplateforme]` existe dans le message
3. Si oui → ouvre directement le lien
4. Si non → re-fetch depuis Odesli avec `originalUrl` pour obtenir tous les liens
5. Si re-fetch échoue → fallback sur `convertedUrl` (lien original de l'expéditeur)

La plateforme active est lue depuis AsyncStorage à chaque tap — l'utilisateur peut avoir changé de plateforme depuis l'envoi du message.
