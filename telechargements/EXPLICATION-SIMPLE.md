# Pourquoi l'application se trompait (et ce que ce correctif répare)

*Tout est expliqué sans jargon. Si vous ne lisez qu'un fichier, lisez celui-ci.*

---

## L'image : deux tiroirs

Imaginez que votre argent est rangé dans **deux tiroirs** :

- le tiroir **« compte courant »** : l'argent liquide disponible ;
- le tiroir **« titres »** : les actions, l'or, les ETF — ce que vous possédez.

Quand vous **achetez** une action, vous ne devenez pas plus riche : vous
**déplacez** de l'argent du premier tiroir vers le second. La somme des deux
tiroirs ne bouge pas d'un centime. C'est ce qu'on appelle un **transfert
interne**.

Maintenant, ajoutez que votre portefeuille est **photographié chaque soir**, à
l'heure où le robot enregistre la valeur (« le dernier enregistrement »). Ces
photos, ce sont les enregistrements. Pour savoir ce que **le marché** a fait
depuis la dernière photo, on compare la valeur actuelle à la dernière photo, en
retirant les mouvements d'argent (les apports, les retraits, et les transferts
entre tiroirs).

## Ce qui n'allait pas

Le 07/10/2026, trois choses se sont mal emboîtées.

**1. On comparait à la mauvaise photo.** La photo du soir est enregistrée, puis
l'application affiche la valeur « en direct ». Le direct écrasait la photo du
07/10 dans la mémoire de l'application : elle comparait donc le direct à la
photo **du 06/10**. Résultat : +2 246 $ alors que la veille au soir valait
81 267,52 $, et non 78 708,86 $.

**2. Un achat comptait comme un gain.** Vous avez acheté 68 FLXC.L pour
1 943,91 $ (68 × 28,355 + 15,77), saisi **après** la photo du 06/10 au soir. Du
point de vue du tiroir « titres », ce jour-là, il y a eu **beaucoup** d'argent qui
est entré — mais c'était juste votre argent qui changeait de tiroir. L'application
ne le savait pas et le comptait comme si le marché avait rapporté 1 943,91 $.

**3. Un retrait comptait comme un versement.** Dans le carnet des mouvements, les
montants sont écrits **en positif**, et c'est une case à part (« sens ») qui dit
si l'argent entre ou sort. L'application lisait le montant sans regarder la case :
un retrait de 1 000 € arrivait donc comme un apport de 1 000 € — l'inverse de la
vérité.

Résultat : **+2 246 $ (+2,85 %)** affichés pour une journée qui valait
**−312,52 $ (−0,38 %)**. Votre courtier, lui, annonçait −0,69 % (le reste de
l'écart vient de l'heure des cotations, pas du calcul).

## Ce que fait le correctif

- La photo du soir **reste intacte**. La valeur en direct devient un **point
  séparé**, marqué d'une étiquette invisible ; l'application ne se mélange plus
  les pinceaux.
- Les **retraits sont déduits** et les apports ajoutés : on regarde la case
  « sens », comme il faut.
- Les **achats et ventes de titres sont reconnus** comme des transferts entre
  tiroirs : ils comptent dans le tiroir « titres » (pour ne pas fausser sa
  performance) et **jamais** dans le total.
- Pour savoir si une opération est **après** la photo, l'application regarde
  **l'heure à laquelle l'opération a été enregistrée** (et non la date qu'elle
  porte) : une opération saisie après la photo ne peut pas y figurer. Si cette
  heure manque, elle retient seulement les opérations strictement postérieures à
  la date — pour ne jamais compter deux fois.
- Les étiquettes affichent enfin leur repère : « depuis le dernier enregistrement
  **du 06/10** ». On ne confond plus avec la variation du jour de votre courtier,
  qui part de la clôture de la veille.

## Les chiffres, en clair

| | Valeur du tiroir « titres » |
|---|---|
| Photo du 06/10 au soir | 78 708,86 $ |
| Photo du 07/10 au soir | 81 267,52 $ |
| Valeur en direct ce jour-là | 80 955 $ |

La journée, c'est donc 80 955 − 81 267,52 = **−312,52 $**, soit **−0,38 %**.
C'est ce que doit afficher la tuile « Portefeuille investi ». Le patrimoine total
(les deux tiroirs) vaut **−0,3 %**.

## Et les fichiers cassés sur GitHub ?

En recopiant le correctif dans GitHub, trois caractères se sont perdus : une
accolade en trop dans deux fichiers, une apostrophe manquante dans le troisième.
Une seule faute de ce genre suffit à empêcher **tout** le moteur JavaScript de
démarrer : l'application ne peut plus fonctionner si on recompile avec ces
fichiers-là. C'est la raison pour laquelle l'archive contient les trois fichiers
**complets et réparés** — et pour laquelle il faut les remettre tels quels, sans
essayer de les retoucher.

## Comment faire, en résumé

1. Téléchargez l'archive et décompressez-la.
2. Remplacez sur GitHub les fichiers listés par ceux du dossier `fichiers/`
   (mêmes chemins, mêmes noms).
3. Laissez faire la compilation de l'APK 1.7.2 (Actions → « Construire l'APK » →
   Run workflow).
4. Installez l'APK **par-dessus** l'ancienne, sans désinstaller, puis rouvrez
   l'application.
5. Vérifiez la tuile « Portefeuille investi » : **≈ −0,4 %**, plus +2,85 %.
