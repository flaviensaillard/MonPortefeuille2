package com.portefeuille.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.view.animation.AlphaAnimation;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/**
 * Coque Android de Porte-feuille.
 *
 * Toute l'application (logique métier + interface) vit dans les assets, sous
 * forme de page locale. La coque ne fait que quatre choses, mais elle les fait
 * nativement : afficher en plein écran, donner accès au réseau sans CORS,
 * gérer le bouton retour, et habiller les barres système.
 */
public class MainActivity extends Activity implements NativeBridge.JsRunner {

    private static final String TAG = "Porte-feuille";
    private static final String PAGE = "file:///android_asset/www/index.html";

    private WebView webView;
    private NativeBridge pont;
    private View splash;
    private boolean backPressedOnce = false;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 28) {
            w.getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
        }
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);

        setContentView(R.layout.activity_main);
        splash = findViewById(R.id.splash);
        webView = findViewById(R.id.webview);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        // DURCISSEMENT 2.1.0 (revue S-03) : la page locale vit dans les assets
        // (chargeables même avec l'accès fichier coupé) ; aucun autre fichier,
        // aucun contenu, aucune origine croisée depuis file:// ne doit être
        // accessible. Un script injecté ne pourrait plus ni lire le système de
        // fichiers, ni requêter d'autres origines au nom de la page.
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setLoadWithOverviewMode(false);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setLayoutAlgorithm(WebSettings.LayoutAlgorithm.NORMAL);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        // Safe Browsing reste ACTIF (il était désactivé avant la 2.1.0).

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url != null && url.startsWith("file:///android_asset/")) {
                    return false;
                }
                // DURCISSEMENT 2.1.0 : seule la sortie https vers un vrai
                // navigateur est permise ; http et les autres schémas sont
                // bloqués ici.
                if (url != null && url.startsWith("https://")) {
                    if (pont != null) pont.openExternal(url);
                    return true;
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                hideSplash();
            }
        });
        webView.setWebChromeClient(new WebChromeClient());
        webView.setBackgroundColor(Color.parseColor("#0B0F17"));
        pont = new NativeBridge(this, this);
        webView.addJavascriptInterface(pont, "Native");
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        if (savedInstanceState == null) {
            webView.loadUrl(PAGE);
        }

        // Sécurité : si la page met plus de 6 s, on l'affiche quand même.
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                hideSplash();
            }
        }, 6000);
    }

    private void hideSplash() {
        if (splash == null || splash.getVisibility() != View.VISIBLE) return;
        AlphaAnimation fade = new AlphaAnimation(1f, 0f);
        fade.setDuration(320);
        splash.startAnimation(fade);
        splash.setVisibility(View.GONE);
    }

    @Override
    public void eval(final String js) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (webView != null) {
                    try {
                        webView.evaluateJavascript(js, null);
                    } catch (Exception ignored) {
                    }
                }
            }
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    protected void onRestoreInstanceState(Bundle savedInstanceState) {
        super.onRestoreInstanceState(savedInstanceState);
        if (webView != null) webView.restoreState(savedInstanceState);
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript(
                "(function(){try{return (typeof App!=='undefined' && App.onBack) ? String(App.onBack()) : 'false';}catch(e){return 'false';}})()",
                value -> {
                    boolean handled = value != null && value.contains("true");
                    if (handled) {
                        backPressedOnce = false;
                        return;
                    }
                    if (backPressedOnce) {
                        finishAffinity();
                        return;
                    }
                    backPressedOnce = true;
                    Toast.makeText(MainActivity.this, "Appuyez encore pour quitter", Toast.LENGTH_SHORT).show();
                    handler.postDelayed(() -> backPressedOnce = false, 2000);
                });
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            try {
                webView.evaluateJavascript("try{App.onPause&&App.onPause()}catch(e){}", null);
            } catch (Exception ignored) {
            }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            try {
                webView.evaluateJavascript("try{App.onResume&&App.onResume()}catch(e){}", null);
            } catch (Exception ignored) {
            }
        }
    }
}
