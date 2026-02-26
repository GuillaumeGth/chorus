# Écran d'accueil – Mosaïque

**Écran :** `app/index.tsx`

## Vue mosaïque

Affichée quand l'utilisateur a reçu au moins un morceau.

- Grille 3 colonnes de vignettes carrées (miniature du morceau)
- Triée par date de réception décroissante (le plus récent en premier)
- Tap sur une vignette → ouvre le morceau dans l'app musicale de l'utilisateur
- Appui long → ouvre le picker de réaction
- Bouton ✕ sur chaque vignette → dismiss

## Vue guide

Affichée quand aucun morceau n'a encore été reçu.

Explique le fonctionnement en 3 étapes :
1. Partager depuis une app musicale
2. Choisir un contact dans Chørus
3. Le contact reçoit le lien converti

## Dismiss et undo

- Tap ✕ → la vignette disparaît localement
- Toast « Annuler » visible pendant 4 secondes
- Tap « Annuler » → la vignette réapparaît
- Après 4 secondes → le dismiss est définitif

**Persistance :** `AsyncStorage` clé `@chorus/dismissedMessages_v2` (liste des IDs dismissés).

## Rafraîchissement

Les messages reçus sont rechargés :
- Au focus de l'écran (`useFocusEffect`)
- Au changement d'état d'authentification (`onAuthStateChanged`)
