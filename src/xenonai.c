#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include "xenonai.h"
#include <llama.h>

#ifdef __ANDROID__
#include <android/log.h>
#define TAG "XenonAI-Native"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)
#else
#define LOGI(...) printf(__VA_ARGS__)
#define LOGE(...) fprintf(stderr, __VA_ARGS__)
#endif

struct xenon_model {
    struct llama_model *model;
    char               *path;
    int                 n_ctx;
};

struct xenon_context {
    xenon_model_t        *model;
    struct llama_context *ctx;
};

static char *xstrdup(const char *s) {
    if (!s) return NULL;
    size_t len = strlen(s);
    char *d = (char *)malloc(len + 1);
    if (d) memcpy(d, s, len + 1);
    return d;
}

xenon_status_t xenon_init(void) {
    llama_backend_init();
    return XENON_OK;
}

void xenon_shutdown(void) {
    llama_backend_free();
}

xenon_config_t xenon_default_config(void) {
    xenon_config_t cfg;
    memset(&cfg, 0, sizeof(cfg));
    cfg.n_ctx = 512;
    cfg.n_threads = 4;
    cfg.n_gpu_layers = 0;
    return cfg;
}

xenon_gen_params_t xenon_default_gen_params(void) {
    xenon_gen_params_t p;
    memset(&p, 0, sizeof(p));
    p.max_tokens = 256;
    p.temperature = 0.70f;
    p.top_p = 0.95f;
    p.top_k = 40;
    return p;
}

xenon_status_t xenon_model_load(const xenon_config_t *cfg, xenon_model_t **out_model) {
    if (!cfg || !cfg->model_path || !out_model) return XENON_ERR_ARG;

    struct llama_model_params mp = llama_model_default_params();
    mp.n_gpu_layers = cfg->n_gpu_layers;

    struct llama_model *lm = llama_model_load_from_file(cfg->model_path, mp);
    if (!lm) {
        LOGE("llama_model_load_from_file returned NULL for %s\n", cfg->model_path);
        return XENON_ERR_MODEL_LOAD;
    }

    xenon_model_t *m = (xenon_model_t *)calloc(1, sizeof(struct xenon_model));
    if (!m) {
        llama_model_free(lm);
        return XENON_ERR_OOM;
    }

    m->model = lm;
    m->path  = xstrdup(cfg->model_path);
    m->n_ctx = cfg->n_ctx > 0 ? cfg->n_ctx : 512;

    *out_model = m;
    return XENON_OK;
}

void xenon_model_free(xenon_model_t *model) {
    if (!model) return;
    if (model->model) llama_model_free(model->model);
    if (model->path) free(model->path);
    free(model);
}

xenon_status_t xenon_context_create(xenon_model_t *model, xenon_context_t **out_ctx) {
    if (!model || !model->model || !out_ctx) return XENON_ERR_ARG;

    struct llama_context_params cp = llama_context_default_params();
    cp.n_ctx = model->n_ctx > 0 ? model->n_ctx : 512;
    cp.n_threads = 4;
    cp.n_threads_batch = 4;

    struct llama_context *lc = llama_init_from_model(model->model, cp);
    if (!lc) {
        LOGE("llama_init_from_model returned NULL\n");
        return XENON_ERR_RUNTIME;
    }

    xenon_context_t *ctx = (xenon_context_t *)calloc(1, sizeof(struct xenon_context));
    if (!ctx) {
        llama_free(lc);
        return XENON_ERR_OOM;
    }

    ctx->model = model;
    ctx->ctx = lc;
    *out_ctx = ctx;
    return XENON_OK;
}

void xenon_context_free(xenon_context_t *ctx) {
    if (!ctx) return;
    if (ctx->ctx) llama_free(ctx->ctx);
    free(ctx);
}

xenon_status_t xenon_generate_stream(xenon_context_t *ctx,
                                    const char *prompt,
                                    const xenon_gen_params_t *params,
                                    xenon_token_cb cb,
                                    void *user) {
    if (!ctx || !ctx->model || !ctx->model->model || !prompt || !cb) return XENON_ERR_ARG;

    // Fresh context per request ensures zero KV-cache leftover conflicts
    if (ctx->ctx) {
        llama_free(ctx->ctx);
        ctx->ctx = NULL;
    }
    struct llama_context_params cp = llama_context_default_params();
    cp.n_ctx = ctx->model->n_ctx > 0 ? ctx->model->n_ctx : 512;
    cp.n_threads = 4;
    cp.n_threads_batch = 4;
    ctx->ctx = llama_init_from_model(ctx->model->model, cp);
    if (!ctx->ctx) {
        LOGE("Failed to allocate clean llama_context for prompt");
        return XENON_ERR_RUNTIME;
    }

    const struct llama_model *m = ctx->model->model;
    const struct llama_vocab *vocab = llama_model_get_vocab(m);

    char formatted[2048];
    if (strstr(prompt, "<|im_start|>") == NULL) {
        snprintf(formatted, sizeof(formatted),
                 "<|im_start|>system\nYou are a helpful assistant.<|im_end|>\n<|im_start|>user\n%s<|im_end|>\n<|im_start|>assistant\n",
                 prompt);
    } else {
        strncpy(formatted, prompt, sizeof(formatted) - 1);
        formatted[sizeof(formatted) - 1] = '\0';
    }

    int n_prompt = -llama_tokenize(vocab, formatted, strlen(formatted), NULL, 0, true, true);
    if (n_prompt <= 0) return XENON_ERR_RUNTIME;

    llama_token *prompt_tokens = (llama_token *)malloc(n_prompt * sizeof(llama_token));
    if (llama_tokenize(vocab, formatted, strlen(formatted), prompt_tokens, n_prompt, true, true) < 0) {
        free(prompt_tokens);
        return XENON_ERR_RUNTIME;
    }

    // Decode full prompt
    struct llama_batch batch = llama_batch_init(512, 0, 1);
    for (int i = 0; i < n_prompt; i++) {
        batch.token[i]     = prompt_tokens[i];
        batch.pos[i]       = i;
        batch.n_seq_id[i]  = 1;
        batch.seq_id[i][0] = 0;
        batch.logits[i]    = (i == n_prompt - 1);
    }
    batch.n_tokens = n_prompt;

    if (llama_decode(ctx->ctx, batch) != 0) {
        LOGE("Failed to decode prompt");
        free(prompt_tokens);
        llama_batch_free(batch);
        return XENON_ERR_RUNTIME;
    }
    free(prompt_tokens);

    // Initialize sampler chain
    struct llama_sampler *smpl = llama_sampler_chain_init(llama_sampler_chain_default_params());
    llama_sampler_chain_add(smpl, llama_sampler_init_top_k(params->top_k > 0 ? params->top_k : 40));
    llama_sampler_chain_add(smpl, llama_sampler_init_top_p(params->top_p > 0.0f ? params->top_p : 0.95f, 1));
    llama_sampler_chain_add(smpl, llama_sampler_init_temp(params->temperature > 0.0f ? params->temperature : 0.70f));
    llama_sampler_chain_add(smpl, llama_sampler_init_dist(LLAMA_DEFAULT_SEED));

    int max_tok = params->max_tokens > 0 ? params->max_tokens : 128;
    int n_cur = n_prompt;
    char buf[256];

    for (int i = 0; i < max_tok; i++) {
        llama_token tok = llama_sampler_sample(smpl, ctx->ctx, -1);
        llama_sampler_accept(smpl, tok);

        if (llama_vocab_is_eog(vocab, tok)) {
            break;
        }

        int n_piece = llama_token_to_piece(vocab, tok, buf, sizeof(buf) - 1, 0, false);
        if (n_piece > 0) {
            buf[n_piece] = '\0';
            if (cb(buf, user) != 0) break;
        }

        batch.token[0]     = tok;
        batch.pos[0]       = n_cur;
        batch.n_seq_id[0]  = 1;
        batch.seq_id[0][0] = 0;
        batch.logits[0]    = true;
        batch.n_tokens     = 1;
        n_cur++;

        if (llama_decode(ctx->ctx, batch) != 0) {
            LOGE("Failed to decode token at pos %d", n_cur);
            break;
        }
    }

    llama_sampler_free(smpl);
    llama_batch_free(batch);
    return XENON_OK;
}

const char *xenon_status_str(xenon_status_t s) {
    switch (s) {
        case XENON_OK:             return "ok";
        case XENON_ERR_ARG:        return "invalid argument";
        case XENON_ERR_IO:         return "io error";
        case XENON_ERR_MODEL_LOAD: return "model load failed";
        case XENON_ERR_RUNTIME:    return "runtime error";
        case XENON_ERR_OOM:        return "out of memory";
        default:                   return "unknown error";
    }
}
