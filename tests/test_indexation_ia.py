"""Indexation du corpus : la reprise doit survivre à tout.

Pourquoi ces tests existent. L'indexation initiale se fait par tranches, sur
plusieurs jours, parce que le quota gratuit de Cloudflare Workers AI est de
10 000 neurons par jour. Trois défauts se cumulaient dans la première version,
et chacun suffisait à rendre l'indexation interminable :

  1. le point de reprise n'était enregistré que si l'indexation allait au bout ;
     le lendemain, le script repartait du passage n° 1 ;
  2. `VECTORIZE.insert` ignore silencieusement un identifiant déjà présent :
     renvoyer les mêmes passages ne produisait aucun progrès, tout en
     consommant le quota ;
  3. le compte affiché s'additionnait à chaque envoi, donc il montait sans que
     l'index grossisse.

Ces tests montent un faux service (une vraie socket, sur 127.0.0.1, mais aucun
appel extérieur : ni Cloudflare, ni Supabase) et vérifient que l'indexeur
reprend, qu'il ne redemande jamais ce que l'index contient déjà, et qu'un quota
épuisé s'arrête proprement au lieu de tout perdre.
"""

from __future__ import annotations

import json
import os
import pathlib
import shutil
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

RACINE_DEPOT = pathlib.Path(__file__).resolve().parents[1]
CLE_ADMIN = "cle-de-test"
NEURONS_PAR_PASSAGE = 2


class FauxService:
    """Le strict nécessaire de /admin/indexation, /admin/presents et /admin/etat."""

    def __init__(self, quota=10_000):
        self.index: set[str] = set()
        self.neurons = 0
        self.quota = quota
        self.recus: list[str] = []  # passages réellement envoyés au modèle

    def cout(self, nombre):
        return nombre * NEURONS_PAR_PASSAGE


@pytest.fixture
def demarrer_service():
    """Lance un faux service sur un port libre et l'arrête à la fin du test.

    C'est une fabrique, pour que chaque test choisisse son quota.
    """
    serveurs = []

    def demarrer(quota=10_000):
        etat = FauxService(quota=quota)

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):  # silence
                pass

            def _lire(self):
                taille = int(self.headers.get("content-length") or 0)
                return json.loads(self.rfile.read(taille) or b"{}")

            def _repondre(self, code, objet):
                corps = json.dumps(objet).encode()
                self.send_response(code)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(corps)))
                self.end_headers()
                self.wfile.write(corps)

            def do_GET(self):
                if self.path.rstrip("/") == "/admin/etat":
                    self._repondre(200, {"passages": len(etat.index), "vecteurs": len(etat.index), "sources": []})
                else:
                    self._repondre(404, {"erreur": "route inconnue"})

            def do_POST(self):
                corps = self._lire()
                route = self.path.rstrip("/")
                if self.headers.get("x-cle-admin") != CLE_ADMIN:
                    self._repondre(401, {"erreur": "Clé admin invalide"})
                elif route == "/admin/indexation":
                    paquet = corps.get("morceaux") or []
                    if etat.neurons + etat.cout(len(paquet)) > etat.quota:
                        # Ce que répond Cloudflare quand le quota du jour est passé.
                        self._repondre(429, {"erreur": "quota exceeded: 10 000 neurons per day"})
                        return
                    etat.neurons += etat.cout(len(paquet))
                    etat.recus.extend(m["id"] for m in paquet)
                    etat.index.update(m["id"] for m in paquet)
                    self._repondre(200, {"ok": True, "inseres": len(paquet),
                                         "corpus": {"vecteurs": len(etat.index), "majLe": "2026-10-05T00:00:00Z"}})
                elif route == "/admin/presents":
                    self._repondre(200, {"presents": [i for i in corps.get("ids", []) if i in etat.index]})
                else:
                    self._repondre(404, {"erreur": "route inconnue"})

        serveur = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=serveur.serve_forever, daemon=True).start()
        serveurs.append(serveur)
        etat.port = serveur.server_address[1]
        return etat

    yield demarrer
    for serveur in serveurs:
        serveur.shutdown()
        serveur.server_close()


def preparer(tmp_path, passages, tranche=1000, taille=2):
    """Un faux dépôt avec l'indexeur et un petit corpus."""
    (tmp_path / "ia" / "scripts").mkdir(parents=True, exist_ok=True)
    (tmp_path / "ia" / "corpus").mkdir(parents=True, exist_ok=True)
    shutil.copy(RACINE_DEPOT / "ia" / "scripts" / "indexer.py", tmp_path / "ia" / "scripts" / "indexer.py")
    with open(tmp_path / "ia" / "corpus" / "chunks.jsonl", "w", encoding="utf-8") as f:
        for i in range(passages):
            f.write(json.dumps({"id": f"p-{i}", "texte": f"Passage numéro {i}."}, ensure_ascii=False) + "\n")
    return [sys.executable, str(tmp_path / "ia" / "scripts" / "indexer.py"),
            "--tranche", str(tranche), "--taille", str(taille)]


def lancer(tmp_path, service, arguments):
    environnement = dict(os.environ, UDE_URL=f"http://127.0.0.1:{service.port}", UDE_CLE_ADMIN=CLE_ADMIN)
    return subprocess.run(arguments, cwd=tmp_path, env=environnement, capture_output=True, text=True, timeout=120)


def point_de_reprise(tmp_path):
    fichier = tmp_path / "ia" / "corpus" / ".indexation.json"
    return set(json.loads(fichier.read_text())["ids"]) if fichier.exists() else set()


def test_une_tranche_complete_est_indexee_et_notee(tmp_path, demarrer_service):
    service = demarrer_service()
    arguments = preparer(tmp_path, 7)
    resultat = lancer(tmp_path, service, arguments)

    assert resultat.returncode == 0, resultat.stdout + resultat.stderr
    assert service.index == {f"p-{i}" for i in range(7)}
    assert point_de_reprise(tmp_path) == service.index
    assert "Tout ce corpus est déjà indexé" in lancer(tmp_path, service, arguments).stdout


def test_quota_epuise_sort_proprement_et_garde_la_tranche(tmp_path, demarrer_service):
    service = demarrer_service(quota=4)  # de quoi indexer deux passages seulement
    arguments = preparer(tmp_path, 7)
    resultat = lancer(tmp_path, service, arguments)

    assert resultat.returncode == 0, "un quota épuisé n'est pas une erreur : il faut pouvoir reprendre"
    assert "Quota gratuit du jour épuisé" in resultat.stdout
    assert len(service.index) == 2
    assert point_de_reprise(tmp_path) == service.index


def test_point_de_reprise_perdu_ne_renvoie_pas_ce_qui_est_deja_indexe(tmp_path, demarrer_service):
    service = demarrer_service()
    """Le cas qui rendait l'indexation infinie : un run annulé, un état perdu."""
    arguments = preparer(tmp_path, 7, tranche=2)
    assert lancer(tmp_path, service, arguments).returncode == 0
    assert len(service.index) == 2 and len(service.recus) == 2

    (tmp_path / "ia" / "corpus" / ".indexation.json").unlink()  # exécution annulée
    service.recus.clear()
    resultat = lancer(tmp_path, service, arguments)

    assert resultat.returncode == 0, resultat.stdout + resultat.stderr
    assert "déjà dans l'index" in resultat.stdout
    assert service.recus == ["p-2", "p-3"], "les passages déjà indexés ne doivent jamais être repayés"
    assert len(service.index) == 4


def test_le_meme_identifiant_n_est_envoye_qu_une_fois(tmp_path, demarrer_service):
    service = demarrer_service()
    """Un corpus qui contient deux fois le même identifiant brûlerait des neurons pour rien."""
    arguments = preparer(tmp_path, 1)
    fichier = tmp_path / "ia" / "corpus" / "chunks.jsonl"
    ligne = fichier.read_text(encoding="utf-8").strip()
    fichier.write_text(ligne + "\n" + ligne + "\n", encoding="utf-8")

    assert lancer(tmp_path, service, arguments).returncode == 0
    assert service.recus == ["p-0"]


def test_etat_affiche_ce_que_l_index_contient_vraiment(tmp_path, demarrer_service):
    service = demarrer_service()
    arguments = preparer(tmp_path, 3)
    lancer(tmp_path, service, arguments)
    resultat = lancer(tmp_path, service, arguments + ["--etat"])

    assert resultat.returncode == 0
    assert json.loads(resultat.stdout)["vecteurs"] == 3
