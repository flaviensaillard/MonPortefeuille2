# Côté Android

## Ce qui est déjà fait

L'onglet **IA** est intégré à l'APK livrée (`Porte-feuille-1.4.0.apk` et les
suivantes). Rien à coder :

- un bouton **IA** dans la barre du bas ;
- un écran de discussion avec vos messages à droite, ses réponses à gauche ;
- les sources sous chaque réponse, qui s'ouvrent dans le navigateur ;
- un bouton **⟳ Corpus** qui relance la collecte à la demande ;
- un bouton **Mes agrégats** pour joindre — ou non — vos chiffres à la question ;
- les réglages : Réglages → ◈ Université de l'Épargne (IA).

`ia.js` est fourni ici pour référence : c'est le module tel qu'il est dans
l'application.

## Où il se branche

| Fichier | Ce qui a été ajouté |
|---|---|
| `index.html` | le bouton de navigation, et le chargement de `js/ia.js` après `views.js` |
| `js/ia.js` | le module complet |
| `js/app.js` | l'entrée `ia` dans `ONGLETS`, les deux réglages en type `texte`, le branchement des gestes après chaque rendu |
| `js/store.js` | les valeurs par défaut `iaUrl` et `iaCle` |
| `css/app.css` | les bulles, les sources, la zone de saisie |

Le module s'enregistre lui-même dans `PF.vues` : l'écran existe dès que le
fichier est chargé, sans modifier le cœur de l'application.

## Le détail qui compte

Les requêtes passent par le pont natif Java (`Native.httpAsync`), pas par le
`fetch` du WebView : la page est servie depuis `file://`, son origine est nulle,
et plusieurs services refusent alors le cross-origin. En Java, l'application
parle au réseau comme n'importe quel client Android.

## Tests

Six assertions couvrent l'onglet dans `tests/test_rendu.js` : présence du
bouton, comportement sans configuration, envoi d'une question avec affichage de
la réponse et des sources, **vérification que le contexte envoyé ne contient que
des agrégats** (aucune écriture, aucun identifiant), désactivation du contexte,
et maintien de la question lorsque le service est injoignable.
