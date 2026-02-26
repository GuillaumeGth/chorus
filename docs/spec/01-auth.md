# Authentification

**Écran :** `app/auth.tsx`

## Connexion

1. L'utilisateur tape « Continuer avec Google »
2. Le dialog natif Google s'ouvre (compte déjà enregistré sur l'appareil)
3. Chørus récupère le token Google → crée une session Firebase Auth
4. Création ou mise à jour du profil utilisateur dans Firestore (`users/{uid}`)
5. Redirection vers l'écran d'accueil `/`

**Cas d'erreur :** annulation, absence de Play Services, erreur réseau → message d'erreur affiché avec code.

## Protection des écrans

`app/_layout.tsx` (composant `AuthGate`) vérifie l'état auth à chaque rendu :

- Pas de session → redirection vers `/auth`
- Session valide + plateforme non configurée → redirection vers `/settings`
- Session valide + plateforme configurée → accès normal

La redirection n'a lieu qu'une fois l'état `loaded` (AsyncStorage + Firebase) résolu, pour éviter les flashes de navigation.

## Déconnexion

Depuis `app/settings.tsx` → déconnexion Firebase → redirection vers `/auth`.
