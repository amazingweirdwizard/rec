# Screen — Enregistreur local

Première version d’une extension Firefox de capture vidéo, en français. Aucun serveur, compte, service externe, suivi ou dépendance. La capture est traitée en mémoire dans l’onglet puis téléchargée sur votre ordinateur.

## Essayer dans Firefox

1. Utilisez Firefox sur ordinateur, version 140 ou ultérieure.
2. Ouvrez `about:debugging#/runtime/this-firefox` dans Firefox.
3. Cliquez sur **Charger un module complémentaire temporaire**, puis sélectionnez le fichier `manifest.json` de ce dossier.
4. Cliquez sur l’icône **Screen** dans le menu des extensions de Firefox. L’enregistreur s’ouvre dans un onglet.
5. Activez le microphone si souhaité, cliquez sur **Démarrer l’enregistrement** et autorisez le partage d’un écran ou d’une fenêtre.
6. Cliquez sur **Terminer**, puis **Télécharger la vidéo**. Vous pouvez aussi terminer avec le bouton d’arrêt du partage de Firefox.

Cette installation de développement est retirée au redémarrage de Firefox. Une distribution permanente demandera un paquet signé par Mozilla.

Après une modification : terminez et téléchargez toute capture en cours, fermez l’onglet Screen, cliquez sur **Recharger** pour cette extension dans `about:debugging#/runtime/this-firefox`, puis rouvrez Screen depuis son icône.

## Fonctionnalités

- Capture d’un écran ou d’une fenêtre à une cadence cible de 30 images/s.
- Microphone optionnel, pause et reprise, compteur de durée hors pauses.
- Aperçu silencieux pendant la capture, lecture avec son après l’arrêt.
- Téléchargement local au format WebM, sans conversion MP4.
- Réutilisation de l’onglet existant via le bouton de l’extension.
- Onglet protégé contre le déchargement automatique par Firefox. Le passage en arrière-plan ne déclenche ni pause ni arrêt dans Screen.
- Affichage de la source choisie et avertissement lorsque Firefox signale une source temporairement indisponible.
- Confirmation avant de remplacer une vidéo non téléchargée et avertissement de fermeture.

## Onglets Firefox proposés en priorité

Le mode **Onglet Firefox · expérimental** est sélectionné par défaut. La liste affiche les titres et domaines des onglets web ouverts. L’onglet depuis lequel Screen a été ouvert vient en premier, suivi des onglets de la fenêtre actuelle, puis des autres fenêtres, par utilisation récente. **Actualiser** recharge la liste.

Choisissez un onglet, puis **Démarrer l’enregistrement** pour capturer la zone visible de sa page (hors barre d’outils Firefox). Le cadre suit le défilement et s’ajuste au format vidéo initial si la fenêtre change de taille. Ce mode utilise les mêmes captures successives que le mode HTML : jusqu’à 5 images/s, sans son du site, avec une autorisation d’accès aux pages au premier démarrage. Les ralentissements en arrière-plan restent possibles. Gardez la page source ouverte, sans la recharger ni naviguer ailleurs.

Le mode **Élément HTML** réutilise cette liste pour choisir la page du sélecteur. Le mode **Écran ou fenêtre** reste disponible dans le menu. Les pages internes de Firefox, les pages d’extension et les fichiers locaux ne sont pas proposés dans la liste.

La permission `tabs` permet de lire les titres et URL pour afficher ce sélecteur local. Elle n’envoie pas l’historique de navigation à un serveur.

## Enregistrer une div ou un élément HTML

1. Rechargez l’extension après sa mise à jour. Ouvrez une page web HTTP ou HTTPS classique.
2. Cliquez sur l’icône **Screen depuis cette page** : elle devient la page cible prioritaire. Vous pouvez aussi choisir directement un autre onglet dans la liste de Screen.
3. Dans Screen, choisissez **Élément HTML · expérimental**, puis **Choisir un élément dans la page**.
4. Acceptez l’autorisation Firefox d’accès aux pages. L’API Firefox `tabs.captureTab` exige l’accès `<all_urls>` ; cette autorisation reste facultative et n’est demandée que pour ce mode. L’extension capture seulement la page sélectionnée pendant la session et ne transmet aucune image en ligne.
5. Survolez le bloc souhaité, puis cliquez. La touche **↑** sélectionne son parent (utile pour une div contenant plusieurs enfants) ; **Échap** annule.
6. De retour dans Screen, activez éventuellement le microphone, puis cliquez sur **Démarrer l’enregistrement**. Gardez la page cible et l’onglet Screen ouverts.
7. Terminez et téléchargez la vidéo comme pour une capture d’écran.

Le mode HTML produit une vidéo à partir de captures locales de la zone du bloc, avec une cadence cible maximale de 5 images/s (souvent moins selon la machine et en arrière-plan). Il convient aux démonstrations de composants et d’interfaces, pas aux vidéos ou jeux nécessitant 30 images/s. Il ne capture pas le son du site.

Le cadrage suit les coordonnées du même élément DOM lors des déplacements et défilements. Si ses dimensions changent, l’image est ajustée au format initial avec des bandes au besoin. Tout contenu superposé dans son rectangle peut apparaître dans la vidéo. Il ne s’agit pas d’un rendu isolé du DOM.

Les pages internes/protégées de Firefox et la sélection à l’intérieur des iframes ne sont pas prises en charge. Une navigation, une fermeture de page ou la suppression/masquage du bloc arrête la capture et permet de récupérer la vidéo déjà reçue. Si un framework remplace le nœud DOM, il faut le sélectionner à nouveau.

Cette capture vise la page via Firefox, sans dépendre d’un partage de fenêtre du bureau. Elle ne force toutefois pas le navigateur ou le site à continuer les animations ou les vidéos quand la fenêtre est réduite : la fluidité en arrière-plan n’est pas garantie.

## Limites de cette version

- Le son du système et des onglets n’est pas enregistré.
- Pour réduire toute la fenêtre Firefox pendant la capture, choisissez **Écran entier** dans la demande de partage. Une fenêtre choisie comme source peut ne plus fournir d’image lorsqu’elle est réduite. Screen ne peut pas forcer Firefox ou le système à continuer à produire ces images, ni changer la source sans une nouvelle autorisation. Si Firefox signale une interruption temporaire, Screen conserve l’enregistrement et affiche un avertissement ; si Firefox termine définitivement le partage, la vidéo reçue est finalisée.
- Gardez l’onglet de l’enregistreur ouvert. Fermer ou recharger cet onglet, quitter Firefox ou subir une panne peut perdre la capture.
- Les vidéos sont gardées en mémoire, sans sauvegarde automatique. Privilégiez les sessions courtes et téléchargez chaque vidéo avant de poursuivre.
- Le clic de téléchargement lance la sauvegarde via Firefox ; l’extension ne peut pas confirmer que vous l’avez menée à son terme.
- La durée est renseignée dans l’en-tête WebM de Firefox à l’export, sans réencodage et hors temps de pause. Si l’en-tête n’est pas reconnu ou si la capture est partielle, un avertissement est affiché ; certains lecteurs peuvent alors afficher une durée inconnue. L’export n’ajoute pas d’index de navigation.
- À l’arrêt, le téléchargement devient disponible dès réception des dernières données, indépendamment du chargement de l’aperçu. Si Firefox ne termine pas après 8 secondes, l’application propose les données déjà reçues avec un avertissement : ce fichier de récupération peut être incomplet ou illisible. Si aucune donnée n’est disponible, elle affiche une erreur et permet de recommencer.
- Les performances et les sources proposées dépendent de Firefox, du système et de la machine.

## Vérification manuelle dans Firefox

Les tests se lancent avec `node --test tests/*.test.cjs`. Ils couvrent la logique avec des API simulées et la correction binaire de la durée WebM. Ils ne remplacent pas un essai réel des autorisations, de l’encodage et du téléchargement dans Firefox.

- Capture sans micro : enregistrer quelques secondes, terminer, télécharger et lire le fichier.
- Capture avec micro : autoriser l’accès et vérifier que la voix est audible dans le fichier.
- Pause/reprise : vérifier que la pause n’apparaît pas dans la vidéo et le compteur.
- Annuler le partage ou refuser le micro : vérifier le message et pouvoir relancer une capture.
- Arrêter via Firefox, y compris en pause : vérifier que la vidéo est récupérée.
- Choisir **Écran entier**, capturer 5 secondes, réduire Firefox pendant 15 secondes en faisant bouger une autre fenêtre, puis revenir et terminer : vérifier la continuité des images dans le fichier téléchargé.
- Capturer une fenêtre, puis réduire cette fenêtre : vérifier que toute indisponibilité signalée par Firefox apparaît dans Screen, sans arrêt volontaire de l’enregistreur.
- Cliquer une deuxième fois sur l’icône : vérifier le retour à l’onglet existant.
- Nouvelle capture avant téléchargement : vérifier la confirmation et l’annulation sans perte de la vidéo précédente.
- Mode HTML : sur une page de test, sélectionner une div contenant des enfants, essayer ↑ et Échap, puis enregistrer un changement de texte dans le bloc.
- Mode HTML : déplacer/redimensionner le bloc et faire défiler la page ; vérifier le cadrage du fichier téléchargé.
- Mode HTML : retirer le bloc ou naviguer vers une autre page ; vérifier l’arrêt et la récupération de la capture sans enregistrer la nouvelle page.
- Mode Onglet Firefox : vérifier l’ordre et l’actualisation de la liste, capturer un onglet complet, puis vérifier le cadrage lors d’un défilement.

## Structure

`manifest.json` déclare l’extension. `background.js` ouvre l’onglet. `recorder.html`, `styles.css` et `recorder.js` contiennent l’interface et la capture via `getDisplayMedia`, `getUserMedia` et `MediaRecorder`.

`element-picker.js` gère le sélecteur injecté dans la page cible. `element-capture.js` suit son rectangle et produit le flux vidéo via `tabs.captureTab` et un canvas local. `webm-duration.js` corrige la durée à l’export.

Documentation des API : https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia
