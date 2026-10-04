/* Test de rendu : on charge la page réelle dans un DOM simulé et on affiche
   les cinq écrans. Objectif : aucun message d'erreur, et du contenu dans
   chaque vue. */
'use strict';

const path = require('path');
const { JSDOM, VirtualConsole } = require('/home/user/.cache/jsdom/node_modules/jsdom');

const PAGE = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www', 'index.html');

const erreurs = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => erreurs.push('jsdomError: ' + (e.message || e)));
vc.on('error', (...a) => erreurs.push('console.error: ' + a.join(' ')));

let reussis = 0, echecs = 0;
function test(nom, fn) {
    try {
        const r = fn();
        if (r === false) throw new Error('assertion fausse');
        reussis++;
        console.log('  ✓ ' + nom);
    } catch (e) {
        echecs++;
        console.log('  ✗ ' + nom + ' → ' + e.message);
    }
}

JSDOM.fromFile(PAGE, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc
}).then((dom) => new Promise((resoudre) => setTimeout(() => resoudre(dom), 900)))
    .then((dom) => {
        const w = dom.window;
        const PF = w.PF;

        console.log('\nChargement de la page');
        test('les modules sont chargés', () => !!PF && !!PF.vues && !!PF.app);
        test('le pont natif absent ne casse pas le démarrage', () => erreurs.length === 0
            || (console.log('    ' + erreurs.join('\n    ')), false));
        test('la navigation est en place', () => !!w.document.querySelector('#nav button[data-onglet="bord"]'));

        // --- Contexte de démonstration
        PF.app.etat.demo = true;
        const ctx = PF.app.demo();
        PF.app.etat.ctx = ctx;

        console.log('\nRendu des cinq écrans');
        ['bord', 'portefeuille', 'performance', 'retraite', 'fiscalite'].forEach((onglet) => {
            test('écran « ' + onglet + ' » rendu sans erreur', () => {
                PF.app.naviguer(onglet, true);
                const html = w.document.getElementById('view').innerHTML;
                if (!html || html.length < 200) throw new Error('contenu vide (' + html.length + ' caractères)');
                if (html.indexOf('undefined') >= 0) throw new Error('« undefined » dans le rendu');
                if (html.indexOf('NaN') >= 0) throw new Error('« NaN » dans le rendu');
                return true;
            });
        });

        console.log('\nNavigation interne');
        ['operations', 'reequilibrage', 'allocation', 'positions'].forEach((sous) => {
            test('portefeuille → ' + sous, () => {
                PF.app.naviguer('portefeuille', true);
                const chip = Array.from(w.document.querySelectorAll('[data-chip]'))
                    .find((c) => c.getAttribute('data-chip') === sous);
                if (!chip) throw new Error('puce « ' + sous + ' » absente');
                chip.click();
                const html = w.document.getElementById('view').innerHTML;
                if (html.indexOf('undefined') >= 0) throw new Error('« undefined » dans le rendu');
                if (html.indexOf('NaN') >= 0) throw new Error('« NaN » dans le rendu');
                if (html.length < 200) throw new Error('contenu vide');
                return true;
            });
        });
        test('performance → chaque période se calcule', () => {
            PF.app.naviguer('performance', true);
            const puces = Array.from(w.document.querySelectorAll('[data-periode]'));
            if (puces.length < 7) throw new Error('périodes manquantes');
            puces.forEach((p) => {
                p.click();
                const html = w.document.getElementById('view').innerHTML;
                if (html.indexOf('NaN') >= 0) throw new Error('NaN sur ' + p.textContent);
                if (html.indexOf('undefined') >= 0) throw new Error('undefined sur ' + p.textContent);
            });
            return true;
        });
        test('fiscalité → changement de millésime', () => {
            PF.app.naviguer('fiscalite', true);
            const puces = Array.from(w.document.querySelectorAll('[data-fisc="annee"]'));
            if (!puces.length) throw new Error('aucun millésime');
            puces[puces.length - 1].click();
            const html = w.document.getElementById('view').innerHTML;
            return html.indexOf('Impôt sur le revenu') >= 0;
        });

        console.log('\nCohérence de l’affichage');
        test('le dollar est affiché en premier, l’euro en dessous', () => {
            PF.app.naviguer('bord', true);
            const html = w.document.getElementById('view').innerHTML;
            const iUsd = html.indexOf('montant-usd');
            const iEur = html.indexOf('montant-eur');
            return iUsd >= 0 && iEur > iUsd;
        });
        test('les flèches sont présentes sur le tableau de bord', () => {
            const html = w.document.getElementById('view').innerHTML;
            return /[↗↘→]/.test(html);
        });
        test('l’alerte de répartition > 100 % se déclenche', () => {
            const cfg = PF.modele.allocationDefaut();
            cfg.actifs[0].cible_pct = 60;
            PF.modele.appliquer(cfg);
            const v = PF.modele.verifier(cfg);
            return v.depasse_100 && v.message.length > 0;
        });
        test('retour à une allocation équilibrée', () => {
            PF.modele.appliquer(PF.modele.allocationDefaut());
            return PF.modele.verifier(PF.modele.etat.actifs).est_valide;
        });

        console.log('\nFeuilles et actions');
        test('ouvrir la feuille « nouvelle opération »', () => {
            PF.app.naviguer('portefeuille', true);
            w.document.getElementById('btnNouveau').click();
            // Le premier écran propose le choix du type d'opération.
            const choix = w.document.querySelector('#feuille [data-c="0"]');
            if (!choix) throw new Error('aucun choix proposé');
            choix.click();
            return w.document.getElementById('feuille').classList.contains('ouvert')
                && w.document.getElementById('feuille').innerHTML.indexOf('txTicker') >= 0;
        });
        test('la feuille propose les devises mondiales', () => {
            const html = w.document.getElementById('feuille').innerHTML;
            return ['USD', 'EUR', 'CHF', 'JPY', 'GBP', 'CNY', 'CAD', 'AUD', 'HKD', 'SGD', 'NOK', 'SEK', 'DKK']
                .every((d) => html.indexOf(d) >= 0);
        });
        test('le choix du compte est proposé', () => {
            const html = w.document.getElementById('feuille').innerHTML;
            return html.indexOf('Compte courant USD') >= 0 && html.indexOf('Épargne de précaution CHF') >= 0;
        });
        test('fermer la feuille', () => {
            w.document.getElementById('voile').click();
            return !w.document.getElementById('feuille').classList.contains('ouvert');
        });
        test('ouvrir les réglages', () => {
            w.document.getElementById('btnReglages').click();
            const html = w.document.getElementById('feuille').innerHTML;
            return html.indexOf('Connexion Supabase') >= 0 && html.indexOf('Inflation') >= 0;
        });
        test('fermer les réglages', () => {
            w.document.getElementById('voile').click();
            return true;
        });

        console.log('\nÉcran fiscalité');
        test('la déclaration de base affiche les cases 1AK et 1BK', () => {
            PF.app.naviguer('fiscalite', true);
            const html = w.document.getElementById('view').innerHTML;
            return html.indexOf('1AK') >= 0 && html.indexOf('1BK') >= 0;
        });
        test('le guide par formulaire est replié', () => {
            const html = w.document.getElementById('view').innerHTML;
            return html.indexOf('2042') >= 0 && html.indexOf('2086') >= 0 && html.indexOf('3916') >= 0;
        });
        test('la situation familiale est un volet à part', () => {
            const html = w.document.getElementById('view').innerHTML;
            return html.indexOf('Situation familiale') >= 0 && html.indexOf('accordeon') >= 0;
        });

        console.log('\nRetour arrière');
        test('App.onBack ferme la feuille ouverte', () => {
            w.document.getElementById('btnReglages').click();
            const fermee = w.App.onBack();
            return fermee === true && !w.document.getElementById('feuille').classList.contains('ouvert');
        });
        test('App.onBack quitte quand tout est fermé', () => {
            PF.app.naviguer('bord', true);
            return w.App.onBack() === false;
        });

        console.log('\nErreurs JavaScript interceptées : ' + erreurs.length);
        erreurs.slice(0, 10).forEach((e) => console.log('   ! ' + e));
        if (erreurs.length) echecs += erreurs.length;

        console.log('\n' + (echecs === 0 ? '✔ ' : '✘ ') + reussis + ' réussis, ' + echecs + ' échecs\n');
        process.exit(echecs === 0 ? 0 : 1);
    })
    .catch((e) => {
        console.log('✘ échec du chargement : ' + (e && e.stack ? e.stack : e));
        process.exit(1);
    });
