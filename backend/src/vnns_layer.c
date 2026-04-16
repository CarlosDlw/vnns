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

    /* Connection mask */
    if (config->mask) {
        layer->mask = (uint8_t *)malloc((size_t)layer->weight_count * sizeof(uint8_t));
        if (!layer->mask) { vnns_layer_free(layer); return NULL; }
        memcpy(layer->mask, config->mask, (size_t)layer->weight_count * sizeof(uint8_t));
        /* Zero out masked weights */
        for (int i = 0; i < layer->weight_count; i++) {
            if (!layer->mask[i]) layer->weights[i] = 0.0f;
        }
    } else {
        layer->mask = NULL;
    }

    /* Dropout */
    layer->dropout_rate = config->dropout_rate;
    if (layer->dropout_rate > 0.0f && layer->dropout_rate < 1.0f) {
        layer->dropout_mask = (uint8_t *)calloc((size_t)config->output_size, sizeof(uint8_t));
        if (!layer->dropout_mask) { vnns_layer_free(layer); return NULL; }
    } else {
        layer->dropout_rate = 0.0f;
        layer->dropout_mask = NULL;
    }

    /* Batch Normalization */
    layer->use_batch_norm = config->use_batch_norm;
    if (layer->use_batch_norm) {
        int os = config->output_size;
        layer->bn_epsilon = 1e-5f;
        layer->bn_momentum = 0.1f;
        layer->bn_gamma        = (float *)malloc((size_t)os * sizeof(float));
        layer->bn_beta         = (float *)calloc((size_t)os, sizeof(float));
        layer->bn_running_mean = (float *)calloc((size_t)os, sizeof(float));
        layer->bn_running_var  = (float *)malloc((size_t)os * sizeof(float));
        layer->bn_dgamma       = (float *)calloc((size_t)os, sizeof(float));
        layer->bn_dbeta        = (float *)calloc((size_t)os, sizeof(float));
        layer->bn_m_gamma      = (float *)calloc((size_t)os, sizeof(float));
        layer->bn_v_gamma      = (float *)calloc((size_t)os, sizeof(float));
        layer->bn_m_beta       = (float *)calloc((size_t)os, sizeof(float));
        layer->bn_v_beta       = (float *)calloc((size_t)os, sizeof(float));
        layer->bn_x_hat        = (float *)calloc((size_t)os, sizeof(float));
        layer->bn_batch_mean   = (float *)calloc((size_t)os, sizeof(float));
        layer->bn_batch_var    = (float *)calloc((size_t)os, sizeof(float));
        layer->bn_x_hat_batch  = NULL;
        layer->bn_x_hat_batch_cap = 0;

        if (!layer->bn_gamma || !layer->bn_beta || !layer->bn_running_mean ||
            !layer->bn_running_var || !layer->bn_dgamma || !layer->bn_dbeta ||
            !layer->bn_m_gamma || !layer->bn_v_gamma || !layer->bn_m_beta ||
            !layer->bn_v_beta || !layer->bn_x_hat || !layer->bn_batch_mean ||
            !layer->bn_batch_var) {
            vnns_layer_free(layer);
            return NULL;
        }

        /* Init gamma=1, beta=0, running_var=1 */
        for (int i = 0; i < os; i++) {
            layer->bn_gamma[i] = 1.0f;
            layer->bn_running_var[i] = 1.0f;
        }
    }

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
    free(layer->mask);
    free(layer->dropout_mask);
    free(layer->bn_gamma);
    free(layer->bn_beta);
    free(layer->bn_running_mean);
    free(layer->bn_running_var);
    free(layer->bn_dgamma);
    free(layer->bn_dbeta);
    free(layer->bn_m_gamma);
    free(layer->bn_v_gamma);
    free(layer->bn_m_beta);
    free(layer->bn_v_beta);
    free(layer->bn_x_hat);
    free(layer->bn_batch_mean);
    free(layer->bn_batch_var);
    free(layer->bn_x_hat_batch);
    free(layer);
}

void vnns_layer_forward(vnns_layer_t *layer, const float *input, float *output) {
    memcpy(layer->last_input, input, (size_t)layer->input_size * sizeof(float));

    /* Use last_input for computation so input/output buffers may alias safely */
    const float *in = layer->last_input;

    for (int j = 0; j < layer->output_size; j++) {
        float sum = layer->use_bias ? layer->biases[j] : 0.0f;
        for (int i = 0; i < layer->input_size; i++) {
            int idx = i * layer->output_size + j;
            if (layer->mask && !layer->mask[idx]) continue;
            sum += in[i] * layer->weights[idx];
        }
        layer->last_pre_activation[j] = sum;
    }

    /* Batch Normalization (inference: use running stats) */
    if (layer->use_batch_norm) {
        vnns_layer_bn_forward_infer(layer, layer->last_pre_activation);
    }

    /* Activation */
    for (int j = 0; j < layer->output_size; j++) {
        output[j] = vnns_math_activate(layer->last_pre_activation[j], layer->activation);
    }

    if (layer->activation == VNNS_ACT_SOFTMAX) {
        vnns_math_softmax(output, layer->output_size);
    }

    memcpy(layer->last_output, output, (size_t)layer->output_size * sizeof(float));
}

/* ---- Dropout ---- */

void vnns_layer_generate_dropout_mask(vnns_layer_t *layer) {
    if (!layer->dropout_mask || layer->dropout_rate <= 0.0f) return;
    for (int i = 0; i < layer->output_size; i++) {
        layer->dropout_mask[i] = (vnns_math_random_uniform(0.0f, 1.0f) >= layer->dropout_rate) ? 1 : 0;
    }
}

void vnns_layer_apply_dropout(vnns_layer_t *layer, float *output) {
    if (!layer->dropout_mask || layer->dropout_rate <= 0.0f) return;
    float scale = 1.0f / (1.0f - layer->dropout_rate);
    for (int i = 0; i < layer->output_size; i++) {
        if (!layer->dropout_mask[i]) {
            output[i] = 0.0f;
        } else {
            output[i] *= scale;
        }
    }
    memcpy(layer->last_output, output, (size_t)layer->output_size * sizeof(float));
}

void vnns_layer_apply_dropout_backward(vnns_layer_t *layer, float *d_output) {
    if (!layer->dropout_mask || layer->dropout_rate <= 0.0f) return;
    float scale = 1.0f / (1.0f - layer->dropout_rate);
    for (int i = 0; i < layer->output_size; i++) {
        if (!layer->dropout_mask[i]) {
            d_output[i] = 0.0f;
        } else {
            d_output[i] *= scale;
        }
    }
}

float vnns_layer_get_dropout_rate(const vnns_layer_t *layer) { return layer->dropout_rate; }
const uint8_t *vnns_layer_get_dropout_mask(const vnns_layer_t *layer) { return layer->dropout_mask; }

/* ---- Batch Normalization ---- */

/*
 * BN forward (training mode).
 * Called ONCE per layer per batch, after collecting all pre_activations.
 * pre_act_batch: [batch_size * output_size] — all pre_activations for the batch.
 * Normalizes in-place, caches x_hat per sample for backward.
 * Updates running mean/var via EMA.
 */
void vnns_layer_bn_forward_train(vnns_layer_t *layer, float *pre_act_batch, int batch_size, int sample_idx) {
    (void)sample_idx; /* unused in batch mode */
    if (!layer->use_batch_norm) return;
    int os = layer->output_size;

    /* Ensure x_hat_batch buffer is large enough */
    if (layer->bn_x_hat_batch_cap < batch_size) {
        free(layer->bn_x_hat_batch);
        layer->bn_x_hat_batch = (float *)malloc((size_t)batch_size * (size_t)os * sizeof(float));
        layer->bn_x_hat_batch_cap = batch_size;
    }

    /* Compute batch mean */
    for (int j = 0; j < os; j++) {
        float sum = 0.0f;
        for (int b = 0; b < batch_size; b++)
            sum += pre_act_batch[b * os + j];
        layer->bn_batch_mean[j] = sum / (float)batch_size;
    }

    /* Compute batch variance */
    for (int j = 0; j < os; j++) {
        float sum = 0.0f;
        float mean = layer->bn_batch_mean[j];
        for (int b = 0; b < batch_size; b++) {
            float diff = pre_act_batch[b * os + j] - mean;
            sum += diff * diff;
        }
        layer->bn_batch_var[j] = sum / (float)batch_size;
    }

    /* Normalize, scale, shift — in-place */
    for (int j = 0; j < os; j++) {
        float inv_std = 1.0f / sqrtf(layer->bn_batch_var[j] + layer->bn_epsilon);
        float mean = layer->bn_batch_mean[j];
        for (int b = 0; b < batch_size; b++) {
            int idx = b * os + j;
            float x_hat = (pre_act_batch[idx] - mean) * inv_std;
            layer->bn_x_hat_batch[idx] = x_hat;
            pre_act_batch[idx] = layer->bn_gamma[j] * x_hat + layer->bn_beta[j];
        }
    }

    /* Update running stats (EMA) */
    float mom = layer->bn_momentum;
    for (int j = 0; j < os; j++) {
        layer->bn_running_mean[j] = (1.0f - mom) * layer->bn_running_mean[j] + mom * layer->bn_batch_mean[j];
        layer->bn_running_var[j]  = (1.0f - mom) * layer->bn_running_var[j]  + mom * layer->bn_batch_var[j];
    }
}

/*
 * BN forward (inference mode).
 * Normalizes a single pre_activation vector using running stats.
 */
void vnns_layer_bn_forward_infer(vnns_layer_t *layer, float *pre_act) {
    if (!layer->use_batch_norm) return;
    int os = layer->output_size;
    for (int j = 0; j < os; j++) {
        float x_hat = (pre_act[j] - layer->bn_running_mean[j]) /
                       sqrtf(layer->bn_running_var[j] + layer->bn_epsilon);
        pre_act[j] = layer->bn_gamma[j] * x_hat + layer->bn_beta[j];
    }
}

/*
 * BN backward.
 * d_pre_act_batch: [batch_size * output_size] — gradients w.r.t. BN output.
 * Modifies d_pre_act_batch in-place to be gradients w.r.t. BN input (the raw linear output).
 * Accumulates dgamma, dbeta.
 */
void vnns_layer_bn_backward(vnns_layer_t *layer, float *d_pre_act_batch, int batch_size) {
    if (!layer->use_batch_norm) return;
    int os = layer->output_size;
    float batch_inv = 1.0f / (float)batch_size;

    for (int j = 0; j < os; j++) {
        float inv_std = 1.0f / sqrtf(layer->bn_batch_var[j] + layer->bn_epsilon);
        float dgamma = 0.0f;
        float dbeta = 0.0f;

        /* Accumulate dgamma, dbeta */
        for (int b = 0; b < batch_size; b++) {
            int idx = b * os + j;
            dbeta += d_pre_act_batch[idx];
            dgamma += d_pre_act_batch[idx] * layer->bn_x_hat_batch[idx];
        }
        layer->bn_dgamma[j] += dgamma;
        layer->bn_dbeta[j] += dbeta;

        /* Compute d_x_hat */
        /* d_x = (1/N) * gamma * inv_std * (N * d_out - sum(d_out) - x_hat * sum(d_out * x_hat)) */
        float sum_dout = dbeta;
        float sum_dout_xhat = dgamma;

        for (int b = 0; b < batch_size; b++) {
            int idx = b * os + j;
            float d_out = d_pre_act_batch[idx];
            d_pre_act_batch[idx] = layer->bn_gamma[j] * inv_std * batch_inv *
                ((float)batch_size * d_out - sum_dout -
                 layer->bn_x_hat_batch[idx] * sum_dout_xhat);
        }
    }
}

void vnns_layer_bn_zero_gradients(vnns_layer_t *layer) {
    if (!layer->use_batch_norm) return;
    memset(layer->bn_dgamma, 0, (size_t)layer->output_size * sizeof(float));
    memset(layer->bn_dbeta, 0, (size_t)layer->output_size * sizeof(float));
}

static void bn_clip_gradients(float *grads, int count, float clip) {
    if (clip <= 0.0f) return;
    float norm = 0.0f;
    for (int i = 0; i < count; i++) norm += grads[i] * grads[i];
    norm = sqrtf(norm);
    if (norm > clip) {
        float scale = clip / norm;
        for (int i = 0; i < count; i++) grads[i] *= scale;
    }
}

void vnns_layer_bn_update_sgd(vnns_layer_t *layer, float lr, float clip) {
    if (!layer->use_batch_norm) return;
    int os = layer->output_size;
    bn_clip_gradients(layer->bn_dgamma, os, clip);
    bn_clip_gradients(layer->bn_dbeta, os, clip);
    for (int i = 0; i < os; i++) {
        layer->bn_gamma[i] -= lr * layer->bn_dgamma[i];
        layer->bn_beta[i]  -= lr * layer->bn_dbeta[i];
    }
}

void vnns_layer_bn_update_sgd_momentum(vnns_layer_t *layer, float lr, float momentum, float clip) {
    if (!layer->use_batch_norm) return;
    int os = layer->output_size;
    bn_clip_gradients(layer->bn_dgamma, os, clip);
    bn_clip_gradients(layer->bn_dbeta, os, clip);
    /* Reuse m_gamma/m_beta as velocity buffers for momentum */
    for (int i = 0; i < os; i++) {
        layer->bn_m_gamma[i] = momentum * layer->bn_m_gamma[i] + layer->bn_dgamma[i];
        layer->bn_gamma[i] -= lr * layer->bn_m_gamma[i];
        layer->bn_m_beta[i] = momentum * layer->bn_m_beta[i] + layer->bn_dbeta[i];
        layer->bn_beta[i] -= lr * layer->bn_m_beta[i];
    }
}

void vnns_layer_bn_update_adam(vnns_layer_t *layer, float lr, float beta1, float beta2, float eps, int t, float clip) {
    if (!layer->use_batch_norm) return;
    int os = layer->output_size;
    bn_clip_gradients(layer->bn_dgamma, os, clip);
    bn_clip_gradients(layer->bn_dbeta, os, clip);
    float bc1 = 1.0f - powf(beta1, (float)t);
    float bc2 = 1.0f - powf(beta2, (float)t);
    for (int i = 0; i < os; i++) {
        layer->bn_m_gamma[i] = beta1 * layer->bn_m_gamma[i] + (1.0f - beta1) * layer->bn_dgamma[i];
        layer->bn_v_gamma[i] = beta2 * layer->bn_v_gamma[i] + (1.0f - beta2) * layer->bn_dgamma[i] * layer->bn_dgamma[i];
        float mh = layer->bn_m_gamma[i] / bc1;
        float vh = layer->bn_v_gamma[i] / bc2;
        layer->bn_gamma[i] -= lr * mh / (sqrtf(vh) + eps);

        layer->bn_m_beta[i] = beta1 * layer->bn_m_beta[i] + (1.0f - beta1) * layer->bn_dbeta[i];
        layer->bn_v_beta[i] = beta2 * layer->bn_v_beta[i] + (1.0f - beta2) * layer->bn_dbeta[i] * layer->bn_dbeta[i];
        mh = layer->bn_m_beta[i] / bc1;
        vh = layer->bn_v_beta[i] / bc2;
        layer->bn_beta[i] -= lr * mh / (sqrtf(vh) + eps);
    }
}

void vnns_layer_bn_update_rmsprop(vnns_layer_t *layer, float lr, float decay, float eps, float clip) {
    if (!layer->use_batch_norm) return;
    int os = layer->output_size;
    bn_clip_gradients(layer->bn_dgamma, os, clip);
    bn_clip_gradients(layer->bn_dbeta, os, clip);
    /* Reuse v_gamma/v_beta as cache */
    for (int i = 0; i < os; i++) {
        layer->bn_v_gamma[i] = decay * layer->bn_v_gamma[i] + (1.0f - decay) * layer->bn_dgamma[i] * layer->bn_dgamma[i];
        layer->bn_gamma[i] -= lr * layer->bn_dgamma[i] / (sqrtf(layer->bn_v_gamma[i]) + eps);
        layer->bn_v_beta[i] = decay * layer->bn_v_beta[i] + (1.0f - decay) * layer->bn_dbeta[i] * layer->bn_dbeta[i];
        layer->bn_beta[i] -= lr * layer->bn_dbeta[i] / (sqrtf(layer->bn_v_beta[i]) + eps);
    }
}

int vnns_layer_get_use_batch_norm(const vnns_layer_t *layer) { return layer->use_batch_norm; }

void vnns_layer_backward(vnns_layer_t *layer, const float *input, const float *d_output, float *d_input) {
    (void)input;
    (void)d_output;

    /* Compute d_input and accumulate gradients */
    for (int i = 0; i < layer->input_size; i++) {
        float sum = 0.0f;
        for (int j = 0; j < layer->output_size; j++) {
            int idx = i * layer->output_size + j;
            if (layer->mask && !layer->mask[idx]) continue;
            float d_act;
            if (layer->activation == VNNS_ACT_SOFTMAX) {
                /* Softmax + cross-entropy derivative is simplified to (output - target) */
                d_act = layer->last_d_output[j];
            } else {
                d_act = layer->last_d_output[j] * vnns_math_activate_derivative(layer->last_pre_activation[j], layer->activation);
            }
            sum += layer->weights[idx] * d_act;
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
            int idx = i * layer->output_size + j;
            if (layer->mask && !layer->mask[idx]) continue;
            layer->d_weights[idx] += input[i] * d_act * batch_size_inv;
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
        if (layer->mask && !layer->mask[i]) continue;
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
        if (layer->mask && !layer->mask[i]) continue;
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
        if (layer->mask && !layer->mask[i]) continue;
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
        if (layer->mask && !layer->mask[i]) continue;
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
