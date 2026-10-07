# À copier dans GitHub : les blocs « remplacer ceci par cela »

Deuxième méthode, pour les fichiers JavaScript seulement : modifier le
fichier sur GitHub à la main, bloc par bloc, au lieu de le remplacer en
entier par celui du dossier `fichiers/`. Les deux méthodes donnent
exactement le même résultat : un programme a vérifié qu'en faisant tous les
remplacements ci-dessous — dans l'ordre, sur la branche `main` actuelle — on
retombe exactement sur les fichiers corrigés de l'archive.

Il y a **8 blocs** répartis sur **3 fichiers**. Ils partent de l'état
actuel de `main` (les trois fichiers JavaScript du 07/10 ne s'exécutent plus :
une accolade en trop dans deux d'entre eux, une apostrophe manquante dans le
troisième). Ces blocs réparent cela **et** ajoutent le traitement des
achats/ventes comme transferts internes.

## Mode opératoire (interface GitHub, sans logiciel à installer)

Pour chaque bloc : ouvrez le fichier sur GitHub, cliquez sur le crayon
(« Edit this file »), cliquez dans le fichier, faites **Ctrl+F** (Cmd+F sur
Mac), collez le texte « AVANT », remplacez la partie trouvée par le texte
« APRÈS », puis passez au bloc suivant. Quand tous les blocs d'un même
fichier sont faits, cliquez sur « Commit changes » avec un message du genre
« correctif transferts internes ».

Astuce : ne recopiez jamais le texte à la main. Sélectionnez-le ici, copiez-le,
et collez-le dans GitHub. Si Ctrl+F ne trouve pas, c'est qu'une ligne du bloc
a été modifiée entre-temps : repartez du bloc tel qu'il est écrit ici.

## Fichier `metrics.js` — 4 blocs

### metrics.js — bloc 1

**AVANT** (à chercher avec Ctrl+F) :

```
            return { ligne: s, date: d, valeur: U.num(s[colVal], 0) };
        }).filter(function (l) { return l.date && l.valeur > 0; })
            .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });

        if (lignes.length < 2) {
```

**APRÈS** (à coller à la place) :

```
            return { ligne: s, date: d, valeur: U.num(s[colVal], 0) };
        }).filter(function (l) { return l.date && l.valeur > 0; })
            .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : ((a.ligne._live ? 1 : 0) - (b.ligne._live ? 1 : 0))); });

        if (lignes.length < 2) {
```

### metrics.js — bloc 2

**AVANT** (à chercher avec Ctrl+F) :

```
                    var f = fluxAp[i] || 0;
                    flux.push(f);
                    reconstruit.push(prev !== null && prev !== undefined ? U.arrondi(prev + f, 2) : null);
                }
            }
```

**APRÈS** (à coller à la place) :

```
                    var f = fluxAp[i] || 0;
                    flux.push(f);
                    reconstruit.push(cap[i] !== null ? cap[i] : (prev !== null && prev !== undefined ? U.arrondi(prev + f, 2) : null));
                }
            }
```

### metrics.js — bloc 3

**AVANT** (à chercher avec Ctrl+F) :

```
        return flux;
    }
    }

    /* Progression sur une période : graphique + indicateurs. */
```

**APRÈS** (à coller à la place) :

```
        return flux;
    }

    /* Progression sur une période : graphique + indicateurs. */
```

### metrics.js — bloc 4

**AVANT** (à chercher avec Ctrl+F) :

```
        if (dates.length < 1) return { vide: true };

        // Le dernier point porte la valorisation en direct du jour.
        if (valeurLiveUsd > 0) valeurs[valeurs.length - 1] = U.arrondi(valeurLiveUsd, 2);

        var idxGraphe = [], idxCalc = [];
```

**APRÈS** (à coller à la place) :

```
        if (dates.length < 1) return { vide: true };

        // Le direct est un point distinct. Accepte aussi une série brute de
        // snapshots : le dernier enregistrement ne doit jamais être écrasé.
        dates = dates.slice();
        var dernierLive = serie.lignes && serie.lignes.length
            && serie.lignes[serie.lignes.length - 1].ligne._live;
        if (valeurLiveUsd > 0 && !dernierLive && dates[dates.length - 1] <= U.todayISO()) {
            dates.push(U.todayISO());
            valeurs.push(U.arrondi(valeurLiveUsd, 2));
            flux.push(U.num(options.fluxLiveUsd, 0));
        }

        var idxGraphe = [], idxCalc = [];
```

## Fichier `portfolio.js` — 3 blocs

### portfolio.js — bloc 1

**AVANT** (à chercher avec Ctrl+F) :

```
    }

    /* Attache les colonnes en dollars aux apports et aux snapshots, puis met le
       dernier point à la valorisation en direct du jour. */
    function enrichirHistoriquesUsd(ctx) {
        var taux = ctx.tauxEurUsd > 0 ? ctx.tauxEurUsd : 1.125;
```

**APRÈS** (à coller à la place) :

```
    }

    /* Attache les colonnes en dollars aux apports et aux snapshots, puis ajoute
       un point distinct pour la valorisation en direct du jour. */
    function enrichirHistoriquesUsd(ctx) {
        var taux = ctx.tauxEurUsd > 0 ? ctx.tauxEurUsd : 1.125;
```

### portfolio.js — bloc 2

**AVANT** (à chercher avec Ctrl+F) :

```
        lignes.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });

        // Le dernier point reflète la valorisation en direct.
        if (lignes.length && ctx.totalInvestiUsd > 0) {
            var last = lignes[lignes.length - 1];
            last.patrimoine_investi_usd = U.arrondi(ctx.totalInvestiUsd, 2);
            last.patrimoine_investi_eur = U.arrondi(ctx.totalInvestiEur, 2);
            if (ctx.patrimoineTotalUsd >= ctx.totalInvestiUsd) {
                last.patrimoine_total_usd = U.arrondi(ctx.patrimoineTotalUsd, 2);
                last.patrimoine_total_eur = U.arrondi(ctx.patrimoineTotalEur, 2);
                last.precaution_usd = U.arrondi(ctx.totalPrecautionUsd, 2);
                last.precaution_eur = U.arrondi(ctx.totalPrecautionEur, 2);
            }
            if (ctx.equivalentOrOz) last.equivalent_or_oz = U.arrondi(ctx.equivalentOrOz, 4);
            if (ctx.coursOr) last.cours_or_usd = U.arrondi(ctx.coursOr, 2);
        }

        ctx.snapshots = lignes;
        }
        // --- Achats et ventes de titres enregistrés APRÈS la dernière référence
        // Payer des titres avec des liquidités ne change pas la richesse : c'est
```

**APRÈS** (à coller à la place) :

```
        lignes.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });

        // La dernière référence pf2 fait foi même si Projections porte la
        // même date. Garder le capital v1, pas une autre valorisation USD.
        if (lignes.length) {
            var idxDernier = lignes.length - 1;
            var ref = parDate[lignes[idxDernier].date];
            if (ref) {
                var capDernier = lignes[idxDernier].capital_investi_usd;
                lignes[idxDernier] = snapshotVersUsd(ref, lignes[idxDernier].date, taux, ctx);
                lignes[idxDernier].capital_investi_usd = capDernier;
            }
        }

        ctx.snapshots = lignes;
        // Ne jamais remplacer le snapshot nocturne par le direct.
        var jourLive = U.todayISO();
        if (lignes.length && ctx.totalInvestiUsd > 0 && lignes[lignes.length - 1].date <= jourLive) {
            lignes.push({
                date: jourLive, _live: true,
                patrimoine_investi_usd: U.arrondi(ctx.totalInvestiUsd, 2),
                patrimoine_investi_eur: U.arrondi(ctx.totalInvestiEur, 2),
                patrimoine_total_usd: U.arrondi(ctx.patrimoineTotalUsd, 2),
                patrimoine_total_eur: U.arrondi(ctx.patrimoineTotalEur, 2),
                precaution_usd: U.arrondi(ctx.totalPrecautionUsd, 2),
                precaution_eur: U.arrondi(ctx.totalPrecautionEur, 2),
                courant_usd: U.arrondi(ctx.totalCourantUsd, 2),
                courant_eur: U.arrondi(ctx.totalCourantEur, 2),
                equivalent_or_oz: ctx.equivalentOrOz, cours_or_usd: ctx.coursOr
            });
        }

        // --- Achats et ventes de titres enregistrés APRÈS la dernière référence
        // Payer des titres avec des liquidités ne change pas la richesse : c'est
```

### portfolio.js — bloc 3

**AVANT** (à chercher avec Ctrl+F) :

```
            var cumul = 0, aDates = Object.keys(fluxJour).sort();
            snaps.forEach(function (s) {
                aDates.forEach(function (d) { if (d <= s.date) cumul += fluxJour[d]; });
                s.capital_investi_usd = cumul > 0 ? U.arrondi(cumul, 2) : null;
```

**APRÈS** (à coller à la place) :

```
            var cumul = 0, aDates = Object.keys(fluxJour).sort();
            snaps.forEach(function (s) {
                cumul = 0;
                aDates.forEach(function (d) { if (d <= s.date) cumul += fluxJour[d]; });
                s.capital_investi_usd = cumul > 0 ? U.arrondi(cumul, 2) : null;
```

## Fichier `views.js` — 1 blocs

### views.js — bloc 1

**AVANT** (à chercher avec Ctrl+F) :

```
            + '<div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
            + UI.fleche(progTot.twr_per)
            + '<span class="dim" style="font-size:12px">' + dernierEnregistrement(progTot) + '</span>
            + (progTot.twr_per === null ? '' : '<span style="font-size:12.5px;font-weight:650">'
                + U.usd(gainJourUsd, { dec: 0, signe: true }) + '</span>')
```

**APRÈS** (à coller à la place) :

```
            + '<div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
            + UI.fleche(progTot.twr_per)
            + '<span class="dim" style="font-size:12px">' + dernierEnregistrement(progTot) + '</span>'
            + (progTot.twr_per === null ? '' : '<span style="font-size:12.5px;font-weight:650">'
                + U.usd(gainJourUsd, { dec: 0, signe: true }) + '</span>')
```

