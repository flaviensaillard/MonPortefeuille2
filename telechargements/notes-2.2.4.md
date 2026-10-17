# MonPortefeuille 2.2.4 — l'historique Supabase dit pourquoi il échoue

**Version :** 2.2.4 · **Code :** 34 · **Release unique :** `apk-2.2.4`

Installez-la par-dessus la 2.2.3 : signature inchangée, code de version supérieur.
Les réglages et les données du téléphone ne sont pas effacés.

Cette version ne change **aucun chiffre fiscal** et n'élargit **aucune** catégorie
établie. Elle corrige l'écriture de l'historique des collectes DGFiP dans Supabase,
après le retour réel du propriétaire du 15/10/2026.

## Ce que le retour réel a montré

Sur un clic du bouton, l'écran Fiscalité a affiché :

| Millésime | Documents lus | Verdict affiché |
| --- | --- | --- |
| Revenus 2023 | 6 | **6 document(s) historisé(s)** |
| Revenus 2024 | 6 | NON historisé, collecte conservée sur l'appareil |
| Revenus 2025 | 11 | NON historisé, collecte conservée sur l'appareil |
| Revenus 2026 | 0 | rien à historiser (correct) |

Deux faits en découlent, vérifiés et non supposés :

- **la migration 013 est bien appliquée** : sans elle, aucune source `dgfip_*` ne
  peut être écrite, or six lignes des revenus 2023 ont été acceptées ;
- **la contrainte n'est pas la cause des échecs** : les 23 lignes réellement
  produites par les lecteurs (6 + 6 + 11), avec leurs vraies adresses, ont été
  rejouées sur un PostgreSQL réel avec les migrations 009 → 013 — toutes sont
  acceptées.

**La cause exacte des refus 2024 et 2025 n'est pas encore connue**, et cette
version ne prétend pas le contraire. Ce qu'elle change, c'est que le refus ne peut
plus se taire : la raison apparaît désormais dans le résumé copiable.

## Les quatre défauts corrigés

1. **Le résumé taisait la raison.** Il disait seulement « NON historisé, collecte
   conservée sur l'appareil », sans le motif — c'est précisément ce qui a rendu le
   retour du 15/10 inexploitable. La raison est maintenant reprise dans le résumé
   (sans adresse, et le résumé reste sous 600 caractères).
2. **Tout refus était attribué à la migration 013.** Un conflit de révision
   (23505), une session expirée (401/403), une cadence refusée (429) ou un droit
   insuffisant (42501) ont des causes et des remèdes différents ; les nommer tous
   « la migration 013 est-elle appliquée ? » envoyait sur une fausse piste. Chaque
   code a désormais son libellé.
3. **Aucun rejeu sur conflit.** Deux clics, ou deux appareils, peuvent lire la même
   dernière révision avant d'écrire : le second reçoit 23505. `fiscal_sources.js`
   relit et réessaie déjà deux fois pour OpenFisca ; ce module ne le faisait pas et
   abandonnait tout le millésime. Il relit maintenant la ligne gagnante et réessaie,
   sans jamais UPDATE, DELETE ni UPSERT — la table reste append-only.
4. **Une collecte identique était vue comme différente.** PostgreSQL `jsonb` ne
   conserve pas l'ordre des clés : il les réordonne. La comparaison par
   `JSON.stringify` brut concluait donc « différent » pour une collecte strictement
   identique relue depuis la base, et **chaque clic aurait recréé une révision**. La
   comparaison est maintenant canonique (clés triées des deux côtés).

S'y ajoute un défaut d'honnêteté du compte rendu : un échec peut survenir **après**
des écritures réussies, qui restent en base (append-only). Le résumé le dit
désormais — « N document(s) écrit(s), puis NON historisé — raison » — au lieu de
laisser croire que rien n'est parti.

## Ce qui ne change pas

**Bascule DGFiP totale : non.** Revenus 2026 : aucun document publié (0 famille sur
11). Revenus 2023 et 2024 : 8 familles sur 11 repérées, dont 6 vérifiées. Pour les
cessions privées de crypto en 2025, la contradiction documentaire n'est pas levée
(BOFiP du 23/04/2024 : 17,2 % ; FAQ du 17/07/2026 : 18,6 %) et aucun taux n'est
activé. RCM personnels, CSG déductible du foyer, exhaustivité de l'annexe 2086,
plafonds particuliers du quotient familial, formules et arrondis : non contrôlés.
Une ligne écrite côté serveur n'active rien : le moteur ne relit jamais cette table.

## À faire après installation

Cliquez sur « ⟳ Mettre à jour les données fiscales disponibles », puis copiez le
résumé. Si un millésime reste « NON historisé », la raison est désormais écrite
dans le résumé : c'est elle qui permettra de trancher, sans supposition.

Voir `docs/COLLECTE-FISCALE.md` (migration 013, sonde en lecture seule) et
`docs/MATRICE-COUVERTURE-FISCALE-2023-2026.md` §7.7.
