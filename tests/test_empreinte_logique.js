/* Connexion par empreinte digitale (2.1.1, nouveauté) — logique applicative.
   Comme les autres suites JS : modules réels dans Node, faux pont natif.

   Ce qui est verrouillé ici (tout était absent avant 2.1.1) :
   - la décision de démarrage : empreinte seulement si le réglage est activé
     ET que l'appareil sait la vérifier ET que des jetons chiffrés sont gardés ;
     sinon repli connexion email/mot de passe ;
   - le verrouillage au démarrage : avec l'empreinte activée, la session en
     clair est scellée (confiée au pont natif, chiffrée par le Keystore) puis
     retirée du stockage en clair ;
   - l'ouverture : le pont natif rend les jetons après la biométrie, la session
     est restaurée ; une annulation ou un échec ne restaure RIEN et laisse le
     repli mot de passe ;
   - l'activation exige une session existante (après une connexion email/mot de
     passe) et ne prend effet qu'après la confirmation native ;
   - la désactivation efface les jetons gardés ;
   - un rafraîchissement de jetons rescelle les jetons quand l'empreinte est
     active, jamais sinon ;
   - le mot de passe n'est JAMAIS stocké : ni dans les réglages, ni dans la
     session, ni dans ce que le pont reçoit. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE_WWW = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www');
const FICHIERS = ['util.js', 'models.js', 'net.js', 'store.js', 'biometrie.js'];

const stockage = {};
const localStorageFaux = {
    getItem: (k) => (k in stockage ? stockage[k] : null),
    setItem: (k, v) => { stockage[k] = String(v); },
    removeItem: (k) => { delete stockage[k]; }
};

// Faux pont natif : mémorise chaque appel et rend des réponses pilotables.
const natif = {
    etat: { dispo: true, sessionGardee: false },
    appels: [],
    reponseActiver: { ok: true },
    reponseOuvrir: { ok: true, session: null },
    empreinteEtat() {
        this.appels.push(['etat']);
        return JSON.stringify({ dispo: this.etat.dispo, sessionGardee: this.etat.sessionGardee });
    },
    empreinteSessionGardee() { return this.etat.sessionGardee; },
    empreinteMajSession(json) {
        this.appels.push(['maj', json]);
        this.etat.sessionGardee = true;
        return true;
    },
    empreinteEffacer() {
        this.appels.push(['effacer']);
        this.etat.sessionGardee = false;
        return true;
    },
    empreinteActiver(json, id) {
        this.appels.push(['activer', json]);
        setTimeout(() => PF.biometrie._fin(id, this.reponseActiver), 0);
    },
    empreinteOuvrir(id) {
        this.appels.push(['ouvrir']);
        setTimeout(() => PF.biometrie._fin(id, this.reponseOuvrir), 0);
    }
};

const contexte = vm.createContext({
    localStorage: localStorageFaux,
    Native: natif,
    atob: (b) => Buffer.from(b, 'base64').toString('binary'),
    console, Promise, Date, JSON, Math, setTimeout
});
for (const f of FICHIERS) {
    vm.runInContext(fs.readFileSync(path.join(RACINE_WWW, 'js', f), 'utf8'), contexte, { filename: f });
}
const PF = contexte.PF;

let reussis = 0, echecs = 0;
function verifier(nom, cond, detail) {
    if (cond) { reussis++; console.log('  ✓ ' + nom); }
    else { echecs++; console.log('  ✗ ' + nom + (detail ? ' — ' + detail : '')); }
}

const SESSION = {
    access_token: 'jeton-acces', refresh_token: 'jeton-rafraichissement',
    expires_at: Date.now() + 3600000, user_id: 'u1', email: 'a@exemple.fr'
};

function reinitialiser() {
    for (const k of Object.keys(stockage)) delete stockage[k];
    natif.appels.length = 0;
    natif.etat = { dispo: true, sessionGardee: false };
    natif.reponseActiver = { ok: true };
    natif.reponseOuvrir = { ok: true, session: null };
    PF.store.sauverReglages({ empreinteActivee: false });
    PF.store.effacerSession();
}

(async function principal() {
    console.log('Connexion par empreinte (2.1.1) — décision de démarrage');
    reinitialiser();

    verifier('1. sans réglage : repli connexion', PF.biometrie.choixDemarrage() === 'connexion');

    PF.store.sauverReglages({ empreinteActivee: true });
    natif.etat = { dispo: true, sessionGardee: true };
    verifier('2. activée + appareil prêt + jetons gardés : empreinte',
        PF.biometrie.choixDemarrage() === 'empreinte');

    natif.etat = { dispo: false, sessionGardee: true };
    verifier('3. empreinte non configurée sur l’appareil : repli connexion',
        PF.biometrie.choixDemarrage() === 'connexion');

    natif.etat = { dispo: true, sessionGardee: false };
    verifier('4. aucun jeton gardé : repli connexion',
        PF.biometrie.choixDemarrage() === 'connexion');

    console.log('Verrouillage au démarrage');
    reinitialiser();
    PF.store.sauverReglages({ empreinteActivee: true });
    PF.store.sauverSession(Object.assign({}, SESSION));
    PF.biometrie.verrouillerAuDemarrage();
    const scelles = natif.appels.filter((a) => a[0] === 'maj');
    verifier('5a. les jetons sont confiés au pont pour scellement', scelles.length === 1,
        'appels : ' + JSON.stringify(natif.appels));
    verifier('5b. le scellement porte bien les jetons de session',
        scelles.length === 1 && JSON.parse(scelles[0][1]).access_token === 'jeton-acces');
    verifier('5c. la session en clair est retirée du stockage', !PF.net.auth.aUneSession());

    reinitialiser();
    PF.store.sauverSession(Object.assign({}, SESSION));
    PF.biometrie.verrouillerAuDemarrage();
    verifier('6a. empreinte inactive : la session reste en clair', PF.net.auth.aUneSession());
    verifier('6b. empreinte inactive : rien n’est confié au pont',
        !natif.appels.some((a) => a[0] === 'maj' || a[0] === 'activer' || a[0] === 'ouvrir'));

    console.log('Ouverture avec l’empreinte');
    reinitialiser();
    PF.store.sauverReglages({ empreinteActivee: true });
    natif.etat = { dispo: true, sessionGardee: true };
    natif.reponseOuvrir = { ok: true, session: Object.assign({}, SESSION) };
    const ouverture = await PF.biometrie.ouvrir();
    verifier('7a. ouverture confirmée : {ok:true}', ouverture && ouverture.ok === true);
    verifier('7b. la session est restaurée en clair pour l’application',
        PF.net.auth.aUneSession() && PF.store.lireSession().access_token === 'jeton-acces');

    reinitialiser();
    PF.store.sauverReglages({ empreinteActivee: true });
    natif.etat = { dispo: true, sessionGardee: true };
    natif.reponseOuvrir = { ok: false, code: 'annule' };
    const annulee = await PF.biometrie.ouvrir();
    verifier('8a. annulation : {ok:false} avec le motif', annulee && annulee.ok === false && annulee.code === 'annule');
    verifier('8b. annulation : aucune session restaurée (repli mot de passe)',
        !PF.net.auth.aUneSession());

    reinitialiser();
    PF.store.sauverReglages({ empreinteActivee: true });
    natif.etat = { dispo: true, sessionGardee: true };
    natif.reponseOuvrir = { ok: false, code: 'echec' };
    const echec = await PF.biometrie.ouvrir();
    verifier('9a. échec biométrique : {ok:false}', echec && echec.ok === false);
    verifier('9b. échec biométrique : aucune session restaurée', !PF.net.auth.aUneSession());

    console.log('Activation / désactivation (écran de réglage)');
    reinitialiser();
    natif.reponseActiver = { ok: true };
    const sansSession = await PF.biometrie.activer();
    verifier('10a. activation sans session : refus net', sansSession && sansSession.ok === false);
    verifier('10b. activation sans session : réglage non activé',
        PF.store.reglages().empreinteActivee === false);
    verifier('10c. activation sans session : le pont n’est pas appelé',
        !natif.appels.some((a) => a[0] === 'activer'));

    reinitialiser();
    PF.store.sauverSession(Object.assign({}, SESSION));
    natif.reponseActiver = { ok: true };
    const activation = await PF.biometrie.activer();
    const actives = natif.appels.filter((a) => a[0] === 'activer');
    verifier('11a. activation confirmée : {ok:true}', activation && activation.ok === true);
    verifier('11b. réglage activé', PF.store.reglages().empreinteActivee === true);
    verifier('11c. les jetons sont scellés à l’activation',
        actives.length === 1 && JSON.parse(actives[0][1]).refresh_token === 'jeton-rafraichissement');

    reinitialiser();
    PF.store.sauverSession(Object.assign({}, SESSION));
    natif.reponseActiver = { ok: false, code: 'annule' };
    const refuse = await PF.biometrie.activer();
    verifier('12a. confirmation refusée : {ok:false}', refuse && refuse.ok === false);
    verifier('12b. confirmation refusée : réglage reste désactivé',
        PF.store.reglages().empreinteActivee === false);

    reinitialiser();
    PF.store.sauverReglages({ empreinteActivee: true });
    natif.etat.sessionGardee = true;
    PF.biometrie.desactiver();
    verifier('13a. désactivation : réglage désactivé', PF.store.reglages().empreinteActivee === false);
    verifier('13b. désactivation : les jetons gardés sont effacés',
        natif.appels.some((a) => a[0] === 'effacer') && !natif.etat.sessionGardee);

    console.log('Suivi des jetons et nettoyage');
    reinitialiser();
    PF.store.sauverReglages({ empreinteActivee: true });
    PF.biometrie.sceller(Object.assign({}, SESSION));
    verifier('14a. empreinte active : chaque session enregistrée rescelle les jetons',
        natif.appels.filter((a) => a[0] === 'maj').length === 1);
    verifier('14b. le scellement porte les jetons, jamais autre chose',
        JSON.parse(natif.appels.find((a) => a[0] === 'maj')[1]).access_token === 'jeton-acces');

    reinitialiser();
    PF.biometrie.sceller(Object.assign({}, SESSION));
    verifier('15. empreinte inactive : aucun scellement', !natif.appels.some((a) => a[0] === 'maj'));

    reinitialiser();
    PF.store.sauverReglages({ empreinteActivee: true });
    natif.etat.sessionGardee = true;
    PF.biometrie.nettoyer();
    verifier('16. session fermée (déconnexion / jeton mort) : jetons gardés effacés',
        natif.appels.some((a) => a[0] === 'effacer') && !natif.etat.sessionGardee);

    console.log('Le mot de passe n’est jamais stocké');
    reinitialiser();
    PF.store.sauverReglages({ empreinteActivee: true });
    natif.reponseActiver = { ok: true };
    PF.store.sauverSession(Object.assign({}, SESSION));
    await PF.biometrie.activer();
    natif.reponseOuvrir = { ok: true, session: Object.assign({}, SESSION) };
    await PF.biometrie.ouvrir();
    const clesDeSession = Object.keys(PF.store.lireSession() || {});
    verifier('17a. la session ne contient aucun champ de mot de passe',
        !clesDeSession.some((k) => /mdp|mot.?de.?passe|password/i.test(k)),
        'champs : ' + clesDeSession.join(', '));
    const clesDeReglage = Object.keys(PF.store.DEFAUTS || {});
    verifier('17b. les réglages ne contiennent aucun champ de mot de passe',
        !clesDeReglage.some((k) => /mdp|mot.?de.?passe|password/i.test(k)),
        'champs : ' + clesDeReglage.join(', '));
    const scellement = natif.appels.filter((a) => a[0] === 'activer' || a[0] === 'maj');
    verifier('17c. rien d’envoyé au pont ne porte de mot de passe',
        scellement.every((a) => !/mdp|mot.?de.?passe|password/i.test(a[1] || '')));

    let levee = false;
    try { PF.biometrie._fin('inconnu', { ok: true }); } catch (e) { levee = true; }
    verifier('18. un retour natif sans demande en attente n’élève rien', !levee);

    console.log(echecs === 0
        ? '\n✔ ' + reussis + ' réussis, 0 échec'
        : '\n✗ ' + reussis + ' réussis, ' + echecs + ' échec' + (echecs > 1 ? 's' : ''));
    process.exit(echecs === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
