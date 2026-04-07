#ifndef VNNS_INTERNAL_H
#define VNNS_INTERNAL_H

#include "vnns_types.h"

/* ---- Internal struct definitions for cross-module access ---- */

struct vnns_layer {
    int input_size;
    int output_size;
    vnns_activation_t activation;
    int use_bias;

    float *weights;
    float *biases;

    float *d_weights;
    float *d_biases;

    /* Adam state */
    float *m_weights;
    float *v_weights;
    float *m_biases;
    float *v_biases;

    /* Momentum state */
    float *v_weights_mom;
    float *v_biases_mom;

    /* RMSprop state */
    float *cache_weights;
    float *cache_biases;

    /* Temporaries */
    float *last_input;
    float *last_pre_activation;
    float *last_output;
    float *last_d_output;

    int weight_count;
    int bias_count;
};

struct vnns_network {
    int num_layers;
    vnns_layer_t **layers;

    vnns_loss_t loss;
    vnns_optimizer_t optimizer_type;

    float learning_rate;
    float momentum;
    float beta1;
    float beta2;
    float epsilon;
    float clip_gradient;
    int batch_size;

    int input_size;
    int output_size;

    /* Temporaries */
    float *temp_output;
    float *temp_d_input;
    float *temp_target;

    int adam_t;
};

#endif /* VNNS_INTERNAL_H */
