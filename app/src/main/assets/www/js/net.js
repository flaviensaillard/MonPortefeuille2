/* Réseau : Yahoo Finance (cours, devises) et Supabase (PostgREST).
   Toutes les requêtes passent par le pont natif Java quand il existe : un
   WebView servi depuis file:// a une origine nulle, et plusieurs API refusent
   alors le cross-origin. En Java, l'application parle au réseau comme n'importe
   quel client Android — pas de CORS, pas de préflight.

   Les appels sont ASYNCHRONES (Native.httpAsync + rappel sur le thread UI) :
   l'interface ne se fige jamais pendant un téléchargement de cours. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var U = PF.util;

    var TICKER_OR = 'GC=F';
    var ALIAS_YAHOO = { 'BTCUSDT': 'BTC-USD' };
    var YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/';

    var cache_serie = {};      // symbole|range -> {timestamps, closes, currency, ok}
    var cache_cours = {};      // ticker|date -> prix
    var cache_variation = {};  // ticker -> fraction
    var cache_seance = {};     // ticker -> date de la séance comparée (ISO)
    var cache_devise = {};     // ticker -> devise
    var cache_fx = {};         // DEV-CONTRE|date -> taux
    var transport = null;      // pour les tests (renvoie un objet ou une promesse)
    var compteurCb = 0;

    var promesses = {};
    var estNavigateur = typeof root.document !== 'undefined';
    var decodeur = (typeof root.TextDecoder !== 'undefined') ? new root.TextDecoder('utf-8') : null;

    function b64versTexte(b64) {
        try {
            var bin = root.atob(b64);
            var octets = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
            if (decodeur) return decodeur.decode(octets);
            var s = '';
            for (var j = 0; j < bin.length; j++) s += String.fromCharCode(octets[j]);
            return decodeURIComponent(escape(s));
        } catch (e) { return ''; }
    }

    function norm(r) {
        var out = r || { ok: false, status: -1, body: '' };
        if (typeof out.body_b64 === 'string') out.body = b64versTexte(out.body_b64);
        if (out.ok && typeof out.body === 'string' && out.body.length) {
            try { out.json = JSON.parse(out.body); } catch (e) { out.json = null; }
        } else {
            out.json = null;
        }
        return out;
    }

    /* Requête HTTP. Asynchrone dès que le pont natif le permet. */
    function req(method, url, entetes, corps) {
        if (transport) {
            return Promise.resolve(transport(method, url, entetes, corps)).then(norm);
        }
        if (estNavigateur && typeof root.Native !== 'undefined' && root.Native.httpAsync) {
            return new Promise(function (resoudre) {
                var id = 'cb' + (++compteurCb);
                promesses[id] = resoudre;
                try {
                    root.Native.httpAsync(
                        method, url,
                        entetes ? JSON.stringify(entetes) : null,
                        corps === undefined || corps === null ? null : String(corps),
                        id
                    );
                } catch (e) {
                    delete promesses[id];
                    resoudre(norm({ ok: false, status: -1, body: '' }));
                }
            });
        }
        if (estNavigateur && typeof root.Native !== 'undefined' && root.Native.http) {
            var brut = root.Native.http(method, url, entetes ? JSON.stringify(entetes) : null,
                corps === undefined || corps === null ? null : String(corps));
            try { return Promise.resolve(norm(typeof brut === 'string' ? JSON.parse(brut) : brut)); }
            catch (e) { return Promise.resolve(norm({ ok: false, status: -1, body: '' })); }
        }
        return Promise.resolve(norm({ ok: false, status: -1, body: '', error: 'hors ligne' }));
    }

    /* Rappel appelé par Java : Native.httpAsync -> PF.net._fin(id, json). */
    function _fin(id, charge) {
        var r = null;
        if (typeof charge === 'string') {
            try { r = JSON.parse(charge); } catch (e) { r = { ok: false, status: -1, body: '' }; }
        } else { r = charge || { ok: false, status: -1, body: '' }; }
        var resoudre = promesses[id];
        delete promesses[id];
        if (resoudre) resoudre(norm(r));
    }

    function estRecent(dateISO) {
        if (!dateISO) return true;
        var d = U.diffJours(dateISO, U.todayISO());
        return d <= 3 && d >= -1;
    }

    /* Écart maximal toléré entre la cotation du moment et la dernière clôture
       de la série. Au-delà, la cotation est réputée fausse (métadonnées
       fossiles chez Yahoo — cas XJSE.SW) : on retombe sur la série. Une action
       ou un ETF ne saute pas de 20 % entre deux séances ; une crypto, si. */
    function seuilEcart(symbole) {
        return /-USD$|-USDT$/.test(String(symbole || '')) ? 0.75 : 0.20;
    }

    /* Série de clôtures d'un symbole Yahoo, en une seule requête. */
    function serie(symbole, range) {
        range = range || 'max';
        var cle = symbole + '|' + range;
        if (cache_serie[cle]) return Promise.resolve(cache_serie[cle]);
        var url = YAHOO + encodeURIComponent(symbole) + '?range=' + range + '&interval=1d&includePrePost=false';
        return req('GET', url).then(function (r) {
            var out = { timestamps: [], closes: [], currency: null, ok: false };
            try {
                var res = r.json && r.json.chart && r.json.chart.result;
                if (res && res.length) {
                    var meta = res[0].meta || {};
                    out.currency = (meta.currency || '').toUpperCase() || null;
                    /* Le « méta » porte la cotation du moment (`regularMarketPrice`)
                       et la séance qui va avec. La série, elle, peut s'arrêter
                       à la séance précédente — cas connu de Yahoo sur IGLN.L,
                       XDW0.L et FLXC.L, où la dernière ligne arrive sans cours. */
                    var prixMeta = Number(meta.regularMarketPrice);
                    out.cours = (isFinite(prixMeta) && prixMeta > 0) ? prixMeta : null;
                    out.seance = meta.regularMarketTime
                        ? U.iso(new Date(meta.regularMarketTime * 1000)) : null;
                    /* Yahoo calcule LUI-MÊME la variation du jour (cours du
                       moment contre la clôture officielle de la veille) : c'est
                       le même chiffre que le courtier. On le prend quand il
                       existe — car la série, elle, peut TROUER une séance
                       (IGLN.L, XDW0.L, FLXC.L : bougie de la veille sans cours),
                       et une base reconstituée depuis la série retombe alors
                       sur l'avant-veille. */
                    var pct = Number(meta.regularMarketChangePercent);
                    if (!isFinite(pct)) pct = Number(meta.fulldayChangePercent);
                    out.varJour = (isFinite(pct) && pct !== 0) ? pct / 100 : null;
                    var ts = res[0].timestamp || [];
                    var q = (res[0].indicators && res[0].indicators.quote && res[0].indicators.quote[0]) || {};
                    var cl = q.close || [];
                    for (var i = 0; i < ts.length; i++) {
                        var v = cl[i];
                        if (typeof v === 'number' && isFinite(v) && v > 0) {
                            out.timestamps.push(U.iso(new Date(ts[i] * 1000)));
                            out.closes.push(v);
                        }
                    }
                    /* La clôture précédente se prend DANS la série, pas dans le
                       méta. `chartPreviousClose` est la clôture d'avant la
                       PREMIÈRE bougie de la fenêtre demandée : sur `range=5d`,
                       c'est celle d'il y a ~6 séances, pas celle de la veille.
                       L'utiliser donnait une variation sur une semaine affichée
                       comme « variation du jour » — l'écart avec le courtier.
                       Bonne base : la dernière clôture de la série ANTÉRIEURE à
                       la séance du cours. Série à jour (dernière bougie = séance
                       du cours) → la veille, comme le courtier. Série en retard
                       (IGLN.L, XDW0.L, FLXC.L : dernière bougie sans cours) →
                       la dernière clôture connue, exactement ce qu'il faut. */
                    out.veille = null;
                    if (out.seance) {
                        for (var j = out.timestamps.length - 1; j >= 0; j--) {
                            if (out.timestamps[j] < out.seance) {
                                out.veille = out.closes[j];
                                break;
                            }
                        }
                    } else if (out.closes.length >= 2) {
                        // Pas de séance connue : la veille est l'avant-dernière
                        // clôture (comportement d'avant la 1.7.3).
                        out.veille = out.closes[out.closes.length - 2];
                    }
                    out.ok = out.closes.length > 0;
                }
            } catch (e) { out.ok = false; }
            cache_serie[cle] = out;
            return out;
        });
    }

    function dernierAvant(s, dateISO) {
        var idx = -1;
        for (var i = 0; i < s.timestamps.length; i++) {
            if (s.timestamps[i] <= dateISO) idx = i; else break;
        }
        return idx;
    }

    /* Cours de clôture d'un ticker (promesse). */
    function cours(ticker, dateISO) {
        var tk = String(ticker || '').toUpperCase().trim();
        if (!tk) return Promise.resolve(null);
        var cleC = tk + '|' + (dateISO || '');
        if (cache_cours[cleC] !== undefined) return Promise.resolve(cache_cours[cleC]);
        var symbole = ALIAS_YAHOO[tk] || tk;
        var range = estRecent(dateISO) ? '5d' : 'max';
        return serie(symbole, range).then(function (s) {
            if (s.currency) cache_devise[tk] = s.currency;
            var prix = null;
            if (s.ok && s.closes.length) {
                if (dateISO && !estRecent(dateISO)) {
                    var idx = dernierAvant(s, dateISO);
                    if (idx >= 0) prix = s.closes[idx];
                } else {
                    // --- Cotation du moment, SOUS RÉSERVE.
                    // XJSE.SW sert un « cours du moment » figé au 06/12/2023
                    // (métadonnées fossiles, en JPY) : l'utiliser gonflait la
                    // ligne de +22,5 %. Deux conditions pour faire confiance :
                    // la séance du cours est récente, et le cours est cohérent
                    // avec la dernière clôture de la série (un ETF ne fait pas
                    // +20 % entre deux séances ; une crypto, si).
                    var dernier = s.closes[s.closes.length - 1];
                    var avantDernier = s.closes.length >= 2
                        ? s.closes[s.closes.length - 2] : null;
                    var seuil = seuilEcart(symbole);
                    var liveValide = s.cours > 0 && s.seance && estRecent(s.seance)
                        && dernier > 0
                        && Math.abs(s.cours / dernier - 1) <= seuil;
                    var prix = liveValide ? s.cours : dernier;
                    var base = liveValide && s.veille !== null && s.veille !== undefined
                        ? s.veille : avantDernier;
                    var seance = liveValide ? s.seance
                        : (s.timestamps.length ? s.timestamps[s.timestamps.length - 1] : null);
                    // Variation du jour : le chiffre CALCULÉ PAR YAHOO d'abord
                    // (même référence que le courtier, insensible aux bougies
                    // trouées), sinon cours/base reconstitués depuis la série.
                    var v = null;
                    if (liveValide && s.varJour !== null && s.varJour !== undefined
                        && Math.abs(s.varJour) <= seuil) {
                        v = s.varJour;
                    } else if (base !== null && base !== undefined && base > 0 && prix > 0) {
                        v = prix / base - 1;
                    }
                    if (v !== null) {
                        cache_variation[tk] = v;
                        cache_seance[tk] = seance;
                    }
                    cache_cours[cleC] = prix > 0 ? prix : null;
                    return cache_cours[cleC];
                }
            }
            if (prix === null || !isFinite(prix) || prix <= 0) prix = null;
            cache_cours[cleC] = prix;
            return prix;
        });
    }

    function coursActuels(tickers) {
        return Promise.all((tickers || []).map(function (t) { return cours(t); }))
            .then(function (vals) {
                var trouves = {}, echecs = [];
                (tickers || []).forEach(function (t, i) {
                    if (vals[i] === null) echecs.push(t); else trouves[t] = vals[i];
                });
                return { cours: trouves, echecs: echecs };
            });
    }

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

    function deviseDe(ticker) {
        var tk = String(ticker || '').toUpperCase().trim();
        if (cache_devise[tk]) return Promise.resolve(cache_devise[tk]);
        return serie(ALIAS_YAHOO[tk] || tk, '5d').then(function (s) {
            if (s.currency) { cache_devise[tk] = s.currency; return s.currency; }
            return null;
        });
    }

    function coursOr(dateISO) { return cours(TICKER_OR, dateISO); }

    /* Taux de change devise -> contre. Yahoo cote les deux sens de la paire. */
    function taux(devise, dateISO, contre) {
        devise = String(devise || '').toUpperCase().trim();
        contre = String(contre || 'EUR').toUpperCase().trim();
        if (devise === contre || !devise || devise === 'NAN') return Promise.resolve(1);
        var cle = devise + '-' + contre + '|' + (dateISO || '');
        if (cache_fx[cle] !== undefined) return Promise.resolve(cache_fx[cle]);
        var symbole = devise + contre + '=X';
        return serie(symbole, estRecent(dateISO) ? '5d' : 'max').then(function (s) {
            var brut = null;
            if (s.ok && s.closes.length) {
                if (dateISO && !estRecent(dateISO)) {
                    var idx = dernierAvant(s, dateISO);
                    if (idx >= 0) brut = s.closes[idx];
                } else {
                    brut = s.closes[s.closes.length - 1];
                }
            }
            if (brut === null || !isFinite(brut) || brut <= 0) brut = null;
            cache_fx[cle] = brut;
            return brut;
        });
    }

    /* Cours d'un mouvement de fonds (apport ou retrait) : la devise en euros ET
       en dollars au jour de l'opération. Si l'un manque, la promesse est rejetée
       avec `tauxIndisponible` et la paire manquante : il n'existe aucun repli
       (ni 1, ni un taux de réglage) qui permettrait d'écrire le mouvement. */
    function tauxMouvement(devise, dateISO) {
        return Promise.all([taux(devise, dateISO, 'EUR'), taux(devise, dateISO, 'USD')]).then(function (r) {
            var eur = PF.util.tauxValide(r[0]), usd = PF.util.tauxValide(r[1]);
            if (eur !== null && usd !== null) return { eur: eur, usd: usd };
            var e = new Error('taux indisponible');
            e.tauxIndisponible = true;
            e.paire = eur === null ? String(devise).toUpperCase() + '/EUR' : String(devise).toUpperCase() + '/USD';
            throw e;
        });
    }

    function viderCache() {
        U.vider(cache_serie); U.vider(cache_cours); U.vider(cache_variation);
        U.vider(cache_seance); U.vider(cache_devise); U.vider(cache_fx);
    }

    // ------------------------------------------------------------- Supabase

    function clefs() {
        var r = (PF.store && PF.store.reglages()) || {};
        return { url: String(r.supabaseUrl || '').replace(/\/+$/, ''), cle: String(r.supabaseKey || '') };
    }

    var supabase = {
        url: function (table, query) {
            return clefs().url + '/rest/v1/' + table + (query ? '?' + query : '');
        },
        entetes: function (extra) {
            var k = clefs().cle;
            var h = { apikey: k, Authorization: 'Bearer ' + k };
            if (extra) for (var e in extra) if (extra.hasOwnProperty(e)) h[e] = extra[e];
            return h;
        },
        select: function (table, query) {
            return req('GET', supabase.url(table, query || 'select=*'), supabase.entetes({ Accept: 'application/json' }))
                .then(function (r) {
                    if (!r.ok) throw new Error('Lecture ' + table + ' impossible (' + (r.status || 'réseau') + ')');
                    return r.json || [];
                });
        },
        insert: function (table, lignes) {
            return req('POST', supabase.url(table), supabase.entetes({
                'Content-Type': 'application/json', Prefer: 'return=representation'
            }), JSON.stringify(lignes)).then(function (r) {
                if (!r.ok) throw new Error('Écriture ' + table + ' refusée' + (r.body ? ' : ' + String(r.body).slice(0, 160) : ''));
                return r.json || [];
            });
        },
        upsert: function (table, lignes, onConflict) {
            var q = onConflict ? 'on_conflict=' + onConflict : '';
            return req('POST', supabase.url(table, q), supabase.entetes({
                'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates'
            }), JSON.stringify(lignes)).then(function (r) {
                if (!r.ok) throw new Error('Mise à jour ' + table + ' refusée' + (r.body ? ' : ' + String(r.body).slice(0, 160) : ''));
                return r.json || [];
            });
        },
        update: function (table, champs, filtre) {
            return req('PATCH', supabase.url(table, filtre || ''), supabase.entetes({
                'Content-Type': 'application/json', Prefer: 'return=representation'
            }), JSON.stringify(champs)).then(function (r) {
                if (!r.ok) throw new Error('Modification ' + table + ' refusée' + (r.body ? ' : ' + String(r.body).slice(0, 160) : ''));
                return r.json || [];
            });
        },
        supprimer: function (table, filtre) {
            return req('DELETE', supabase.url(table, filtre || ''), supabase.entetes({ Prefer: 'return=representation' }))
                .then(function (r) {
                    if (!r.ok) throw new Error('Suppression ' + table + ' refusée' + (r.body ? ' : ' + String(r.body).slice(0, 160) : ''));
                    return r.json || [];
                });
        },
        tester: function () {
            return req('GET', supabase.url('pf2_transactions', 'select=id&limit=1'), supabase.entetes({ Accept: 'application/json' }))
                .then(function (r) {
                    return { ok: !!r.ok, status: r.status, detail: r.ok ? 'Connexion établie' : (r.body ? String(r.body).slice(0, 160) : 'Réseau injoignable') };
                });
        },
        /* Essaie plusieurs tables : sur une base partagée, certaines n'existent pas. */
        essayer: function (tables, query) {
            var i = 0;
            function suivant() {
                if (i >= tables.length) return Promise.resolve([]);
                var t = tables[i++];
                return supabase.select(t, query).then(function (rows) { return rows; },
                    function () { return suivant(); });
            }
            return suivant();
        }
    };

    PF.net = {
        req: req, _fin: _fin, serie: serie, cours: cours, coursActuels: coursActuels,
        variationRecente: variationRecente, variationSeance: variationSeance,
        deviseDe: deviseDe, coursOr: coursOr,
        taux: taux, tauxMouvement: tauxMouvement, viderCache: viderCache, supabase: supabase,
        setTransport: function (fn) { transport = fn; viderCache(); },
        TICKER_OR: TICKER_OR, ALIAS_YAHOO: ALIAS_YAHOO,
        cache: { cours: cache_cours, fx: cache_fx, variation: cache_variation, serie: cache_serie }
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
