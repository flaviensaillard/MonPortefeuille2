package com.portefeuille.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import android.util.Base64;
import java.util.Locale;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Pont natif : réseau, retours haptiques, partage.
 *
 * Pourquoi le réseau passe par Java : un WebView chargé depuis file:// a une
 * origine « null ». Beaucoup d'API (Yahoo, PostgREST) refusent ou compliquent
 * les requêtes cross-origin dans ce cas. En appelant HttpURLConnection depuis
 * Java, l'application parle au réseau comme n'importe quel client Android :
 * pas de CORS, pas de préflight, et le même code sert pour Supabase et Yahoo.
 */
public class NativeBridge {

    /** Permet de renvoyer un résultat asynchrone dans la page. */
    public interface JsRunner {
        void eval(String js);
    }

    private static final String TAG = "Porte-feuille";
    private static final int TIMEOUT_MS = 25000;
    private static final String UA =
            "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) "
                    + "Chrome/122.0.0.0 Mobile Safari/537.36";

    /* DURCISSEMENT 2.1.0 (revue S-03) : le pont n'ouvre QUE des URL HTTPS
       vers cette liste d'hôtes. Une entrée commençant par « . » autorise le
       domaine et ses sous-domaines. Le projet Supabase du porteur est toujours
       un sous-domaine de supabase.co ; les cours viennent de Yahoo Finance ;
       l'inflation de l'INSEE ; le service IA du porteur, s'il en configure un,
       vit sur un worker Cloudflare (.workers.dev). Toute autre destination est
       refusée, même si le JavaScript la demande. */
    private static final String[] HOTES_AUTORISES = {
            ".supabase.co",
            "query1.finance.yahoo.com",
            "query2.finance.yahoo.com",
            "api.insee.fr",
            ".workers.dev"
    };

    /* Méthodes que le pont accepte : celles utilisées par l'application,
       rien d'autre. */
    private static final String[] METHODES_AUTORISEES = {"GET", "POST", "PATCH", "DELETE"};

    static boolean hoteAutorise(String url) {
        try {
            URL u = new URL(url);
            if (!"https".equalsIgnoreCase(u.getProtocol())) return false;
            String h = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.US);
            if (h.isEmpty()) return false;
            for (String a : HOTES_AUTORISES) {
                if (a.startsWith(".")) {
                    if (h.endsWith(a) || h.equals(a.substring(1))) return true;
                } else if (h.equals(a)) {
                    return true;
                }
            }
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    static boolean methodeAutorisee(String m) {
        if (m == null) return false;
        for (String a : METHODES_AUTORISEES) if (a.equals(m)) return true;
        return false;
    }

    private final Activity activity;
    private final JsRunner js;
    private final java.util.concurrent.ExecutorService pool =
            java.util.concurrent.Executors.newFixedThreadPool(4);

    NativeBridge(Activity activity, JsRunner js) {
        this.activity = activity;
        this.js = js;
    }

    /**
     * Requête HTTP bloquante. Retourne {"ok":true,"status":200,"body":"..."} ou
     * {"ok":false,"status":-1,"error":"..."}. Appelée depuis le thread JavaBridge :
     * elle peut donc bloquer sans geler l'interface.
     */
    /**
     * Même requête, en tâche de fond. Le résultat est renvoyé dans la page par
     * `PF.net._fin(id, json)` ; le corps est encodé en Base64 pour traverser
     * `evaluateJavascript` sans échappement hasardeux.
     */
    @JavascriptInterface
    public void httpAsync(final String method, final String url, final String headersJson,
                          final String body, final String callbackId) {
        pool.execute(new Runnable() {
            @Override
            public void run() {
                JSONObject res = executer(method, url, headersJson, body);
                String payload = res.optString("body", "");
                res.remove("body");
                try {
                    res.put("body_b64", Base64.encodeToString(
                            payload.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP));
                } catch (Exception ignore) {
                    try {
                        res.put("body_b64", "");
                    } catch (Exception ignore2) {
                        // rien de plus à tenter
                    }
                }
                final String jsAppel = "PF.net._fin('" + callbackId + "', " + res.toString() + ")";
                if (js != null) {
                    js.eval(jsAppel);
                }
            }
        });
    }

    @JavascriptInterface
    public String http(String method, String url, String headersJson, String body) {
        return executer(method, url, headersJson, body).toString();
    }

    private JSONObject executer(String method, String url, String headersJson, String body) {
        // DURCISSEMENT 2.1.0 (revue S-03) : aucune requête ne part si la
        // destination n'est pas HTTPS vers un hôte de l'allowlist, ou si la
        // méthode n'est pas l'une des quatre attendues. Le pont n'est plus un
        // proxy ouvert : un script injecté ne peut plus faire requêter par
        // l'appareil un hôte arbitraire.
        String m = method == null ? "GET" : method.toUpperCase(Locale.US);
        if (!methodeAutorisee(m)) {
            return erreur("Méthode HTTP non autorisée : " + m);
        }
        if (!hoteAutorise(url)) {
            return erreur("Hôte non autorisé (HTTPS requis, allowlist) : " + url);
        }

        HttpURLConnection conn = null;
        try {
            URL u = new URL(url);
            conn = (HttpURLConnection) u.openConnection();
            conn.setRequestMethod(m);
            conn.setConnectTimeout(TIMEOUT_MS);
            conn.setReadTimeout(TIMEOUT_MS);
            // Pas de suivi de redirection : un hôte autorisé ne doit pas
            // pouvoir renvoyer l'appareil vers une destination hors allowlist.
            conn.setInstanceFollowRedirects(false);
            conn.setRequestProperty("User-Agent", UA);
            conn.setRequestProperty("Accept", "application/json, text/plain, */*");

            if (headersJson != null && !headersJson.isEmpty() && !headersJson.equals("null")) {
                JSONObject h = new JSONObject(headersJson);
                java.util.Iterator<String> it = h.keys();
                while (it.hasNext()) {
                    String k = it.next();
                    // En-têtes validés : nom de jeton HTTP simple, valeur sans
                    // retour à la ligne (pas d'injection d'en-tête).
                    if (k == null || !k.matches("[A-Za-z0-9!#$%&'*+.^_`|-]+")) continue;
                    String v = h.optString(k, "");
                    if (v.indexOf('\r') >= 0 || v.indexOf('\n') >= 0) continue;
                    conn.setRequestProperty(k, v);
                }
            }

            if (body != null && !body.isEmpty() && !body.equals("null")) {
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json");
                byte[] out = body.getBytes(StandardCharsets.UTF_8);
                conn.setFixedLengthStreamingMode(out.length);
                OutputStream os = conn.getOutputStream();
                os.write(out);
                os.flush();
                os.close();
            }

            int status = conn.getResponseCode();
            InputStream is = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
            String payload = is == null ? "" : readAll(is);
            JSONObject res = new JSONObject();
            res.put("ok", status >= 200 && status < 300);
            res.put("status", status);
            res.put("body", payload);
            return res;
        } catch (Exception e) {
            Log.w(TAG, "HTTP " + method + " " + url + " : " + e.getMessage());
            try {
                JSONObject res = new JSONObject();
                res.put("ok", false);
                res.put("status", -1);
                res.put("error", String.valueOf(e.getMessage()));
                res.put("body", "");
                return res;
            } catch (Exception e2) {
                JSONObject vide = new JSONObject();
                try {
                    vide.put("ok", false);
                    vide.put("status", -1);
                    vide.put("body", "");
                } catch (Exception ignore) {
                    // objet vide en dernier recours
                }
                return vide;
            }
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    /* Réponse d'erreur uniforme (destination refusée, méthode refusée, etc.). */
    private static JSONObject erreur(String message) {
        JSONObject res = new JSONObject();
        try {
            res.put("ok", false);
            res.put("status", -1);
            res.put("error", message);
            res.put("body", "");
        } catch (Exception ignore) {
            // ne peut pas arriver sur un JSONObject neuf
        }
        return res;
    }


    /* ------------------------------------------------------------------ INSEE
       L'inflation doit être trouvée par l'application, pas saisie à la main.
       On télécharge le jeu Mélodi de l'IPC (sans clé), on en extrait la série
       « ensemble des ménages » et on renvoie une inflation par année civile,
       calculée en glissement décembre/décembre. Le ZIP fait 4 Mo et le CSV
       40 Mo : le travail se fait donc ici, en Java, et seul le résultat —
       quelques octets — remonte vers la page.
       ------------------------------------------------------------------- */

    private static final String URL_INSEE_IPC =
            "https://api.insee.fr/melodi/file/DS_IPC_PRINC/DS_IPC_PRINC_CSV_FR";

    @JavascriptInterface
    public void telechargerInflationInsee(final String callbackId) {
        pool.execute(new Runnable() {
            @Override
            public void run() {
                JSONObject out = new JSONObject();
                JSONArray annees = new JSONArray();
                try {
                    byte[] zip = telechargerBinaire(URL_INSEE_IPC);
                    Map<String, Double> parMois = extraireIpc(zip);
                    LinkedHashMap<String, Double> triee = new LinkedHashMap<>();
                    List<String> cles = new ArrayList<>(parMois.keySet());
                    Collections.sort(cles);
                    for (String c : cles) triee.put(c, parMois.get(c));

                    /* Inflation annuelle = moyenne des douze indices de
                       l'année divisée par celle de l'année précédente : c'est
                       la définition de l'INSEE, et c'est celle que retient
                       l'application Streamlit. Vérifié sur le jeu Mélodi :
                       2022 → 5,22 %, 2023 → 4,88 %, 2024 → 2,00 %,
                       2025 → 0,94 %. Le glissement décembre/décembre donne
                       d'autres chiffres (5,84 % en 2022) : ce n'est pas la
                       même mesure, et les mélanger dans une même table
                       fausserait les deux applications.

                       Une année incomplète est écartée : on ne publie pas une
                       moyenne calculée sur huit mois comme si elle portait sur
                       douze. */
                    TreeMap<String, double[]> parAn = new TreeMap<String, double[]>();
                    for (Map.Entry<String, Double> e : triee.entrySet()) {
                        String periode = e.getKey();
                        if (periode.length() < 7) continue;
                        String an = periode.substring(0, 4);
                        double[] cumul = parAn.get(an);
                        if (cumul == null) { cumul = new double[] { 0.0, 0.0 }; parAn.put(an, cumul); }
                        cumul[0] += e.getValue();
                        cumul[1] += 1.0;
                    }

                    Double moyennePrecedente = null;
                    for (Map.Entry<String, double[]> e : parAn.entrySet()) {
                        double[] cumul = e.getValue();
                        if (cumul[1] < 12) { moyennePrecedente = null; continue; }  // année en cours
                        double moyenne = cumul[0] / cumul[1];
                        if (moyennePrecedente != null && moyennePrecedente > 0) {
                            double taux = moyenne / moyennePrecedente - 1.0;
                            /* Garde-fou : en France, depuis 1996, une inflation
                               annuelle n'a jamais dépassé 6 % ni été inférieure
                               à −1 %. Toute valeur hors de cette plage signale
                               un indice ou un cumul pris pour un taux — on
                               écarte la ligne plutôt que d'écrire 94 % dans une
                               table que Streamlit lit aussi. */
                            if (taux <= 0.15 && taux >= -0.02) {
                                JSONObject o = new JSONObject();
                                o.put("annee", Integer.parseInt(e.getKey()));
                                /* La table stocke un POURCENTAGE (1,7 pour
                                   1,7 %) : c'est la convention de la v2, qui
                                   divise par 100 à la lecture. Les deux
                                   applications partagent la table, l'unité
                                   doit donc être la même. */
                                o.put("inflation", Math.round(taux * 10000.0) / 100.0);
                                annees.put(o);
                            }
                        }
                        moyennePrecedente = moyenne;
                    }
                    out.put("ok", annees.length() > 0);
                    if (annees.length() == 0) {
                        /* Dire POURQUOI, au lieu du message fourre-tout « source
                           injoignable » : ici le fichier est bien arrivé, c'est
                           la lecture qui n'a rien donné. */
                        out.put("erreur", "fichier reçu (" + zip.length
                                + " octets, série " + parMois.size()
                                + " mois) mais aucune année lisible");
                    }
                } catch (Exception e) {
                    Log.w(TAG, "INSEE : " + e.getMessage());
                    try {
                        out.put("ok", false);
                        out.put("erreur", String.valueOf(e.getMessage()));
                    } catch (Exception ignore) {
                    }
                }
                try {
                    out.put("annees", annees);
                } catch (Exception ignore) {
                }
                if (js != null) {
                    js.eval("PF.app.retourInflation('" + callbackId + "', " + out.toString() + ")");
                }
            }
        });
    }

    private byte[] telechargerBinaire(String url) throws Exception {
        // Même garde-fou que le pont : HTTPS + allowlist (l'URL INSEE est une
        // constante, mais la vérification protège toute évolution future).
        if (!hoteAutorise(url)) {
            throw new SecurityException("Hôte non autorisé : " + url);
        }
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setInstanceFollowRedirects(false);
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(60000);
        conn.setRequestProperty("User-Agent", UA);
        try {
            int statut = conn.getResponseCode();
            if (statut >= 400) throw new Exception("HTTP " + statut);
            InputStream is = conn.getInputStream();
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] tampon = new byte[16384];
            int lu;
            while ((lu = is.read(tampon)) > 0) bos.write(tampon, 0, lu);
            is.close();
            return bos.toByteArray();
        } finally {
            conn.disconnect();
        }
    }

    /* Sélection de l'agrégat « ensemble des ménages » :
       IND_TYPE=IX, GEO=F, PRODUCT_GROUP=_Z, COICOP_2018=00, TPH_CPI=_T, FREQ=M,
       et la base de référence la plus récente (BASE_PER). */
    private Map<String, Double> extraireIpc(byte[] zip) throws Exception {
        Map<String, Double> brut = new LinkedHashMap<>();
        ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zip));
        ZipEntry entree;
        while ((entree = zis.getNextEntry()) != null) {
            String nom = entree.getName();
            if (!nom.endsWith(".csv") || !nom.contains("data")) {
                zis.closeEntry();
                continue;
            }
            BufferedReader lecteur = new BufferedReader(new InputStreamReader(zis, StandardCharsets.UTF_8));
            String ligne = lecteur.readLine();
            if (ligne == null) {
                zis.closeEntry();
                continue;
            }
            String[] entetes = ligne.split(";", -1);
            int iInd = index(entetes, "IND_TYPE"), iGeo = index(entetes, "GEO");
            int iProd = index(entetes, "PRODUCT_GROUP"), iCoicop = index(entetes, "COICOP_2018");
            int iTph = index(entetes, "TPH_CPI"), iFreq = index(entetes, "FREQ");
            int iTemps = index(entetes, "TIME_PERIOD");
            if (iTemps < 0) iTemps = index(entetes, "TIME");
            int iVal = index(entetes, "OBS_VALUE");
            if (iTemps < 0 || iVal < 0) {
                zis.closeEntry();
                continue;
            }
            String baseMax = "", base = "";
            List<String[]> lignesUtiles = new ArrayList<>();
            while ((ligne = lecteur.readLine()) != null) {
                String[] c = ligne.split(";", -1);
                /* Une ligne qui a moins de champs que l'en-tête n'est PAS une
                   ligne à jeter : certains fichiers INSEE terminent l'en-tête
                   par un « ; », ce qui lui donne un champ de plus qu'aux lignes
                   de données. L'ancien test les écartait TOUTES, l'import ne
                   trouvait aucune année, et l'application annonçait « source
                   injoignable » alors que le fichier était arrivé entier.
                   On complète la ligne par des champs vides : chaque colonne
                   garde ainsi sa position. */
                if (c.length < entetes.length) {
                    String[] complet = new String[entetes.length];
                    for (int k = 0; k < entetes.length; k++) {
                        complet[k] = k < c.length ? c[k] : "";
                    }
                    c = complet;
                }
                if (iInd >= 0 && !"IX".equals(nettoyer(c[iInd]))) continue;
                if (iGeo >= 0 && !"F".equals(nettoyer(c[iGeo]))) continue;
                if (iProd >= 0 && !"_Z".equals(nettoyer(c[iProd]))) continue;
                if (iCoicop >= 0 && !"00".equals(nettoyer(c[iCoicop]))) continue;
                if (iTph >= 0 && !"_T".equals(nettoyer(c[iTph]))) continue;
                if (iFreq >= 0 && !"M".equals(nettoyer(c[iFreq]))) continue;
                lignesUtiles.add(c);
            }
            int iBase = index(entetes, "BASE_PER");
            for (String[] c : lignesUtiles) {
                /* PIEGE QUI A TOUT BLOQUE (6 octobre 2026) : les valeurs du
                   fichier INSEE sont entre guillemets ("2025"). Cette ligne
                   gardait les guillemets, alors que le filtre trois lignes
                   plus bas compare la valeur NETTOYEE. « 2025 » n'est pas
                   égal à 2025 : aucune ligne n'était retenue, la série
                   sortait vide, et l'application annonçait « aucune année
                   lisible » alors que le fichier était parfaitement lisible.
                   On nettoie donc ici aussi. */
                if (iBase >= 0 && nettoyer(c[iBase]).compareTo(baseMax) > 0) {
                    baseMax = nettoyer(c[iBase]);
                }
            }
            for (String[] c : lignesUtiles) {
                if (iBase >= 0 && !nettoyer(c[iBase]).equals(baseMax)) continue;
                String periode = nettoyer(c[iTemps]);
                try {
                    double v = Double.parseDouble(nettoyer(c[iVal]).replace(',', '.'));
                    if (periode.length() >= 7 && v > 0) brut.put(periode, v);
                } catch (Exception ignore) {
                }
            }
            zis.closeEntry();
            break;
        }
        zis.close();
        return brut;
    }

    /* Les en-têtes du CSV INSEE sont entre guillemets ("IND_TYPE"), et les
       valeurs aussi pour la plupart. Sans ce nettoyage, aucune colonne n'est
       retrouvée et l'import ne renvoie rien — ce qui laisse croire que la base
       est vide alors qu'elle ne l'est pas. */
    private static String nettoyer(String s) {
        if (s == null) return "";
        String v = s.trim();
        if (v.length() >= 2 && v.charAt(0) == '"' && v.charAt(v.length() - 1) == '"') {
            v = v.substring(1, v.length() - 1).trim();
        }
        return v;
    }

    private static int index(String[] entetes, String nom) {
        for (int i = 0; i < entetes.length; i++) {
            if (nettoyer(entetes[i]).equalsIgnoreCase(nom)) return i;
        }
        return -1;
    }

    private static String readAll(InputStream is) throws Exception {
        BufferedReader r = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = r.readLine()) != null) {
            sb.append(line).append('\n');
        }
        r.close();
        return sb.toString();
    }

    @JavascriptInterface
    public boolean isOnline() {
        try {
            ConnectivityManager cm = (ConnectivityManager) activity.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            NetworkInfo ni = cm.getActiveNetworkInfo();
            return ni != null && ni.isConnected();
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public void haptic(int ms) {
        try {
            Vibrator v = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null) return;
            int d = Math.max(1, Math.min(ms <= 0 ? 12 : ms, 120));
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                v.vibrate(VibrationEffect.createOneShot(d, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                v.vibrate(d);
            }
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void toast(final String message) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(activity, message, Toast.LENGTH_SHORT).show();
            }
        });
    }

    @JavascriptInterface
    public void openExternal(String url) {
        // DURCISSEMENT 2.1.0 : uniquement des liens https vers le navigateur.
        // Les autres schémas (intent:, javascript:, file:, http:) sont refusés.
        if (url == null || !url.startsWith("https://")) {
            Log.w(TAG, "openExternal refusé (https uniquement) : " + url);
            return;
        }
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
        } catch (Exception e) {
            Log.w(TAG, "openExternal: " + e.getMessage());
        }
    }

    @JavascriptInterface
    public void share(String title, String text) {
        try {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("text/plain");
            i.putExtra(Intent.EXTRA_SUBJECT, title);
            i.putExtra(Intent.EXTRA_TEXT, text);
            activity.startActivity(Intent.createChooser(i, "Partager"));
        } catch (Exception e) {
            Log.w(TAG, "share: " + e.getMessage());
        }
    }

    /* =================================================================
       Connexion par empreinte digitale (2.1.1).

       Après une première connexion email/mot de passe, l'appareil peut
       rouvrir la session par empreinte. Le mot de passe n'est JAMAIS stocké,
       ni ici ni dans la page : cette porte ne manipule que les jetons de
       session Supabase.

       Les jetons sont scellés en AES-GCM sous une clé du Keystore Android
       (`AndroidKeyStore`) : la clé vit dans le composant matériel, n'est ni
       exportable ni lisible. L'ouverture passe par `BiometricPrompt`, liée à
       un CryptoObject (le déchiffrement n'a lieu qu'après la biométrie) ;
       le bouton « Utiliser le mot de passe » est le repli permanent.

       Limites assumées :
       - la clé n'exige pas une authentification par empreinte à CHAQUE
         opération crypto : le scellement silencieux des jetons rafraîchis en
         arrière-plan serait sinon impossible. La porte est applicative
         (toute ouverture passe par le prompt) et la clé reste matérielle ;
       - BiometricPrompt est l'API système (android.hardware.biometrics,
         Android 9+). Sous Android 8, l'empreinte est annoncée indisponible
         et le repli email/mot de passe s'applique ;
       - la biométrie elle-même ne se teste que sur appareil. */

    private static final String PREFS_EMPREINTE = "pf_empreinte";
    private static final String CLE_SESSION_CHIFFREE = "session_chiffree";
    private static final String CLE_KEYSTORE_EMPREINTE = "pf_empreinte_v1";

    private SharedPreferences prefsEmpreinte() {
        return activity.getSharedPreferences(PREFS_EMPREINTE, Context.MODE_PRIVATE);
    }

    /** Clé AES du Keystore Android : créée au premier scellement, jamais exportée. */
    private SecretKey cleEmpreinte(boolean creer) throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(CLE_KEYSTORE_EMPREINTE)) {
            KeyStore.Entry entree = ks.getEntry(CLE_KEYSTORE_EMPREINTE, null);
            if (entree instanceof KeyStore.SecretKeyEntry) {
                return ((KeyStore.SecretKeyEntry) entree).getSecretKey();
            }
        }
        if (!creer) return null;
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        kg.init(new KeyGenParameterSpec.Builder(CLE_KEYSTORE_EMPREINTE,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return kg.generateKey();
    }

    /** Scellement silencieux : chiffre et garde la session (jetons seuls). */
    private boolean scellerSession(String sessionJson) {
        try {
            SecretKey cle = cleEmpreinte(true);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, cle);
            byte[] iv = c.getIV();
            byte[] chiffre = c.doFinal(sessionJson.getBytes(StandardCharsets.UTF_8));
            String blob = Base64.encodeToString(iv, Base64.NO_WRAP) + ":"
                    + Base64.encodeToString(chiffre, Base64.NO_WRAP);
            prefsEmpreinte().edit().putString(CLE_SESSION_CHIFFREE, blob).apply();
            return true;
        } catch (Exception e) {
            Log.w(TAG, "Scellement des jetons impossible : " + e.getMessage());
            return false;
        }
    }

    @JavascriptInterface
    public boolean empreinteMajSession(String sessionJson) {
        return sessionJson != null && scellerSession(sessionJson);
    }

    @JavascriptInterface
    public boolean empreinteEffacer() {
        prefsEmpreinte().edit().remove(CLE_SESSION_CHIFFREE).apply();
        return true;
    }

    @JavascriptInterface
    public boolean empreinteSessionGardee() {
        String blob = prefsEmpreinte().getString(CLE_SESSION_CHIFFREE, "");
        return blob != null && !blob.isEmpty();
    }

    @SuppressWarnings("deprecation")
    private boolean empreinteDisponible() {
        // BiometricPrompt : Android 9 (API 28). Avant, indisponible — repli
        // email/mot de passe, jamais une biométrie de fortune.
        if (android.os.Build.VERSION.SDK_INT < 28) return false;
        try {
            if (android.os.Build.VERSION.SDK_INT >= 29) {
                android.hardware.biometrics.BiometricManager bm =
                        (android.hardware.biometrics.BiometricManager)
                                activity.getSystemService(Context.BIOMETRIC_SERVICE);
                return bm != null && bm.canAuthenticate()
                        == android.hardware.biometrics.BiometricManager.BIOMETRIC_SUCCESS;
            }
            android.hardware.fingerprint.FingerprintManager fm = activity.getSystemService(
                    android.hardware.fingerprint.FingerprintManager.class);
            return fm != null && fm.isHardwareDetected() && fm.hasEnrolledFingerprints();
        } catch (Throwable t) {
            return false;
        }
    }

    @JavascriptInterface
    public String empreinteEtat() {
        try {
            JSONObject o = new JSONObject();
            o.put("dispo", empreinteDisponible());
            o.put("sessionGardee", empreinteSessionGardee());
            return o.toString();
        } catch (Exception e) {
            return "{\"dispo\":false,\"sessionGardee\":false}";
        }
    }

    @JavascriptInterface
    public void empreinteActiver(String sessionJson, String callbackId) {
        demanderEmpreinte(callbackId, sessionJson,
                "Activer la connexion par empreinte",
                "Confirmez votre identité pour sceller vos jetons de session");
    }

    @JavascriptInterface
    public void empreinteOuvrir(String callbackId) {
        demanderEmpreinte(callbackId, null,
                "Porte-feuille verrouillé",
                "Confirmez votre identité pour rouvrir votre session");
    }

    /** Demande biométrique liée au chiffrement. Résultat : PF.biometrie._fin(id, r). */
    private void demanderEmpreinte(final String callbackId, final String sessionJson,
                                   final String titre, final String sousTitre) {
        if (android.os.Build.VERSION.SDK_INT < 28) {
            retourEmpreinte(callbackId, erreurEmpreinte("indispo",
                    "BiometricPrompt absent (Android 9 requis)"));
            return;
        }
        if (!empreinteDisponible()) {
            retourEmpreinte(callbackId, erreurEmpreinte("indispo",
                    "Aucune empreinte configurée sur cet appareil"));
            return;
        }
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    final Cipher chiffre;
                    if (sessionJson != null) {
                        chiffre = Cipher.getInstance("AES/GCM/NoPadding");
                        chiffre.init(Cipher.ENCRYPT_MODE, cleEmpreinte(true));
                    } else {
                        String blob = prefsEmpreinte().getString(CLE_SESSION_CHIFFREE, "");
                        if (blob == null || blob.indexOf(':') <= 0) {
                            retourEmpreinte(callbackId, erreurEmpreinte("sans_session",
                                    "Aucun jeton chiffré gardé"));
                            return;
                        }
                        byte[] iv = Base64.decode(blob.split(":", 2)[0], Base64.NO_WRAP);
                        chiffre = Cipher.getInstance("AES/GCM/NoPadding");
                        chiffre.init(Cipher.DECRYPT_MODE, cleEmpreinte(false),
                                new GCMParameterSpec(128, iv));
                    }

                    android.hardware.biometrics.BiometricPrompt.Builder constructeur =
                            new android.hardware.biometrics.BiometricPrompt.Builder(activity);
                    constructeur.setTitle(titre).setSubtitle(sousTitre);
                    constructeur.setNegativeButton("Utiliser le mot de passe", pool,
                            new DialogInterface.OnClickListener() {
                                @Override
                                public void onClick(DialogInterface dialog, int which) {
                                    retourEmpreinte(callbackId,
                                            erreurEmpreinte("repli", "Repli demandé : mot de passe"));
                                }
                            });
                    android.hardware.biometrics.BiometricPrompt prompt = constructeur.build();

                    prompt.authenticate(
                            new android.hardware.biometrics.BiometricPrompt.CryptoObject(chiffre),
                            new android.os.CancellationSignal(), pool,
                            new android.hardware.biometrics.BiometricPrompt.AuthenticationCallback() {
                                @Override
                                public void onAuthenticationSucceeded(
                                        android.hardware.biometrics.BiometricPrompt.AuthenticationResult resultat) {
                                    try {
                                        if (sessionJson != null) {
                                            byte[] chiffree = chiffre.doFinal(
                                                    sessionJson.getBytes(StandardCharsets.UTF_8));
                                            String blob = Base64.encodeToString(chiffre.getIV(), Base64.NO_WRAP)
                                                    + ":" + Base64.encodeToString(chiffree, Base64.NO_WRAP);
                                            prefsEmpreinte().edit().putString(CLE_SESSION_CHIFFREE, blob).apply();
                                            retourEmpreinte(callbackId, "{\"ok\":true}");
                                        } else {
                                            String blob = prefsEmpreinte().getString(CLE_SESSION_CHIFFREE, "");
                                            byte[] clair = chiffre.doFinal(
                                                    Base64.decode(blob.split(":", 2)[1], Base64.NO_WRAP));
                                            JSONObject res = new JSONObject();
                                            res.put("ok", true);
                                            res.put("session", new JSONObject(
                                                    new String(clair, StandardCharsets.UTF_8)));
                                            retourEmpreinte(callbackId, res.toString());
                                        }
                                    } catch (Exception e) {
                                        Log.w(TAG, "Jetons illisibles après biométrie : " + e.getMessage());
                                        retourEmpreinte(callbackId,
                                                erreurEmpreinte("echec", "Jetons illisibles"));
                                    }
                                }

                                @Override
                                public void onAuthenticationError(int code, CharSequence message) {
                                    boolean annulation =
                                            code == android.hardware.biometrics.BiometricPrompt.ERROR_USER_CANCELED
                                            || code == android.hardware.biometrics.BiometricPrompt.ERROR_CANCELED;
                                    retourEmpreinte(callbackId, erreurEmpreinte(
                                            annulation ? "annule" : "echec", String.valueOf(message)));
                                }

                                // onAuthenticationFailed : doigt inconnu — le prompt reste
                                // ouvert, on ne rend rien, l'utilisateur peut réessayer.
                            });
                } catch (Exception e) {
                    Log.w(TAG, "Demande biométrique impossible : " + e.getMessage());
                    retourEmpreinte(callbackId,
                            erreurEmpreinte("echec", String.valueOf(e.getMessage())));
                }
            }
        });
    }

    private static String erreurEmpreinte(String code, String message) {
        try {
            JSONObject o = new JSONObject();
            o.put("ok", false);
            o.put("code", code);
            o.put("message", message);
            return o.toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"code\":\"echec\"}";
        }
    }

    private void retourEmpreinte(String callbackId, String json) {
        if (js != null) {
            js.eval("PF.biometrie._fin('" + callbackId + "', " + json + ")");
        }
    }

    @JavascriptInterface
    public int versionCode() {
        return 1;
    }

    @JavascriptInterface
    public String versionName() {
        try {
            return activity.getPackageManager()
                    .getPackageInfo(activity.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "1.0.0";
        }
    }
}
