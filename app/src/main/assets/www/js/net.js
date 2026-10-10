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

    /* Taux de change devise -> contre. Yahoo cote les deux sens de la paire.

       2.1.0 (revue D-04) : une devise ABSENTE ou « NAN » n'est PLUS JAMAIS
       convertie au taux 1. Elle rend `null` — comme un taux introuvable — et
       toute valorisation qui en dépend est annoncée indisponible. Une devise
       hors ISO 4217 est traitée de même. Seule la devise contre elle-même
       reste 1. */
    function taux(devise, dateISO, contre) {
        devise = String(devise || '').toUpperCase().trim();
        contre = String(contre || 'EUR').toUpperCase().trim();
        if (devise === contre) return Promise.resolve(1);
        if (!devise || !contre || devise === 'NAN' || contre === 'NAN'
            || !PF.modele || !(PF.modele.DEVISES_ISO || []).includes(devise)
            || !(PF.modele.DEVISES_ISO || []).includes(contre)) {
            return Promise.resolve(null);
        }
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

    /* Pagination (2.1.0) : limite standard Supabase par réponse, et ordre
       stable propre à chaque table (clé primaire ou clé naturelle). */
    var LIMITE_PAGE = 1000;
    var ORDRE_PAGINATION = {
        pf2_transactions: 'id.asc',
        pf2_apports: 'id.asc',
        pf2_snapshots: 'date.asc,id.asc',
        pf2_cours: 'ticker.asc,date.asc',
        pf2_fx: 'devise.asc,contre.asc,date.asc',
        pf2_inflation: 'annee.asc',
        pf2_alertes: 'id.asc',
        pf2_comptes: 'id.asc',
        pf2_operations_compte: 'id.asc',
        Donnees: 'id.asc',
        Projections: 'id.asc',
        Historique: 'id.asc',
        Transaction: 'id.asc'
    };

    /* ------------------------------------------------------------------
       Supabase Auth (2.1.0, revue S-01). La clé publique ne suffit plus :
       les politiques RLS exigent un utilisateur authentifié. L'application
       crée un compte (email/mot de passe), conserve les jetons sur
       l'appareil et les rafraîchit automatiquement.                       */
    var auth = {
        url: function (chemin) { return clefs().url + '/auth/v1/' + chemin; },
        entetes: function () {
            return { apikey: clefs().cle, 'Content-Type': 'application/json' };
        },
        /* Crée un compte. Selon la configuration Supabase, la réponse porte
           soit une session immédiate, soit une demande de confirmation par
           e-mail (retour {confirmation: true}). */
        inscription: function (email, motDePasse) {
            return req('POST', auth.url('signup'), auth.entetes(),
                JSON.stringify({ email: email, password: motDePasse }))
                .then(function (r) {
                    if (!r.ok) throw new Error(erreurAuth(r, 'La création du compte a échoué'));
                    if (r.json && r.json.access_token) return enregistrerSession(r.json);
                    return { confirmation: true };
                });
        },
        connexion: function (email, motDePasse) {
            return req('POST', auth.url('token?grant_type=password'), auth.entetes(),
                JSON.stringify({ email: email, password: motDePasse }))
                .then(function (r) {
                    if (!r.ok) throw new Error(erreurAuth(r, 'Connexion refusée'));
                    return enregistrerSession(r.json);
                });
        },
        rafraichir: function () {
            var s = (PF.store && PF.store.lireSession && PF.store.lireSession()) || null;
            if (!s || !s.refresh_token) return Promise.resolve(null);
            return req('POST', auth.url('token?grant_type=refresh_token'), auth.entetes(),
                JSON.stringify({ refresh_token: s.refresh_token }))
                .then(function (r) {
                    if (!r.ok || !r.json || !r.json.access_token) {
                        // Jeton de rafraîchissement révoqué ou expiré : la
                        // session est morte, on la retire sans effacer les réglages.
                        if (PF.store && PF.store.effacerSession) PF.store.effacerSession();
                        // 2.1.1 : les jetons gardés pour l'empreinte sont morts
                        // eux aussi — jamais une copie morte n'ouvrira la suite.
                        if (PF.biometrie && PF.biometrie.nettoyer) { try { PF.biometrie.nettoyer(); } catch (e) { /* sans empreinte */ } }
                        return null;
                    }
                    return enregistrerSession(r.json);
                });
        },
        /* Session utilisable : rafraîchie si l'expiration approche. */
        sessionValide: function () {
            var s = (PF.store && PF.store.lireSession && PF.store.lireSession()) || null;
            if (!s || !s.access_token) return Promise.resolve(null);
            if (s.expires_at && s.expires_at - 60000 > Date.now()) return Promise.resolve(s);
            return auth.rafraichir();
        },
        deconnexion: function () {
            var s = (PF.store && PF.store.lireSession && PF.store.lireSession()) || null;
            var h = auth.entetes();
            if (s && s.access_token) h.Authorization = 'Bearer ' + s.access_token;
            if (PF.store && PF.store.effacerSession) PF.store.effacerSession();
            // 2.1.1 : la copie chiffrée des jetons (empreinte) ne survit pas à
            // la déconnexion.
            if (PF.biometrie && PF.biometrie.nettoyer) { try { PF.biometrie.nettoyer(); } catch (e) { /* sans empreinte */ } }
            return req('POST', auth.url('logout'), h, '').then(function () { return true; });
        },
        aUneSession: function () {
            var s = (PF.store && PF.store.lireSession && PF.store.lireSession()) || null;
            return !!(s && s.access_token);
        },
        utilisateur: function () {
            var s = (PF.store && PF.store.lireSession && PF.store.lireSession()) || null;
            return s ? { id: s.user_id || null, email: s.email || null } : null;
        }
    };

    function enregistrerSession(brut) {
        var s = {
            access_token: brut.access_token,
            refresh_token: brut.refresh_token,
            expires_at: Date.now() + (Number(brut.expires_in) || 3600) * 1000,
            user_id: brut.user ? brut.user.id : null,
            email: brut.user ? (brut.user.email || '') : ''
        };
        if (PF.store && PF.store.sauverSession) PF.store.sauverSession(s);
        // 2.1.1 — connexion par empreinte : chaque jeton rafraîchi rescelle la
        // copie chiffrée (Keystore), sinon la prochaine ouverture tomberait sur
        // un jeton de rafraîchissement déjà consommé.
        if (PF.biometrie && PF.biometrie.sceller) { try { PF.biometrie.sceller(s); } catch (e) { /* sans empreinte */ } }
        return s;
    }

    function erreurAuth(r, defaut) {
        try {
            var j = r.json || (r.body ? JSON.parse(r.body) : null);
            if (j && (j.error_description || j.msg || j.message)) {
                return String(j.error_description || j.msg || j.message);
            }
        } catch (e) { /* corps illisible */ }
        return defaut + ' (' + (r.status || 'réseau') + ')';
    }

    var supabase = {
        url: function (table, query) {
            return clefs().url + '/rest/v1/' + table + (query ? '?' + query : '');
        },
        entetes: function (extra) {
            var k = clefs().cle;
            // Bearer = jeton d'accès de la session si elle existe, sinon clé
            // publique (lecture seule après la migration 004).
            var s = (PF.store && PF.store.lireSession && PF.store.lireSession()) || null;
            // 2.1.1 (constat B) : une clé `sb_…` (publishable) n'est PAS un JWT.
            // Elle ne va que dans `apikey`, jamais en Bearer. Le Bearer ne porte
            // qu'un jeton de session, ou une clé anon héritée (JWT eyJ…).
            var jeton = (s && s.access_token) ? s.access_token : (k.indexOf('sb_') === 0 ? null : k);
            var h = { apikey: k };
            if (jeton) h.Authorization = 'Bearer ' + jeton;
            if (extra) for (var e in extra) if (extra.hasOwnProperty(e)) h[e] = extra[e];
            return h;
        },
        select: function (table, query) {
            return requeteAvecSession('GET', supabase.url(table, query || 'select=*'),
                { Accept: 'application/json' }, null).then(function (r) {
                    if (!r.ok) throw new Error('Lecture ' + table + ' impossible (' + (r.status || 'réseau') + ')');
                    return r.json || [];
                });
        },
        insert: function (table, lignes) {
            return requeteAvecSession('POST', supabase.url(table), {
                'Content-Type': 'application/json', Prefer: 'return=representation'
            }, JSON.stringify(lignes)).then(function (r) {
                if (!r.ok) throw new Error('Écriture ' + table + ' refusée' + (r.body ? ' : ' + String(r.body).slice(0, 160) : ''));
                return r.json || [];
            });
        },
        upsert: function (table, lignes, onConflict) {
            var q = onConflict ? 'on_conflict=' + onConflict : '';
            return requeteAvecSession('POST', supabase.url(table, q), {
                'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates'
            }, JSON.stringify(lignes)).then(function (r) {
                if (!r.ok) throw new Error('Mise à jour ' + table + ' refusée' + (r.body ? ' : ' + String(r.body).slice(0, 160) : ''));
                return r.json || [];
            });
        },
        update: function (table, champs, filtre) {
            return requeteAvecSession('PATCH', supabase.url(table, filtre || ''), {
                'Content-Type': 'application/json', Prefer: 'return=representation'
            }, JSON.stringify(champs)).then(function (r) {
                if (!r.ok) throw new Error('Modification ' + table + ' refusée' + (r.body ? ' : ' + String(r.body).slice(0, 160) : ''));
                return r.json || [];
            });
        },
        supprimer: function (table, filtre) {
            return requeteAvecSession('DELETE', supabase.url(table, filtre || ''),
                { Prefer: 'return=representation' }, null)
                .then(function (r) {
                    if (!r.ok) throw new Error('Suppression ' + table + ' refusée' + (r.body ? ' : ' + String(r.body).slice(0, 160) : ''));
                    return r.json || [];
                });
        },
        /* Fonction PostgreSQL (migrations 004) : les écritures couplées
           (titre + mouvement de compte, apport + mouvement) passent par là —
           une seule transaction, jamais de demi-écriture. */
        rpc: function (fonction, parametres) {
            return requeteAvecSession('POST', clefs().url + '/rest/v1/rpc/' + fonction,
                { 'Content-Type': 'application/json', Accept: 'application/json' },
                JSON.stringify(parametres || {})).then(function (r) {
                    if (!r.ok) throw new Error('Écriture refusée par ' + fonction
                        + (r.body ? ' : ' + String(r.body).slice(0, 160) : ''));
                    return r.json;
                });
        },
        /* LECTURE PAGINÉE (2.1.0, revue D-05) : Supabase limite chaque réponse
           à 1 000 lignes. selectTout enchaîne les pages (limit/offset sur un
           ordre stable propre à chaque table) jusqu'à épuisement. Une page qui
           échoue fait échouer toute la lecture : l'historique ne doit JAMAIS
           être tronqué en silence. À un snapshot par jour, la limite arrive en
           ~2,7 ans ; 40 ans ≈ 14 610 lignes. */
        selectTout: function (table, query) {
            var ordre = ORDRE_PAGINATION[table] || null;
            if (!ordre) {
                // Table sans ordre connu (Config v1, petites tables) : lecture
                // simple, comme avant.
                return supabase.select(table, query);
            }
            var toutes = [];
            function page(offset) {
                var q = (query ? query + '&' : '')
                    + 'order=' + ordre + '&limit=' + LIMITE_PAGE + '&offset=' + offset;
                return supabase.select(table, q).then(function (rows) {
                    toutes = toutes.concat(rows || []);
                    if ((rows || []).length === LIMITE_PAGE) return page(offset + LIMITE_PAGE);
                    return toutes;
                });
            }
            return page(0);
        },
        tester: function () {
            return requeteAvecSession('GET', supabase.url('pf2_transactions', 'select=id&limit=1'),
                { Accept: 'application/json' }, null)
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

    /* Une requête Data API qui répond 401 alors qu'une session existe est
       retentée UNE fois après rafraîchissement du jeton. Sans session, le
       401/403 remonte tel quel : c'est le signal « connectez-vous ». */
    function requeteAvecSession(method, url, extras, corps, dejaRetente) {
        return req(method, url, supabase.entetes(extras), corps).then(function (r) {
            if ((r.status === 401 || r.status === 403) && auth.aUneSession() && !dejaRetente) {
                return auth.rafraichir().then(function (s) {
                    if (!s) throw new Error('Session expirée : reconnectez-vous.');
                    // En-têtes RECALCULÉS : ils portent le nouveau jeton.
                    return req(method, url, supabase.entetes(extras), corps);
                });
            }
            return r;
        });
    }

    /* ÉCRITURES ATOMIQUES (2.1.0, revue D-03).
       Avant, une saisie faisait deux requêtes séparées (la transaction puis le
       mouvement de compte), avec une « compensation » qui pouvait elle-même
       échouer : des titres achetés sans argent débité. Désormais tout passe par
       les RPC de la migration 004 : les deux lignes sont écrites dans UNE
       transaction SQL, tout passe ou rien, et la clé d'idempotence rend les
       rejeux (réseau instable, bouton pressé deux fois) inoffensifs. */

    function ecrireTransaction(opts) {
        var ligne = opts.ligne || {};
        return supabase.rpc('pf2_enregistrer_transaction', {
            p_ticker: ligne.ticker, p_sens: ligne.sens, p_date: ligne.date,
            p_quantite: ligne.quantite, p_cours: ligne.cours, p_frais: ligne.frais || 0,
            p_devise: ligne.devise || null, p_source: ligne.source || 'appli',
            p_reference: ligne.reference || null, p_note: ligne.note || null,
            p_compte_id: opts.compteId || null,
            p_montant_operation: opts.compteId ? opts.montantOperation : null,
            p_type_operation: opts.compteId ? opts.typeOperation : null,
            p_idempotence: opts.idempotence || null
        });
    }

    function modifierTransaction(opts) {
        var ligne = opts.ligne || {};
        return supabase.rpc('pf2_modifier_transaction', {
            p_tx_id: opts.id,
            p_ticker: ligne.ticker, p_sens: ligne.sens, p_date: ligne.date,
            p_quantite: ligne.quantite, p_cours: ligne.cours, p_frais: ligne.frais || 0,
            p_devise: ligne.devise || null, p_source: ligne.source || 'appli',
            p_reference: ligne.reference || null, p_note: ligne.note || null,
            p_compte_id: opts.compteId || null,
            p_operation_id: opts.operationId || null,
            p_montant_operation: opts.compteId ? opts.montantOperation : null,
            p_type_operation: opts.compteId ? opts.typeOperation : null
        });
    }

    /* TWR exact (2.1.0, revue F-07) : chaque apport porte la valeur du
       patrimoine juste AVANT le flux (opts.valeurAvantEur/Usd), capturée par
       l'app au moment du geste. NULL = écriture antérieure à la 2.1.0 ou robot
       : son intervalle sera déclaré non calculé, jamais estimé. */
    function ecrireApport(opts) {
        var ligne = opts.ligne || {};
        return supabase.rpc('pf2_enregistrer_apport', {
            p_date: ligne.date, p_sens: ligne.sens, p_montant_eur: ligne.montant_eur,
            p_montant_or: ligne.montant_or || null, p_cours_or: ligne.cours_or || null,
            p_compte: ligne.compte || null, p_reference: ligne.reference || null,
            p_compte_id: opts.compteId || null,
            p_montant_operation: opts.compteId ? opts.montantOperation : null,
            p_type_operation: opts.compteId ? opts.typeOperation : null,
            p_idempotence: opts.idempotence || null,
            p_valeur_avant_eur: opts.valeurAvantEur != null ? opts.valeurAvantEur : null,
            p_valeur_avant_usd: opts.valeurAvantUsd != null ? opts.valeurAvantUsd : null
        });
    }

    function modifierApport(opts) {
        var ligne = opts.ligne || {};
        return supabase.rpc('pf2_modifier_apport', {
            p_apport_id: opts.id,
            p_date: ligne.date, p_sens: ligne.sens, p_montant_eur: ligne.montant_eur,
            p_montant_or: ligne.montant_or || null, p_cours_or: ligne.cours_or || null,
            p_compte: ligne.compte || null, p_reference: ligne.reference || null,
            p_compte_id: opts.compteId || null,
            p_operation_id: opts.operationId || null,
            p_montant_operation: opts.compteId ? opts.montantOperation : null,
            p_type_operation: opts.compteId ? opts.typeOperation : null,
            p_valeur_avant_eur: opts.valeurAvantEur != null ? opts.valeurAvantEur : null,
            p_valeur_avant_usd: opts.valeurAvantUsd != null ? opts.valeurAvantUsd : null
        });
    }

    PF.net = {
        req: req, _fin: _fin, serie: serie, cours: cours, coursActuels: coursActuels,
        variationRecente: variationRecente, variationSeance: variationSeance,
        deviseDe: deviseDe, coursOr: coursOr,
        taux: taux, tauxMouvement: tauxMouvement, viderCache: viderCache, supabase: supabase,
        auth: auth,
        ecrireTransaction: ecrireTransaction, modifierTransaction: modifierTransaction,
        ecrireApport: ecrireApport, modifierApport: modifierApport,
        setTransport: function (fn) { transport = fn; viderCache(); },
        TICKER_OR: TICKER_OR, ALIAS_YAHOO: ALIAS_YAHOO,
        cache: { cours: cache_cours, fx: cache_fx, variation: cache_variation, serie: cache_serie }
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
