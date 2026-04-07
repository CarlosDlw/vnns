#include "vnns_layer.h"
#include "vnns_internal.h"
#include "vnns_math.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>

static int weight_count_for(int in, int out) { return in * out; }

static void init_weights(vnns_layer_t *layer, int init_type, float scale) {
    for (int i = 0; i < layer->weight_count; i++) {
        switch (init_type) {
            case 1: /* xavier */
                layer->weights[i] = vnns_math_random_xavier(layer->input_size, layer->output_size);
                break;
            case 2: /* he */
                layer->weights[i] = vnns_math_random_he(layer->input_size);
                break;
            default: /* random */
                layer->weights[i] = vnns_math_random_uniform(-scale, scale);
                break;
        }
    }
}

vnns_layer_t *vnns_layer_create(const vnns_layer_config_t *config) {
    if (!config) return NULL;

    vnns_layer_t *layer = (vnns_layer_t *)calloc(1, sizeof(vnns_layer_t));
    if (!layer) return NULL;

    layer->input_size = config->input_size;
    layer->output_size = config->output_size;
    layer->activation = config->activation;
    layer->use_bias = config->use_bias;
    layer->weight_count = weight_count_for(config->input_size, config->output_size);
    layer->bias_count = config->use_bias ? config->output_size : 0;

    float scale = config->weight_init_scale > 0.0f ? config->weight_init_scale : 0.5f;

    layer->weights = (float *)calloc((size_t)layer->weight_count, sizeof(float));
    layer->d_weights = (float *)calloc((size_t)layer->weight_count, sizeof(float));
    layer->m_weights = (float *)calloc((size_t)layer->weight_count, sizeof(float));
    layer->v_weights = (float *)calloc((size_t)layer->weight_count, sizeof(float));
    layer->v_weights_mom = (float *)calloc((size_t)layer->weight_count, sizeof(float));
    layer->cache_weights = (float *)calloc((size_t)layer->weight_count, sizeof(float));

    if (layer->use_bias) {
        layer->biases = (float *)calloc((size_t)layer->bias_count, sizeof(float));
        layer->d_biases = (float *)calloc((size_t)layer->bias_count, sizeof(float));
        layer->m_biases = (float *)calloc((size_t)layer->bias_count, sizeof(float));
        layer->v_biases = (float *)calloc((size_t)layer->bias_count, sizeof(float));
        layer->v_biases_mom = (float *)calloc((size_t)layer->bias_count, sizeof(float));
        layer->cache_biases = (float *)calloc((size_t)layer->bias_count, sizeof(float));
    }

    layer->last_input = (float *)calloc((size_t)config->input_size, sizeof(float));
    layer->last_pre_activation = (float *)calloc((size_t)config->output_size, sizeof(float));
    layer->last_output = (float *)calloc((size_t)config->output_size, sizeof(float));
    layer->last_d_output = (float *)calloc((size_t)config->output_size, sizeof(float));

    /* Check all allocations */
    if (!layer->weights || !layer->d_weights || !layer->m_weights ||
        !layer->v_weights || !layer->v_weights_mom || !layer->cache_weights ||
        !layer->last_input || !layer->last_pre_activation ||
        !layer->last_output || !layer->last_d_output ||
        (layer->use_bias && (!layer->biases || !layer->d_biases ||
                              !layer->m_biases || !layer->v_biases ||
                              !layer->v_biases_mom || !layer->cache_biases))) {
        vnns_layer_free(layer);
        return NULL;
    }

    init_weights(layer, config->weight_init_type, scale);

    return layer;
}

void vnns_layer_free(vnns_layer_t *layer) {
    if (!layer) return;
    free(layer->weights);
    free(layer->biases);
    free(layer->d_weights);
    free(layer->d_biases);
    free(layer->m_weights);
    free(layer->v_weights);
    free(layer->m_biases);
    free(layer->v_biases);
    free(layer->v_weights_mom);
    free(layer->v_biases_mom);
    free(layer->cache_weights);
    free(layer->cache_biases);
    free(layer->last_input);
    free(layer->last_pre_activation);
    free(layer->last_output);
    free(layer->last_d_output);
    free(layer);
}

void vnns_layer_forward(vnns_layer_t *layer, const float *input, float *output) {
    memcpy(layer->last_input, input, (size_t)layer->input_size * sizeof(float));

    /* Use last_input for computation so input/output buffers may alias safely */
    const float *in = layer->last_input;

    for (int j = 0; j < layer->output_size; j++) {
        float sum = layer->use_bias ? layer->biases[j] : 0.0f;
        for (int i = 0; i < layer->input_size; i++) {
            sum += in[i] * layer->weights[i * layer->output_size + j];
        }
        layer->last_pre_activation[j] = sum;
        output[j] = vnns_math_activate(sum, layer->activation);
    }

    if (layer->activation == VNNS_ACT_SOFTMAX) {
        vnns_math_softmax(output, layer->output_size);
    }

    memcpy(layer->last_output, output, (size_t)layer->output_size * sizeof(float));
}

void vnns_layer_backward(vnns_layer_t *layer, const float *input, const float *d_output, float *d_input) {
    (void)input;
    (void)d_output;

    /* Compute d_input and accumulate gradients */
    for (int i = 0; i < layer->input_size; i++) {
        float sum = 0.0f;
        for (int j = 0; j < layer->output_size; j++) {
            float d_act;
            if (layer->activation == VNNS_ACT_SOFTMAX) {
                /* Softmax + cross-entropy derivative is simplified to (output - target) */
                d_act = layer->last_d_output[j];
            } else {
                d_act = layer->last_d_output[j] * vnns_math_activate_derivative(layer->last_pre_activation[j], layer->activation);
            }
            sum += layer->weights[i * layer->output_size + j] * d_act;
        }
        d_input[i] = sum;
    }
}

void vnns_layer_zero_gradients(vnns_layer_t *layer) {
    vnns_math_vec_zero(layer->d_weights, layer->weight_count);
    if (layer->use_bias) {
        vnns_math_vec_zero(layer->d_biases, layer->bias_count);
    }
}

void vnns_layer_accumulate_gradients(vnns_layer_t *layer, const float *input, const float *d_output, float batch_size_inv) {
    memcpy(layer->last_d_output, d_output, (size_t)layer->output_size * sizeof(float));

    for (int j = 0; j < layer->output_size; j++) {
        float d_act;
        if (layer->activation == VNNS_ACT_SOFTMAX) {
            d_act = d_output[j];
        } else {
            d_act = d_output[j] * vnns_math_activate_derivative(layer->last_pre_activation[j], layer->activation);
        }

        for (int i = 0; i < layer->input_size; i++) {
            layer->d_weights[i * layer->output_size + j] += input[i] * d_act * batch_size_inv;
        }

        if (layer->use_bias) {
            layer->d_biases[j] += d_act * batch_size_inv;
        }
    }
}

static void clip_gradients(float *grads, int count, float clip) {
    if (clip <= 0.0f) return;
    float norm = 0.0f;
    for (int i = 0; i < count; i++) {
        norm += grads[i] * grads[i];
    }
    norm = sqrtf(norm);
    if (norm > clip) {
        float scale = clip / norm;
        for (int i = 0; i < count; i++) {
            grads[i] *= scale;
        }
    }
}

void vnns_layer_update_sgd(vnns_layer_t *layer, float lr, float clip) {
    clip_gradients(layer->d_weights, layer->weight_count, clip);
    if (layer->use_bias) clip_gradients(layer->d_biases, layer->bias_count, clip);
    for (int i = 0; i < layer->weight_count; i++) {
        layer->weights[i] -= lr * layer->d_weights[i];
    }
    if (layer->use_bias) {
        for (int i = 0; i < layer->bias_count; i++) {
            layer->biases[i] -= lr * layer->d_biases[i];
        }
    }
}

void vnns_layer_update_sgd_momentum(vnns_layer_t *layer, float lr, float momentum, float clip) {
    clip_gradients(layer->d_weights, layer->weight_count, clip);
    if (layer->use_bias) clip_gradients(layer->d_biases, layer->bias_count, clip);
    for (int i = 0; i < layer->weight_count; i++) {
        layer->v_weights_mom[i] = momentum * layer->v_weights_mom[i] + layer->d_weights[i];
        layer->weights[i] -= lr * layer->v_weights_mom[i];
    }
    if (layer->use_bias) {
        for (int i = 0; i < layer->bias_count; i++) {
            layer->v_biases_mom[i] = momentum * layer->v_biases_mom[i] + layer->d_biases[i];
            layer->biases[i] -= lr * layer->v_biases_mom[i];
        }
    }
}

void vnns_layer_update_adam(vnns_layer_t *layer, float lr, float beta1, float beta2, float eps, int t, float clip) {
    clip_gradients(layer->d_weights, layer->weight_count, clip);
    if (layer->use_bias) clip_gradients(layer->d_biases, layer->bias_count, clip);

    float bias_corr1 = 1.0f - powf(beta1, (float)t);
    float bias_corr2 = 1.0f - powf(beta2, (float)t);

    for (int i = 0; i < layer->weight_count; i++) {
        layer->m_weights[i] = beta1 * layer->m_weights[i] + (1.0f - beta1) * layer->d_weights[i];
        layer->v_weights[i] = beta2 * layer->v_weights[i] + (1.0f - beta2) * layer->d_weights[i] * layer->d_weights[i];
        float m_hat = layer->m_weights[i] / bias_corr1;
        float v_hat = layer->v_weights[i] / bias_corr2;
        layer->weights[i] -= lr * m_hat / (sqrtf(v_hat) + eps);
    }

    if (layer->use_bias) {
        for (int i = 0; i < layer->bias_count; i++) {
            layer->m_biases[i] = beta1 * layer->m_biases[i] + (1.0f - beta1) * layer->d_biases[i];
            layer->v_biases[i] = beta2 * layer->v_biases[i] + (1.0f - beta2) * layer->d_biases[i] * layer->d_biases[i];
            float m_hat = layer->m_biases[i] / bias_corr1;
            float v_hat = layer->v_biases[i] / bias_corr2;
            layer->biases[i] -= lr * m_hat / (sqrtf(v_hat) + eps);
        }
    }
}

void vnns_layer_update_rmsprop(vnns_layer_t *layer, float lr, float decay, float eps, float clip) {
    clip_gradients(layer->d_weights, layer->weight_count, clip);
    if (layer->use_bias) clip_gradients(layer->d_biases, layer->bias_count, clip);

    for (int i = 0; i < layer->weight_count; i++) {
        layer->cache_weights[i] = decay * layer->cache_weights[i] + (1.0f - decay) * layer->d_weights[i] * layer->d_weights[i];
        layer->weights[i] -= lr * layer->d_weights[i] / (sqrtf(layer->cache_weights[i]) + eps);
    }

    if (layer->use_bias) {
        for (int i = 0; i < layer->bias_count; i++) {
            layer->cache_biases[i] = decay * layer->cache_biases[i] + (1.0f - decay) * layer->d_biases[i] * layer->d_biases[i];
            layer->biases[i] -= lr * layer->d_biases[i] / (sqrtf(layer->cache_biases[i]) + eps);
        }
    }
}

int vnns_layer_get_input_size(const vnns_layer_t *layer) { return layer->input_size; }
int vnns_layer_get_output_size(const vnns_layer_t *layer) { return layer->output_size; }
float *vnns_layer_get_weights(const vnns_layer_t *layer) { return layer->weights; }
float *vnns_layer_get_biases(const vnns_layer_t *layer) { return layer->biases; }
int vnns_layer_get_weight_count(const vnns_layer_t *layer) { return layer->weight_count; }
vnns_activation_t vnns_layer_get_activation(const vnns_layer_t *layer) { return layer->activation; }
int vnns_layer_get_use_bias(const vnns_layer_t *layer) { return layer->use_bias; }
int vnns_layer_get_bias_count(const vnns_layer_t *layer) { return layer->bias_count; }
const float *vnns_layer_get_last_output(const vnns_layer_t *layer) { return layer->last_output; }
