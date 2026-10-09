# 02 — Rapport exactitude financière, performance et retraite

**Version examinée :** 2.0.1 · HEAD `7be0e11` · 09/10/2026. Revue en lecture seule. Les anomalies fiscales détaillées figurent aussi dans [04](04-fiscalite-fr.md); l’intégrité des écritures et snapshots dans [05](05-integrite-donnees.md).

## F-07 — Le TWR suppose un flux en fin d’intervalle

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** `core/metrics.py:33-60` calcule `r_i=(V_i−V_{i−1}−F_i)/V_{i−1}`; `flux_par_periode()` regroupe les flux entre deux snapshots et les retranche à la valeur de fin (`:64-128`). Le commentaire précise que le flux est supposé survenir en fin de période (`:39-43`). Le miroir Android a la même convention (`app/src/main/assets/www/js/metrics.js:10-53`).

Scénario reproductible : 100 € au départ, 100 € versés au milieu de l’intervalle, puis +10 % après le versement; clôture à 220 €. La formule donne `(220−100−100)/100=20 %`, alors que le rendement chaîné avant/après flux est 10 %. Les séries mensuelles ou les jours manquants rendent cette hypothèse visible. Les tests actuels contrôlent surtout les versements posés à la fin des périodes, par exemple `tests/test_metrics.py:170-175`.

**Impact :** TWR historique potentiellement biaisé; le rendement A de la retraite réutilise ce TWR comme rendement annualisé. La correction du rattachement des flux aux intervalles évite de perdre un apport, mais ne reconstitue pas le moment du flux à l’intérieur de l’intervalle.

**Correctif proposé :** valoriser juste avant/après chaque flux pour un TWR exact; si cela est impossible, afficher explicitement une estimation de type Modified Dietz avec pondération temporelle, ainsi que l’incertitude liée aux intervalles troués. Ajouter un test de versement en milieu de période (cas 100/100/+10 %). Effort M.

## F-16 — Les colonnes USD des snapshots ne sont pas persistées; le total est reconstruit depuis la poche investie

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** `jobs/daily_snapshot.py:95-104` calcule `totaux_usd`, mais la ligne enregistrée `:158-172` ne contient que des totaux EUR, le cours d’or et l’équivalent-or de la poche investie. Le schéma `migrations/001_init.sql:67-80` n’a ni colonnes USD ni statut de composition. `core/session.py:788-795` reconstruit `tot_u=tot_e*(inv_u/inv_e)`; le repli fait de même `:832-850`.

**Scénario :** la poche investie et les liquidités ont des compositions en devises différentes (par exemple actifs cotés en USD, réserve en CHF). Le rapport USD calculé depuis le ratio de la poche investie ne correspond pas nécessairement aux taux des liquidités; la courbe et l’équivalent de patrimoine en dollars sont alors estimés.

**Correctif proposé :** persister les valeurs EUR et USD par poche/devise, les taux réellement appliqués et l’horodatage/source; ne jamais reconstruire le total USD avec le seul ratio de la poche investie. Si l’un des composants est inconnu, conserver `NULL` et afficher un total incomplet. Effort M.

## F-17 — Le scénario retraite peut présenter 5 % comme rendement « historique » sans avertissement dans Streamlit

**Sévérité : MAJEUR · Effort : S**

**Preuve / scénario :** `pages/3_Retraite.py:76-77` remplace un TWR annualisé absent par `0.05`; `:104-107` présente ensuite le rendement comme « calculé, non modifiable ». Aucun avertissement Python n’explique le repli (`grep` des occurrences dans le fichier : uniquement lignes 76-77). Le miroir Android contient le même 5 %, mais ajoute un texte explicite si le CAGR manque (`views.js:983-990,1256-1260`).

**Scénario :** historique insuffisant, cours indisponibles ou snapshots insuffisants; la page Streamlit affiche une performance historique de 5 % qui n’a pas été observée.

**Correctif proposé :** renvoyer « indisponible » tant que le TWR n’est pas calculable, ou afficher en grand « hypothèse 5 %, pas un rendement constaté » et autoriser l’édition. Harmoniser les deux applications. Effort S.

## F-18 — Projection de rente déterministe, pas une probabilité de pérennité

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** `core/metrics.py:801-832` applique un rendement réel annuel constant, consomme uniquement ce rendement et préserve le pouvoir d’achat du capital. `pages/3_Retraite.py:63-70,116-125,231-238` propose un taux et des scénarios fixes. Cette formule ne modélise pas la volatilité, la séquence des rendements au début de la retraite, les frais, les périodes de perte, l’espérance de vie, la pension, les soins ou une règle de retrait du capital.

**Impact :** le chiffre est une rente mathématique conditionnelle à des hypothèses constantes, pas une garantie de retraite ni un taux de retrait soutenable probabiliste. La mention « perpétuelle » ne doit pas être comprise comme une certitude à 30–40 ans.

**Correctif proposé :** renommer le résultat « scénario à rendement constant »; ajouter scénarios de rendement réel négatif, simulations de séquence (Monte-Carlo ou historiques), épuisement du capital, frais et pension estimée; afficher intervalle et hypothèses plutôt qu’un seul montant. Les contributions manuelles doivent rester datées et révisables annuellement. Effort M.

## F-19 — Le prix de l’or est un future COMEX, non le spot

**Sévérité : SUGGESTION · Effort : S**

**Preuve / scénario :** `core/prices.py:52-58,342-350` choisit `GC=F` après retrait du spot Yahoo et indique lui-même qu’il s’agit du contrat front-month, avec basis et échéance. Le snapshot en déduit `equivalent_or_oz` (`jobs/daily_snapshot.py:148-165`).

**Impact :** l’indicateur « équivalent-or » suit le contrat future et son basis, pas un fixing spot garanti; les écarts de roll/échéance peuvent affecter le benchmark. Le compromis est documenté dans le code, mais la valeur affichée doit être comprise de la même manière.

**Correctif proposé :** afficher la source et la date de cotation à côté du chiffre, ou utiliser un flux spot/fixing d’or contractuellement documenté. Ajouter un contrôle de continuité au changement de contrat. Effort S à M selon la source.

## F-20 — Les historiques partiels peuvent alimenter le rendement comme s’ils étaient complets

**Sévérité : MAJEUR · Effort : M**

**Preuve / scénario :** `jobs/daily_snapshot.py:87-92` poursuit l’écriture lorsqu’une partie seulement des positions a un cours; `:106-146` peut aussi omettre une liquidité si son FX manque. L’alerte est créée, mais la ligne quotidienne est tout de même écrite (`:158-190`). Aucune colonne `complet` n’existe (`migrations/001_init.sql:67-80`). La reconstruction et les historiques sont décrits dans [05](05-integrite-donnees.md).

**Correctif proposé :** séparer snapshot complet, partiel et manquant; exclure les points partiels des calculs de rendement par défaut, ou faire des calculs par composant avec un indicateur visible et traçable. Effort M.

## Contrôles et références

- Scénario TWR calculé à partir de la formule source; test existant de flux en fin de période : `tests/test_metrics.py:170-175`.
- Taux FX historiques appelés via Yahoo par `core/fx.py:100-120`; les échecs réseau du run Python sont documentés dans [00](00-SYNTHESE.md), sans les confondre avec un défaut arithmétique.
- Prix spot/contrat or : le code signale expressément la différence; aucune affirmation n’est faite ici sur un fixing réglementaire unique.
