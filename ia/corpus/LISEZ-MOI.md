# Le corpus

## Ce qu'il contient

| Source | Volume | Statut |
|---|---|---|
| Articles signés Charles Gave (Institut des Libertés) | 663 | importé |
| Manifestes et bibliographie | 3 documents | importé |
| Articles de l'Institut des Libertés (tous auteurs) | 1 733 | disponible |
| Transcriptions de vidéos publiques | 798 | disponible |

Pour tout importer : `python3 scripts/importer_corpus_local.py` (sans option).

## Ce qu'on n'y met pas

- **Un livre entier.** Droit d'auteur. Une citation courte et sourcée, oui ; un
  chapitre recopié, non.
- **Un contenu payant aspiré.** Le Daily d'Initié accessible après connexion est
  hors de portée des scripts. Si vous y avez accès, exportez-le vous-même et
  déposez les fichiers dans `brut/youtube/` au même format que les autres.
- **N'importe quoi.** Un passage non sourcé dans le corpus devient une
  affirmation sourcée dans une réponse. La provenance est donc obligatoire
  (`sources.json`).

## Format d'un document

```json
{
  "id": "idl-mon-article",
  "titre": "Le Grand Retour de la Souveraineté",
  "date": "2026-10-04",
  "url": "https://institutdeslibertes.org/19155-2/",
  "source": "Institut des Libertés",
  "type": "article",
  "auteur": "Charles Gave",
  "texte": "…"
}
```

Le champ `auteur` est celui qui permet de distinguer ce que Gave a écrit de ce
que l'Institut publie par ailleurs. Il n'est jamais déduit : il vient des
métadonnées du site, ou reste à « non attribué ».

## Vos notes

Le meilleur ajout que vous puissiez faire : vos propres notes de lecture, en
`.md` ou `.txt`, dans `manuels/`. Elles n'ont aucun droit attaché et elles
disent ce que vous avez retenu — c'est exactement ce qu'un assistant doit
retrouver.
