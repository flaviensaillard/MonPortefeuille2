# Rapport — reconstitution de `valeur_avant_eur` / `valeur_avant_usd` (pf2_apports)

**Statut : PROPOSITION, NON APPLIQUÉE.** Aucune écriture n'a été faite dans la base. Ce rapport et le CSV doivent être validés par écrit par le propriétaire avant toute exécution de `update_valeur_avant.sql`.

Généré par le workflow « Reconstitution valeur_avant » (run 38080891220), en lecture seule.

## 1. Données lues et constats

- **pf2_apports** : 41 lignes lues (filtre user_id du propriétaire). Sens : 38 apport(s), 3 retrait(s).
- Colonnes réelles de pf2_apports (sonde) : `id, date, sens, montant_eur, montant_or, cours_or, compte, reference, note, idempotence, user_id, valeur_avant_eur, valeur_avant_usd, cree_le`. **Pas de colonne `montant_usd`** : il est calculé comme dans `core/session.py` (référence `usd:…`, puis `montant_or × cours_or`, puis `montant_eur × taux historique`). La source est indiquée par ligne (`source_montant_usd`).
- **pf2_snapshots** : 188 lignes. Snapshots incomplets exclus (`complet = false`) : 0. Totaux absents ou nuls exclus : 0. **Snapshots utilisables : 188** (du 2023-04-01 au 2026-10-10).
- Colonnes réelles de pf2_snapshots (sonde) : `id, date, patrimoine_total_eur, patrimoine_investi_eur, courant_eur, precaution_eur, cours_or_usd, equivalent_or_oz, poche_rv_eur, poche_energie_eur, poche_asie_eur, poche_jgb_eur, complet, manquantes, user_id, cree_le`. **Aucune colonne de patrimoine en USD** (`cours_or_usd` est le cours de l'or) : la conversion USD est donc nécessaire (voir hypothèses).
- **Tables v1** (`Historique`, `Projections`, `Donnees`, `Transaction`, `Config`) : inaccessibles avec la clé utilisée par le workflow (erreur 42501, constatée lors d'une sonde des noms de colonnes). Le repli sur `Historique` demandé par la mission n'a donc **pas** pu être utilisé.
- **pf2_fx** ne contient que le cache du jour (écrit par `jobs/update_market_data.py`) : il n'a pas d'historique. Les taux historiques EUR/USD viennent donc de `core/fx.py` (même source que le robot de reconstitution). Chaque conversion est signalée.

## 2. Nombre d'apports

| Indicateur | EUR | USD |
|---|---:|---:|
| Total d'apports | 41 | 41 |
| Déjà mesurés (valeur présente avant la mission) | 0 | 0 |
| Reconstruits (snapshot antérieur) | 41 | 41 |
| dont USD converties au taux historique | — | 41 |
| Approximés (snapshot postérieur, approximation plus forte) | 0 | 0 |
| Non renseignés (NULL) | 0 | 0 |

- Apports déjà entièrement mesurés (EUR et USD) : **0**.
- Lignes à compléter dans le SQL : **41**.
- Lignes où une seule devise est mesurée (l'autre laissée NULL pour ne pas mélanger les sources) : **0**.
- Montants EUR négatifs dans pf2_apports : 0 (le sens gouverne le signe du flux).
- Écart entre le snapshot retenu et l'apport (reconstructions antérieures) : médiane **10 jours**, maximum **31 jours** (apport id 299, snapshot du 2026-02-28). Plus l'écart est grand, moins la valeur reconstruite est fiable.

## 3. Apports approximés (snapshot postérieur)

Aucun.

## 4. Apports non renseignés

Aucun.

## 5. TWR par année civile, avec les nouvelles valeurs

Méthode : TWR strict. Chaque apport est encadré par sa valorisation juste avant (valeur reconstruite depuis son snapshot). Une année est **« non calculé »** dès qu'un de ses apports reste sans valeur, qu'un intervalle ne peut pas être chaîné, ou qu'elle n'est pas couverte par les snapshots. Les années avec approximations sont marquées.

### 5.1 Série demandée par la mission : patrimoine total

| Année | TWR EUR | TWR USD | Apports | Approximés (EUR / USD) | Motif si non calculé |
|---:|---:|---:|---:|---:|---|
| 2023 | +3,26 % | +4,05 % | 1 | 0 / 0 | — |
| 2024 | -6,09 % | -11,14 % | 18 | 0 / 0 | — |
| 2025 | -1,48 % | +10,79 % | 10 | 0 / 0 | — |
| 2026 (partielle, jusqu'au 2026-10-10) | +0,71 % | -3,89 % | 12 | 0 / 0 | — |

### 5.2 Comparaison : patrimoine investi (série de l'application)

Même méthode, même snapshot retenu pour chaque apport, mais sur `patrimoine_investi_eur` (la trésorerie est exclue). Cette série sert à comparer avec les performances affichées par l'application. Elle ne remplace pas le TWR total de la section 5.1.

| Année | TWR EUR | TWR USD | Apports | Approximés (EUR / USD) | Motif si non calculé |
|---:|---:|---:|---:|---:|---|
| 2023 | +9,09 % | +9,28 % | 1 | 0 / 0 | — |
| 2024 | -13,25 % | -17,75 % | 18 | 0 / 0 | — |
| 2025 | +4,35 % | +17,29 % | 10 | 0 / 0 | — |
| 2026 (partielle, jusqu'au 2026-10-10) | +10,99 % | +5,94 % | 12 | 0 / 0 | — |

## 6. Contrôles automatiques

- [OK] colonnes attendues présentes dans pf2_apports (manquantes : aucune)
- [OK] colonnes attendues présentes dans pf2_snapshots (manquantes : aucune)
- [OK] montant_eur renseigné sur tous les apports
- [OK] sens = apport ou retrait sur tous les apports
- [OK] lignes calculées = apports lus
- [OK] aucun snapshot du même jour que l'apport n'a été utilisé
- [OK] snapshot antérieur pour « reconstruite », postérieur pour « approximée »
- [OK] valeurs EUR mesurées inchangées
- [OK] valeurs USD mesurées inchangées
- [OK] une date de snapshot n'est retenue que si une valeur en découle
- [OK] aucune source mixte : une devise mesurée seule laisse l'autre NULL
- [OK] chaînage TWR EUR (total) identique à core/metrics.rendements_stricts
- [OK] chaînage TWR USD (total) identique à core/metrics.rendements_stricts
- [OK] chaînage TWR EUR (investi) identique à core/metrics.rendements_stricts
- [OK] chaînage TWR USD (investi) identique à core/metrics.rendements_stricts
- [OK] une instruction UPDATE par ligne à compléter
- [OK] SQL : aucune suppression ni changement de schéma
- [OK] SQL : chaque UPDATE ne touche que pf2_apports, colonnes valeur_avant_*, avec garde IS NULL
- [OK] Contrôle anti-secret : vérifié par le workflow sur `donnees-reconstituees/` avant la publication (les valeurs de SUPABASE_URL et SUPABASE_KEY n'y figurent pas).

## 7. Hypothèses retenues

1. **Valeur « avant apport » = `patrimoine_total_eur` du snapshot.** C'est la valeur que l'application enregistre au moment d'un apport (`pages/1_Portefeuille.py`).
2. **Snapshots utilisés : complets et valorisés seulement** (`complet = true`, total > 0). Un point partiel est exclu, comme dans l'application.
3. **Règle 2 (antérieur strict)** : le snapshot du même jour que l'apport est exclu. Le snapshot le plus proche antérieur est pris.
4. **Règle 3 (postérieur)** : utilisée seulement s'il n'existe aucun snapshot complet antérieur.
5. **USD** : pas de colonne USD dans pf2_snapshots. Le total EUR du snapshot retenu est converti au taux EUR→USD historique de sa date (`core/fx.py`). L'origine porte le suffixe `_converti_taux_historique`. Les taux EUR/USD historiques ne sont pas des cotations de la base : c'est une approximation signalée.
6. **Source commune** : EUR et USD d'un même apport viennent du même snapshot, donc du même jour. Si une seule devise est mesurée, l'autre reste NULL (pas de source mixte).
7. **Plusieurs apports le même jour** : ils partagent la valeur « avant » du jour. Pour un même jour, la valeur retenue est celle du premier apport (id le plus bas) ; l'application exclut ces jours, ce rapport les garde.
8. **montant USD** : `montant_or × cours_or` si disponible, sinon `montant_eur × taux historique` (même ordre que `core/session.py` ; la source est indiquée par ligne dans `source_montant_usd`).
9. **Flux** : `apport` = entrée (+), `retrait` = sortie (−). Le montant est pris en valeur absolue.
10. **Aucun chiffre inventé.** Sans snapshot utilisable, la ligne reste NULL avec sa raison.

## 8. Points d'attention

- **Dépôt public.** Les montants, dates et totaux de patrimoine de ces fichiers sont visibles de tout le monde, dans le dépôt, les journaux d'Actions et la PR. Le propriétaire a accepté cette publication. Un retrait ultérieur ne supprime pas l'historique git.
- **Incohérence possible dans l'application (non modifiée).** Le TWR de l'application compare les valeurs « avant » au total `patrimoine_total_eur`, mais la série de performance utilise `patrimoine_investi_eur` (`core/session.py`, `serie_performance`). Quand il y a de la trésorerie, ces deux séries diffèrent. Ce rapport, lui, utilise le total des deux côtés.
- Les valeurs reconstruites supposent un portefeuille inchangé entre le snapshot et l'apport (voir `core/metrics.py`, limite A6). Elles sont donc des approximations.

## 9. Application (à faire après validation écrite)

Exécuter `update_valeur_avant.sql` dans l'éditeur SQL Supabase, une seule fois. Le fichier est une transaction BEGIN/COMMIT. Chaque instruction ne met à jour que les colonnes encore NULL.
