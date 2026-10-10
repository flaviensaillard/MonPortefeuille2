/* Connexion par empreinte digitale (2.1.1).
   Après une première connexion email/mot de passe, l'appareil peut rouvrir la
   session par empreinte : les jetons de session Supabase sont chiffrés par le
   Keystore Android (côté natif, `Native`), et la biométrie (BiometricPrompt)
   est la porte d'ouverture.

   Règles absolues :
   - le mot de passe n'est JAMAIS stocké, ni ici, ni côté natif : seul le pont
     reçoit les jetons de session, jamais un secret de compte ;
   - sans empreinte disponible ou configurée, le repli est l'écran de
     connexion email/mot de passe (`feuilleConnexionCompte`) ;
   - quand l'empreinte est activée, la session en clair n'existe que pendant
     que la page est déverrouillée : au démarrage elle est scellée puis
     rouverte par la biométrie.

   Cette logique est entièrement testable hors appareil (tests/
   test_empreinte_logique.js, faux pont natif) ; la biométrie elle-même —
   BiometricPrompt, Keystore — ne se teste que sur appareil. */
(function (root) {
    'use strict';
    var PF = root.PF = root.PF || {};

    var compteurCb = 0;
    var attente = {};

    /* 2.2.0 (constat B1) : chaque échec nomme sa cause. Plus aucun libellé
       fourre-tout « activation annulée ». Les codes viennent de NativeBridge.java
       (codeErreurBiometrie, codeCanAuthenticate, et les codes propres à l'app). */
    var LIBELLES = {
        ok: 'Empreinte disponible.',
        sdk_trop_ancien: 'La connexion par empreinte exige Android 9 ou plus récent.',
        permission_manquante: 'L’application n’a pas la permission biométrique. Installez la version 2.2.0 ou plus récente.',
        materiel_absent: 'Aucun capteur d’empreinte n’est détecté sur cet appareil.',
        materiel_indisponible: 'Le capteur d’empreinte est momentanément indisponible. Réessayez.',
        aucune_empreinte_enrolee: 'Aucune empreinte n’est enregistrée. Ajoutez-en une dans les réglages du téléphone.',
        maj_securite_requise: 'Une mise à jour de sécurité Android est requise pour utiliser l’empreinte.',
        non_supporte: 'Le capteur n’est pas reconnu comme assez fort pour protéger la session. Le mot de passe reste disponible.',
        diagnostic_impossible: 'Impossible de vérifier le capteur d’empreinte sur cet appareil.',
        sans_session: 'Connectez-vous d’abord avec votre e-mail et votre mot de passe.',
        cle_absente: 'La clé de chiffrement a disparu. Reconnectez-vous avec votre mot de passe.',
        cle_invalidee: 'Une empreinte a été ajoutée ou retirée sur l’appareil : la connexion par empreinte doit être réactivée avec votre mot de passe.',
        cle_indisponible: 'La clé de chiffrement du téléphone est inaccessible.',
        jetons_illisibles: 'Les jetons gardés sont illisibles. Reconnectez-vous avec votre mot de passe.',
        erreur_prompt: 'L’invite biométrique n’a pas pu s’ouvrir (erreur système).',
        annule_utilisateur: 'Vérification annulée.',
        annule_systeme: 'La vérification a été interrompue par le système.',
        repli_mot_de_passe: 'Vous avez choisi le mot de passe.',
        delai_depasse: 'Délai dépassé : réessayez.',
        capteur_illisible: 'Le capteur n’a pas pu lire l’empreinte : nettoyez-le et réessayez.',
        espace_insuffisant: 'Espace insuffisant pour enregistrer l’empreinte.',
        verrouillage_temporaire: 'Trop de tentatives : le capteur est verrouillé quelques instants. Réessayez plus tard ou utilisez le mot de passe.',
        verrouillage_permanent: 'Trop de tentatives : le capteur est verrouillé. Utilisez le code de l’écran ou le mot de passe.',
        erreur_fabricant: 'Le capteur a signalé une erreur.',
        pas_de_code_ecran: 'Aucun code d’écran n’est configuré sur le téléphone.',
        erreur_inconnue: 'Erreur biométrique inconnue.',
        indispo: 'Empreinte indisponible sur cet appareil.',
        echec: 'La vérification a échoué.',
        erreur: 'Erreur interne de l’empreinte.'
    };

    /* Texte à afficher pour un résultat `{ok:false, code}`. Un code inconnu
       garde son code système : jamais un libellé générique qui masque la cause. */
    function libelle(res) {
        if (!res || res.ok) return '';
        var texte = LIBELLES[res.code];
        if (texte) return texte;
        return 'Erreur biométrique (' + (res.code || 'inconnue') + (res.systeme !== undefined ? ', code système ' + res.systeme : '') + ').';
    }

    /* Vrai si l'échec est une annulation volontaire (pas une panne). */
    function annulationVolontaire(res) {
        return !!res && (res.code === 'annule_utilisateur' || res.code === 'repli_mot_de_passe');
    }

    function natif() {
        return (typeof root.Native !== 'undefined' && root.Native && root.Native.empreinteEtat)
            ? root.Native : null;
    }

    function actif() {
        return !!(PF.store && PF.store.reglages().empreinteActivee);
    }

    function etat() {
        var defaut = { activee: actif(), disponible: false, sessionGardee: false, raison: 'diagnostic_impossible' };
        var n = natif();
        if (!n) return defaut;
        try {
            var brut = n.empreinteEtat();
            var e = (typeof brut === 'string') ? JSON.parse(brut) : brut;
            return {
                activee: actif(),
                disponible: !!(e && e.dispo),
                sessionGardee: !!(e && e.sessionGardee),
                raison: (e && e.raison) || 'diagnostic_impossible'
            };
        } catch (e) {
            return defaut;
        }
    }

    /* Décision de démarrage : l'empreinte n'est proposée que si le réglage est
       pris, que l'appareil sait vérifier un doigt, et que des jetons chiffrés
       sont gardés. Sinon : repli connexion (email/mot de passe). */
    function choixDemarrage() {
        var e = etat();
        return (e.activee && e.disponible && e.sessionGardee) ? 'empreinte' : 'connexion';
    }

    /* Scellement : les jetons sont confiés au pont qui les chiffre avec la clé
       du Keystore. Le pont ne voit que la session — jamais un mot de passe. */
    function sceller(session) {
        var n = natif();
        if (!actif() || !n || !session) return false;
        try {
            return n.empreinteMajSession(JSON.stringify(session)) !== false;
        } catch (e) {
            return false;
        }
    }

    /* Au démarrage, si l'empreinte est active : la session en clair (éventuelle
       dernière session, jetons rafraîchis compris) est rescellée puis retirée.
       Elle ne revient que par la biométrie — ou par une nouvelle connexion. */
    function verrouillerAuDemarrage() {
        if (!actif() || !natif()) return false;
        var s = (PF.store && PF.store.lireSession && PF.store.lireSession()) || null;
        if (!s) return false;
        var scelle = sceller(s);
        if (scelle && PF.store && PF.store.effacerSession) PF.store.effacerSession();
        return scelle;
    }

    function demander(invoquer) {
        var n = natif();
        if (!n) return Promise.resolve({ ok: false, code: 'indispo' });
        return new Promise(function (resoudre) {
            compteurCb += 1;
            var id = 'bio' + compteurCb;
            attente[id] = resoudre;
            try {
                invoquer(n, id);
            } catch (e) {
                delete attente[id];
                resoudre({ ok: false, code: 'erreur', message: String(e && e.message || e) });
            }
        });
    }

    /* Activation (écran de réglage) : exige une session déjà ouverte par
       email/mot de passe ; la confirmation biométrique du téléphone est la
       dernière étape — refusée, rien n'est activé. */
    function activer() {
        var s = (PF.store && PF.store.lireSession && PF.store.lireSession()) || null;
        if (!s) return Promise.resolve({ ok: false, code: 'sans_session' });
        return demander(function (n, id) { n.empreinteActiver(JSON.stringify(s), id); })
            .then(function (res) {
                if (res && res.ok) {
                    PF.store.sauverReglages({ empreinteActivee: true });
                    return { ok: true };
                }
                return res || { ok: false, code: 'echec' };
            });
    }

    /* Ouverture au lancement : le pont déchiffre les jetons après la biométrie.
       Échec ou annulation : RIEN n'est restauré, le repli mot de passe reste. */
    function ouvrir() {
        return demander(function (n, id) { n.empreinteOuvrir(id); }).then(function (res) {
            if (res && res.ok && res.session) {
                if (PF.store && PF.store.sauverSession) PF.store.sauverSession(res.session);
                return { ok: true };
            }
            return res || { ok: false, code: 'echec' };
        });
    }

    function desactiver() {
        PF.store.sauverReglages({ empreinteActivee: false });
        var n = natif();
        if (n) { try { n.empreinteEffacer(); } catch (e) { /* rien */ } }
    }

    /* Nettoyage sans désactivation : déconnexion ou jeton mort — les jetons
       gardés n'ont plus rien à ouvrir, le réglage reste pour la prochaine
       connexion email/mot de passe. */
    function nettoyer() {
        var n = natif();
        if (n) { try { n.empreinteEffacer(); } catch (e) { /* rien */ } }
    }

    /* Rappel appelé par Java : Native.empreinte* -> PF.biometrie._fin(id, r). */
    function _fin(id, charge) {
        var resoudre = attente[id];
        delete attente[id];
        if (resoudre) resoudre(charge || { ok: false, code: 'echec' });
    }

    PF.biometrie = {
        libelle: libelle,
        libelles: LIBELLES,
        annulationVolontaire: annulationVolontaire,
        actif: actif,
        etat: etat,
        choixDemarrage: choixDemarrage,
        sceller: sceller,
        verrouillerAuDemarrage: verrouillerAuDemarrage,
        activer: activer,
        ouvrir: ouvrir,
        desactiver: desactiver,
        nettoyer: nettoyer,
        _fin: _fin
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
