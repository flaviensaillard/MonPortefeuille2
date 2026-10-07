# À copier dans GitHub : les blocs « remplacer ceci par cela »

Deuxième méthode, pour les fichiers JavaScript seulement : modifier le
fichier sur GitHub à la main, bloc par bloc, au lieu de le remplacer en
entier par celui du dossier `fichiers/`. Les deux méthodes donnent le même
résultat : un programme a vérifié qu'en faisant tous les remplacements
ci-dessous — dans l'ordre, sur la branche `main` actuelle — on retombe
exactement sur les fichiers corrigés de l'archive.

Il y a **26 blocs** répartis sur **5 fichiers**. Ils partent de l'état
actuel de `main` : trois fichiers JavaScript ne s'exécutent plus (une accolade
en trop dans `metrics.js` et `portfolio.js`, une apostrophe manquante dans
`views.js`). Ces blocs réparent cela, ajoutent le traitement des achats/ventes
comme transferts internes, et corrigent la variation du jour des fiches
d'actifs (cotation du moment plutôt que dernière clôture de la série).

## Mode opératoire (interface GitHub, sans logiciel à installer)

Pour chaque bloc : ouvrez le fichier sur GitHub, cliquez sur le crayon
(« Edit this file »), cliquez dans le fichier, faites **Ctrl+F** (Cmd+F sur
Mac), collez le texte « AVANT », remplacez la partie trouvée par le texte
« APRÈS », puis passez au bloc suivant. Quand tous les blocs d'un même
fichier sont faits, cliquez sur « Commit changes ».

Astuce : ne recopiez jamais le texte à la main. Sélectionnez-le ici, copiez-le,
et collez-le dans GitHub.

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

## Fichier `portfolio.js` — 6 blocs

### portfolio.js — bloc 1

**AVANT** (à chercher avec Ctrl+F) :

```
    }

    /* Variation depuis le dernier enregistrement : le cours Yahoo d'abord, la
       table `Donnees` de la v1 ensuite. */
    function variationsActifs(ctx) {
        var varsV1 = variationsDonneesV1(ctx.donneesV1 || []);
```

**APRÈS** (à coller à la place) :

```
    }

    /* Variation du jour (cotation du moment comparée à la clôture précédente,
       comme le courtier) : le cours Yahoo d'abord, la table `Donnees` de la v1
       ensuite — cette dernière dit « depuis l'enregistrement », et l'écran
       l'affiche ainsi. */
    function variationsActifs(ctx) {
        var varsV1 = variationsDonneesV1(ctx.donneesV1 || []);
```

### portfolio.js — bloc 2

**AVANT** (à chercher avec Ctrl+F) :

```
            ctx.actifs.forEach(function (a) {
                var v = a.variationPct;
                var info = varsV1[a.ticker.toUpperCase()] || {};
                if ((v === null || v === undefined || Math.abs(v) <= 1e-6) && info) {
```

**APRÈS** (à coller à la place) :

```
            ctx.actifs.forEach(function (a) {
                var v = a.variationPct;
                // La séance que Yahoo a réellement comparée (« 2026-10-07 »).
                // Affichée quand ce n'est pas le jour même : l'utilisateur voit
                // alors que la ligne est une clôture, pas un cours manquant.
                var seance = PF.net.variationSeance(a.ticker);
                var origine = seance ? 'jour' : null;
                var info = varsV1[a.ticker.toUpperCase()] || {};
                if ((v === null || v === undefined || Math.abs(v) <= 1e-6) && info) {
```

### portfolio.js — bloc 3

**AVANT** (à chercher avec Ctrl+F) :

```
                        && Math.abs(a.prix - info.cours_usd) > 1e-4) {
                        v = a.prix / info.cours_usd - 1;
                    } else if (info.var_fraction !== null && info.var_fraction !== undefined) {
                        v = info.var_fraction;
                    }
                }
                a.variationPct = (v === null || v === undefined) ? 0 : v;
                ctx.variationsActifs[a.ticker] = a.variationPct;
            });
```

**APRÈS** (à coller à la place) :

```
                        && Math.abs(a.prix - info.cours_usd) > 1e-4) {
                        v = a.prix / info.cours_usd - 1;
                        origine = 'enregistrement';
                    } else if (info.var_fraction !== null && info.var_fraction !== undefined) {
                        v = info.var_fraction;
                        origine = 'enregistrement';
                    }
                }
                a.variationPct = (v === null || v === undefined) ? 0 : v;
                a.variationOrigine = origine;
                a.seanceVariation = seance;
                ctx.variationsActifs[a.ticker] = a.variationPct;
            });
```

### portfolio.js — bloc 4

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

### portfolio.js — bloc 5

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

### portfolio.js — bloc 6

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

## Fichier `views.js` — 9 blocs

### views.js — bloc 1

**AVANT** (à chercher avec Ctrl+F) :

```
       pas « depuis le dernier enregistrement » avec la variation du jour du
       courtier (qui part de la clôture précédente). */
    function dernierEnregistrement(p) {
        return 'depuis le dernier enregistrement'
            + (p && p.d0 ? ' du ' + U.jourMoisAnneeISO(p.d0) : '');
    }

```

**APRÈS** (à coller à la place) :

```
       pas « depuis le dernier enregistrement » avec la variation du jour du
       courtier (qui part de la clôture précédente). */
    /* L'enregistrement qui sert de repère : le dernier snapshot, jamais la
       valorisation en direct (elle changerait à chaque actualisation). */
    function referenceEnregistrement(ctx) {
        var lignes = (ctx && ctx.serie && ctx.serie.lignes) || [];
        for (var i = lignes.length - 1; i >= 0; i--) {
            if (!lignes[i].ligne._live) return lignes[i].ligne;
        }
        return null;
    }

    /* Heure locale de l'enregistrement (« à 2h58 »), quand elle est connue :
       deux repères pris à des heures différentes ne sont pas comparables. */
    function heureEnregistrement(ref) {
        var quand = ref && ref.cree_le ? new Date(ref.cree_le) : null;
        if (!quand || isNaN(quand.getTime())) return '';
        var mn = quand.getMinutes();
        return ' à ' + quand.getHours() + 'h' + (mn < 10 ? '0' : '') + mn;
    }

    function dernierEnregistrement(ctx, p) {
        return 'depuis le dernier enregistrement'
            + (p && p.d0 ? ' du ' + U.jourMoisAnneeISO(p.d0) : '')
            + heureEnregistrement(referenceEnregistrement(ctx));
    }

    /* D'où vient le pourcentage d'une fiche : la séance du jour (Yahoo) ou une
       clôture plus ancienne. On le dit plutôt que de laisser croire que le
       cours du jour n'a pas bougé. */
    function mentionSeance(a) {
        if (!a) return '';
        if (a.variationOrigine === 'enregistrement') return ' · depuis l’enregistrement';
        if (a.seanceVariation && a.seanceVariation !== U.todayISO()) {
            return ' · clôture du ' + U.jourMoisAnneeISO(a.seanceVariation);
        }
        return '';
    }

```

### views.js — bloc 2

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
            + '<span class="dim" style="font-size:12px">' + dernierEnregistrement(ctx, progTot) + '</span>'
            + (progTot.twr_per === null ? '' : '<span style="font-size:12.5px;font-weight:650">'
                + U.usd(gainJourUsd, { dec: 0, signe: true }) + '</span>')
```

### views.js — bloc 3

**AVANT** (à chercher avec Ctrl+F) :

```
                progInv.twr_per === null ? null : UI.fleche(progInv.twr_per), null, null,
                progInv.twr_per === null ? null : {
                    usd: gainJourInvUsd, eur: gainJourInvUsd / fx0, legende: dernierEnregistrement(progInv)
                })
            + miniCarte('Performance depuis le début', null, null, null, perfDebut,
```

**APRÈS** (à coller à la place) :

```
                progInv.twr_per === null ? null : UI.fleche(progInv.twr_per), null, null,
                progInv.twr_per === null ? null : {
                    usd: gainJourInvUsd, eur: gainJourInvUsd / fx0, legende: dernierEnregistrement(ctx, progInv)
                })
            + miniCarte('Performance depuis le début', null, null, null, perfDebut,
```

### views.js — bloc 4

**AVANT** (à chercher avec Ctrl+F) :

```
            + 'l’euro en dessous. Touchez à nouveau pour revenir au pourcentage.</div>';

        // --- Vos actifs depuis le dernier enregistrement
        var investis = ctx.actifs.filter(function (a) { return estInvesti(a); });
        if (investis.length) {
            out += '<div class="titre">Vos actifs <span class="n">' + dernierEnregistrement(progInv) + '</span></div>';
            out += '<div class="hscroll">';
            investis.forEach(function (a) {
```

**APRÈS** (à coller à la place) :

```
            + 'l’euro en dessous. Touchez à nouveau pour revenir au pourcentage.</div>';

        // --- Vos actifs : variation du jour (même repère que le courtier)
        var investis = ctx.actifs.filter(function (a) { return estInvesti(a); });
        if (investis.length) {
            out += '<div class="titre">Vos actifs <span class="n">variation du jour</span></div>';
            out += '<div class="hscroll">';
            investis.forEach(function (a) {
```

### views.js — bloc 5

**AVANT** (à chercher avec Ctrl+F) :

```
                    + ((a.variationPct || h) ? '1' : '') + '">'
                    + '<div class="tk">' + UI.h(a.ticker) + '</div>'
                    + '<div class="pc">' + UI.h(nomPoche(a.poche)) + '</div>'
                    + '<div class="pct">'
                    + '<div class="fl ' + f.classe + '">' + UI.h(f.texte) + '</div>'
```

**APRÈS** (à coller à la place) :

```
                    + ((a.variationPct || h) ? '1' : '') + '">'
                    + '<div class="tk">' + UI.h(a.ticker) + '</div>'
                    + '<div class="pc">' + UI.h(nomPoche(a.poche) + mentionSeance(a)) + '</div>'
                    + '<div class="pct">'
                    + '<div class="fl ' + f.classe + '">' + UI.h(f.texte) + '</div>'
```

### views.js — bloc 6

**AVANT** (à chercher avec Ctrl+F) :

```
                + '<div class="pastille" style="background:' + couleurPoche(a.poche) + '22">' + icone(a.classe) + '</div>'
                + '<div class="gr"><div class="tt">' + UI.h(a.ticker) + '</div>'
                + '<div class="st">' + UI.h(nomPoche(a.poche)) + ' · ' + U.quantite(a.quantite) + ' × '
                + U.nombre(a.prix, 2) + ' ' + UI.h(a.deviseCotation) + '</div></div>'
                + '<div class="dr"><div class="a">' + U.usd(a.valeurUsd, { dec: 0 }) + '</div>'
```

**APRÈS** (à coller à la place) :

```
                + '<div class="pastille" style="background:' + couleurPoche(a.poche) + '22">' + icone(a.classe) + '</div>'
                + '<div class="gr"><div class="tt">' + UI.h(a.ticker) + '</div>'
                + '<div class="st">' + UI.h(nomPoche(a.poche) + mentionSeance(a)) + ' · ' + U.quantite(a.quantite) + ' × '
                + U.nombre(a.prix, 2) + ' ' + UI.h(a.deviseCotation) + '</div></div>'
                + '<div class="dr"><div class="a">' + U.usd(a.valeurUsd, { dec: 0 }) + '</div>'
```

### views.js — bloc 7

**AVANT** (à chercher avec Ctrl+F) :

```
        var affiches = 0;

        BLOCS_PERF.forEach(function (b) {
            var p = progression(ctx, b.cle, perimetre);
```

**APRÈS** (à coller à la place) :

```
        var affiches = 0;

        /* Sur la progression journalière, on écrit noir sur blanc la valeur de
           départ : c'est elle qu'on compare à la « variation journalière » du
           courtier, et deux repères pris à des heures différentes ne sont pas
           comparables. */
        function ligneRepere(contexte, cle, p) {
            if (cle !== 'Progression journalière') return '';
            var ref = referenceEnregistrement(contexte);
            return ' \u00b7 repère de départ ' + U.usd(p.v_debut_usd, { dec: 0 })
                + (ref ? ' enregistré le ' + U.jourMoisAnneeISO(ref.date) + heureEnregistrement(ref) : '');
        }

        BLOCS_PERF.forEach(function (b) {
            var p = progression(ctx, b.cle, perimetre);
```

### views.js — bloc 8

**AVANT** (à chercher avec Ctrl+F) :

```
                + ' \u00b7 ' + courbe.valeurs.length + ' points \u00b7 valeur fin de p\u00e9riode '
                + U.usd(p.v_fin_usd, { dec: 0 })
                + ' <span style="color:var(--euro)">(' + U.eur(p.v_fin_usd / fx, { dec: 0 }) + ')</span></div>'
                + UI.graphique([{
                    nom: nomPerimetre,
```

**APRÈS** (à coller à la place) :

```
                + ' \u00b7 ' + courbe.valeurs.length + ' points \u00b7 valeur fin de p\u00e9riode '
                + U.usd(p.v_fin_usd, { dec: 0 })
                + ' <span style="color:var(--euro)">(' + U.eur(p.v_fin_usd / fx, { dec: 0 }) + ')</span>'
                + ligneRepere(ctx, b.cle, p) + '</div>'
                + UI.graphique([{
                    nom: nomPerimetre,
```

### views.js — bloc 9

**AVANT** (à chercher avec Ctrl+F) :

```
    PF.vues = {
        bord: vueBord,
        portefeuille: vuePortefeuille,
        performance: vuePerformance,
```

**APRÈS** (à coller à la place) :

```
    PF.vues = {
        bord: vueBord,
        mentionSeance: mentionSeance,
        dernierEnregistrement: dernierEnregistrement,
        portefeuille: vuePortefeuille,
        performance: vuePerformance,
```

## Fichier `net.js` — 6 blocs

### net.js — bloc 1

**AVANT** (à chercher avec Ctrl+F) :

```
    var cache_cours = {};      // ticker|date -> prix
    var cache_variation = {};  // ticker -> fraction
    var cache_devise = {};     // ticker -> devise
    var cache_fx = {};         // DEV-CONTRE|date -> taux
```

**APRÈS** (à coller à la place) :

```
    var cache_cours = {};      // ticker|date -> prix
    var cache_variation = {};  // ticker -> fraction
    var cache_seance = {};     // ticker -> date de la séance comparée (ISO)
    var cache_devise = {};     // ticker -> devise
    var cache_fx = {};         // DEV-CONTRE|date -> taux
```

### net.js — bloc 2

**AVANT** (à chercher avec Ctrl+F) :

```
                    var meta = res[0].meta || {};
                    out.currency = (meta.currency || '').toUpperCase() || null;
                    var ts = res[0].timestamp || [];
                    var q = (res[0].indicators && res[0].indicators.quote && res[0].indicators.quote[0]) || {};
```

**APRÈS** (à coller à la place) :

```
                    var meta = res[0].meta || {};
                    out.currency = (meta.currency || '').toUpperCase() || null;
                    /* Le « méta » porte la cotation du moment et la clôture
                       précédente : c'est exactement la référence du courtier
                       (« variation journalière »). La série, elle, peut s'arrêter
                       à la séance précédente — cas connu de Yahoo sur IGLN.L,
                       XDW0.L et FLXC.L, où la dernière ligne arrive sans cours.
                       S'en remettre aux deux dernières clôtures de la série
                       affichait donc la variation de la veille. */
                    var prixMeta = Number(meta.regularMarketPrice);
                    var veilleMeta = Number(
                        meta.chartPreviousClose !== undefined && meta.chartPreviousClose !== null
                            ? meta.chartPreviousClose : meta.previousClose);
                    out.cours = (isFinite(prixMeta) && prixMeta > 0) ? prixMeta : null;
                    out.veille = (isFinite(veilleMeta) && veilleMeta > 0) ? veilleMeta : null;
                    out.seance = meta.regularMarketTime
                        ? U.iso(new Date(meta.regularMarketTime * 1000)) : null;
                    var ts = res[0].timestamp || [];
                    var q = (res[0].indicators && res[0].indicators.quote && res[0].indicators.quote[0]) || {};
```

### net.js — bloc 3

**AVANT** (à chercher avec Ctrl+F) :

```
                    if (idx >= 0) prix = s.closes[idx];
                } else {
                    prix = s.closes[s.closes.length - 1];
                    if (s.closes.length >= 2 && s.closes[s.closes.length - 2] > 0) {
                        cache_variation[tk] = prix / s.closes[s.closes.length - 2] - 1;
                    }
                }
```

**APRÈS** (à coller à la place) :

```
                    if (idx >= 0) prix = s.closes[idx];
                } else {
                    // Cotation du moment d'abord (méta Yahoo) : la série peut
                    // être en retard d'une séance sur certains tickers.
                    prix = (s.cours !== null && s.cours !== undefined)
                        ? s.cours : s.closes[s.closes.length - 1];
                    var base = (s.veille !== null && s.veille !== undefined)
                        ? s.veille
                        : (s.closes.length >= 2 ? s.closes[s.closes.length - 2] : null);
                    if (base !== null && base !== undefined && base > 0 && prix > 0) {
                        cache_variation[tk] = prix / base - 1;
                        cache_seance[tk] = s.seance
                            || (s.timestamps.length ? s.timestamps[s.timestamps.length - 1] : null);
                    }
                }
```

### net.js — bloc 4

**AVANT** (à chercher avec Ctrl+F) :

```
    function variationRecente(ticker) {
        var v = cache_variation[String(ticker || '').toUpperCase().trim()];
        return v === undefined ? null : v;
    }
```

**APRÈS** (à coller à la place) :

```
    function variationRecente(ticker) {
        var v = cache_variation[String(ticker || '').toUpperCase().trim()];
        return v === undefined ? null : v;
    }

    /* Séance (date ISO) sur laquelle porte `variationRecente`. Permet d'afficher
       « clôture du 06/10 » quand le cours du jour n'est pas encore connu : sans
       cela, on croit que la ligne n'a pas bougé. */
    function variationSeance(ticker) {
        var v = cache_seance[String(ticker || '').toUpperCase().trim()];
        return v === undefined ? null : v;
    }
```

### net.js — bloc 5

**AVANT** (à chercher avec Ctrl+F) :

```
    function viderCache() {
        U.vider(cache_serie); U.vider(cache_cours); U.vider(cache_variation);
        U.vider(cache_devise); U.vider(cache_fx);
    }

```

**APRÈS** (à coller à la place) :

```
    function viderCache() {
        U.vider(cache_serie); U.vider(cache_cours); U.vider(cache_variation);
        U.vider(cache_seance); U.vider(cache_devise); U.vider(cache_fx);
    }

```

### net.js — bloc 6

**AVANT** (à chercher avec Ctrl+F) :

```
    PF.net = {
        req: req, _fin: _fin, serie: serie, cours: cours, coursActuels: coursActuels,
        variationRecente: variationRecente, deviseDe: deviseDe, coursOr: coursOr,
        taux: taux, viderCache: viderCache, supabase: supabase,
        setTransport: function (fn) { transport = fn; viderCache(); },
```

**APRÈS** (à coller à la place) :

```
    PF.net = {
        req: req, _fin: _fin, serie: serie, cours: cours, coursActuels: coursActuels,
        variationRecente: variationRecente, variationSeance: variationSeance,
        deviseDe: deviseDe, coursOr: coursOr,
        taux: taux, viderCache: viderCache, supabase: supabase,
        setTransport: function (fn) { transport = fn; viderCache(); },
```

## Fichier `app.js` — 1 blocs

### app.js — bloc 1

**AVANT** (à chercher avec Ctrl+F) :

```
            + '<div class="lbl">Valeur</div>'
            + UI.montant(a.valeurUsd, a.valeurEur)
            + '<div style="margin-top:7px">' + UI.fleche(a.variationPct) + ' <span class="dim" style="font-size:12px">depuis le dernier enregistrement</span></div>'
            + '</div>'
            + '<div class="grille g2">'
```

**APRÈS** (à coller à la place) :

```
            + '<div class="lbl">Valeur</div>'
            + UI.montant(a.valeurUsd, a.valeurEur)
            + '<div style="margin-top:7px">' + UI.fleche(a.variationPct) + ' <span class="dim" style="font-size:12px">'
            + UI.h('variation du jour' + (PF.vues && PF.vues.mentionSeance ? PF.vues.mentionSeance(a) : '')) + '</span></div>'
            + '</div>'
            + '<div class="grille g2">'
```

