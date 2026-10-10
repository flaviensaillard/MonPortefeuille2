/* Empreinte 2.2.0 — chaque échec nomme sa vraie cause (constats B1 et B2).

   Avant 2.2.0, toute erreur de BiometricPrompt devenait « Activation annulée :
   l'empreinte n'a pas confirmé votre identité », et une permission absente
   faisait passer l'appareil pour « sans empreinte ». Ici on verrouille :
   - chaque code natif a un libellé propre (pas le libellé fourre-tout) ;
   - un code inconnu garde son code système (jamais masqué) ;
   - l'activation et le déverrouillage remontent le code natif tel quel ;
   - une annulation volontaire est distinguée d'une panne ;
   - la raison de l'indisponibilité est transmise au réglage.

   La liste des codes natifs est recoupée avec NativeBridge.java par
   tests/test_empreinte_cableage.py (les deux côtés doivent rester en phase). */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE_WWW = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www');
const FICHIERS = ['util.js', 'models.js', 'net.js', 'store.js', 'biometrie.js'];

// Codes que le natif peut renvoyer (NativeBridge.java : codeErreurBiometrie,
// codeCanAuthenticate, et les codes propres à l'application).
const CODES_NATIFS = [
    'ok', 'sdk_trop_ancien', 'permission_manquante', 'materiel_absent',
    'materiel_indisponible', 'aucune_empreinte_enrolee', 'maj_securite_requise',
    'non_supporte', 'diagnostic_impossible', 'sans_session', 'cle_absente',
    'cle_invalidee', 'cle_indisponible', 'jetons_illisibles', 'erreur_prompt',
    'annule_utilisateur', 'annule_systeme', 'repli_mot_de_passe', 'delai_depasse',
    'capteur_illisible', 'espace_insuffisant', 'verrouillage_temporaire',
    'verrouillage_permanent', 'erreur_fabricant', 'pas_de_code_ecran', 'erreur_inconnue'
];
const LIBELLE_GENERIQUE_ANCIEN = 'Activation annulée';

const stockage = {};
const localStorageFaux = {
    getItem: (k) => (k in stockage ? stockage[k] : null),
    setItem: (k, v) => { stockage[k] = String(v); },
    removeItem: (k) => { delete stockage[k]; }
};

const natif = {
    etat: { dispo: true, raison: 'ok', sessionGardee: false },
    reponseActiver: { ok: true },
    reponseOuvrir: { ok: true, session: null },
    empreinteEtat() {
        return JSON.stringify({ dispo: this.etat.dispo, raison: this.etat.raison, sessionGardee: this.etat.sessionGardee });
    },
    empreinteSessionGardee() { return this.etat.sessionGardee; },
    empreinteMajSession() { return true; },
    empreinteEffacer() { this.etat.sessionGardee = false; return true; },
    empreinteActiver(json, id) {
        setTimeout(() => PF.biometrie._fin(id, this.reponseActiver), 0);
    },
    empreinteOuvrir(id) {
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

const SESSION = { access_token: 'jeton-acces', refresh_token: 'jeton-rafraichi', user: { id: 'u1', email: 'a@b.fr' } };

(async function () {
    console.log('Chaque code natif a son libellé, distinct du libellé fourre-tout');
    for (const code of CODES_NATIFS) {
        const texte = PF.biometrie.libelle({ ok: false, code: code });
        verifier('libellé pour « ' + code + ' »',
            typeof texte === 'string' && texte.length > 10 && texte.indexOf(LIBELLE_GENERIQUE_ANCIEN) === -1,
            'obtenu : ' + texte);
    }

    console.log('Un code inconnu n’est jamais masqué');
    const inconnu = PF.biometrie.libelle({ ok: false, code: 'code_nouveau', systeme: 99 });
    verifier('le code et le code système apparaissent', inconnu.indexOf('code_nouveau') !== -1 && inconnu.indexOf('99') !== -1, inconnu);

    console.log('L’activation remonte la vraie cause');
    PF.store.sauverSession(Object.assign({}, SESSION));
    natif.reponseActiver = { ok: false, code: 'aucune_empreinte_enrolee', message: 'x' };
    let res = await PF.biometrie.activer();
    verifier('code natif conservé', res.ok === false && res.code === 'aucune_empreinte_enrolee', JSON.stringify(res));
    verifier('libellé nommant l’absence d’empreinte',
        PF.biometrie.libelle(res).indexOf('Aucune empreinte') !== -1, PF.biometrie.libelle(res));
    verifier('réglage non activé après un échec', PF.store.reglages().empreinteActivee !== true);

    natif.reponseActiver = { ok: false, code: 'permission_manquante', message: 'Must declare USE_BIOMETRIC' };
    res = await PF.biometrie.activer();
    verifier('permission manquante nommée, pas « annulée »',
        res.code === 'permission_manquante' && PF.biometrie.libelle(res).indexOf('permission') !== -1);

    natif.reponseActiver = { ok: false, code: 'cle_invalidee', message: 'invalidée' };
    res = await PF.biometrie.activer();
    verifier('clé invalidée : réactivation demandée avec le mot de passe',
        res.code === 'cle_invalidee' && PF.biometrie.libelle(res).indexOf('mot de passe') !== -1);

    console.log('Annulation volontaire distinguée d’une panne');
    natif.reponseOuvrir = { ok: false, code: 'annule_utilisateur', systeme: 10 };
    res = await PF.biometrie.ouvrir();
    verifier('annulation volontaire reconnue', PF.biometrie.annulationVolontaire(res) === true);
    natif.reponseOuvrir = { ok: false, code: 'verrouillage_permanent', systeme: 9 };
    res = await PF.biometrie.ouvrir();
    verifier('verrouillage : panne, pas une annulation', PF.biometrie.annulationVolontaire(res) === false
        && PF.biometrie.libelle(res).indexOf('verrouillé') !== -1);

    console.log('La raison de l’indisponibilité atteint le réglage');
    natif.etat = { dispo: false, raison: 'permission_manquante', sessionGardee: false };
    const etat = PF.biometrie.etat();
    verifier('etat().raison transmise', etat.raison === 'permission_manquante' && etat.disponible === false, JSON.stringify(etat));
    natif.etat = { dispo: true, raison: 'ok', sessionGardee: true };

    console.log('Le repli mot de passe reste intact');
    natif.reponseOuvrir = { ok: false, code: 'repli_mot_de_passe', systeme: 13 };
    res = await PF.biometrie.ouvrir();
    verifier('repli : pas de session restaurée', res.ok === false && PF.biometrie.annulationVolontaire(res) === true);

    if (echecs) { console.log('\n✗ ' + echecs + ' échec(s), ' + reussis + ' réussis'); process.exit(1); }
    console.log('\n✔ ' + reussis + ' réussis, 0 échec');
})();
