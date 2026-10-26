package com.xenonai.app;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.system.Os;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int REQ_PICK_MODEL = 1001;
    private WebView mWebView;
    private static String sLibStatus = "OK";

    static {
        String[] libs = {"c++_shared", "ggml-base", "ggml-cpu", "ggml", "llama", "xenonai_jni", "xenonai"};
        for (String lib : libs) {
            try {
                System.loadLibrary(lib);
            } catch (Throwable ignored) {}
        }
    }

    public native int nativeInit(String modelPath);
    public native void nativeSetBackendPath(String nativeLibDir);
    public native String nativeGetLastError();
    public native void nativeGenerate(String prompt, int maxTokens, float temp, float topP, int topK, long callbackId);
    public native void nativeStop();
    public native void nativeFree();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        try {
            String libDir = getApplicationInfo().nativeLibraryDir;
            Os.setenv("GGML_BACKEND_SEARCH_PATH", libDir, true);
            nativeSetBackendPath(libDir);
        } catch (Throwable ignored) {}

        requestStorageAccess();

        mWebView = new WebView(this);
        setContentView(mWebView);

        WebSettings settings = mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        mWebView.setWebViewClient(new WebViewClient());
        mWebView.setWebChromeClient(new WebChromeClient());
        mWebView.addJavascriptInterface(new XenonBridge(), "Xenon");
        mWebView.loadUrl("file:///android_asset/index.html");
    }

    private void requestStorageAccess() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (!Environment.isExternalStorageManager()) {
                try {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                } catch (Exception ignored) {}
            }
        } else {
            if (checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE}, 2001);
            }
        }
    }

    public void runJs(final String js) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (mWebView != null) {
                    mWebView.evaluateJavascript(js, null);
                }
            }
        });
    }

    public void onTokenGenerated(final long callbackId, final String piece) {
        if (piece == null || piece.isEmpty()) return;
        final String safePiece = JSONObject.quote(piece);
        runJs(String.format(Locale.US, "window.__xenonToken(%d, %s);", callbackId, safePiece));
    }

    public void onGenerationComplete(final long callbackId) {
        runJs(String.format(Locale.US, "window.__xenonDone(%d);", callbackId));
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_PICK_MODEL && resultCode == RESULT_OK && data != null && data.getData() != null) {
            final Uri uri = data.getData();
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        runJs("window.__xenonSetStatus('Importing model...');");
                        String name = "custom_model.gguf";
                        File dest = new File(getFilesDir(), name);

                        InputStream in = getContentResolver().openInputStream(uri);
                        FileOutputStream out = new FileOutputStream(dest);
                        byte[] buffer = new byte[1048576];
                        int read;
                        while ((read = in.read(buffer)) != -1) {
                            out.write(buffer, 0, read);
                        }
                        out.flush();
                        out.close();
                        in.close();

                        runJs("window.__xenonSetStatus('Loading model...');");
                        int res = nativeInit(dest.getAbsolutePath());
                        if (res == 0) {
                            AppState.activeModel = name;
                            runJs("window.__xenonOnModelReady('custom_model.gguf');");
                        } else {
                            String log = nativeGetLastError().replace('\'', ' ').replace('\n', ' ');
                            runJs(String.format(Locale.US, "alert('nativeInit failed (code %d):\\n%s'); window.__xenonSetStatus('Load failed');", res, log));
                        }
                    } catch (Exception e) {
                        final String err = String.valueOf(e.getMessage()).replace('\'', ' ');
                        runJs("alert('Import Error: " + err + "'); window.__xenonSetStatus('Import failed');");
                    }
                }
            }).start();
        }
    }

    public void startDownload(final String urlStr, final String filename) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                File destFile = new File(getFilesDir(), filename);
                File tempFile = new File(getFilesDir(), filename + ".part");

                InputStream in = null;
                FileOutputStream out = null;

                try {
                    URL url = new URL(urlStr);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setInstanceFollowRedirects(true);
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Android; Mobile)");
                    conn.connect();

                    int status = conn.getResponseCode();
                    if (status == HttpURLConnection.HTTP_MOVED_TEMP || status == HttpURLConnection.HTTP_MOVED_PERM || status == 307 || status == 308) {
                        String newUrl = conn.getHeaderField("Location");
                        conn.disconnect();
                        url = new URL(newUrl);
                        conn = (HttpURLConnection) url.openConnection();
                        conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Android; Mobile)");
                        conn.connect();
                    }

                    long totalBytes = conn.getContentLengthLong();
                    in = new BufferedInputStream(conn.getInputStream());
                    out = new FileOutputStream(tempFile);

                    byte[] buffer = new byte[65536];
                    long downloaded = 0;
                    int read;
                    long lastTime = System.currentTimeMillis();
                    long bytesSinceLast = 0;

                    while ((read = in.read(buffer)) != -1) {
                        out.write(buffer, 0, read);
                        downloaded += read;
                        bytesSinceLast += read;

                        long now = System.currentTimeMillis();
                        if (now - lastTime >= 350 || downloaded == totalBytes) {
                            double speedMb = ((double) bytesSinceLast / (1024.0 * 1024.0)) / ((now - lastTime) / 1000.0);
                            int percent = totalBytes > 0 ? (int) ((downloaded * 100) / totalBytes) : 0;
                            double dlMb = (double) downloaded / (1024.0 * 1024.0);
                            double totMb = (double) totalBytes / (1024.0 * 1024.0);

                            final String js = String.format(Locale.US,
                                "window.__xenonDownloadProgress('%s', %d, '%.2f', '%.1f', '%.1f');",
                                filename, percent, speedMb, dlMb, totMb);

                            runJs(js);
                            lastTime = now;
                            bytesSinceLast = 0;
                        }
                    }

                    out.flush();
                    out.close();
                    in.close();

                    if (destFile.exists()) destFile.delete();
                    tempFile.renameTo(destFile);

                    runJs(String.format("window.__xenonDownloadDone('%s');", filename));

                } catch (Exception e) {
                    final String safeErr = String.valueOf(e.getMessage()).replace('\'', ' ');
                    runJs(String.format("window.__xenonDownloadError('%s', '%s');", filename, safeErr));
                } finally {
                    try { if (out != null) out.close(); } catch (Exception ignored) {}
                    try { if (in != null) in.close(); } catch (Exception ignored) {}
                }
            }
        }).start();
    }

    public class XenonBridge {
        @JavascriptInterface
        public String getAppVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "0.2.0";
            }
        }

        @JavascriptInterface
        public int getAppVersionCode() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
            } catch (Exception e) {
                return 200;
            }
        }

        @JavascriptInterface
        public void openExternalUrl(String url) {
            try {
                Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void openFilePicker() {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            startActivityForResult(intent, REQ_PICK_MODEL);
        }

        @JavascriptInterface
        public boolean isModelDownloaded(String filename) {
            File f = new File(getFilesDir(), filename);
            return f.exists() && f.length() > 50000000L;
        }

        @JavascriptInterface
        public String modelPath(String filename) {
            return new File(getFilesDir(), filename).getAbsolutePath();
        }

        @JavascriptInterface
        public void downloadModel(String url, String filename) {
            MainActivity.this.startDownload(url, filename);
        }

        @JavascriptInterface
        public String loadModelDetailed(final String fullPath) {
            final File f = new File(fullPath);
            if (!f.exists()) return "Err: File not found (" + f.getAbsolutePath() + ")";

            final int[] result = new int[]{-1};
            final String[] errorMsg = new String[]{""};

            // Allocate a dedicated thread with 8MB stack for native initialization
            Thread initThread = new Thread(null, new Runnable() {
                @Override
                public void run() {
                    try {
                        result[0] = nativeInit(f.getAbsolutePath());
                        if (result[0] != 0) {
                            errorMsg[0] = nativeGetLastError();
                        }
                    } catch (Throwable t) {
                        result[0] = -99;
                        errorMsg[0] = t.getMessage();
                    }
                }
            }, "XenonInitThread", 8 * 1024 * 1024);

            initThread.start();
            try {
                initThread.join();
            } catch (InterruptedException e) {
                return "Err: Thread interrupted";
            }

            if (result[0] == 0) {
                AppState.activeModel = f.getName();
                return "OK";
            } else {
                return "NativeInitErr (code " + result[0] + "): " + errorMsg[0];
            }
        }

        @JavascriptInterface
        public void generateStream(final String prompt, final int maxTokens, final float temp, final float topP, final int topK, final long callbackId) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        nativeGenerate(prompt, maxTokens, temp, topP, topK, callbackId);
                    } catch (Throwable t) {
                        onTokenGenerated(callbackId, "[Native inference failure]");
                        onGenerationComplete(callbackId);
                    }
                }
            }).start();
        }

        @JavascriptInterface
        public void stopGeneration() {
            try {
                nativeStop();
            } catch (Throwable ignored) {}
        }

        @JavascriptInterface
        public void copyToClipboard(String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                    if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("XenonAI", text));
                }
            });
        }

        @JavascriptInterface
        public void shareText(String text) {
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.putExtra(Intent.EXTRA_TEXT, text);
            intent.setType("text/plain");
            startActivity(Intent.createChooser(intent, "Share via"));
        }

        @JavascriptInterface
        public String getSettings() {
            JSONObject obj = new JSONObject();
            try {
                obj.put("maxTokens", AppState.maxTokens);
                obj.put("temperature", AppState.temperature);
                obj.put("topP", AppState.topP);
                obj.put("topK", AppState.topK);
                obj.put("system", AppState.systemPrompt);
            } catch (Exception ignored) {}
            return obj.toString();
        }

        @JavascriptInterface
        public void saveSettings(int maxTokens, float temperature, float topP, int topK, String system) {
            AppState.maxTokens = maxTokens;
            AppState.temperature = temperature;
            AppState.topP = topP;
            AppState.topK = topK;
            AppState.systemPrompt = system;
        }

        @JavascriptInterface
        public void setActiveModel(String filename) {
            AppState.activeModel = filename;
        }

        @JavascriptInterface
        public String getActiveModel() {
            return AppState.activeModel != null ? AppState.activeModel : "";
        }
    }
}
