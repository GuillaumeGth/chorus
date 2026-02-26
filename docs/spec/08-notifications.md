# Notifications push

## Enregistrement

Au démarrage (une fois par session) :

1. Demande de permission push à l'utilisateur
2. Si accordée : récupération du token Expo Push via `expo-notifications`
3. Sauvegarde du token dans `users/{uid}.expoPushToken`

## Réception

| Contexte | Comportement |
|---|---|
| App au premier plan | Notification reçue mais non affichée (comportement par défaut Expo) |
| Tap sur une notification (arrière-plan ou fermée) | Lecture du `chatId` dans les données → navigation vers `app/chat/[id].tsx` |
