package br.com.campodata.offline;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + APP_HOST + "/assets/www/index.html";
    private static final int REQUEST_OPEN = 1001;
    private static final int REQUEST_EXPORT = 1002;
    private static final int REQUEST_GPS = 1003;

    private WebView webView;
    private ValueCallback<Uri[]> uploadCallback;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;
    private File pendingExport;

    private boolean appUrl(Uri uri) {
        return uri != null && "https".equals(uri.getScheme())
            && APP_HOST.equals(uri.getHost())
            && uri.getPath() != null
            && uri.getPath().startsWith("/assets/www/");
    }

    @Override
    public void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.addJavascriptInterface(new StorageBridge(), "CampoDataAndroid");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !appUrl(request.getUrl());
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (appUrl(request.getUrl())) {
                    return loader.shouldInterceptRequest(request.getUrl());
                }
                return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (uploadCallback != null) uploadCallback.onReceiveValue(null);
                uploadCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQUEST_OPEN);
                    return true;
                } catch (Exception ex) {
                    uploadCallback = null;
                    toast("Não foi possível selecionar o arquivo");
                    return false;
                }
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin,
                                                            GeolocationPermissions.Callback callback) {
                if (!APP_HOST.equals(Uri.parse(origin).getHost())) {
                    callback.invoke(origin, false, false);
                    return;
                }
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                    == PackageManager.PERMISSION_GRANTED ||
                    checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
                    == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                } else {
                    geoCallback = callback;
                    geoOrigin = origin;
                    requestPermissions(new String[]{
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    }, REQUEST_GPS);
                }
            }
        });
        webView.loadUrl(HOME);
    }

    private void toast(String message) {
        runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == REQUEST_GPS && geoCallback != null) {
            boolean granted = false;
            for (int result : results) {
                if (result == PackageManager.PERMISSION_GRANTED) granted = true;
            }
            geoCallback.invoke(geoOrigin, granted, false);
            geoCallback = null;
            geoOrigin = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_OPEN) {
            if (uploadCallback != null) {
                uploadCallback.onReceiveValue(WebChromeClient.FileChooserParams
                    .parseResult(resultCode, data));
                uploadCallback = null;
            }
        } else if (requestCode == REQUEST_EXPORT) {
            final File export = pendingExport;
            pendingExport = null;
            if (resultCode == RESULT_OK && export != null && data != null && data.getData() != null) {
                final Uri target = data.getData();
                new Thread(() -> {
                    try (InputStream in = new FileInputStream(export);
                         OutputStream out = getContentResolver().openOutputStream(target)) {
                        if (out == null) throw new IllegalStateException("Destino não disponível");
                        byte[] buf = new byte[16384];
                        int n;
                        while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                        out.flush();
                        toast("Backup salvo com sucesso");
                    } catch (Exception ex) {
                        Log.e("CampoData", "Falha ao exportar", ex);
                        toast("Não foi possível salvar o arquivo");
                    } finally {
                        export.delete();
                    }
                }).start();
            } else if (export != null) {
                export.delete();
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("CampoDataAndroid");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    public final class StorageBridge {
        private File shadowDir() {
            File dir = new File(getFilesDir(), "entrevistas-espelho");
            if (!dir.exists()) dir.mkdirs();
            return dir;
        }

        private boolean validId(String id) {
            return id != null && id.matches("[A-Za-z0-9_-]{1,100}");
        }

        private File templateDir() {
            File dir = new File(getFilesDir(), "formularios-espelho");
            if (!dir.exists()) dir.mkdirs();
            return dir;
        }

        @JavascriptInterface
        public void writeTemplate(String json) {
            try {
                JSONObject entry = new JSONObject(json);
                String id = entry.optString("id", "");
                if (!validId(id) || entry.optJSONArray("sections") == null) return;
                File dir = templateDir();
                File temporary = new File(dir, id + ".tmp");
                File destination = new File(dir, id + ".json");
                try (FileOutputStream out = new FileOutputStream(temporary)) {
                    out.write(json.getBytes(StandardCharsets.UTF_8));
                    out.flush();
                    out.getFD().sync();
                }
                if (!temporary.renameTo(destination)) {
                    throw new IllegalStateException("Falha ao atualizar formulário espelho");
                }
            } catch (Exception ex) {
                Log.e("CampoData", "Falha de redundância do formulário", ex);
            }
        }

        @JavascriptInterface
        public String readTemplates() {
            JSONArray entries = new JSONArray();
            File[] saved = templateDir().listFiles();
            if (saved == null) return entries.toString();
            for (File file : saved) {
                if (!file.getName().endsWith(".json") || file.length() > 10 * 1024 * 1024) continue;
                try (FileInputStream stream = new FileInputStream(file)) {
                    byte[] bytes = new byte[(int)file.length()];
                    int read = 0;
                    while (read < bytes.length) {
                        int count = stream.read(bytes, read, bytes.length-read);
                        if (count < 0) break;
                        read += count;
                    }
                    if (read == bytes.length) entries.put(new JSONObject(new String(bytes, StandardCharsets.UTF_8)));
                } catch (Exception ex) {
                    Log.w("CampoData", "Formulário espelho inválido", ex);
                }
            }
            return entries.toString();
        }

        @JavascriptInterface
        public void deleteTemplate(String id) {
            if (validId(id)) new File(templateDir(), id + ".json").delete();
        }

        @JavascriptInterface
        public void writeShadow(String json) {
            try {
                JSONObject entry = new JSONObject(json);
                String id = entry.optString("id", "");
                if (!validId(id) || entry.optJSONObject("answers") == null) return;
                File directory = shadowDir();
                File destination = new File(directory, id + ".json");
                File temp = new File(directory, id + ".tmp");
                try (FileOutputStream out = new FileOutputStream(temp)) {
                    out.write(json.getBytes(StandardCharsets.UTF_8));
                    out.flush();
                    out.getFD().sync();
                }
                if (!temp.renameTo(destination)) {
                    throw new IllegalStateException("Não foi possível atualizar o espelho");
                }
            } catch (Exception ex) {
                Log.e("CampoData", "Falha ao gravar espelho", ex);
            }
        }

        @JavascriptInterface
        public String readShadows() {
            JSONArray entries = new JSONArray();
            File[] files = shadowDir().listFiles();
            if (files == null) return entries.toString();
            for (File f : files) {
                if (!f.getName().endsWith(".json")) continue;
                try (FileInputStream in = new FileInputStream(f)) {
                    byte[] bytes = new byte[(int) f.length()];
                    int read = 0;
                    while (read < bytes.length) {
                        int n = in.read(bytes, read, bytes.length - read);
                        if (n < 0) break;
                        read += n;
                    }
                    if (read == bytes.length) {
                        entries.put(new JSONObject(new String(bytes, StandardCharsets.UTF_8)));
                    }
                } catch (Exception ex) {
                    Log.w("CampoData", "Espelho inválido ignorado", ex);
                }
            }
            return entries.toString();
        }

        @JavascriptInterface
        public void deleteShadow(String id) {
            if (validId(id)) new File(shadowDir(), id + ".json").delete();
        }

        @JavascriptInterface
        public void saveTextFile(String suggestedName, String mime, String content) {
            try {
                prepareExport(suggestedName, mime, content.getBytes(StandardCharsets.UTF_8));
            } catch (Exception ex) {
                Log.e("CampoData", "Falha ao preparar exportação", ex);
                toast("Não foi possível preparar o arquivo");
            }
        }

        @JavascriptInterface
        public void saveBase64File(String suggestedName, String mime, String encoded) {
            try {
                byte[] bytes = android.util.Base64.decode(encoded, android.util.Base64.DEFAULT);
                prepareExport(suggestedName, mime, bytes);
            } catch (Exception ex) {
                Log.e("CampoData", "Falha na exportação XLSX", ex);
                toast("Não foi possível preparar a planilha");
            }
        }

        private void prepareExport(String suggestedName, String mime, byte[] bytes) throws Exception {
            String filename = suggestedName == null ? "CampoData_backup.json"
                : suggestedName.replaceAll("[^A-Za-z0-9_.-]", "_");
            String contentType = mime != null && (mime.equals("text/csv")
                || mime.equals("application/json")
                || mime.equals("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    ? mime : "application/octet-stream";
            File output = File.createTempFile("campodata-export-", ".tmp", getCacheDir());
            try (FileOutputStream stream = new FileOutputStream(output)) {
                stream.write(bytes);
                stream.flush();
                stream.getFD().sync();
            }
            runOnUiThread(() -> {
                if (pendingExport != null) {
                    output.delete();
                    toast("Conclua a exportação anterior");
                    return;
                }
                pendingExport = output;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.setType(contentType);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.putExtra(Intent.EXTRA_TITLE, filename);
                try {
                    startActivityForResult(intent, REQUEST_EXPORT);
                } catch (Exception ex) {
                    pendingExport = null;
                    output.delete();
                    toast("Não foi possível abrir o seletor de arquivos");
                }
            });
        }

    }
}
