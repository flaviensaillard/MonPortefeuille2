# MonPortefeuille 2.2.1 — notes de version

**Version :** 2.2.1 · **Code de version :** 31 · **Release unique :** `apk-2.2.1`

Cette version ne change **aucun calcul**. Elle retire un message d'écran qui
vous gênait : la liste des apports « valorisés par le snapshot précédent ».
La 2.2.0 reste en ligne ; aucune release antérieure n'est modifiée.

## À retenir

- **Le bandeau « N apport(s) valorisé(s) par le snapshot précédent » ne s'affiche plus**, ni dans l'application (écran *Perf.*, sous le tableau « Performance par année »), ni sur la page **Performance** du tableau de bord.
- **Le calcul est identique.** La valorisation reconstruite continue d'alimenter le TWR (règle A1 de la 2.2.0) ; la donnée reste disponible, flux par flux, dans le diagnostic en lecture seule (`jobs/diagnostic.py`, écran « origine », « snapshot retenu »).
- **Aucune migration Supabase** n'est livrée : rien à exécuter.
- Installez la 2.2.1 par-dessus la 2.2.0 : même signature, code de version supérieur (31 > 30). Aucune désinstallation n'est nécessaire. Les fiches saisies sur le téléphone (situation fiscale, réglages) sont conservées.

## Ce qui est retiré, exactement

### Le message, dans l'application

Sous le tableau de la performance par année, l'écran affichait :

> ℹ️ 39 apport(s) valorisé(s) par le snapshot précédent (valeur reconstruite, approximation : le portefeuille est supposé inchangé entre ce snapshot et l'apport) : 05/01/2024 (snapshot du 31/12/2023), …

Ce bloc est supprimé de `app/src/main/assets/www/js/views.js`. Rien d'autre
n'est touché : les moyennes par année, le TWR, les années « — » et leur
explication restent affichés comme avant.

### Le même message, sur le tableau de bord

La page **Performance** (`pages/2_Performance.py`) portait le même texte en
`st.info`. Il est retiré aussi. Les messages d'erreur qui restent — « TWR global
non calculé » et les intervalles fautifs — ne sont pas touchés : eux signalent
un chiffre qui n'a pas pu être calculé, pas une méthode de calcul.

## Pourquoi la donnée reste dans le diagnostic

Une valorisation reconstruite est une approximation : le portefeuille est
supposé inchangé entre le snapshot retenu et le geste. C'est utile à savoir le
jour où un chiffre étonne. Le détail n'est donc pas supprimé du moteur :

- `metrics.valorisations_avant_flux` (Python) et `PF.metrics.valorisationsAvantFlux` (JavaScript) conservent, pour chaque flux, l'origine (`mesurée`, `reconstruite`, `manquante`) et la date du snapshot retenu ;
- le robot `jobs/diagnostic.py` les affiche flux par flux, sur les trois dernières années (constat A3 de la 2.2.0). À lancer depuis GitHub Actions → *Diagnostic*.

## Les verrous (tests)

- `tests/test_js.js` — « un apport sans valorisation mesurée reste *reconstruite* dans la série » et « l'écran Performance n'affiche plus la liste des apports reconstruits ». Rouge sur la 2.2.0, vert après le correctif.
- `tests/test_twr_v220.py` — `TestListeDesReconstructionsRetiree` : le texte est absent des deux sources (`views.js`, `2_Performance.py`), et les tests `TestReconstruction` vérifient que la reconstruction, elle, fonctionne toujours.
- `tests/test_livraison_securisee.js` et `tests/test_empreinte_cableage.py` — version 2.2.1 (code 31) cohérente partout : manifeste, `apk.yml`, `build.sh`, `core/__init__.py`.

## À vérifier sur votre téléphone (aucun test automatique ne le remplace)

1. Écran **Perf.** : le tableau « Performance par année » s'affiche, et le bandeau des apports reconstruits a disparu.
2. Les autres écrans (Bord, Portefeuille, Retraite, Fiscalité, IA) s'ouvrent normalement.
3. L'empreinte digitale rouvre toujours la session (elle dépend du téléphone, pas de cette version).

## Ce qui n'est PAS dans cette version

Les chantiers D (données externes, veille fiscale) et E des revues restent pour
la suite : ils ne sont pas commencés par ce correctif d'affichage.
