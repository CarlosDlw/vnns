#include "vnns_math.h"
#include <math.h>
#include <stdlib.h>
#include <string.h>

/* ---- Random (xorshift32 — much better than LCG, full 32-bit period) ---- */

static unsigned int vnns_math_rand_state = 42;

void vnns_math_seed(unsigned int seed) {
    vnns_math_rand_state = seed ? seed : 1;
}

int vnns_math_rand(void) {
    unsigned int x = vnns_math_rand_state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    vnns_math_rand_state = x;
    return (int)(x & 0x7FFFFFFF);
}

float vnns_math_random_uniform(float low, float high) {
    float t = (float)(vnns_math_rand() & 0xFFFF) / 65536.0f;
    return low + t * (high - low);
}

float vnns_math_random_normal(float mean, float std) {
    float u1 = (float)vnns_math_rand() / 32768.0f;
    float u2 = (float)vnns_math_rand() / 32768.0f;
    if (u1 < 1e-10f) u1 = 1e-10f;
    float z = sqrtf(-2.0f * logf(u1)) * cosf(2.0f * 3.14159265358979f * u2);
    return mean + std * z;
}

float vnns_math_random_xavier(int fan_in, int fan_out) {
    float limit = sqrtf(6.0f / (float)(fan_in + fan_out));
    return vnns_math_random_uniform(-limit, limit);
}

float vnns_math_random_he(int fan_in) {
    float std = sqrtf(2.0f / (float)fan_in);
    return vnns_math_random_normal(0.0f, std);
}

/* ---- Activation Functions ---- */

float vnns_math_activate(float x, vnns_activation_t act) {
    switch (act) {
        case VNNS_ACT_LINEAR:
            return x;
        case VNNS_ACT_RELU:
            return x > 0.0f ? x : 0.0f;
        case VNNS_ACT_LEAKY_RELU:
            return x > 0.0f ? x : 0.01f * x;
        case VNNS_ACT_SIGMOID:
            return 1.0f / (1.0f + expf(-x));
        case VNNS_ACT_TANH:
            return tanhf(x);
        case VNNS_ACT_ELU:
            return x > 0.0f ? x : (expf(x) - 1.0f);
        case VNNS_ACT_GELU:
            return 0.5f * x * (1.0f + tanhf(0.7978845608f * (x + 0.044715f * x * x * x)));
        case VNNS_ACT_SWISH:
            return x / (1.0f + expf(-x));
        case VNNS_ACT_SOFTMAX:
            return x; /* softmax applied on entire vector */
        default:
            return x;
    }
}

float vnns_math_activate_derivative(float x, vnns_activation_t act) {
    switch (act) {
        case VNNS_ACT_LINEAR:
            return 1.0f;
        case VNNS_ACT_RELU:
            return x > 0.0f ? 1.0f : 0.0f;
        case VNNS_ACT_LEAKY_RELU:
            return x > 0.0f ? 1.0f : 0.01f;
        case VNNS_ACT_SIGMOID: {
            float s = 1.0f / (1.0f + expf(-x));
            return s * (1.0f - s);
        }
        case VNNS_ACT_TANH: {
            float t = tanhf(x);
            return 1.0f - t * t;
        }
        case VNNS_ACT_ELU:
            return x > 0.0f ? 1.0f : expf(x);
        case VNNS_ACT_GELU: {
            float cdf = 0.5f * (1.0f + tanhf(0.7978845608f * (x + 0.044715f * x * x * x)));
            float pdf = 0.3989422804f * expf(-0.5f * x * x);
            return cdf + x * pdf * (1.0f + 0.134145f * x * x);
        }
        case VNNS_ACT_SWISH: {
            float s = 1.0f / (1.0f + expf(-x));
            return s + x * s * (1.0f - s);
        }
        case VNNS_ACT_SOFTMAX:
            return 1.0f; /* handled separately */
        default:
            return 1.0f;
    }
}

float vnns_math_activate_derivative_from_output(float output, vnns_activation_t act) {
    switch (act) {
        case VNNS_ACT_LINEAR:
            return 1.0f;
        case VNNS_ACT_RELU:
            return output > 0.0f ? 1.0f : 0.0f;
        case VNNS_ACT_LEAKY_RELU:
            return output > 0.0f ? 1.0f : 0.01f;
        case VNNS_ACT_SIGMOID:
            return output * (1.0f - output);
        case VNNS_ACT_TANH:
            return 1.0f - output * output;
        case VNNS_ACT_ELU:
            return output > 0.0f ? 1.0f : (output + 1.0f);
        case VNNS_ACT_GELU:
            return 1.0f; /* approximation */
        case VNNS_ACT_SWISH:
            return 1.0f; /* approximation */
        case VNNS_ACT_SOFTMAX:
            return 1.0f;
        default:
            return 1.0f;
    }
}

/* ---- Loss Functions ---- */

float vnns_math_loss(float *predicted, float *target, int size, vnns_loss_t loss) {
    float total = 0.0f;
    switch (loss) {
        case VNNS_LOSS_MSE:
            for (int i = 0; i < size; i++) {
                float diff = predicted[i] - target[i];
                total += diff * diff;
            }
            return total / (float)size;

        case VNNS_LOSS_BINARY_CROSSENTROPY: {
            float eps = 1e-7f;
            for (int i = 0; i < size; i++) {
                float p = predicted[i];
                if (p < eps) p = eps;
                if (p > 1.0f - eps) p = 1.0f - eps;
                total -= target[i] * logf(p) + (1.0f - target[i]) * logf(1.0f - p);
            }
            return total / (float)size;
        }

        case VNNS_LOSS_CATEGORICAL_CROSSENTROPY: {
            float eps = 1e-7f;
            for (int i = 0; i < size; i++) {
                float p = predicted[i];
                if (p < eps) p = eps;
                total -= target[i] * logf(p);
            }
            return total;
        }

        case VNNS_LOSS_MAE:
            for (int i = 0; i < size; i++) {
                total += fabsf(predicted[i] - target[i]);
            }
            return total / (float)size;

        case VNNS_LOSS_HUBER: {
            float delta = 1.0f;
            for (int i = 0; i < size; i++) {
                float diff = predicted[i] - target[i];
                float abs_diff = fabsf(diff);
                if (abs_diff <= delta) {
                    total += 0.5f * diff * diff;
                } else {
                    total += delta * (abs_diff - 0.5f * delta);
                }
            }
            return total / (float)size;
        }

        default:
            return 0.0f;
    }
}

float vnns_math_loss_derivative(float predicted, float target, vnns_loss_t loss) {
    return vnns_math_loss_derivative_from_output(predicted, target, loss);
}

float vnns_math_loss_derivative_from_output(float output, float target, vnns_loss_t loss) {
    float eps = 1e-7f;
    switch (loss) {
        case VNNS_LOSS_MSE:
            return 2.0f * (output - target);

        case VNNS_LOSS_BINARY_CROSSENTROPY: {
            float p = output;
            if (p < eps) p = eps;
            if (p > 1.0f - eps) p = 1.0f - eps;
            return (p - target) / (p * (1.0f - p));
        }

        case VNNS_LOSS_CATEGORICAL_CROSSENTROPY: {
            float p = output;
            if (p < eps) p = eps;
            return -target / p;
        }

        case VNNS_LOSS_MAE:
            return (output > target) ? 1.0f : -1.0f;

        case VNNS_LOSS_HUBER: {
            float diff = output - target;
            float delta = 1.0f;
            if (fabsf(diff) <= delta) return diff;
            return (diff > 0) ? delta : -delta;
        }

        default:
            return 0.0f;
    }
}

/* ---- Accuracy ---- */

float vnns_math_accuracy(float *predicted, float *target, int pred_size, int target_size, vnns_loss_t loss_type) {
    /* Regression losses: accuracy = max(0, 1 - MAE) per sample */
    if (loss_type == VNNS_LOSS_MSE || loss_type == VNNS_LOSS_MAE || loss_type == VNNS_LOSS_HUBER) {
        int size = pred_size < target_size ? pred_size : target_size;
        float sum_abs = 0.0f;
        for (int i = 0; i < size; i++) {
            float diff = predicted[i] - target[i];
            if (diff < 0) diff = -diff;
            sum_abs += diff;
        }
        float mae = sum_abs / (float)size;
        float acc = 1.0f - mae;
        return acc > 0.0f ? acc : 0.0f;
    }

    /* Binary classification: threshold at 0.5 */
    if (pred_size == 1 && target_size == 1) {
        float pred_label = predicted[0] >= 0.5f ? 1.0f : 0.0f;
        return (pred_label == target[0]) ? 1.0f : 0.0f;
    }

    /* Multi-class classification: argmax comparison */
    int pred_idx = 0;
    int target_idx = 0;
    float pred_max = predicted[0];
    float target_max = target[0];

    for (int i = 1; i < pred_size; i++) {
        if (predicted[i] > pred_max) {
            pred_max = predicted[i];
            pred_idx = i;
        }
    }
    for (int i = 1; i < target_size; i++) {
        if (target[i] > target_max) {
            target_max = target[i];
            target_idx = i;
        }
    }

    return (pred_idx == target_idx) ? 1.0f : 0.0f;
}

/* ---- Vector Operations ---- */

void vnns_math_vec_add(float *a, float *b, float *out, int size) {
    for (int i = 0; i < size; i++) out[i] = a[i] + b[i];
}

void vnns_math_vec_sub(float *a, float *b, float *out, int size) {
    for (int i = 0; i < size; i++) out[i] = a[i] - b[i];
}

void vnns_math_vec_mul_scalar(float *a, float scalar, float *out, int size) {
    for (int i = 0; i < size; i++) out[i] = a[i] * scalar;
}

void vnns_math_vec_dot(float *a, float *b, int size, float *out) {
    float sum = 0.0f;
    for (int i = 0; i < size; i++) sum += a[i] * b[i];
    *out = sum;
}

void vnns_math_vec_copy(float *src, float *dst, int size) {
    memcpy(dst, src, (size_t)size * sizeof(float));
}

void vnns_math_vec_zero(float *vec, int size) {
    memset(vec, 0, (size_t)size * sizeof(float));
}

void vnns_math_vec_max(float *vec, int size, float *out_max, int *out_idx) {
    float max_val = vec[0];
    int max_idx = 0;
    for (int i = 1; i < size; i++) {
        if (vec[i] > max_val) {
            max_val = vec[i];
            max_idx = i;
        }
    }
    *out_max = max_val;
    *out_idx = max_idx;
}

void vnns_math_softmax(float *vec, int size) {
    float max_val = vec[0];
    for (int i = 1; i < size; i++) {
        if (vec[i] > max_val) max_val = vec[i];
    }

    float sum = 0.0f;
    for (int i = 0; i < size; i++) {
        vec[i] = expf(vec[i] - max_val);
        sum += vec[i];
    }

    if (sum > 1e-10f) {
        for (int i = 0; i < size; i++) {
            vec[i] /= sum;
        }
    }
}
