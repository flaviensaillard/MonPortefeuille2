# MonPortefeuille 2.2.7 — formulaires fiscaux et reports corrigés

**Version 2.2.7 · code 37 · tag réservé `apk-2.2.7`.**

Installez par-dessus la 2.2.6, sans effacer les réglages. Aucune migration SQL n'est
requise. La PR reste ouverte : le build de branche fournit un artefact, pas une
release publique.

## Lignes et cadres de la déclaration

La section « Vos formulaires » n'attend plus qu'un calcul d'impôt complet pour être
visible. Elle affiche immédiatement les **sept parcours utiles** aux revenus 2025 :
2042, 2042 C, 2047, 2074, 2074-CMV (alternative sous condition), 2086 et
3916-3916-bis. Numéro, intitulé et montant connu — ou **« à vérifier »** si la
donnée manque — sont placés côte à côte. Le résultat est lisible par formulaire,
cadre et ligne, sans replier les formulaires dans l'application.

Les repères revenus 2025 ont été contrôlés sur les imprimés officiels :

- [2042 N°10330*30](https://www.impots.gouv.fr/sites/default/files/formulaires/2042/2026/2042_5535.pdf) ;
  [2042 C N°11222*28](https://www.impots.gouv.fr/sites/default/files/formulaires/2042/2026/2042_5472.pdf) ;
- [2047 N°11226*28](https://www.impots.gouv.fr/sites/default/files/formulaires/2047/2026/2047_5488.pdf) ;
- [2074 N°11905*26](https://www.impots.gouv.fr/sites/default/files/formulaires/2074/2026/2074_5497.pdf) ;
  [2074-CMV N°15484*11](https://www.impots.gouv.fr/sites/default/files/formulaires/2074-cmv/2026/2074-cmv_5494.pdf) ;
- [2086 N°16043*07](https://www.impots.gouv.fr/sites/default/files/formulaires/2086/2026/2086_5515.pdf) ;
- [3916-3916 bis](https://www.impots.gouv.fr/sites/default/files/formulaires/3916/2026/3916_5454.pdf).

Les formulaires **des revenus 2026 et suivants ne sont pas encore publiés** au
17/10/2026. Une saisie d'année (2025 à 9999) donne accès au guide même sans
barème fiscal. Ses cases sont visiblement marquées « REPÈRES des revenus 2025,
non officiels pour ce millésime » : **aucune valeur fiscale future n'est copiée**
d'une autre année. Les éventuelles PV calculées depuis les seules transactions
connues sont signalées *à part* comme estimation non reportable. Publication et
millésime devront être recontrôlés au moment de la déclaration réelle.

## Deux erreurs de report corrigées

**2074 :** la ligne 524 des cessions calculées par vous-même se reporte en **903,
colonne PV ou MV**. L'ancien écran annonçait à tort « 905 = total des plus-values »
et « 913 = total des moins-values ». Sur l'imprimé, **905 = profits sur
instruments financiers à terme** et **913 = total du cadre 900**, pas les pertes
seules. Le calcul Python et Android emploie désormais les clés
`ligne_903_pv` et `ligne_903_mv`.

**2074 cadre 510 :** plus de regroupement de plusieurs ventes d'un titre sous la
fausse date « 31/12 ». Chaque cession garde sa date, son prix brut (516), ses frais
de vente (517), son prix net (518), le prix d'achat (521), sa part de frais
d'acquisition (522), son coût total (523) et le résultat (524). Les cadres 10–12
suivent les moins-values par année ; le cadre 11 distingue A à H et laisse
**inconnus** F/G/H si un achat antérieur à 2018 peut ouvrir droit à un abattement.
Le calcul reste celui des **seuls titres connus**, non de tous les comptes du foyer.

**2086 :** les lignes 215, 216, 222, le total 224 du déclarant et les lignes 51/52
du foyer sont visibles. Les frais de cession ne sont pas mis artificiellement à
zéro ; la fraction de capital est calculée sur le prix avant frais (217/212) et
le gain depuis le prix net des frais (218). Les soultes 216/222 sont affichées
**« à vérifier »**, jamais 0 certifié. La ligne 51 utilise les prix nets des frais
(ligne 218), pas le brut 213. Le montant 3AN/3BN ne devient pas un report « prêt à
copier » : l'application ne connaît ni les autres plateformes ni les cessions
éventuelles du conjoint, et une annexe 2086 doit être appréciée au niveau du foyer.

**2047 / 3916 :** pas de crédit d'impôt étranger mis à zéro sur la seule foi du
pays du courtier ; le pays *de source* des plus-values et le précompte doivent être
confirmés. Les numéros de compte, dates, identité et modalités d'usage ne sont pas
inventés : la 3916 indique les cadres 1, 2, 3/4, 5, chacun « à compléter » depuis
les justificatifs. L'option 2OP du foyer reste distincte de 3CN.

La page Streamlit de Fiscalité reçoit également les clés 903 corrigées, les frais
et la formule du 2086 ; sans cela elle plantait sur l'ancienne clé 905.

## Limite honnête

La version rapproche les **lignes utiles à ce portefeuille** des imprimés
revenus 2025. Elle ne peut **pas** connaître ou certifier toutes les données
personnelles, les autres comptes/foyer, l'IFU, les soultes, les cas particuliers,
les déductions CSG, ni les cases d'années non publiées. Ces champs sont explicitement
signalés, et non remplis par défaut. La bascule DGFiP totale reste **non**.
