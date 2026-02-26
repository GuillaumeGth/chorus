# Réactions aux morceaux

Les réactions permettent à l'utilisateur d'exprimer son ressenti sur un morceau reçu, depuis la mosaïque d'accueil ou depuis un chat. Le système est unifié : même modèle de données, même picker, même affichage visuel dans les deux contextes.

## Réactions disponibles

| Type | Emoji | Label |
|---|---|---|
| `like` | ❤️ | J'aime |
| `superlike` | 🔥 | Super |
| `wow` | 😮 | Wow |
| `dislike` | 👎 | Bof |

Défini dans `src/services/firestore.ts` :

```ts
export type ReactionType = 'like' | 'superlike' | 'wow' | 'dislike';

export const REACTIONS: Array<{ type: ReactionType; emoji: string; label: string }> = [
  { type: 'like',      emoji: '❤️',  label: "J'aime" },
  { type: 'superlike', emoji: '🔥',  label: 'Super' },
  { type: 'wow',       emoji: '😮',  label: 'Wow' },
  { type: 'dislike',   emoji: '👎',  label: 'Bof' },
];
```

## Interaction utilisateur

1. **Appui long** sur une vignette (mosaïque ou message dans le chat) → ouvre le picker
2. Le picker affiche le titre + artiste du morceau et les 4 boutons de réaction
3. **Tap sur une réaction inactive** → l'applique (mise à jour optimiste + Firestore)
4. **Tap sur la réaction active** → la retire (toggle)
5. **Tap en dehors du picker** → ferme sans modification
6. La réaction choisie apparaît sous forme d'un **badge emoji en bas à gauche de la vignette**

## Affichage

Le badge est positionné en absolu (`position: 'absolute', bottom: 4, left: 4`) au-dessus de la vignette (thumbnail). Il affiche toutes les réactions de tous les participants.

- Fond semi-transparent : `rgba(0,0,0,0.55)`
- Taille emoji : 13
- Même style dans `index.tsx` (`mosaicReactionBadge`) et `chat/[id].tsx` (`reactionBadge`)

## Modèle de données Firestore

### Document message : `chats/{chatId}/messages/{msgId}`

```ts
reactions?: Record<string, ReactionType>
// uid → type de réaction
// ex: { "abc123": "like", "def456": "superlike" }
```

- Un seul type de réaction par utilisateur (pas de multi-réaction)
- Supprimer une réaction = `deleteField()` sur la clé `reactions.{uid}`

### Règles de sécurité

Seul le champ `reactions` peut être mis à jour par un participant :

```js
allow update: if request.auth != null
  && request.auth.uid in get(...).data.participants
  && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['reactions']);
```

## API Firestore

```ts
// Ajouter ou retirer une réaction (null = retirer)
setMessageReaction(chatId: string, msgId: string, uid: string, reaction: ReactionType | null): Promise<void>
```

## Mise à jour optimiste

Pour un retour visuel immédiat, les deux écrans maintiennent un état local `localReactions: Record<msgId, ReactionType | null>` :

1. Mise à jour locale avant l'appel Firestore
2. Si l'appel échoue → rollback (suppression de la clé dans `localReactions`)
3. `getMyReaction(item)` consulte `localReactions` en priorité, puis `item.reactions[uid]`

## Fichiers concernés

| Fichier | Rôle |
|---|---|
| `src/services/firestore.ts` | Types `ReactionType`, constante `REACTIONS`, fonction `setMessageReaction` |
| `app/index.tsx` | Réactions sur la mosaïque d'accueil |
| `app/chat/[id].tsx` | Réactions dans les conversations |
