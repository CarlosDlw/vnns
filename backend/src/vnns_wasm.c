#include "vnns_wasm.h"
#include "vnns_internal.h"
#include "vnns_network.h"
#include "vnns_layer.h"
#include "vnns_math.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

/* ---- Simple registry for network instances ---- */
#define MAX_NETWORKS 64
static vnns_network_t *g_networks[MAX_NETWORKS];
static int g_network_count = 0;

static int alloc_network_id(vnns_network_t *net) {
    for (int i = 0; i < MAX_NETWORKS; i++) {
        if (!g_networks[i]) {
            g_networks[i] = net;
            if (i >= g_network_count) g_network_count = i + 1;
            return i;
        }
    }
    return -1;
}

/* ---- JSON parsing helpers (minimal) ---- */
static const char *json_find_string(const char *json, const char *key) {
    char buf[64];
    snprintf(buf, sizeof(buf), "\"%s\"", key);
    const char *p = strstr(json, buf);
    if (!p) return NULL;
    p += strlen(buf);
    while (*p && (*p == ' ' || *p == ':')) p++;
    if (*p == '"') {
        p++;
        return p;
    }
    return NULL;
}

static float json_find_float(const char *json, const char *key, float default_val) {
    char buf[64];
    snprintf(buf, sizeof(buf), "\"%s\"", key);
    const char *p = strstr(json, buf);
    if (!p) return default_val;
    p += strlen(buf);
    while (*p && (*p == ' ' || *p == ':')) p++;
    return (float)atof(p);
}

static int json_find_int(const char *json, const char *key, int default_val) {
    char buf[64];
    snprintf(buf, sizeof(buf), "\"%s\"", key);
    const char *p = strstr(json, buf);
    if (!p) return default_val;
    p += strlen(buf);
    while (*p && (*p == ' ' || *p == ':')) p++;
    return atoi(p);
}

static const char *json_find_string_value(const char *json, const char *key, char *out, int out_size) {
    const char *p = json_find_string(json, key);
    if (!p) return NULL;
    int i = 0;
    while (*p && *p != '"' && i < out_size - 1) {
        out[i++] = *p++;
    }
    out[i] = '\0';
    return out;
}

static vnns_activation_t parse_activation(const char *name) {
    if (!name) return VNNS_ACT_RELU;
    if (strcmp(name, "relu") == 0) return VNNS_ACT_RELU;
    if (strcmp(name, "leaky_relu") == 0) return VNNS_ACT_LEAKY_RELU;
    if (strcmp(name, "sigmoid") == 0) return VNNS_ACT_SIGMOID;
    if (strcmp(name, "tanh") == 0) return VNNS_ACT_TANH;
    if (strcmp(name, "softmax") == 0) return VNNS_ACT_SOFTMAX;
    if (strcmp(name, "elu") == 0) return VNNS_ACT_ELU;
    if (strcmp(name, "gelu") == 0) return VNNS_ACT_GELU;
    if (strcmp(name, "swish") == 0) return VNNS_ACT_SWISH;
    if (strcmp(name, "linear") == 0) return VNNS_ACT_LINEAR;
    return VNNS_ACT_RELU;
}

static vnns_loss_t parse_loss(const char *name) {
    if (!name) return VNNS_LOSS_MSE;
    if (strcmp(name, "mse") == 0) return VNNS_LOSS_MSE;
    if (strcmp(name, "binary_crossentropy") == 0) return VNNS_LOSS_BINARY_CROSSENTROPY;
    if (strcmp(name, "categorical_crossentropy") == 0) return VNNS_LOSS_CATEGORICAL_CROSSENTROPY;
    if (strcmp(name, "mae") == 0) return VNNS_LOSS_MAE;
    if (strcmp(name, "huber") == 0) return VNNS_LOSS_HUBER;
    return VNNS_LOSS_MSE;
}

static vnns_optimizer_t parse_optimizer(const char *name) {
    if (!name) return VNNS_OPTIMIZER_ADAM;
    if (strcmp(name, "sgd") == 0) return VNNS_OPTIMIZER_SGD;
    if (strcmp(name, "sgd_momentum") == 0) return VNNS_OPTIMIZER_SGD_MOMENTUM;
    if (strcmp(name, "adam") == 0) return VNNS_OPTIMIZER_ADAM;
    if (strcmp(name, "rmsprop") == 0) return VNNS_OPTIMIZER_RMSPROP;
    return VNNS_OPTIMIZER_ADAM;
}

static int parse_weight_init(const char *name) {
    if (!name) return 1;
    if (strcmp(name, "random") == 0) return 0;
    if (strcmp(name, "xavier") == 0) return 1;
    if (strcmp(name, "he") == 0) return 2;
    return 1;
}

VNNS_EXPORT int vnns_wasm_create_network(const char *config_json) {
    if (!config_json) return -1;

    int num_layers = json_find_int(config_json, "num_layers", 0);
    if (num_layers < 1) return -1;

    vnns_layer_config_t *layers = (vnns_layer_config_t *)calloc((size_t)num_layers, sizeof(vnns_layer_config_t));
    if (!layers) return -1;

    char act_buf[64] = {0};
    char init_buf[64] = {0};
    for (int i = 0; i < num_layers; i++) {
        char key[32];
        act_buf[0] = '\0';
        init_buf[0] = '\0';
        snprintf(key, sizeof(key), "layer_%d_input", i);
        layers[i].input_size = json_find_int(config_json, key, 0);
        snprintf(key, sizeof(key), "layer_%d_output", i);
        layers[i].output_size = json_find_int(config_json, key, 0);
        snprintf(key, sizeof(key), "layer_%d_activation", i);
        json_find_string_value(config_json, key, act_buf, sizeof(act_buf));
        layers[i].activation = parse_activation(act_buf);
        snprintf(key, sizeof(key), "layer_%d_bias", i);
        layers[i].use_bias = json_find_int(config_json, key, 1);
        snprintf(key, sizeof(key), "layer_%d_init", i);
        json_find_string_value(config_json, key, init_buf, sizeof(init_buf));
        layers[i].weight_init_type = parse_weight_init(init_buf);
        layers[i].weight_init_scale = 0.5f;
    }

    char loss_buf[64] = {0};
    char opt_buf[64] = {0};
    json_find_string_value(config_json, "loss", loss_buf, sizeof(loss_buf));
    json_find_string_value(config_json, "optimizer", opt_buf, sizeof(opt_buf));

    vnns_network_config_t net_cfg;
    net_cfg.num_layers = num_layers;
    net_cfg.layers = layers;
    net_cfg.loss = parse_loss(loss_buf);
    net_cfg.optimizer_type = parse_optimizer(opt_buf);
    net_cfg.learning_rate = json_find_float(config_json, "learning_rate", 0.001f);
    net_cfg.momentum = json_find_float(config_json, "momentum", 0.9f);
    net_cfg.beta1 = json_find_float(config_json, "beta1", 0.9f);
    net_cfg.beta2 = json_find_float(config_json, "beta2", 0.999f);
    net_cfg.epsilon = json_find_float(config_json, "epsilon", 1e-8f);
    net_cfg.clip_gradient = json_find_float(config_json, "clip_gradient", 5.0f);
    net_cfg.batch_size = json_find_int(config_json, "batch_size", 32);

    vnns_network_t *net = NULL;
    vnns_error_t err = vnns_network_create(&net, &net_cfg);
    free(layers);

    if (err != VNNS_OK || !net) return -1;
    return alloc_network_id(net);
}

VNNS_EXPORT void vnns_wasm_free_network(int net_id) {
    if (net_id < 0 || net_id >= MAX_NETWORKS || !g_networks[net_id]) return;
    vnns_network_free(g_networks[net_id]);
    g_networks[net_id] = NULL;
}

VNNS_EXPORT float *vnns_wasm_predict(int net_id, const float *input, int input_size) {
    if (net_id < 0 || net_id >= MAX_NETWORKS || !g_networks[net_id]) return NULL;
    vnns_network_t *net = g_networks[net_id];
    if (input_size != net->input_size) return NULL;

    float *output = (float *)malloc((size_t)net->output_size * sizeof(float));
    if (!output) return NULL;

    vnns_network_predict(net, input, output);
    return output;
}

VNNS_EXPORT void vnns_wasm_predict_inplace(int net_id, const float *input, float *output) {
    if (net_id < 0 || net_id >= MAX_NETWORKS || !g_networks[net_id]) return;
    vnns_network_predict(g_networks[net_id], input, output);
}

static vnns_metrics_t g_last_metrics;

VNNS_EXPORT float vnns_wasm_train_epoch(int net_id, const float *data, const float *labels, int sample_count) {
    if (net_id < 0 || net_id >= MAX_NETWORKS || !g_networks[net_id]) return -1.0f;
    vnns_error_t err = vnns_network_train_epoch(g_networks[net_id], data, labels, sample_count, &g_last_metrics);
    if (err != VNNS_OK) return -1.0f;
    return g_last_metrics.loss;
}

VNNS_EXPORT float vnns_wasm_get_last_accuracy(void) {
    return g_last_metrics.accuracy;
}

VNNS_EXPORT float vnns_wasm_get_last_loss(void) {
    return g_last_metrics.loss;
}

VNNS_EXPORT float vnns_wasm_train_batch(int net_id, const float *data, const float *labels, int batch_size) {
    if (net_id < 0 || net_id >= MAX_NETWORKS || !g_networks[net_id]) return -1.0f;
    vnns_error_t err = vnns_network_train_batch(g_networks[net_id], data, labels, batch_size);
    return (err == VNNS_OK) ? 0.0f : -1.0f;
}

VNNS_EXPORT float vnns_wasm_evaluate(int net_id, const float *data, const float *labels, int sample_count) {
    if (net_id < 0 || net_id >= MAX_NETWORKS || !g_networks[net_id]) return -1.0f;
    vnns_error_t err = vnns_network_evaluate(g_networks[net_id], data, labels, sample_count, &g_last_metrics);
    if (err != VNNS_OK) return -1.0f;
    return g_last_metrics.accuracy;
}

VNNS_EXPORT void vnns_wasm_set_learning_rate(int net_id, float lr) {
    if (net_id < 0 || net_id >= MAX_NETWORKS || !g_networks[net_id]) return;
    vnns_network_set_learning_rate(g_networks[net_id], lr);
}

VNNS_EXPORT void vnns_wasm_set_batch_size(int net_id, int batch_size) {
    if (net_id < 0 || net_id >= MAX_NETWORKS || !g_networks[net_id]) return;
    if (batch_size > 0) g_networks[net_id]->batch_size = batch_size;
}

VNNS_EXPORT void vnns_wasm_set_clip_gradient(int net_id, float clip) {
    if (net_id < 0 || net_id >= MAX_NETWORKS || !g_networks[net_id]) return;
    vnns_network_set_clip_gradient(g_networks[net_id], clip);
}

VNNS_EXPORT char *vnns_wasm_get_weights_json(int net_id) {
    if (net_id < 0 || net_id >= MAX_NETWORKS || !g_networks[net_id]) return NULL;
    vnns_network_t *net = g_networks[net_id];

    int total = 0;
    for (int i = 0; i < net->num_layers; i++) {
        total += net->layers[i]->weight_count;
        if (net->layers[i]->use_bias) total += net->layers[i]->output_size;
    }

    size_t buf_size = (size_t)total * 20 + 64;
    char *buf = (char *)malloc(buf_size);
    if (!buf) return NULL;

    int offset = 0;
    offset += snprintf(buf + offset, buf_size - (size_t)offset, "{\"weights\":[");
    int first = 1;
    for (int i = 0; i < net->num_layers; i++) {
        vnns_layer_t *layer = net->layers[i];
        for (int j = 0; j < layer->weight_count; j++) {
            if (!first) buf[offset++] = ',';
            offset += snprintf(buf + offset, buf_size - (size_t)offset, "%.8g", layer->weights[j]);
            first = 0;
        }
        if (layer->use_bias) {
            for (int j = 0; j < layer->bias_count; j++) {
                if (!first) buf[offset++] = ',';
                offset += snprintf(buf + offset, buf_size - (size_t)offset, "%.8g", layer->biases[j]);
                first = 0;
            }
        }
    }
    offset += snprintf(buf + offset, buf_size - (size_t)offset, "]}");

    return buf;
}

VNNS_EXPORT void vnns_wasm_set_weights(int net_id, const char *weights_json) {
    if (net_id < 0 || net_id >= MAX_NETWORKS || !g_networks[net_id] || !weights_json) return;
    /* Parse JSON array of weights and set them */
    const char *p = strchr(weights_json, '[');
    if (!p) return;
    p++;

    vnns_network_t *net = g_networks[net_id];
    for (int i = 0; i < net->num_layers; i++) {
        vnns_layer_t *layer = net->layers[i];
        for (int j = 0; j < layer->weight_count; j++) {
            while (*p && (*p == ' ' || *p == ',' || *p == '\n' || *p == '\r')) p++;
            if (*p == ']' || *p == '\0') return;
            layer->weights[j] = (float)atof(p);
            while (*p && *p != ',' && *p != ']' && *p != ' ') p++;
        }
        if (layer->use_bias) {
            for (int j = 0; j < layer->bias_count; j++) {
                while (*p && (*p == ' ' || *p == ',' || *p == '\n' || *p == '\r')) p++;
                if (*p == ']' || *p == '\0') return;
                layer->biases[j] = (float)atof(p);
                while (*p && *p != ',' && *p != ']' && *p != ' ') p++;
            }
        }
    }
}

VNNS_EXPORT char *vnns_wasm_get_network_info(int net_id) {
    if (net_id < 0 || net_id >= MAX_NETWORKS || !g_networks[net_id]) return NULL;
    vnns_network_t *net = g_networks[net_id];

    char *buf = (char *)malloc(1024);
    if (!buf) return NULL;

    snprintf(buf, 1024,
        "{\"input_size\":%d,\"output_size\":%d,\"num_layers\":%d,\"total_params\":%d,\"learning_rate\":%.8g}",
        net->input_size, net->output_size, net->num_layers,
        vnns_network_get_total_params(net), net->learning_rate);

    return buf;
}

VNNS_EXPORT void vnns_wasm_free_ptr(void *ptr) {
    free(ptr);
}
