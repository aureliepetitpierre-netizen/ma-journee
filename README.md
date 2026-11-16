# Ma journée

Ta journée type en timeline sur ton téléphone Android, avec chrono, mode focus et Google Agenda.

Pour l'utiliser sur ton téléphone, il faut deux choses :
1. mettre l'appli en ligne (gratuit), pour qu'elle ait une adresse en `https://` ;
2. créer un identifiant Google, pour que l'appli puisse lire ton agenda.

Compte environ 20 minutes la première fois.

---

## Étape 1 : mettre l'appli en ligne avec GitHub Pages

1. Crée un compte gratuit sur https://github.com (si tu n'en as pas).
2. Crée un nouveau dépôt : bouton **New**, nom `ma-journee`, coche **Public**, puis **Create repository**.
3. Sur la page du dépôt, clique sur **uploading an existing file** et glisse-dépose **tout le contenu** du dossier `app` (les fichiers et le dossier `icons`). Clique sur **Commit changes**.
4. Va dans **Settings → Pages**. Sous « Branch », choisis `main` et `/ (root)`, puis **Save**.
5. Après une minute, l'adresse de l'appli s'affiche, du type `https://ton-pseudo.github.io/ma-journee/`. Note-la.

Le dépôt est public : le code de l'appli est visible, mais pas tes données. Tes blocs restent sur ton téléphone et ton agenda n'est lu que par ton téléphone.

## Étape 2 : créer l'identifiant Google

1. Va sur https://console.cloud.google.com et connecte-toi avec le compte Google de ton agenda.
2. En haut, crée un projet : **Nouveau projet**, nom `Ma journee`, puis **Créer**.
3. Menu **API et services → Bibliothèque** : cherche **Google Calendar API** et clique sur **Activer**.
4. Menu **API et services → Écran de consentement OAuth** (ou « Google Auth Platform ») :
   - type d'utilisateur **Externe** ;
   - nom de l'appli `Ma journée`, ton e-mail comme adresse d'assistance et de contact ;
   - dans **Audience** (ou « Utilisateurs test »), ajoute **ton adresse Gmail** comme utilisateur test.
   Laisse l'appli en mode « Test » : seule toi pourras t'y connecter, c'est voulu.
5. Menu **API et services → Identifiants → Créer des identifiants → ID client OAuth** :
   - type **Application Web** ;
   - dans **Origines JavaScript autorisées**, ajoute `https://ton-pseudo.github.io` (sans le `/ma-journee`) ;
   - **Créer**. Copie l'**ID client** (il finit par `.apps.googleusercontent.com`).
6. Sur GitHub, ouvre le fichier `config.js`, clique sur le crayon ✏️ pour le modifier, colle l'ID entre les guillemets :
   ```js
   GOOGLE_CLIENT_ID: "123456789-abc.apps.googleusercontent.com"
   ```
   puis **Commit changes**. Attends une minute.

## Étape 3 : installer sur ton téléphone

1. Ouvre l'adresse de l'étape 1 dans **Chrome** sur ton téléphone.
2. Menu **⋮ → Installer l'application** (ou « Ajouter à l'écran d'accueil »).
3. Ouvre l'appli depuis l'écran d'accueil, puis **Réglages** (icône en haut à droite) :
   - **Connecter Google Agenda**. Google affiche « Google n'a pas validé cette application » : c'est normal pour une appli en mode test. Touche **Continuer** ;
   - **Activer les notifications**, puis **Tester**.

## Bon à savoir

- **Connexion Google** : par sécurité, l'accès donné par Google dure une heure. Après, l'appli affiche « Actualiser » : un toucher suffit, sans retaper ton mot de passe.
- **Notifications** : quand l'appli est ouverte ou en mode focus, tu as le son et la vibration à la fin du chrono. Quand l'appli est en arrière-plan, Android l'endort au bout de quelques minutes. La notification peut alors arriver en retard ou pas du tout. Le mode focus garde l'écran allumé : c'est le plus fiable pour le deep work.
- **Chaque jour**, la timeline repart de ta journée pleine. Le chrono d'un bloc continue même si tu fermes l'appli.
- **Hors ligne**, l'appli fonctionne. Seul l'agenda ne se met pas à jour.

## Tester sur l'ordinateur

Depuis le dossier `orga` :

```bash
python -m http.server 8765 --directory app
```

puis ouvre http://localhost:8765. Pour y connecter Google, ajoute aussi `http://localhost:8765` dans les origines autorisées de l'étape 2.
