# Configuration de la plateforme

**Écran :** `app/settings.tsx`

L'utilisateur choisit sa plateforme de streaming principale. Ce choix conditionne dans quelle app s'ouvrent les morceaux qu'il reçoit.

## Premier lancement

- Affiché automatiquement après la première connexion
- Bouton « Commencer » (pas de bouton retour)
- Obligatoire avant d'accéder à l'app

## Modification

- Accessible depuis n'importe quel écran via l'icône paramètres
- Liste des 5 plateformes avec coche sur la sélection active
- Bouton « Enregistrer » → retour à l'écran précédent

## Persistance

La plateforme est sauvegardée à deux endroits :

| Endroit | Pourquoi |
|---|---|
| `AsyncStorage` (`@chorus/platform`) | Lecture rapide locale sans requête réseau |
| Firestore `users/{uid}.platform` | Visible par les contacts au moment du partage |
