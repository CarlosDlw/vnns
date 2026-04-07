#ifndef VNNS_WASM_H
#define VNNS_WASM_H

#include "vnns_types.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define VNNS_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define VNNS_EXPORT
#endif

#ifdef __cplusplus
extern "C" {
#endif

/* ---- Network Management ---- */
VNNS_EXPORT int vnns_wasm_create_network(const char *config_json);
VNNS_EXPORT void vnns_wasm_free_network(int net_id);

/* ---- Forward / Predict ---- */
VNNS_EXPORT float *vnns_wasm_predict(int net_id, const float *input, int input_size);
VNNS_EXPORT void vnns_wasm_predict_inplace(int net_id, const float *input, float *output);

/* ---- Training ---- */
VNNS_EXPORT float vnns_wasm_train_epoch(int net_id, const float *data, const float *labels, int sample_count);
VNNS_EXPORT float vnns_wasm_train_batch(int net_id, const float *data, const float *labels, int batch_size);
VNNS_EXPORT float vnns_wasm_evaluate(int net_id, const float *data, const float *labels, int sample_count);
VNNS_EXPORT float vnns_wasm_get_last_accuracy(void);
VNNS_EXPORT float vnns_wasm_get_last_loss(void);

/* ---- Hyperparameters ---- */
VNNS_EXPORT void vnns_wasm_set_learning_rate(int net_id, float lr);
VNNS_EXPORT void vnns_wasm_set_batch_size(int net_id, int batch_size);
VNNS_EXPORT void vnns_wasm_set_clip_gradient(int net_id, float clip);

/* ---- Serialization ---- */
VNNS_EXPORT char *vnns_wasm_get_weights_json(int net_id);
VNNS_EXPORT void vnns_wasm_set_weights(int net_id, const char *weights_json);
VNNS_EXPORT char *vnns_wasm_get_network_info(int net_id);

/* ---- Memory Management ---- */
VNNS_EXPORT void vnns_wasm_free_ptr(void *ptr);

#ifdef __cplusplus
}
#endif

#endif /* VNNS_WASM_H */
