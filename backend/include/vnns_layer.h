#ifndef VNNS_LAYER_H
#define VNNS_LAYER_H

#include "vnns_types.h"

/* ---- Layer Creation / Destruction ---- */
vnns_layer_t *vnns_layer_create(const vnns_layer_config_t *config);
void vnns_layer_free(vnns_layer_t *layer);

/* ---- Forward Pass ---- */
void vnns_layer_forward(vnns_layer_t *layer, const float *input, float *output);

/* ---- Dropout ---- */
void vnns_layer_generate_dropout_mask(vnns_layer_t *layer);
void vnns_layer_apply_dropout(vnns_layer_t *layer, float *output);
void vnns_layer_apply_dropout_backward(vnns_layer_t *layer, float *d_output);
float vnns_layer_get_dropout_rate(const vnns_layer_t *layer);
const uint8_t *vnns_layer_get_dropout_mask(const vnns_layer_t *layer);

/* ---- Backward Pass ---- */
void vnns_layer_backward(vnns_layer_t *layer, const float *input, const float *d_output, float *d_input);

/* ---- Gradient Accumulation ---- */
void vnns_layer_zero_gradients(vnns_layer_t *layer);
void vnns_layer_accumulate_gradients(vnns_layer_t *layer, const float *input, const float *d_output, float batch_size_inv);

/* ---- Parameter Update ---- */
void vnns_layer_update_sgd(vnns_layer_t *layer, float lr, float clip);
void vnns_layer_update_sgd_momentum(vnns_layer_t *layer, float lr, float momentum, float clip);
void vnns_layer_update_adam(vnns_layer_t *layer, float lr, float beta1, float beta2, float eps, int t, float clip);
void vnns_layer_update_rmsprop(vnns_layer_t *layer, float lr, float decay, float eps, float clip);

/* ---- Getters ---- */
int vnns_layer_get_input_size(const vnns_layer_t *layer);
int vnns_layer_get_output_size(const vnns_layer_t *layer);
float *vnns_layer_get_weights(const vnns_layer_t *layer);
float *vnns_layer_get_biases(const vnns_layer_t *layer);
int vnns_layer_get_weight_count(const vnns_layer_t *layer);
vnns_activation_t vnns_layer_get_activation(const vnns_layer_t *layer);
int vnns_layer_get_use_bias(const vnns_layer_t *layer);
int vnns_layer_get_bias_count(const vnns_layer_t *layer);
const float *vnns_layer_get_last_output(const vnns_layer_t *layer);

#endif /* VNNS_LAYER_H */
