#ifndef VNNS_NETWORK_H
#define VNNS_NETWORK_H

#include "vnns_types.h"

/* ---- Network Creation / Destruction ---- */
vnns_error_t vnns_network_create(vnns_network_t **out_network, const vnns_network_config_t *config);
void vnns_network_free(vnns_network_t *network);

/* ---- Forward / Backward ---- */
vnns_error_t vnns_network_forward(vnns_network_t *network, const float *input, float *output);
vnns_error_t vnns_network_backward(vnns_network_t *network, const float *input, const float *target);

/* ---- Training ---- */
vnns_error_t vnns_network_train_batch(vnns_network_t *network, const float *data, const float *labels, int batch_size);
vnns_error_t vnns_network_train_epoch(vnns_network_t *network, const float *data, const float *labels, int sample_count, vnns_metrics_t *metrics);
vnns_error_t vnns_network_train(vnns_network_t *network, const float *data, const float *labels, int sample_count, int epochs, vnns_epoch_callback_t callback, void *user_data);

/* ---- Evaluation ---- */
vnns_error_t vnns_network_evaluate(vnns_network_t *network, const float *data, const float *labels, int sample_count, vnns_metrics_t *metrics);
vnns_error_t vnns_network_predict(vnns_network_t *network, const float *input, float *output);

/* ---- Serialization ---- */
vnns_error_t vnns_network_save(const vnns_network_t *network, const char *path);
vnns_error_t vnns_network_load(vnns_network_t **out_network, const char *path);
vnns_error_t vnns_network_to_json(const vnns_network_t *network, char **out_json);
vnns_error_t vnns_network_from_json(vnns_network_t **out_network, const char *json);

/* ---- Info ---- */
int vnns_network_get_input_size(const vnns_network_t *network);
int vnns_network_get_output_size(const vnns_network_t *network);
int vnns_network_get_layer_count(const vnns_network_t *network);
int vnns_network_get_total_params(const vnns_network_t *network);
vnns_layer_t *vnns_network_get_layer(const vnns_network_t *network, int index);

/* ---- Hyperparameters ---- */
vnns_error_t vnns_network_set_learning_rate(vnns_network_t *network, float lr);
vnns_error_t vnns_network_set_clip_gradient(vnns_network_t *network, float clip);
float vnns_network_get_learning_rate(const vnns_network_t *network);

#endif /* VNNS_NETWORK_H */
