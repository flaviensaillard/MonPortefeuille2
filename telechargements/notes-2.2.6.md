# MonPortefeuille 2.2.6 — quatre bandeaux d'en-tête retirés

**Version :** 2.2.6 · **Code :** 36 · **Release unique :** `apk-2.2.6`

Installez-la par-dessus la 2.2.5 : signature inchangée, code de version supérieur.
Les réglages et les données du téléphone ne sont pas effacés.

Cette version ne change **aucun chiffre fiscal**, n'élargit **aucune** catégorie
établie, n'active **aucun** taux et ne demande **aucune** migration. Elle retire
quatre bandeaux de l'écran Fiscalité, à la demande du propriétaire.

## Les quatre bandeaux retirés

| Bandeau | Ce qu'il disait |
| --- | --- |
| « Révision publiée des paramètres … » | que la R2 était appliquée depuis Supabase |
| « Paramètres publiés pour les revenus … » | la même chose, en doublon |
| « Quotient familial : plafond général seulement … » | que les plafonds QF particuliers ne sont pas modélisés |
| « Titres et cessions : ce portefeuille appartient … » | que le périmètre du foyer dépasse ce portefeuille |

Les deux premiers doublonnaient : ils s'affichaient ensemble dès qu'une révision
était active. Les autres messages de `verifierMaj()` — millésime absent, constantes
intégrées, valeurs DGFiP relues — **restent affichés** ; seul le message d'une
révision active est retiré.

## Ce qui a été vérifié avant de retirer

**La partie « personnalisée » du bandeau Quotient familial ne s'est jamais
affichée.** Elle appelait `casParticuliersQF()` avec un nombre d'enfants déclaré
*plus bas* dans la même fonction : `var` le faisait donc valoir `undefined` à
l'appel, et aucun drapeau (parent isolé, invalidité, ancien combattant, veuvage)
n'était transmis. `blocages` et `avertissements` restaient vides dans tous les cas
— vérifié par appel direct sur cinq situations de foyer différentes. Retirer ce
bandeau ne supprime donc aucun avertissement qui ait jamais été vu.

Le module `fiscal_gardes_foyer.js` reste chargé, exporté et testé : `casParticuliersQF()`
fonctionne correctement quand il reçoit ses entrées, et `portee2086Foyer()` comme
`csgDeductible6DE()` sont toujours utilisés par l'écran.

## Ce qui subsiste, et où

Les deux avertissements de fond ne disparaissent pas avec les bandeaux — ils sont
déplacés au contact des chiffres qu'ils qualifient, ce qui est plus utile qu'un
rappel général en haut d'écran :

- **Périmètre du foyer** : la limite du comparateur 2OP (« 2OP est globale pour tous
  les RCM et gains mobiliers du foyer »), le bandeau du seuil crypto de 305 €
  (« Ce total ne suffit pas à prouver l'exonération du foyer fiscal : vérifiez aussi
  les cessions éventuelles du conjoint hors de ce portefeuille »), et `portee2086Foyer()`.
- **Plafonds QF particuliers** : la matrice de couverture, repliée dans l'onglet de
  mise à jour, classe `qf_speciaux` en « non disponible » avec la note « plafonds
  particuliers non modélisés ; le bilan et la recommandation 2OP ne sont pas certifiés
  pour un parent isolé, une invalidité ou une demi-part majorée ».
- **État de la R2** : le résumé copiable dit toujours « R2 publiée prioritaire », et
  l'onglet de mise à jour porte la pastille vert / orange / rouge.

## Garantie

`tests/test_fiscal_perimetre_ui.js` a été réécrit pour cette version. Il ne se
contente pas d'acter le retrait : il vérifie que les avertissements foyer
**subsistent** là où ils ont été déplacés, et il verrouille le retrait — si l'un des
quatre bandeaux réapparaît dans un rendu, la suite échoue. La suppression est un
choix du propriétaire, pas un oubli ; elle doit le rester.

L'assertion porte sur le code **hors commentaires** : les commentaires citent
volontairement ces incipits pour documenter le retrait, et une recherche brute les
retrouverait à tort.
