# États d'erreur

| Situation | Comportement |
|---|---|
| Lien non reconnu par Odesli | Message d'erreur + bouton « Réessayer » |
| Erreur réseau pendant la conversion | Message d'erreur + bouton « Réessayer » |
| Morceau absent sur la plateforme du destinataire | « Lien introuvable » + lien vers la recherche sur la plateforme cible |
| Erreur Firestore sur l'abonnement chat | Bandeau rouge dans la conversation |
| Utilisateur supprimé de Firestore | Plateforme affichée comme `null`, pas de crash |
| Annulation Google Sign-In | Message d'erreur discret, bouton de connexion réactivé |
| Re-fetch Odesli échoué au moment d'écouter | Fallback sur `convertedUrl` (lien original de l'expéditeur) |
