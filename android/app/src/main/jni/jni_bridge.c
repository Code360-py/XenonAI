#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <jni.h>
#include <android/log.h>
#include <llama.h>
#include <ggml-backend.h>
#include "xenonai.h"

#define TAG "XenonAI-JNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

static xenon_model_t   *g_model = NULL;
static xenon_context_t *g_ctx   = NULL;
static volatile bool    g_stop_requested = false;
static char g_last_llama_log[4096] = {0};

static void llama_log_callback(enum ggml_log_level level, const char *text, void *user_data) {
    (void)level; (void)user_data;
    if (!text) return;
    LOGI("[llama.cpp] %s", text);
    strncat(g_last_llama_log, text, sizeof(g_last_llama_log) - strlen(g_last_llama_log) - 1);
}

JNIEXPORT void JNICALL
Java_com_xenonai_app_MainActivity_nativeSetBackendPath(JNIEnv *env, jobject thiz, jstring jpath) {
    (void)thiz;
    const char *path = (*env)->GetStringUTFChars(env, jpath, NULL);
    if (!path) return;

    setenv("GGML_BACKEND_SEARCH_PATH", path, 1);
    ggml_backend_load_all_from_path(path);

    (*env)->ReleaseStringUTFChars(env, jpath, path);
}

JNIEXPORT jstring JNICALL
Java_com_xenonai_app_MainActivity_nativeGetLastError(JNIEnv *env, jobject thiz) {
    (void)thiz;
    return (*env)->NewStringUTF(env, g_last_llama_log);
}

JNIEXPORT jint JNICALL
Java_com_xenonai_app_MainActivity_nativeInit(JNIEnv *env, jobject thiz, jstring jmodelPath) {
    (void)thiz;
    g_last_llama_log[0] = '\0';
    llama_log_set(llama_log_callback, NULL);

    const char *path = (*env)->GetStringUTFChars(env, jmodelPath, NULL);
    if (!path) return -1;

    LOGI("nativeInit called with path: %s", path);

    if (g_ctx)   { xenon_context_free(g_ctx); g_ctx = NULL; }
    if (g_model) { xenon_model_free(g_model); g_model = NULL; }

    xenon_init();

    xenon_config_t cfg = xenon_default_config();
    cfg.model_path = path;
    cfg.n_ctx      = 512;
    cfg.n_threads  = 4;
    cfg.n_gpu_layers = 0;

    xenon_status_t st = xenon_model_load(&cfg, &g_model);
    if (st != XENON_OK || !g_model) {
        LOGE("xenon_model_load failed: %d", (int)st);
        (*env)->ReleaseStringUTFChars(env, jmodelPath, path);
        return (jint)st;
    }

    st = xenon_context_create(g_model, &g_ctx);
    (*env)->ReleaseStringUTFChars(env, jmodelPath, path);
    if (st != XENON_OK || !g_ctx) {
        LOGE("xenon_context_create failed: %d", (int)st);
        return (jint)st;
    }

    LOGI("nativeInit SUCCESS");
    return 0;
}

JNIEXPORT void JNICALL
Java_com_xenonai_app_MainActivity_nativeStop(JNIEnv *env, jobject thiz) {
    (void)env; (void)thiz;
    g_stop_requested = true;
    LOGI("Stop requested by user");
}

JNIEXPORT void JNICALL
Java_com_xenonai_app_MainActivity_nativeFree(JNIEnv *env, jobject thiz) {
    (void)env; (void)thiz;
    if (g_ctx)   { xenon_context_free(g_ctx); g_ctx = NULL; }
    if (g_model) { xenon_model_free(g_model); g_model = NULL; }
    xenon_shutdown();
}

typedef struct {
    JNIEnv *env;
    jobject activityObj;
    jmethodID onTokenMethod;
    jlong callbackId;
    int token_count;
} stream_ctx_t;

static int stream_cb(const char *piece, void *user) {
    if (g_stop_requested) {
        return 1; // Abort generation loop
    }
    stream_ctx_t *s = (stream_ctx_t *)user;
    if (!s || !piece || piece[0] == '\0') return 0;

    jstring js = (*s->env)->NewStringUTF(s->env, piece);
    if (js) {
        if (s->onTokenMethod) {
            (*s->env)->CallVoidMethod(s->env, s->activityObj, s->onTokenMethod, s->callbackId, js);
        }
        (*s->env)->DeleteLocalRef(s->env, js);
    }

    s->token_count++;
    return 0;
}

JNIEXPORT void JNICALL
Java_com_xenonai_app_MainActivity_nativeGenerate(JNIEnv *env, jobject thiz,
                                                jstring jprompt,
                                                jint maxTokens,
                                                jfloat temperature,
                                                jfloat topP,
                                                jint topK,
                                                jlong callbackId) {
    if (!g_ctx) return;

    g_stop_requested = false;

    jclass cls = (*env)->GetObjectClass(env, thiz);
    jmethodID onToken = (*env)->GetMethodID(env, cls, "onTokenGenerated", "(JLjava/lang/String;)V");
    jmethodID onDone  = (*env)->GetMethodID(env, cls, "onGenerationComplete", "(J)V");

    const char *prompt = (*env)->GetStringUTFChars(env, jprompt, NULL);
    if (!prompt) return;

    xenon_gen_params_t gp = xenon_default_gen_params();
    gp.max_tokens  = (int)maxTokens;
    gp.temperature = (float)temperature;
    gp.top_p       = (float)topP;
    gp.top_k       = (int)topK;

    stream_ctx_t sc;
    sc.env = env;
    sc.activityObj = thiz;
    sc.onTokenMethod = onToken;
    sc.callbackId = callbackId;
    sc.token_count = 0;

    xenon_generate_stream(g_ctx, prompt, &gp, (xenon_token_cb)stream_cb, &sc);

    (*env)->ReleaseStringUTFChars(env, jprompt, prompt);

    if (onDone) {
        (*env)->CallVoidMethod(env, thiz, onDone, callbackId);
    }
}
