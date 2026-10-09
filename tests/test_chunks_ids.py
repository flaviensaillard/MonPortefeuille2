"""Identifiants du corpus IA : chacun désigne un seul passage.

Pourquoi ces tests existent. `fabriquer_chunks.py` tronquait l'identifiant
`{document}-{n}` à 64 caractères. Pour les longs articles, la troncature
supprimait le numéro de passage : 1 143 passages partageaient l'identifiant de
leur premier passage. `indexer.py` ne gardait que la première occurrence, les
1 143 autres n'étaient jamais envoyés, et le robot répondait « déjà indexé ».

Ces tests vérifient :
  - que le fichier `chunks.jsonl` versionné n'a aucun identifiant en double ;
  - que le générateur ne produit plus de doublon sur un long article ;
  - que l'indexeur refuse un identifiant qui désigne deux textes différents ;
  - que le point de reprise ne désigne que des passages du corpus.
"""

from __future__ import annotations

import importlib.util
import json
import pathlib
import re

import pytest

RACINE = pathlib.Path(__file__).resolve().parents[1]
SCRIPTS = RACINE / "ia" / "scripts"
CHUNKS = RACINE / "ia" / "corpus" / "chunks.jsonl"
ETAT = RACINE / "ia" / "corpus" / ".indexation.json"


def charger_module(nom):
    chemin = SCRIPTS / f"{nom}.py"
    spec = importlib.util.spec_from_file_location(f"ia_{nom}", chemin)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def lire_lignes(chemin):
    return [json.loads(l) for l in chemin.read_text(encoding="utf-8").split("\n") if l.strip()]


def test_chunks_jsonl_a_un_identifiant_par_passage():
    lignes = lire_lignes(CHUNKS)
    ids = [o["id"] for o in lignes]
    doublons = sorted({i for i in ids if ids.count(i) > 1})
    assert not doublons, f"{len(ids) - len(set(ids))} passages en trop partagent un identifiant : {doublons[:5]}"


def test_identifiants_tiennent_en_64_caracteres():
    ids = [o["id"] for o in lire_lignes(CHUNKS)]
    assert max(len(i) for i in ids) <= 64


def test_le_point_de_reprise_ne_designe_que_des_passages_du_corpus():
    ids_corpus = {o["id"] for o in lire_lignes(CHUNKS)}
    ids_indexes = set(json.loads(ETAT.read_text(encoding="utf-8"))["ids"])
    orphelins = ids_indexes - ids_corpus
    assert not orphelins, f"identifiants indexés absents du corpus : {sorted(orphelins)[:5]}"


def test_generateur_donne_un_identifiant_distinct_a_chaque_passage_d_un_long_article():
    fabriquer = charger_module("fabriquer_chunks")
    doc_id = "idl-un-tres-long-titre-darticle-qui-depasse-largement-la-limite-de-soixante-quatre-caracteres"
    utilises = set()
    passages = [f"Passage {i}, texte différent." for i in range(30)]
    ids = [fabriquer.identifiant_passage(doc_id, i, p, utilises) for i, p in enumerate(passages)]

    assert len(set(ids)) == len(ids), "un identifiant de passage est réutilisé"
    assert max(len(i) for i in ids) <= 64
    assert ids[0] == f"{doc_id}-0"[:64], "le premier passage garde l'identifiant tronqué d'origine"
    for identifiant in ids[1:]:
        assert re.search(r"-[0-9a-f]{8}$", identifiant), identifiant


def test_generateur_est_deterministe():
    fabriquer = charger_module("fabriquer_chunks")
    doc_id = "idl-un-tres-long-titre-darticle-qui-depasse-largement-la-limite-de-soixante-quatre-caracteres"
    passages = [f"Passage {i}." for i in range(5)]

    def tirer():
        utilises = set()
        return [fabriquer.identifiant_passage(doc_id, i, p, utilises) for i, p in enumerate(passages)]

    assert tirer() == tirer()


def test_generateur_ne_confond_pas_deux_documents_au_meme_nom_tronque():
    fabriquer = charger_module("fabriquer_chunks")
    prefixe = "idl-" + "x" * 70
    utilises = set()
    a = fabriquer.identifiant_passage(prefixe + "-a", 0, "Texte A", utilises)
    b = fabriquer.identifiant_passage(prefixe + "-b", 0, "Texte B", utilises)
    assert a != b


def test_indexeur_refuse_un_identifiant_qui_designe_deux_textes(tmp_path, monkeypatch, capsys):
    indexer = charger_module("indexer")
    fichier = tmp_path / "chunks.jsonl"
    fichier.write_text(
        json.dumps({"id": "doc-1", "texte": "Premier texte."}, ensure_ascii=False) + "\n"
        + json.dumps({"id": "doc-1", "texte": "Autre texte."}, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(indexer, "CHUNKS", fichier)

    assert indexer.lire_passages() is None
    assert "deux textes différents" in capsys.readouterr().out


def test_indexeur_ignore_un_doublon_identique_et_le_signale(tmp_path, monkeypatch, capsys):
    indexer = charger_module("indexer")
    fichier = tmp_path / "chunks.jsonl"
    ligne = json.dumps({"id": "doc-1", "texte": "Même texte."}, ensure_ascii=False)
    fichier.write_text(ligne + "\n" + ligne + "\n", encoding="utf-8")
    monkeypatch.setattr(indexer, "CHUNKS", fichier)

    passages = indexer.lire_passages()
    assert [p["id"] for p in passages] == ["doc-1"]
    assert "1 doublon(s) identique(s) ignoré(s)" in capsys.readouterr().out


def test_indexeur_lit_le_corpus_versionne_sans_erreur():
    indexer = charger_module("indexer")
    passages = indexer.lire_passages()
    assert passages is not None
    assert len(passages) == len({o["id"] for o in lire_lignes(CHUNKS)})
