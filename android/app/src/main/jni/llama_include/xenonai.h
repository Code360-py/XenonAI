#ifndef XENONAI_H
#define XENONAI_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>
#include <stdint.h>

#define XENONAI_VERSION_MAJOR 1
#define XENONAI_VERSION_MINOR 0
#define XENONAI_VERSION_PATCH 0

#if defined(__GNUC__) && __GNUC__ >= 4
  #define XENONAI_API __attribute__((visibility("default")))
#else
  #define XENONAI_API
#endif

typedef enum {
    XENON_OK              =  0,
    XENON_ERR_ARG         = -1,
    XENON_ERR_IO          = -2,
    XENON_ERR_MODEL_LOAD  = -3,
    XENON_ERR_RUNTIME     = -4,
    XENON_ERR_OOM         = -5,
    XENON_ERR_UNKNOWN     = -99
} xenon_status_t;

typedef struct xenon_model   xenon_model_t;
typedef struct xenon_context xenon_context_t;

typedef struct {
    const char *model_path;
    int         n_threads;
    int         n_ctx;
    int         n_gpu_layers;
    int         seed;
    int         verbose;
} xenon_config_t;

typedef struct {
    int         max_tokens;
    float       temperature;
    float       top_p;
    int         top_k;
    float       repeat_penalty;
    const char *stop;
} xenon_gen_params_t;

typedef int (*xenon_token_cb)(const char *token, void *user_data);

/* Library info */
XENONAI_API const char *xenon_version(void);

/* Defaults */
XENONAI_API xenon_config_t     xenon_default_config(void);
XENONAI_API xenon_gen_params_t xenon_default_gen_params(void);

/* Lifecycle */
XENONAI_API xenon_status_t xenon_init(void);
XENONAI_API void           xenon_shutdown(void);

/* Model */
XENONAI_API xenon_status_t xenon_model_load(const xenon_config_t *cfg,
                                            xenon_model_t **out_model);
XENONAI_API void           xenon_model_free(xenon_model_t *model);

/* Context */
XENONAI_API xenon_status_t xenon_context_create(xenon_model_t *model,
                                                xenon_context_t **out_ctx);
XENONAI_API void           xenon_context_free(xenon_context_t *ctx);

/* Inference */
XENONAI_API xenon_status_t xenon_generate(xenon_context_t *ctx,
                                          const char *prompt,
                                          const xenon_gen_params_t *params,
                                          char **out_text);

XENONAI_API xenon_status_t xenon_generate_stream(xenon_context_t *ctx,
                                                 const char *prompt,
                                                 const xenon_gen_params_t *params,
                                                 xenon_token_cb cb,
                                                 void *user_data);

/* Utility */
XENONAI_API void         xenon_free_string(char *s);
XENONAI_API const char  *xenon_status_str(xenon_status_t s);

#ifdef __cplusplus
}
#endif
#endif /* XENONAI_H */
