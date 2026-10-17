# Crypto privés — notice 2086 et brochure DGFiP des revenus 2025

Le bouton consulte **deux documents DGFiP distincts**, sans attribuer les taux courants de la FAQ à 2025 :

- [Formulaire et notice 2086, déclaration 2026 des cessions réalisées en 2025](https://www.impots.gouv.fr/sites/default/files/formulaires/2086/2026/2086_5515.pdf) : année des cessions explicite ; quotient du prix de cession **avant frais** sur la valeur globale du portefeuille, frais déduits du premier terme du gain ; prix 213/217/218, capital 220–223, résultat 224 ; ligne 51 agrégeant les cessions **du foyer** (218/258/318/413/423/433), seuil de 305 €, 3AN/3BN, option 3CN indépendante de l'option RCM. L'IR forfaitaire de 12,8 % est mentionné, mais **aucun taux global de PS crypto 2025 n'est chiffré dans la preuve lue**. Le formulaire indique « inférieur ou égal à 305 € » ; un paragraphe explicatif de la notice écrit « inférieur à 305 € ». Cette divergence de rédaction est signalée, sans convertir la lecture partielle en certification du seuil du foyer.
- [Brochure IR 2026, plus-values et gains divers, section crypto](https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/09-plus_values_137a156.pdf) : foyer, seuil, 2086 même si sous le seuil, IR 12,8 %, prélèvements sociaux **sans taux chiffré dans ce passage**, 3CN distincte de l'option RCM et mention explicite de cessions du foyer en 2025. La brochure est millésimée par son chemin de déclaration 2026 *et* son contenu 2025, mais sa date de publication n'est pas extraite : ne pas l'inventer.

Le pont binaire Android n'autorise que ces URL exactes et la brochure CSG déjà prise en charge : HTTPS, même hôte DGFiP, **aucune redirection**, taille maximale 2 Mio, signature `%PDF-`. PDF.js extrait le texte sans évaluation dynamique (`isEvalSupported: false`). Les passages reconnus sont conservés sous forme de **révisions locales par compte et document** ; chaque lecture de cache les revalide. La récupération d'un document peut échouer sans annuler la lecture de l'autre. Les autres millésimes ne réutilisent jamais la lecture 2025.

[Diagnostic ponctuel sur les deux PDF officiels](https://github.com/flaviensaillard/MonPortefeuille2/actions/runs/38536490877) : notice de 7 pages (241 748 octets), brochure de 20 pages (722 877 octets). La [vérification des extraits conservés sur ces mêmes PDF](https://github.com/flaviensaillard/MonPortefeuille2/actions/runs/38536490877) passe en CI ; le workflow de diagnostic ponctuel a ensuite été retiré. Tests récurrents sans réseau : `node tests/test_fiscal_crypto_pdf_sources.js` et `node tests/test_fiscal_brochure_sources.js`.

## Taux de PS des cessions crypto privées 2025 : recherche de la preuve manquante (14/10/2026)

Les deux PDF ci-dessus ne chiffrent **aucun** taux global de PS. La recherche a
donc été portée sur les textes qui qualifient ces gains, en distinguant année des
revenus, année de déclaration et date de publication :

- **BOFiP `BOI-RPPM-PVBMC-30-30`**, [permalien version 23/04/2024](https://bofip.impots.gouv.fr/bofip/11969-PGP.html/identifiant=BOI-RPPM-PVBMC-30-30-20240423)
  (la redirection `/doctrine/BOI-RPPM-PVBMC-30-30` pointe encore sur cette
  version au 14/10/2026) : § 10, « … taux forfaitaire de 12,8 % … ainsi qu'aux
  **prélèvements sociaux sur les revenus du patrimoine** au taux global de
  **17,2 %** … taux global de **30 %** ». Ce texte **ne date pas** son taux par
  année de cession.
- **Brochure DGFiP « Principales nouveautés revenus 2025 »** (déjà lue par
  `fiscal_brochure_sources.js`) : CSG portée de 9,2 % à **10,6 %** sur les
  revenus du patrimoine, « **à compter des revenus 2025 déclarés en 2026** »,
  1.1.2026 pour les produits de placement, exceptions limitatives (revenus
  fonciers, plus-values immobilières, assurance-vie, épargne logement), CSG
  déductible maintenue à 6,8 % *(LFSS 2026, art. 12 ; CSS, art. L 136-8)*.
- **FAQ DGFiP actifs numériques** (modifiée le 17/07/2026) : PFU 31,4 %
  (12,8 % + **18,6 %**), **sans année de cession** → corroboration seulement.

`fiscal_crypto_ps_recoupement.js` compose les deux premiers : qualification
« revenus du patrimoine » + hausse de CSG datée des revenus 2025 + actifs
numériques hors de la liste d'exceptions ⇒ 17,2 % + 1,4 point = **18,6 %** pour
les cessions de 2025, avec le statut **« recoupement »**, `active: false`, huit
maillons vérifiés un à un et aucun taux du moteur modifié. 2023, 2024 et 2026
sont refusés (aucune source ne date ces millésimes / documents non publiés). La
contradiction BOFiP 17,2 % ↔ FAQ 18,6 % est affichée, non tranchée.
Détail : `docs/MATRICE-COUVERTURE-FISCALE-2023-2026.md`, § 3.
Test hors réseau : `node tests/test_fiscal_crypto_ps_recoupement.js`.

Complément pour l'échelle du **foyer** : le BOFiP
[`BOI-RPPM-PVBMC-30-10` (version 02/09/2019)](https://bofip.impots.gouv.fr/bofip/11967-PGP.html/identifiant=BOI-RPPM-PVBMC-30-10-20190902)
énonce que « il convient de retenir les cessions d'actifs numériques … réalisées
**dans le cadre du foyer fiscal** … tant par le contribuable ou les époux … que
par les autres membres du foyer fiscal ». Cette règle fonde le garde-fou
`portee2086Foyer()` : `certifieFoyer` reste `false`, seule l'inférence à sens
unique est admise (un total du seul portefeuille supérieur à 305 € exclut
l'exonération ; un total inférieur ne la prouve pas).
Test : `node tests/test_fiscal_gardes_foyer.js`.

**Portée stricte** : ce lecteur vérifie des passages publiés, **pas** l'exhaustivité des cessions de tous les membres du foyer, des avoirs hors application, des soultes ou des personnes interposées. Il ne compare pas automatiquement l'ensemble de la formule 2086 à toutes les situations possibles ; les contrôles des conditions personnelles et des arrondis restent à faire. Aucun taux PS crypto 2025 ou déduction personnelle de CSG n'est activé. Une R2 2025 active reste prioritaire ; « bascule DGFiP totale : non ». La prochaine APK doit confirmer la lecture effective de ces deux PDF sur le téléphone, sans nouvelle migration SQL.
