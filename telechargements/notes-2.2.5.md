# MonPortefeuille 2.2.5 — la mise à jour fiscale dans un onglet replié, avec pastille

**Version :** 2.2.5 · **Code :** 35 · **Release unique :** `apk-2.2.5`

Installez-la par-dessus la 2.2.4 : signature inchangée, code de version supérieur.
Les réglages et les données du téléphone ne sont pas effacés.

Cette version ne change **aucun chiffre fiscal**, n'élargit **aucune** catégorie
établie et n'active **aucun** taux. Elle ne touche pas non plus à l'historique
Supabase : la migration 013 reste appliquée, rien n'est à rejouer.

## Ce qui change à l'écran

Tous les messages qu'affiche une mise à jour de données fiscales — le résumé
copiable, l'audit détaillé, la matrice de couverture et les autres millésimes
vérifiés par le même clic — sont désormais regroupés dans **un seul onglet
replié** de l'écran Fiscalité.

L'onglet porte une pastille dont la couleur est **calculée d'après l'état réel de
la collecte**, jamais décorative :

| Pastille | Signification |
| --- | --- |
| **verte** | tout ce que la DGFiP publie pour ces millésimes a été lu |
| **orange** | des informations manquent : document non publié pour le millésime, non attribuable à l'année des revenus, preuve insuffisante |
| **rouge** | la récupération n'a pas abouti : source inaccessible, PDF illisible, écriture Supabase refusée, mise à jour interrompue |

L'onglet ne déroule **que ce qui manque ou a échoué**, avec le millésime concerné
et la raison exacte. Quand tout est lu, il n'y a **aucune alerte** : la pastille
verte suffit.

## Ce que le vert ne dit pas

Le vert signifie « la mise à jour a obtenu ce qu'elle cherchait ». Il ne signifie
pas que toute la fiscalité du millésime est établie.

Plusieurs lecteurs renvoient des valeurs **et** une portée partielle — « produit du
foyer non déterminé », « avis et montants du foyer non lus », « PS non déterminés
par ce lecteur ». Ces limites restent écrites, à l'intérieur du même onglet, dans
le résumé copiable et dans la matrice de couverture. Elles ne sont pas effacées
par la pastille.

**Bascule DGFiP totale : non**, inchangé. RCM personnels, PS crypto 2025 attestés
et déduction CSG du foyer restent non vérifiés.

## Pourquoi une version neuve

La 2.2.4 était déjà installée sur votre téléphone. Publier un code différent sous
le même nom aurait produit deux APK appelées 2.2.4, impossibles à distinguer. La
release étant unique et immuable, toute modification sous `app/` exige une version
neuve, cohérente dans le manifeste, le workflow, `build.sh`, `core/__init__.py` et
ces notes.

## Garantie

Le classement des couleurs est verrouillé par `tests/test_fiscal_etat_collecte.js`,
qui rejoue les motifs **réellement** produits par les douze lecteurs du dépôt et
vérifie les deux sens de l'erreur :

- une panne ne doit jamais être masquée par des valeurs restées en cache —
  l'échec est testé avant la présence de valeurs ;
- un motif inconnu ne doit jamais rassurer — il retombe sur « manquant », jamais
  sur « ok » ;
- un document lu dont la portée est partielle ne doit pas être compté comme
  manquant, sinon la pastille resterait orange en permanence et l'alerte
  deviendrait du bruit.

Sans le module de classement, l'écran affiche les messages à plat **sans aucune
pastille** : il ne devine pas une couleur qu'il ne sait pas calculer.
