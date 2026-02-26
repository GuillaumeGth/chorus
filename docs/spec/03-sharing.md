# Flux de partage de musique

C'est la fonctionnalité centrale de l'application. Elle peut être déclenchée de trois façons.

## Sources d'entrée

### Source A – Share sheet natif (principal)

1. L'utilisateur est dans Spotify (ou autre app musicale)
2. Il tape « Partager » → choisit Chørus dans la liste des apps
3. Chørus reçoit l'URL via `expo-share-intent`
4. Navigation automatique vers l'écran d'accueil
5. Le sélecteur de destinataire s'ouvre immédiatement

### Source B – Presse-papiers

1. L'utilisateur copie un lien musical dans une autre app
2. À la prochaine ouverture de Chørus (ou retour au premier plan)
3. Un bandeau « Lien musical détecté » apparaît en bas d'écran
4. Bouton « Convertir » → lance la conversion sans destinataire (pour soi)

### Source C – Intent filter Android

1. Un lien musical est tapé dans une autre app (SMS, navigateur…)
2. Android propose d'ouvrir avec Chørus
3. L'URL est passée via le paramètre `?incomingUrl=` de la route `/`
4. Conversion automatique lancée (sans sélecteur de destinataire)

## Sélection du destinataire

Affiché après la source A :

- Liste des abonnements de l'utilisateur (avec plateforme fraîche)
- Champ de recherche pour filtrer par nom
- Option « Pour moi » en haut de liste (conversion vers sa propre plateforme)
- Tap sur un contact → lance la conversion vers sa plateforme

## Conversion (service Odesli)

```
GET https://api.song.link/v1-alpha.1/links?url=<url-encodée>&userCountry=US
```

L'API retourne pour un même morceau les liens vers toutes les plateformes disponibles.

**Données extraites :**

| Champ | Source dans la réponse |
|---|---|
| Titre | `entitiesByUniqueId[firstKey].title` |
| Artiste | `entitiesByUniqueId[firstKey].artistName` |
| Miniature | `entitiesByUniqueId[firstKey].thumbnailUrl` |
| Liens | `linksByPlatform.<platform>.url` |

**Fallbacks :** `Unknown title` / `Unknown artist` si champs absents. Certains morceaux ne sont pas disponibles sur toutes les plateformes — le lien correspondant est alors absent.

## Machine d'état (`useConversionFlow`)

```
idle ──onShareIntent──▶ idle (picker visible)
                               │
                        startConversion
                               │
                               ▼
                           loading
                          /       \
                    resolve       reject
                       │             │
                    success        error
                       │             │
                    reset()       reset()
                       │
                      idle
```

**Invariant :** quand `pendingUrl` est défini ET `status === 'idle'`, le sélecteur de destinataire DOIT être visible.

**Protection contre les race conditions :**
- `convertingRef` : empêche une double conversion simultanée
- `generationRef` : invalide les callbacks `.then/.catch` d'une conversion périmée quand un nouveau share intent arrive

## Envoi du message

Une fois la conversion réussie et le destinataire confirmé :

1. Récupération du profil frais du destinataire (la plateforme peut avoir changé)
2. Extraction du lien converti : `result.platformLinks[destinataire.platform]`
3. Création ou réutilisation du chat (`chats/{uid1_uid2}`)
4. Enregistrement du message dans `chats/{chatId}/messages/{msgId}`
5. Mise à jour de `lastMessage` et `updatedAt` sur le chat
6. Navigation vers le chat

**Si le lien est absent** sur la plateforme du destinataire : affichage d'un message « Lien introuvable » avec un bouton vers la recherche sur la plateforme cible.
