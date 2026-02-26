# Contacts – Abonnements

## Liste des abonnements

**Écran :** `app/contacts.tsx`

Chørus utilise un système de **follow asymétrique** : on suit des gens sans réciprocité obligatoire.

- Chargée depuis `users/{uid}/following/` au focus de l'écran
- Chaque entrée : avatar (initiale), nom, plateforme actuelle
- La plateforme est **toujours rafraîchie** depuis le profil Firestore (pas la valeur snapshotée au moment du follow)
- Bouton → navigue vers `/search`

**État vide :** « Tu ne suis encore personne. » + bouton vers la recherche

## Recherche et follow

**Écran :** `app/search.tsx`

### Recherche

- Debounce 300 ms sur la saisie
- Deux requêtes Firestore parallèles :
  - Préfixe sur `displayNameLower` (ex : « ali » → tous les noms commençant par « ali »)
  - Préfixe sur `email`
- Déduplication des résultats
- L'utilisateur courant est exclu des résultats

**Technique :** requête range Firestore (`>= lower`, `<= lower + '\uf8ff'`).

### Follow / Unfollow

| État | Bouton | Action |
|---|---|---|
| Non suivi | « Suivre » (contour blanc) | `followUser()` |
| Suivi | « Suivi » (fond vert) | `unfollowUser()` |
| En cours | Spinner | — |

Mise à jour optimiste de l'UI avant confirmation Firestore.

## Modèle de données

```ts
// users/{myUid}/following/{followedUid}
{
  uid: string
  displayName: string
  photoURL: string | null
  platform: PlatformKey | null   // snapshot au moment du follow
  followedAt: Timestamp
}
```
