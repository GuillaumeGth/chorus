# Vue d'ensemble

Chørus est une application mobile (iOS/Android) qui permet de partager des morceaux de musique entre amis, quelle que soit leur plateforme de streaming.

**Problème résolu :** Alice écoute sur Spotify, Bob sur YouTube Music. Alice veut envoyer un morceau à Bob. Aujourd'hui elle copie un lien Spotify que Bob ne peut pas ouvrir directement.

**Solution :** Alice partage le lien depuis Spotify → Chørus convertit automatiquement → Bob reçoit un lien YouTube Music qu'il ouvre en un tap.

## Plateformes supportées

| Clé interne | Nom affiché |
|---|---|
| `spotify` | Spotify |
| `appleMusic` | Apple Music |
| `youtubeMusic` | YouTube Music |
| `deezer` | Deezer |
| `tidal` | Tidal |

## Principes UX

- Thème sombre : fond `#0d0d0d`, accent vert `#1db954`
- Zéro friction : le partage se fait depuis le bouton natif « Partager » de n'importe quelle app musicale
- Pas de compte à créer : connexion Google en un tap
