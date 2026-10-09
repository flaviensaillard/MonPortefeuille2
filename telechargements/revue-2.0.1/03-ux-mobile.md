# 03 — Rapport UX mobile : Android et WebView

**Version examinée :** 2.0.1 · HEAD `7be0e11` · 09/10/2026. Inspection statique de l’interface WebView et de ses flux. Aucune mesure instrumentée sur un parc réel n’a été effectuée.

## U-01 — Le zoom utilisateur est désactivé à deux niveaux

**Sévérité : MINEUR · Effort : S**

**Preuve / scénario :** `app/src/main/assets/www/index.html:5` fixe `maximum-scale=1` et `user-scalable=no`. `app/src/main/java/com/portefeuille/app/MainActivity.java:70-72` désactive aussi le zoom intégré WebView. Un utilisateur malvoyant ou un écran à faible densité ne peut donc pas agrandir l’interface avec le geste système.

**Correctif proposé :** supprimer les limites de zoom, permettre le zoom/pinch ou proposer une taille de texte accessible; vérifier les feuilles, tableaux fiscaux, dialogues et navigation à 200 % avec TalkBack et des tailles d’écran étroites. Effort S.

## U-02 — L’affichage hors ligne peut réutiliser des chiffres sans date de fraîcheur

**Sévérité : MINEUR · Effort : S**

**Preuve / scénario :** au démarrage `app/src/main/assets/www/js/app.js:64-70` réhydrate un cache local puis tente un rafraîchissement. Après un chargement réussi, seule une sélection de données est conservée (`:275-285`) et `store.js:119-127` l’écrit sans timestamp de synchronisation ni statut de complétude. Si le réseau tombe ensuite, l’échec est signalé par un toast (`app.js:266-270`), mais les données déjà rendues ne portent pas un bandeau persistant « valeurs mises en cache — date X ».

**Correctif proposé :** mémoriser `synced_at`, la provenance et les parties manquantes; afficher un bandeau hors ligne/stale persistant. Ne jamais présenter une donnée de cache comme une cotation du jour. Une file d’écritures hors ligne ne devrait être ajoutée qu’avec idempotence et résolution de conflits. Effort S; file d’attente M.

## U-03 — Pas de saisie/écriture transactionnelle hors réseau

**Sévérité : MINEUR · Effort : M**

**Preuve / scénario :** la WebView passe les requêtes au réseau natif (`NativeBridge.java:81-124`). Les écritures d’écran traitent l’échec par message/toast; l’application n’a pas de journal local en attente ni de resynchronisation différée dans `app.js:904-911` et `:1048-1062`. Sur mobile en transport ou réseau intermittent, il faut recommencer la saisie et l’utilisateur ne peut pas continuer hors ligne.

**Correctif proposé :** conserver le comportement actuel explicitement « en ligne seulement » avec état de connexion et brouillon préservé; si une file locale est retenue, numéroter chaque commande, la rendre idempotente côté serveur et afficher les conflits sans double écriture. Effort M.

## U-04 — L’architecture hybride permet une UX différente pour une même simulation

**Sévérité : MINEUR · Effort : M**

**Preuve / scénario :** Android et Streamlit ont des formulaires et paramètres séparés. Les défauts de salaires/intérêts Android sont nuls (`app/src/main/assets/www/js/store.js:19-31`), tandis que Streamlit utilise des valeurs préremplies (`pages/4_Fiscalite.py:165-167`). Le scénario retraite Android explique le repli 5 % (`views.js:985-990,1256-1260`), contrairement à la page Streamlit (`pages/3_Retraite.py:76-77,104-107`).

**Correctif proposé :** états « donnée à confirmer » communs, libellés de source/fraîcheur et tests de parité UX sur les écrans d’onboarding, fiscalité, performance et retraite. Effort M.

## Ce qui n’a pas été observé

La navigation Android dispose de libellés visibles et la mise en page réserve une barre inférieure; aucune affirmation de défaut systématique de boutons trop petits n’est faite sans mesures réelles. `test_rendu.js` n’a pas été lancé faute de `jsdom` et ne fait pas partie des trois suites JS requises. La revue n’a pas simulé TalkBack, VoiceOver, rotations ou coupures réseau sur un appareil physique.
