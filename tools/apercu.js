/* Génère un aperçu visuel de l'application : les cinq écrans sont rendus avec
   un jeu de données de démonstration, puis figés dans une page autonome
   (styles inclus) présentée dans un cadre de téléphone. */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('/home/user/.cache/jsdom/node_modules/jsdom');

const RACINE = path.join(__dirname, '..');
const PAGE = path.join(RACINE, 'app', 'src', 'main', 'assets', 'www', 'index.html');
const CSS = fs.readFileSync(path.join(RACINE, 'app', 'src', 'main', 'assets', 'www', 'css', 'app.css'), 'utf8');
const SORTIE = path.join(RACINE, 'apercu.html');

const vc = new VirtualConsole();

JSDOM.fromFile(PAGE, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc })
    .then((dom) => new Promise((r) => setTimeout(() => r(dom), 800)))
    .then((dom) => {
        const w = dom.window;
        const PF = w.PF;
        PF.app.etat.demo = true;
        const ctx = PF.app.demo();
        PF.app.etat.ctx = ctx;

        const onglets = [
            ['bord', 'Tableau de bord'],
            ['portefeuille', 'Portefeuille'],
            ['performance', 'Performance'],
            ['retraite', 'Retraite'],
            ['fiscalite', 'Fiscalité']
        ];

        const ecrans = onglets.map(([cle, titre]) => {
            PF.app.naviguer(cle, true);
            const vue = w.document.getElementById('view').innerHTML;
            return { cle, titre, html: vue };
        });

        const navHtml = w.document.getElementById('nav').outerHTML
            .replace(/data-onglet="bord" class="actif"/, 'data-onglet="bord" class="actif"');

        const page = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Porte-feuille — aperçu</title>
<style>
${CSS}
body { background: #060910; }
body::before { display: none; }
#app { padding-bottom: 0; }
.galerie { display: flex; flex-wrap: wrap; gap: 34px; justify-content: center; padding: 30px 16px 60px; }
.titre-galerie { text-align: center; color: #F5C451; font-size: 24px; font-weight: 700; margin: 34px 0 4px; }
.sous-titre { text-align: center; color: #6B7789; font-size: 13px; margin-bottom: 6px; }
.telephone {
    width: 372px; height: 760px; border-radius: 40px; position: relative; overflow: hidden;
    background: #0B0F17; border: 1px solid rgba(255,255,255,.10);
    box-shadow: 0 30px 70px rgba(0,0,0,.55);
}
.telephone .ecran { position: absolute; inset: 0; overflow-y: auto; overflow-x: hidden; }
.telephone .ecran::-webkit-scrollbar { width: 0; }
.telephone .barre-haut {
    position: sticky; top: 0; z-index: 30; height: 26px; background: #0B0F17;
    display: flex; align-items: center; justify-content: space-between; padding: 0 16px;
    font-size: 11px; color: #9AA7BC; font-weight: 600;
}
.telephone .barre-bas { position: sticky; bottom: 0; height: 14px; background: #0B0F17; }
.telephone nav.bottom { position: sticky; bottom: 0; }
</style></head>
<body>
<div class="titre-galerie">Porte-feuille</div>
<div class="sous-titre">Aperçu des cinq écrans — jeu de données de démonstration</div>
<div class="galerie">
${ecrans.map((e) => `  <div>
    <div style="text-align:center;color:#8A96AB;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px">${e.titre}</div>
    <div class="telephone">
      <div class="ecran">
        <div class="barre-haut"><span>9:41</span><span>Porte-feuille · ${e.titre}</span><span>100 %</span></div>
        <header class="topbar" style="position:sticky;top:0">
          <h1>${e.titre}<span class="sub">synchronisé 09h41</span></h1>
          <button class="iconbtn">⟳</button><button class="iconbtn">⚙︎</button>
        </header>
        <main id="view-${e.cle}" class="view-apercu">${e.html}</main>
        ${navHtml}
        <div class="barre-bas"></div>
      </div>
    </div>
  </div>`).join('\n')}
</div>
</body></html>`;

        fs.writeFileSync(SORTIE, page, 'utf8');
        console.log('aperçu écrit : ' + SORTIE + ' (' + Math.round(page.length / 1024) + ' Ko)');
        process.exit(0);
    })
    .catch((e) => {
        console.log('échec : ' + (e && e.stack ? e.stack : e));
        process.exit(1);
    });
