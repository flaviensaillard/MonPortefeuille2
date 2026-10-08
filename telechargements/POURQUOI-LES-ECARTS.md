# Pourquoi l'application et votre courtier n'affichent pas le même chiffre

*Document établi à partir de vos quatre captures du 07/10/2026 (19h26 et 19h27–19h28).
Toutes les valeurs citées y sont reprises telles quelles.*

**En une phrase :** les deux ont raison. Ils ne parlent ni du même périmètre, ni du
même instant, et ils ne prennent pas leurs cours à la même source. Le 07/10, un
seul de ces écarts était un vrai défaut de l'application — la ligne de l'or ;
il est corrigé dans la version **1.7.3**.

---

## 1. Le tableau de vos captures

| Ce que vous lisez | Valeur affichée | Ce dont ça parle |
|---|---|---|
| Courtier — compte 2787698 | 80 924,40 $ | Titres **76 030,30** + crypto **4 786,22** + espèces **107,43** |
| Courtier — variation journalière | **−669,34 $ (−0,82 %)** | Depuis la **clôture de la veille** |
| Courtier — TWR YTD | 4,54 % | Sa propre série, ses propres flux |
| App — patrimoine total | 92 938,99 $ (82 982,71 €) | Investi **80 778** + précaution **12 150** + cash **10** |
| App — portefeuille investi | **80 778 $** → −0,60 % | Depuis le **dernier enregistrement** (81 267,52 $) |
| App — vos actifs, IGLN.L | **−0,70 %** | Variation **du jour** (source Yahoo) |
| Courtier — IGLN ×140 | **−1,35 %** | Variation **du jour** (source Swissquote) |

---

## 2. Le périmètre : deux totaux qui ne comptent pas la même chose

- Votre courtier ne montre **que le compte-titres** : 80 924,40 $, espèces
  comprises (les 106,57 $ de « pouvoir d'achat » sont une partie des espèces,
  pas un montant supplémentaire).
- L'application montre **tout ce que vous possédez** : le portefeuille investi
  (80 778 $, qui contient vos 4 786 $ de crypto), **plus** votre épargne de
  précaution (12 150 $ — le compte en CHF, 8 694,44 CHF) **plus** votre cash
  disponible (10 $).

Le bon rapprochement est donc :

| | Application | Courtier | Écart |
|---|---|---|---|
| Titres + crypto | 80 778 $ | 76 030,30 + 4 786,22 = **80 816,52 $** | **≈ 38 $ (0,05 %)** |

Ces 38 $ viennent de la source des cours (voir § 6) et de la minute à laquelle
chaque application a calculé. C'est le niveau d'écart normal, pas une erreur.

---

## 3. La « variation journalière » : même période, deux mesures

Les deux chiffres ne partent pas du même montant de départ :

| Point de départ | Valeur |
|---|---|
| L'application : dernier enregistrement du **07/10 à 02h58** | 81 267,52 $ (portefeuille investi) |
| Le courtier : clôture de la veille | 80 924,40 + 669,34 = **81 593,74 $** (tout le compte) |

Ces deux repères correspondent au **même instant de marché** : l'enregistrement
du 07/10 a été écrit à 02h58 du matin, donc il contient les **cours de clôture du
06/10** — exactement ce que votre courtier appelle « la veille ». Mais les deux
montants diffèrent de **≈ 0,3 %**, parce que chacun valorise le portefeuille avec
ses propres cours (voir § 6).

Résultat : le même mouvement de marché donne **−0,60 %** côté application et
**−0,82 %** côté courtier. Le **signe** et l'**ordre de grandeur** concordent
maintenant ; c'est la mesure de départ qui diffère de quelques dixièmes de point.
Le 06/10, c'était le signe lui-même qui était faux (+2,85 % au lieu de −0,38 %).

**Ce que la 1.7.3 ajoute pour lever le doute :** la tuile affiche la date **et
l'heure** du repère (« depuis le dernier enregistrement du 07/10/2026 à 2h58 »),
et la page Performance affiche la **valeur** du repère (« repère de départ
81 268 $ enregistré le 07/10/2026 à 2h58 »). Vous pouvez donc comparer les deux
montants de départ directement.

---

## 4. La ligne de l'or (IGLN) : c'était le vrai défaut — corrigé en 1.7.3

L'application affichait **−0,70 %** quand votre courtier affichait **−1,35 %**.

**La cause, dans le code :** pour trois de vos lignes — **IGLN.L, XDW0.L et
FLXC.L** — Yahoo renvoie une dernière ligne de cotation **sans cours**. Le
programme retirait cette ligne vide, puis comparait « la dernière clôture
connue » à « celle d'avant » : il affichait donc la variation de **la veille**,
et valorisait la ligne avec un cours **d'un jour en retard**. Le courtier, lui,
compare le cours du moment à la clôture précédente.

**Le correctif :** l'application lit désormais la **cotation du moment** et la
**clôture précédente** que Yahoo publie à côté de la série — exactement les deux
chiffres qu'utilise votre courtier — et retombe sur l'ancien calcul seulement si
Yahoo ne les fournit pas. En plus, quand elle ne dispose que d'une clôture plus
ancienne, la fiche de l'actif l'écrit en clair : « **clôture du 06/10** ».

---

## 5. Les deux pages de l'application entre elles

+48,98 % (Tableau de bord) contre +49,01 % (Performance), et 80 778 $ contre
80 795 $ : ce ne sont pas deux calculs différents, ce sont **deux instants
d'actualisation** — 18h33 pour la page Performance, 19h28 pour le tableau de
bord. Chaque page affiche son heure en haut, à côté de « SYNCHRONISÉ ».

Pour que toutes les pages parlent du même instant : **tirez l'écran vers le bas**
(ou touchez l'icône ⟳), puis passez d'une page à l'autre sans attendre.

---

## 6. Ce qui restera toujours différent (et pourquoi c'est normal)

1. **La source des cours.** L'application utilise **Yahoo Finance** (gratuit,
   différé d'environ 15 minutes, parfois plus sur les places européennes).
   Votre courtier utilise son propre flux, en temps réel. Sur une journée calme,
   l'écart est de quelques centièmes de point ; quand le marché bouge après la
   clôture de Londres — précisément le cas du 07/10 —, il peut atteindre
   quelques dixièmes.
2. **Le périmètre.** L'application ajoute votre épargne de précaution et votre
   cash ; le courtier ne montre que le compte-titres.
3. **L'instant du calcul.** L'application calcule quand vous ouvrez l'écran, le
   courtier quand vous le regardez. À une minute d'intervalle, deux images
   diffèrent légèrement.
4. **La progression annuelle.** +3,85 % (application) contre 4,54 % TWR
   (courtier) : même genre de calcul (rendement pondéré par le temps), mais deux
   séries de valeurs différentes. L'application part de son enregistrement du
   31/12/2025 et reconstruit les apports depuis la colonne « capital investi » ;
   le courtier part de sa propre évaluation et de son propre journal de
   mouvements. Un écart de quelques dixièmes de point est attendu. Si vous voulez
   vérifier ce point précisément, une capture de votre courtier au 31/12/2025
   suffira.

---

## 7. Une anomalie de dates à connaître (rien n'est perdu, rien n'est faux)

Le robot de nuit est prévu à **23h35 (heure de Paris)**. GitHub décale parfois le
démarrage des tâches planifiées de deux à trois heures : la nuit du 06 au 07/10,
il a tourné à **02h58**. Or il date son enregistrement du **jour où il tourne** :

- la ligne datée **07/10** contient donc les cours de clôture du **06/10** ;
- la ligne datée **06/10** contient ceux du **05/10**, et ainsi de suite.

Deux conséquences :

- **Pour votre comparaison avec le courtier, c'est une bonne nouvelle** : le
  repère de l'application et la « variation journalière » du courtier portent
  bien sur la **même période** (la dernière clôture).
- **Les étiquettes, elles, sont décalées d'un jour** : « du 07/10 » veut dire
  « écrit le 07/10 », pas « clôture du 07/10 ». La 1.7.3 affiche donc l'heure,
  pour que le repère soit sans ambiguïté.

Si vous souhaitez que les enregistrements portent la date du **jour de marché**
(la date de la clôture qu'ils contiennent, ce qui est plus juste), dites-le-moi :
je préparerai la modification **sans rien effacer** — mais il faudra décider
ensemble comment traiter les lignes déjà décalées, car la date est unique dans la
table. Tant que vous ne le demandez pas, **je ne touche à aucune donnée**.

---

## 8. Ce que change la version 1.7.3 (à installer par-dessus la 1.7.2)

1. La ligne d'un actif affiche la **variation du jour**, comme votre courtier
   (cotation du moment contre clôture précédente), et non plus celle de la veille.
2. La valeur de la ligne est la **cotation du moment**, plus la dernière clôture
   disponible dans la série.
3. Quand seule une clôture plus ancienne est connue, la fiche l'annonce :
   « clôture du 06/10 ».
4. Les tuiles de patrimoine affichent la **date et l'heure** du repère, et la
   page Performance affiche la **valeur** du repère pour la progression
   journalière.

Tout le reste (le correctif du 07/10 sur le repère d'enregistrement, les retraits
signés, les achats/ventes comptés comme transferts internes) est inchangé.

---

## 9. Ce que corrige la 1.7.6 — et pourquoi la 1.7.3→1.7.5 écartait du courtier

Le correctif décrit au § 4 contenait une erreur. Pour trouver « la clôture de la
veille », il lisait le champ `chartPreviousClose` que Yahoo place à côté de la
série. Or ce champ ne veut pas dire « clôture de la veille » : c'est la clôture
**d'avant la première bougie de la fenêtre demandée**. L'application demande
5 séances — ce champ pointait donc sur **il y a environ 6 séances**, pas sur la
veille. Résultat : la ligne affichait une variation **sur une semaine**, présentée
comme « variation du jour ». Comparée au courtier (qui, lui, compare bien le cours
du moment à la clôture de la veille), elle paraissait fausse — c'était le cas.

La 1.7.6 prend la clôture de la veille **dans la série elle-même** : la dernière
clôture antérieure à la séance du cours. Série à jour → exactement la veille,
comme le courtier ; série en retard (IGLN.L, XDW0.L, FLXC.L) → la dernière
clôture connue, qui est la bonne base. Le cours affiché reste la cotation du
moment, inchangée.

Côté Streamlit et robot nocturne (Python), la même idée vaut pour l'**ajustement
des dividendes** : les versions récentes de la bibliothèque Yahoo ajustent les
clôtures historiques comme si les dividendes étaient réinvestis. Un cours daté
redescendait alors de tous les dividendes détachés depuis, et ne correspondait
plus au cours du courtier. Les appels passent désormais `auto_adjust=False` :
les cours sont les cours réellement cotés.

