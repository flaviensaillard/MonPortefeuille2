/* Onglet « IA » — Université de l'Épargne.
   Une fenêtre de discussion posée sur VOTRE corpus, pas sur l'opinion d'un
   modèle. Trois principes tiennent le code autant que les réponses :

   1. RIEN DE CE QUI EST AFFICHÉ N'EST INVENTÉ ICI. Le texte vient du service,
      qui ne répond qu'à partir des passages retrouvés dans le corpus. Si le
      corpus n'a rien, le service le dit, et l'application affiche ce refus
      tel quel — jamais « aucune réponse » ni un message rassurant.

   2. LES SOURCES SONT AFFICHÉES AVEC LA RÉPONSE. Une affirmation non sourcée
      n'a pas de valeur ; chaque réponse porte ses passages, et chacun
      s'ouvre dans le navigateur.

   3. AUCUNE CLÉ DANS L'APPLICATION. L'adresse et la clé du service sont
      saisies par vous, une fois, et rangées dans les réglages locaux du
      téléphone. Le service, lui, garde les vrais secrets (jeton GitHub,
      modèle). Une clé dans une APK se lit avec un décompresseur.

   Le contexte envoyé au service est le MÊME que celui de la page Streamlit :
   les deux clients posent donc la même question au même assistant. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};
    var U = PF.util, UI = PF.ui;

    var messages = [];          // la conversation en cours, en mémoire
    var enCours = false;        // une question est en route
    var erreur = null;
    var etatService = null;     // réponse de /sante : modèle, nombre de passages
    var contexteActif = true;   // joindre les agrégats du portefeuille
    var questionEnCours = '';

    var SUGGESTIONS = [
        'Que dit le corpus sur l’or ?',
        'Explique-moi le TWR.',
        'Dois-je rééquilibrer ?',
        'Que ferait Charles Gave avec mon portefeuille ?',
        'Ma moyenne mobile 7 ans a-t-elle cassé ?'
    ];

    // ------------------------------------------------------------ configuration

    function urlService() {
        return String((PF.store.reglages() || {}).iaUrl || '').trim().replace(/\/+$/, '');
    }

    function cleService() {
        return String((PF.store.reglages() || {}).iaCle || '').trim();
    }

    function configure() {
        return urlService().length > 10 && cleService().length > 0;
    }

    /* Ce que l'assistant reçoit de votre portefeuille : des agrégats, et rien
       d'autre. Aucun identifiant, aucune ligne nominative, aucun cours. */
    function contextePourIA(ctx) {
        if (!ctx) return null;
        var poches = [];
        var actifs = (ctx.actifs || []).slice().sort(function (a, b) {
            return (b.valeurUsd || 0) - (a.valeurUsd || 0);
        });
        var investi = ctx.totalInvestiUsd || 0;
        (PF.rebalance.diagnostiquer(ctx).ecarts || []).forEach(function (e) {
            poches.push({
                nom: e.pocheNom,
                poids: U.arrondi(e.poidsReel, 4),
                cible: U.arrondi(e.poidsCible, 4),
                bande: U.arrondi(e.bande, 4),
                horsBande: !!e.horsBande
            });
        });
        return {
            uniteDeCompte: 'USD',
            deviseDeDepense: 'EUR',
            tauxEurUsd: ctx.tauxEurUsd || 0,
            capitalInvesti: Math.round(investi),
            cashDisponible: Math.round(ctx.totalCourantUsd || 0),
            epargnePrecaution: Math.round(ctx.totalPrecautionUsd || 0),
            patrimoineTotal: Math.round(ctx.patrimoineTotalUsd || 0),
            apportsNets: Math.round(ctx.capitalInvestiUsd || 0),
            poches: poches,
            principalesLignes: actifs.slice(0, 5).map(function (a) {
                return { ticker: a.ticker, poids: U.arrondi(investi > 0 ? a.valeurUsd / investi : 0, 4) };
            })
        };
    }

    // ------------------------------------------------------------------- réseau

    function appeler(route, corps, enteteCle) {
        var url = urlService() + route;
        var entetes = { 'content-type': 'application/json' };
        var cle = cleService();
        if (cle) entetes[enteteCle || 'x-cle-service'] = cle;
        return PF.net.req('POST', url, entetes, JSON.stringify(corps)).then(function (r) {
            if (r && r.json) return r.json;
            if (r && r.status === -1) throw new Error('Téléphone hors ligne, ou service injoignable.');
            throw new Error('Le service a répondu ' + (r ? r.status : '?')
                + (r && r.body ? ' : ' + String(r.body).slice(0, 200) : ''));
        });
    }

    function poserQuestion(question) {
        if (enCours || !question) return;
        enCours = true;
        erreur = null;
        questionEnCours = question;
        messages.push({ role: 'user', contenu: question });
        PF.app.rendre();
        allerEnBas();

        var corps = {
            question: question,
            historique: messages.slice(-7, -1).map(function (m) {
                return { role: m.role === 'assistant' ? 'assistant' : 'user', contenu: m.contenu };
            }),
            contexte: contexteActif ? contextePourIA(PF.app.etat.ctx) : null
        };

        appeler('/discussion', corps).then(function (res) {
            enCours = false;
            messages.push({
                role: 'assistant',
                contenu: (res.reponse || '').trim(),
                sources: res.sources || [],
                passages: (res.sources || []).length,
                interpretation: !!res.interpretation,
                verification: res.verification || null,
                corpus: res.corpus || null,
                modele: res.modele
            });
            PF.app.rendre();
            allerEnBas();
        }).catch(function (e) {
            enCours = false;
            erreur = e.message || String(e);
            /* La question RESTE dans le fil : la voir disparaître au moment
               même où l'erreur s'affiche donne l'impression que l'application
               a avalé ce que vous aviez écrit. Elle reste donc, avec l'erreur
               en dessous, et la zone de saisie la rend prête à renvoyer. */
            var zoneErreur = document.getElementById('iaQuestion');
            if (zoneErreur && !String(zoneErreur.value || '').trim()) zoneErreur.value = questionEnCours;
            PF.app.rendre();
        });
    }

    /* La clé d’administration ne va jamais dans l’APK : elle se lit avec
       un décompresseur. Ce bouton relit donc l’état après la mise à jour GitHub. */
    function mettreAJour() {
        if (!configure()) return;
        etatService = null;
        UI.toast('Vérification de la date du corpus…');
        interrogerSante();
    }

    function interrogerSante() {
        if (!configure() || etatService) return;
        appeler('/sante', {}).then(function (res) {
            etatService = res;
            if (PF.app.etat.onglet === 'ia') PF.app.rendre();
        }).catch(function () {
            etatService = { ok: false, corpus: { majLe: null, passages: null } };
            if (PF.app.etat.onglet === 'ia') PF.app.rendre();
        });
    }

    function dateCorpus() {
        var iso = etatService && etatService.corpus && etatService.corpus.majLe;
        if (!iso) return 'Corpus jamais indexé';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return 'Corpus mis à jour le ' + iso;
        return 'Corpus mis à jour le ' + d.toLocaleDateString('fr-FR')
            + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }

    function allerEnBas() {
        var h = document.getElementById('iaFil');
        if (h) h.scrollTop = h.scrollHeight;
    }

    // ---------------------------------------------------------------------- vue

    function bulle(m) {
        var qui = m.role === 'user' ? 'moi' : 'ia';
        var out = '<div class="ia-bulle ' + qui + '"><div class="ia-corps">'
            + UI.h(m.contenu).replace(/\n/g, '<br>') + '</div>';
        if (m.role === 'assistant' && m.sources && m.sources.length) {
            out += '<div class="ia-sources">';
            m.sources.forEach(function (s) {
                out += '<a class="ia-source" href="#" data-url="' + UI.h(s.url || '') + '">'
                    + '↗ ' + UI.h((s.titre || 'source') + (s.date ? ' · ' + s.date : '')) + '</a>';
            });
            out += '</div>';
        }
        if (m.role === 'assistant' && m.interpretation) {
            out += '<div class="ia-note" style="color:var(--gold)">⚠ Interprétation du modèle — '
                + 'ce n’est ni une citation, ni une source fiable.</div>';
        }
        if (m.role === 'assistant' && m.verification && m.verification.note) {
            out += '<div class="ia-note" style="color:var(--down)">Filet anti-invention : '
                + UI.h(m.verification.note) + '</div>';
        } else if (m.role === 'assistant' && m.verification && m.verification.verifie) {
            out += '<div class="ia-note">✓ Les chiffres ont été retrouvés dans les sources ou vos agrégats.</div>';
        }
        return out + '</div>';
    }

    function vue(ctx) {
        interrogerSante();
        var out = '';

        out += '<div class="card tight" style="border-color:rgba(245,196,81,.30)">'
            + '<div style="display:flex;gap:10px;align-items:flex-start">'
            + '<div style="font-size:19px;line-height:1.1">◈</div>'
            + '<div style="flex:1;font-size:12px;color:var(--txt-3);line-height:1.55">'
            + 'Assistant <b style="color:var(--txt-2)">documenté</b> à partir du corpus public de '
            + 'l’Institut des Libertés, des vidéos publiques de l’Université de l’Épargne et de la '
            + 'bibliographie. <b style="color:var(--gold)">Ce n’est pas Charles Gave.</b> '
            + 'Il cite ses sources. Si le corpus se tait, il donne une interprétation clairement signalée. Un filet vérifie ses chiffres.'
            + '</div></div></div>';

        if (!configure()) {
            out += '<div class="card">'
                + '<div style="font-size:15px;font-weight:700;margin-bottom:6px">Le service n’est pas configuré</div>'
                + '<div style="font-size:13px;color:var(--txt-2);line-height:1.6;margin-bottom:12px">'
                + 'Deux valeurs à saisir une seule fois : l’adresse de votre service Cloudflare et la clé '
                + 'qu’il vous a donnée. Rien d’autre n’est nécessaire, et aucune clé de modèle ne se '
                + 'trouve dans l’application.</div>'
                + '<button class="btn" id="iaConfig">Configurer le service</button>'
                + '<div style="font-size:11.5px;color:var(--txt-3);margin-top:10px">'
                + 'Le guide pas à pas est dans le dossier <b>ia-universite-epargne</b>, fichier LISEZ-MOI.md.</div>'
                + '</div>';
            return out;
        }

        // --- Barre d'état
        out += '<div class="chips" style="margin-bottom:10px">'
            + '<button class="chip" id="iaContexte">' + (contexteActif ? '✓' : '✕') + ' Mes agrégats</button>'
            + '<button class="chip" id="iaMaj">⟳ Vérifier le corpus</button>'
            + (messages.length ? '<button class="chip" id="iaVider">Effacer</button>' : '')
            + (etatService && etatService.corpus && etatService.corpus.passages !== null
                ? '<span class="chip" style="opacity:.75">' + UI.h(String(etatService.corpus.passages)) + ' passages</span>' : '')
            + '</div>'
            + '<div class="ia-note" style="margin:-3px 0 11px">'
            + UI.h(etatService ? dateCorpus() : 'Lecture de la date du corpus…')
            + (etatService && etatService.branchements && etatService.branchements.supabase
                ? ' · Supabase connecté' : '') + '</div>';

        if (erreur) {
            out += '<div class="erreur">' + UI.h(erreur) + '</div>';
        }

        // --- Fil de discussion
        out += '<div id="iaFil" class="ia-fil">';
        if (!messages.length) {
            out += '<div class="ia-vide"><div style="font-size:26px">◈</div>'
                + '<div style="margin-top:8px">Posez votre première question.</div></div>';
        } else {
            messages.forEach(function (m) { out += bulle(m); });
            if (enCours) {
                out += '<div class="ia-bulle ia"><div class="ia-corps ia-attente">'
                    + 'Recherche dans le corpus<span>.</span><span>.</span><span>.</span></div></div>';
            }
        }
        out += '</div>';

        // --- Suggestions
        if (!messages.length) {
            out += '<div class="chips" style="margin:10px 0">' + SUGGESTIONS.map(function (s) {
                return '<button class="chip" data-ia-suggestion="' + UI.h(s) + '">' + UI.h(s) + '</button>';
            }).join('') + '</div>';
        }

        // --- Zone de saisie
        out += '<div class="ia-compose">'
            + '<textarea id="iaQuestion" rows="1" placeholder="Votre question…"></textarea>'
            + '<button class="ia-envoi" id="iaEnvoyer" aria-label="Envoyer">↑</button>'
            + '</div>';

        return out;
    }

    // -------------------------------------------------------------- événements

    function feuilleConfiguration() {
        var r = PF.store.reglages() || {};
        UI.feuille({
            titre: 'Service Université de l’Épargne',
            aide: 'Les valeurs que le déploiement vous a données. Elles restent sur ce téléphone.',
            corps: UI.champ({ id: 'rgIaUrl', label: 'Adresse du service', type: 'text', valeur: r.iaUrl || '' })
                + UI.champ({ id: 'rgIaCle', label: 'Clé de service', type: 'text', valeur: r.iaCle || '' })
                + '<div style="font-size:11.5px;color:var(--txt-3);margin-top:8px;line-height:1.6">'
                + 'Exemple d’adresse : https://universite-epargne.votre-compte.workers.dev<br>'
                + 'Cette clé ne donne accès qu’à la discussion. Les secrets du service — jeton GitHub, '
                + 'modèle — restent côté Cloudflare, jamais dans l’application.</div>',
            boutons: [
                { texte: 'Annuler', sorte: 'ghost' },
                {
                    texte: 'Enregistrer', sorte: '', garder: true, action: function () {
                        PF.store.sauverReglages({
                            iaUrl: String(UI.lire('rgIaUrl') || '').trim().replace(/\/+$/, ''),
                            iaCle: String(UI.lire('rgIaCle') || '').trim()
                        });
                        etatService = null;
                        UI.toast('Enregistré');
                        document.querySelector('#voile').click();
                        PF.app.rendre();
                    }
                }
            ]
        });
    }

    function attacher() {
        var conteneur = document.getElementById('view');
        if (!conteneur || conteneur.dataset.ia === '1') return;
        conteneur.dataset.ia = '1';

        conteneur.addEventListener('click', function (e) {
            var cible = e.target;
            if (!cible || !cible.closest) return;

            var source = cible.closest('.ia-source');
            if (source) {
                e.preventDefault();
                var url = source.getAttribute('data-url');
                if (url && typeof root.Native !== 'undefined' && root.Native.openExternal) {
                    root.Native.openExternal(url);
                }
                return;
            }
            if (cible.closest('#iaConfig')) { feuilleConfiguration(); return; }
            if (cible.closest('#iaMaj')) { mettreAJour(); return; }
            if (cible.closest('#iaVider')) { messages = []; erreur = null; PF.app.rendre(); return; }
            if (cible.closest('#iaContexte')) { contexteActif = !contexteActif; PF.app.rendre(); return; }
            if (cible.closest('#iaEnvoyer')) { envoyer(); return; }
            var sug = cible.closest('[data-ia-suggestion]');
            if (sug) { poserQuestion(sug.getAttribute('data-ia-suggestion')); return; }
        });

        conteneur.addEventListener('keydown', function (e) {
            if (e.target && e.target.id === 'iaQuestion' && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                envoyer();
            }
        });
    }

    function envoyer() {
        var zone = document.getElementById('iaQuestion');
        if (!zone) return;
        var texte = String(zone.value || '').trim();
        if (!texte) return;
        zone.value = '';
        poserQuestion(texte);
    }

    PF.ia = {
        vue: vue,
        attacher: attacher,
        contextePourIA: contextePourIA,
        messages: function () { return messages.slice(); },
        effacer: function () { messages = []; erreur = null; },
        configurer: function (url, cle) {
            PF.store.sauverReglages({ iaUrl: url, iaCle: cle });
            etatService = null;
        }
    };

    /* L'onglet se déclare lui-même : l'écran existe dès que le module est
       chargé, sans toucher au cœur de l'application. */
    PF.vues = PF.vues || {};
    PF.vues.ia = vue;
})(typeof globalThis !== 'undefined' ? globalThis : this);
