/* État d'une mise à jour de données fiscales — ce qui est lu, ce qui manque,
   ce qui n'a pas pu être récupéré.

   Pourquoi ce module existe
   -------------------------
   L'écran Fiscalité affichait les messages d'une mise à jour en clair, mêlés au
   reste, sans dire d'un coup d'œil si la collecte avait abouti. Ce module classe
   chaque famille de documents dans l'un de trois états, pour que l'onglet replié
   porte une couleur QUI VIENT DE L'ÉTAT RÉEL et non d'une décoration :

       ok       → tout ce que la DGFiP publie pour ce millésime a été lu ;
       manquant → une information manque (non publiée, non attribuable au
                  millésime, portée partielle, contradiction non levée) ;
       echec    → la récupération n'a pas abouti (document inaccessible, PDF
                  illisible, format non reconnu, écriture Supabase refusée).

   Règle de lecture importante : la présence de `valeurs` ne suffit PAS à dire
   « ok ». Plusieurs lecteurs renvoient des valeurs ET un motif de portée
   partielle (« notice 2086 … méthode et foyer partiellement vérifiés, PS non
   déterminés par ce lecteur »). Classer ces cas en « ok » afficherait un vert
   mensonger : les taux correspondants ne sont justement pas établis. Le motif a
   donc priorité sur la présence de valeurs.

   Les tables de motifs ne sont pas inventées : elles couvrent les motifs
   réellement produits par les lecteurs (`fiscal_dgfip_sources.js`,
   `fiscal_frais_sources.js`, `fiscal_regimes_sources.js`, `fiscal_rcm_sources.js`,
   `fiscal_crypto_sources.js`, `fiscal_brochure_sources.js`,
   `fiscal_crypto_pdf_sources.js`, `fiscal_rcm_pdf_sources.js`,
   `fiscal_crypto_ps_recoupement.js`, `fiscal_historique_supabase.js`).
   `tests/test_fiscal_etat_collecte.js` rejoue chacun de ces motifs réels et
   vérifie qu'aucun ne reste non classé.

   Un motif inconnu retombe sur `manquant`, jamais sur `ok` : dans le doute on
   signale, on ne rassure pas.

   Aucune donnée personnelle n'entre ici : les motifs sont recopiés tels que les
   lecteurs les produisent, avec les adresses retirées et une longueur bornée. */
(function (root) {
    'use strict';
    var PF = root.PF || (root.PF = {});

    var OK = 'ok', MANQUANT = 'manquant', ECHEC = 'echec';

    /* ÉCHEC : la récupération n'a pas abouti. Ordre important — ces motifs sont
       testés AVANT les motifs de succès et de manque. */
    var MOTIFS_ECHEC = [
        /inaccessible/i,                      // document / source / BOFiP / PDF
        /impossible à relire/i,               // preuve PDF impossible à relire
        /insuffisant(?:e)? pour relecture/i,  // relecture de l'extrait impossible
        /^PDF(?: DGFiP)? non disponible \(/i, // téléchargement du PDF en échec
        /recoupement interrompu/i,
        /recoupement PS crypto impossible/i,
        /historique illisible/i,
        /non historisée/i,                    // écriture Supabase refusée
        /actualisation interrompue/i,
        /format inattendu/i,
        // Le module de recoupement est chargé par index.html et exigé par
        // build.sh : s'il manque, l'application est incomplète et le recoupement
        // n'a pas pu être TENTÉ. Ce n'est pas une lacune documentaire DGFiP.
        /module de recoupement absent/i
    ];

    /* SUCCÈS : la valeur du millésime a été lue et attribuée. */
    var MOTIFS_OK = [
        /^historisée$/i,
        /^inchangée$/i,
        /valeur du millésime trouvée/i,
        /valeur explicite trouvée/i,
        /valeur explicite collectée/i,
        /taux IR\/PS des titres et année explicites/i,
        /établis par recoupement/i
    ];

    /* MANQUE : l'information n'est pas établie. Ni panne, ni succès. */
    var MOTIFS_MANQUANT = [
        /partiel/i, /non déterminé/i, /non attesté/i, /non activé/i,
        /non vérifié/i, /non certifié/i, /non reconnu/i, /non reconnue/i,
        /non identifié/i, /non mentionné/i, /non documenté/i, /non publié/i,
        /non prise en charge/i, /non pris en charge/i, /non attribuable/i,
        /non disponible/i, /non établi/i, /non modélisé/i, /non confirmé/i,
        /non levée/i, /non lu/i, /repéré/i, /incomplète/i, /absent/i, /absente/i,
        /refusé/i, /refusée/i, /contradict/i, /incohérent/i, /incompatible/i,
        /inattendu/i, /différent/i, /invalide/i, /aucune valeur/i,
        /aucune source/i, /rien à historiser/i, /module de recoupement absent/i,
        /hors bornes/i, /aucun taux/i, /portée/i
    ];

    /* Familles suivies, dans l'ordre du rapport de collecte. `cle` est le chemin
       dans `rapportsControle[annee]` ; `sous` liste les clés d'un map `etats`. */
    var FAMILLES = [
        { cle: 'boi', sous: ['ir', 'decote', 'qf'],
          libelle: 'BOFiP (barème, décote, plafond QF)' },
        { cle: 'frais', sous: ['abatt', 'repas', 'km'],
          libelle: 'Frais salariés (abattement, repas, kilométrique)' },
        { cle: 'titres', libelle: 'PS et IR des gains de titres' },
        { cle: 'rcm', libelle: 'RCM (page DGFiP)' },
        { cle: 'crypto', libelle: 'FAQ crypto privée' },
        { cle: 'brochure', libelle: 'Brochure nouveautés (CSG)' },
        { cle: 'cryptoPdf.notice', libelle: 'Notice 2086' },
        { cle: 'cryptoPdf.brochure', libelle: 'Brochure plus-values crypto' },
        { cle: 'rcmPdf.rcm', libelle: 'Brochure RCM' },
        { cle: 'rcmPdf.charges', libelle: 'Brochure charges et CSG' },
        { cle: 'recoupement', libelle: 'Recoupement PS crypto privés' },
        { cle: 'historique', libelle: 'Historisation Supabase' }
    ];

    function motifCourt(motif) {
        var m = String(motif == null ? '' : motif)
            .replace(/https?:\/\/[^\s'"]+/gi, '<adresse>')
            .replace(/\s+/g, ' ').trim();
        if (!m) return 'motif absent';
        return m.length > 140 ? m.slice(0, 137) + '…' : m;
    }

    function testListe(liste, texte) {
        for (var i = 0; i < liste.length; i++) if (liste[i].test(texte)) return true;
        return false;
    }

    /* Classe un motif.

       Ordre délibéré, et il porte tout le sens de la pastille :

       1. un ÉCHEC technique l'emporte toujours, même si des valeurs traînent
          encore dans le cache : une panne ne doit jamais être masquée ;
       2. des valeurs obtenues = le document a été LU. Le motif qui les accompagne
          décrit la PORTÉE de la lecture (« produit du foyer non déterminé »,
          « avis et montants du foyer non lus »), pas un document manquant. Cette
          portée est déjà écrite dans le résumé copiable et dans la matrice de
          couverture, repliés dans le même onglet : la pastille, elle, répond à la
          question posée — la mise à jour a-t-elle obtenu ce qu'elle cherchait ?
          Traiter une portée partielle comme un manque condamnerait la pastille à
          rester orange en permanence, y compris quand tout ce que la DGFiP publie
          pour le millésime a été lu ;
       3. sans valeurs, le motif dit pourquoi : absence de publication, document
          non attribuable au millésime, preuve insuffisante → manquant.

       Un motif inconnu sans valeurs retombe sur `manquant`, jamais sur `ok` :
       dans le doute on signale, on ne rassure pas. */
    function classerMotif(motif, aValeurs) {
        if (motif && testListe(MOTIFS_ECHEC, motif)) return ECHEC;
        if (aValeurs) return OK;
        if (motif && testListe(MOTIFS_OK, motif)) return OK;
        if (motif && testListe(MOTIFS_MANQUANT, motif)) return MANQUANT;
        return MANQUANT;
    }

    function chemin(rapport, cle) {
        var v = rapport, parts = cle.split('.'), i;
        for (i = 0; i < parts.length; i++) {
            if (!v || typeof v !== 'object') return undefined;
            v = v[parts[i]];
        }
        return v;
    }

    /* Une famille = une ligne d'état. Les familles à map `etats` (BOFiP, frais)
       produisent une ligne par sous-clé, pour nommer exactement ce qui manque. */
    function etatsFamille(rapport, famille) {
        var res = chemin(rapport, famille.cle), lignes = [], i, k;
        if (res === undefined || res === null) return lignes; // non tentée : on n'invente rien
        if (typeof res !== 'object') return lignes;

        if (typeof res.erreur === 'string' && res.erreur) {
            lignes.push({ famille: famille.libelle, detail: null, etat: ECHEC,
                motif: motifCourt(res.erreur) });
            return lignes;
        }
        if (famille.sous && res.etats && typeof res.etats === 'object') {
            for (i = 0; i < famille.sous.length; i++) {
                k = famille.sous[i];
                if (typeof res.etats[k] !== 'string') continue;
                lignes.push({
                    famille: famille.libelle, detail: k,
                    etat: classerMotif(res.etats[k], !!(res.valeurs && res.valeurs[k])),
                    motif: motifCourt(res.etats[k])
                });
            }
            if (lignes.length) return lignes;
        }
        var etatBrut = typeof res.etat === 'string' ? res.etat : null;
        // Le classement porte sur l'ÉTAT seul : plusieurs familles portent aussi un
        // `motif` complémentaire (raison d'un refus d'écriture, constat de
        // l'inventaire). L'ajouter au classement ferait basculer un état exact —
        // « historisée » cessant de matcher une ancre ^…$ — alors on l'ajoute
        // seulement à ce qui est AFFICHÉ, pour que la raison précise soit lisible.
        var affiche = etatBrut;
        if (etatBrut && typeof res.motif === 'string' && res.motif && res.motif !== etatBrut)
            affiche = etatBrut + ' — ' + res.motif;
        lignes.push({
            famille: famille.libelle, detail: null,
            etat: classerMotif(etatBrut, !!res.valeurs),
            motif: motifCourt(affiche)
        });
        return lignes;
    }

    /* Synthèse pour UN millésime. `interruption` est le message d'un échec global
       du bouton (session changée, modules absents) : il force l'état échec. */
    function synthese(annee, rapport, interruption) {
        var lignes = [], manquants = [], echecs = [], lus = 0, i;
        if (rapport && typeof rapport === 'object') {
            for (i = 0; i < FAMILLES.length; i++)
                lignes = lignes.concat(etatsFamille(rapport, FAMILLES[i]));
        }
        // Chaque ligne porte son millésime : `syntheseTout` agrège plusieurs
        // années dans UNE seule alerte, et « Notice 2086 manquante » ne veut rien
        // dire si l'on ne sait pas de quels revenus il s'agit. Un millésime est
        // une année de REVENUS, jamais une année de déclaration.
        lignes.forEach(function (l) { l.annee = Number(annee); });
        if (interruption) lignes.push({ annee: null, famille: 'Mise à jour', detail: null,
            etat: ECHEC, motif: motifCourt(interruption) });

        for (i = 0; i < lignes.length; i++) {
            if (lignes[i].etat === ECHEC) echecs.push(lignes[i]);
            else if (lignes[i].etat === MANQUANT) manquants.push(lignes[i]);
            else lus++;
        }
        return {
            annee: Number(annee),
            // Aucune ligne ⇒ aucune famille tentée ⇒ on ne sait rien. Renvoyer
            // MANQUANT ici peindrait l'onglet en orange SANS qu'aucune alerte ne
            // l'explique (texteManquants n'aurait rien à lister) : c'est exactement
            // le bruit que l'onglet doit éviter. L'état reste donc inconnu.
            couleur: echecs.length ? ECHEC : (manquants.length ? MANQUANT : (lignes.length ? OK : null)),
            lignes: lignes, manquants: manquants, echecs: echecs,
            lus: lus, total: lignes.length
        };
    }

    /* Synthèse pour PLUSIEURS millésimes : un clic sur « Vérifier les revenus
       2023 à 2025 » produit un rapport par année, et l'onglet doit porter UNE
       couleur pour toute la mise à jour — la pire des trois, jamais la moyenne.
       `interruption` est l'échec global du bouton (session changée, modules
       absents) : il compte pour une seule ligne, pas une par millésime, parce
       qu'une seule panne l'a produit. */
    function syntheseTout(rapports, interruption, anneesInterruption) {
        var cles = [], an, manquants = [], echecs = [], lus = 0, total = 0;
        for (an in rapports || {}) if (Object.prototype.hasOwnProperty.call(rapports, an))
            cles.push(Number(an));
        cles.sort(function (a, b) { return a - b; });
        cles.forEach(function (a) {
            var s = synthese(a, rapports[a], null);
            manquants = manquants.concat(s.manquants);
            echecs = echecs.concat(s.echecs);
            lus += s.lus; total += s.total;
        });
        if (interruption) echecs.push({
            annee: null, detail: null, etat: ECHEC, motif: motifCourt(interruption),
            famille: 'Mise à jour' + (anneesInterruption && anneesInterruption.length
                ? ' (revenus ' + anneesInterruption.slice().sort().join(', ') + ')' : '')
        });
        return {
            annee: null, annees: cles,
            couleur: echecs.length ? ECHEC : (manquants.length ? MANQUANT : (total ? OK : null)),
            manquants: manquants, echecs: echecs, lus: lus, total: total
        };
    }

    function ligneAlerte(l) {
        return '• ' + (l.annee ? 'revenus ' + l.annee + ' — ' : '')
            + l.famille + (l.detail ? ' (' + l.detail + ')' : '') + ' : ' + l.motif;
    }

    /* Le texte de l'alerte : UNIQUEMENT ce qui manque ou a échoué. Rien si tout
       est lu — un vert n'a pas besoin d'alerte. */
    function texteManquants(s) {
        if (!s || s.couleur === OK) return '';
        var parties = [];
        if (s.echecs.length) parties.push('Récupération impossible (' + s.echecs.length + ') :\n'
            + s.echecs.map(ligneAlerte).join('\n'));
        if (s.manquants.length) parties.push('Informations manquantes (' + s.manquants.length + ') :\n'
            + s.manquants.map(ligneAlerte).join('\n'));
        return parties.join('\n\n');
    }

    function libelle(s) {
        if (!s) return '';
        if (s.couleur === ECHEC) return 'récupération impossible (' + s.echecs.length + ')';
        if (s.couleur === MANQUANT) return s.manquants.length + ' info(s) manquante(s)';
        if (s.couleur === OK) return 'tout est lu (' + s.lus + '/' + s.total + ')';
        return 'aucune mise à jour lancée';
    }

    PF.fiscalEtatCollecte = {
        OK: OK, MANQUANT: MANQUANT, ECHEC: ECHEC,
        FAMILLES: FAMILLES,
        MOTIFS_ECHEC: MOTIFS_ECHEC, MOTIFS_OK: MOTIFS_OK, MOTIFS_MANQUANT: MOTIFS_MANQUANT,
        classerMotif: classerMotif, motifCourt: motifCourt,
        etatsFamille: etatsFamille, synthese: synthese, syntheseTout: syntheseTout,
        texteManquants: texteManquants, libelle: libelle
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
