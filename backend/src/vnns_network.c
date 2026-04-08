#include "vnns_network.h"
#include "vnns_internal.h"
#include "vnns_layer.h"
#include "vnns_math.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdio.h>
#include <time.h>

/* ---- DAG helpers ---- */

static void compute_topo_order(vnns_network_t *net) {
    int n = net->num_nodes;
    int *in_deg = (int *)calloc((size_t)n, sizeof(int));
    int *queue  = (int *)malloc((size_t)n * sizeof(int));
    int head = 0, tail = 0;

    for (int e = 0; e < net->num_layers; e++)
        in_deg[net->layer_to_node[e]]++;

    for (int i = 0; i < n; i++)
        if (in_deg[i] == 0) queue[tail++] = i;

    int idx = 0;
    while (head < tail) {
        int node = queue[head++];
        net->topo_order[idx++] = node;
        for (int e = 0; e < net->num_layers; e++) {
            if (net->layer_from_node[e] == node) {
                int dest = net->layer_to_node[e];
                if (--in_deg[dest] == 0) queue[tail++] = dest;
            }
        }
    }

    free(in_deg);
    free(queue);
}

static vnns_error_t network_init_dag(vnns_network_t *net, const vnns_network_config_t *cfg) {
    int nn = cfg->num_nodes;
    net->num_nodes = nn;

    net->node_sizes       = (int *)malloc((size_t)nn * sizeof(int));
    net->node_activations = (int *)malloc((size_t)nn * sizeof(int));
    net->layer_from_node  = (int *)malloc((size_t)cfg->num_layers * sizeof(int));
    net->layer_to_node    = (int *)malloc((size_t)cfg->num_layers * sizeof(int));
    net->topo_order       = (int *)malloc((size_t)nn * sizeof(int));
    net->node_outputs     = (float **)calloc((size_t)nn, sizeof(float *));
    net->node_pre_acts    = (float **)calloc((size_t)nn, sizeof(float *));
    net->node_d_outputs   = (float **)calloc((size_t)nn, sizeof(float *));

    if (!net->node_sizes || !net->node_activations || !net->layer_from_node ||
        !net->layer_to_node || !net->topo_order || !net->node_outputs ||
        !net->node_pre_acts || !net->node_d_outputs) {
        return VNNS_ERR_OUT_OF_MEMORY;
    }

    memcpy(net->node_sizes,       cfg->node_sizes,       (size_t)nn * sizeof(int));
    memcpy(net->node_activations,  cfg->node_activations,  (size_t)nn * sizeof(int));
    memcpy(net->layer_from_node,   cfg->layer_from_node,   (size_t)cfg->num_layers * sizeof(int));
    memcpy(net->layer_to_node,     cfg->layer_to_node,     (size_t)cfg->num_layers * sizeof(int));

    for (int i = 0; i < nn; i++) {
        net->node_outputs[i]   = (float *)calloc((size_t)net->node_sizes[i], sizeof(float));
        net->node_pre_acts[i]  = (float *)calloc((size_t)net->node_sizes[i], sizeof(float));
        net->node_d_outputs[i] = (float *)calloc((size_t)net->node_sizes[i], sizeof(float));
        if (!net->node_outputs[i] || !net->node_pre_acts[i] || !net->node_d_outputs[i])
            return VNNS_ERR_OUT_OF_MEMORY;
    }

    compute_topo_order(net);

    /* input/output sizes from topo order endpoints */
    net->input_size  = net->node_sizes[net->topo_order[0]];
    net->output_size = net->node_sizes[net->topo_order[nn - 1]];

    return VNNS_OK;
}

static void network_free_dag(vnns_network_t *net) {
    if (net->node_outputs) {
        for (int i = 0; i < net->num_nodes; i++) free(net->node_outputs[i]);
        free(net->node_outputs);
    }
    if (net->node_pre_acts) {
        for (int i = 0; i < net->num_nodes; i++) free(net->node_pre_acts[i]);
        free(net->node_pre_acts);
    }
    if (net->node_d_outputs) {
        for (int i = 0; i < net->num_nodes; i++) free(net->node_d_outputs[i]);
        free(net->node_d_outputs);
    }
    free(net->node_sizes);
    free(net->node_activations);
    free(net->layer_from_node);
    free(net->layer_to_node);
    free(net->topo_order);
}

static void network_forward_dag(vnns_network_t *net, const float *input, float *output) {
    int input_node  = net->topo_order[0];
    int output_node = net->topo_order[net->num_nodes - 1];

    /* Copy raw input into input node */
    memcpy(net->node_outputs[input_node], input,
           (size_t)net->node_sizes[input_node] * sizeof(float));

    for (int t = 1; t < net->num_nodes; t++) {
        int n = net->topo_order[t];
        int nsize = net->node_sizes[n];

        /* Zero pre-activation */
        memset(net->node_pre_acts[n], 0, (size_t)nsize * sizeof(float));

        /* Accumulate all incoming edges */
        for (int e = 0; e < net->num_layers; e++) {
            if (net->layer_to_node[e] != n) continue;
            vnns_layer_t *layer = net->layers[e];
            int src = net->layer_from_node[e];
            const float *src_out = net->node_outputs[src];

            /* Cache input for backprop */
            memcpy(layer->last_input, src_out,
                   (size_t)layer->input_size * sizeof(float));

            /* Linear accumulation: pre_act[j] += W*x + bias */
            for (int j = 0; j < layer->output_size; j++) {
                float sum = layer->use_bias ? layer->biases[j] : 0.0f;
                for (int i = 0; i < layer->input_size; i++) {
                    int idx = i * layer->output_size + j;
                    if (layer->mask && !layer->mask[idx]) continue;
                    sum += src_out[i] * layer->weights[idx];
                }
                net->node_pre_acts[n][j] += sum;
            }
        }

        /* Apply activation at node level */
        vnns_activation_t act = (vnns_activation_t)net->node_activations[n];
        for (int j = 0; j < nsize; j++)
            net->node_outputs[n][j] = vnns_math_activate(net->node_pre_acts[n][j], act);
        if (act == VNNS_ACT_SOFTMAX)
            vnns_math_softmax(net->node_outputs[n], nsize);
    }

    memcpy(output, net->node_outputs[output_node],
           (size_t)net->node_sizes[output_node] * sizeof(float));
}

static void network_train_batch_dag(vnns_network_t *net,
                                     const float *data, const float *labels,
                                     int batch_size) {
    int output_node = net->topo_order[net->num_nodes - 1];
    int out_size = net->output_size;
    float batch_inv = 1.0f / (float)batch_size;

    /* Zero all edge gradients */
    for (int e = 0; e < net->num_layers; e++)
        vnns_layer_zero_gradients(net->layers[e]);

    for (int b = 0; b < batch_size; b++) {
        const float *sample = data  + b * net->input_size;
        const float *label  = labels + b * out_size;

        /* Forward (DAG) — writes to node_outputs */
        float *out_buf = net->node_outputs[output_node];
        network_forward_dag(net, sample, out_buf);

        /* Zero all node gradients */
        for (int i = 0; i < net->num_nodes; i++)
            memset(net->node_d_outputs[i], 0,
                   (size_t)net->node_sizes[i] * sizeof(float));

        /* Compute output error */
        vnns_activation_t out_act = (vnns_activation_t)net->node_activations[output_node];
        if (out_act == VNNS_ACT_SOFTMAX &&
            net->loss == VNNS_LOSS_CATEGORICAL_CROSSENTROPY) {
            for (int j = 0; j < out_size; j++)
                net->node_d_outputs[output_node][j] = out_buf[j] - label[j];
        } else {
            float inv = 1.0f / (float)out_size;
            for (int j = 0; j < out_size; j++)
                net->node_d_outputs[output_node][j] =
                    vnns_math_loss_derivative_from_output(out_buf[j], label[j], net->loss) * inv;
        }

        /* Backward: reverse topo order */
        for (int t = net->num_nodes - 1; t >= 1; t--) {
            int n = net->topo_order[t];
            vnns_activation_t act = (vnns_activation_t)net->node_activations[n];

            for (int e = 0; e < net->num_layers; e++) {
                if (net->layer_to_node[e] != n) continue;
                vnns_layer_t *layer = net->layers[e];
                int src = net->layer_from_node[e];

                /* Accumulate dW, db and propagate d_input to source node */
                for (int j = 0; j < layer->output_size; j++) {
                    float d_act;
                    if (act == VNNS_ACT_SOFTMAX &&
                        net->loss == VNNS_LOSS_CATEGORICAL_CROSSENTROPY) {
                        d_act = net->node_d_outputs[n][j];
                    } else {
                        d_act = net->node_d_outputs[n][j] *
                                vnns_math_activate_derivative(
                                    net->node_pre_acts[n][j], act);
                    }

                    for (int i = 0; i < layer->input_size; i++) {
                        int idx = i * layer->output_size + j;
                        if (layer->mask && !layer->mask[idx]) continue;
                        layer->d_weights[idx] += layer->last_input[i] * d_act * batch_inv;
                        net->node_d_outputs[src][i] += layer->weights[idx] * d_act;
                    }

                    if (layer->use_bias)
                        layer->d_biases[j] += d_act * batch_inv;
                }
            }
        }
    }

    /* Update weights */
    net->adam_t++;
    for (int e = 0; e < net->num_layers; e++) {
        switch (net->optimizer_type) {
            case VNNS_OPTIMIZER_SGD:
                vnns_layer_update_sgd(net->layers[e], net->learning_rate, net->clip_gradient);
                break;
            case VNNS_OPTIMIZER_SGD_MOMENTUM:
                vnns_layer_update_sgd_momentum(net->layers[e], net->learning_rate, net->momentum, net->clip_gradient);
                break;
            case VNNS_OPTIMIZER_ADAM:
                vnns_layer_update_adam(net->layers[e], net->learning_rate, net->beta1, net->beta2, net->epsilon, net->adam_t, net->clip_gradient);
                break;
            case VNNS_OPTIMIZER_RMSPROP:
                vnns_layer_update_rmsprop(net->layers[e], net->learning_rate, 0.99f, net->epsilon, net->clip_gradient);
                break;
            default:
                break;
        }
    }
}

vnns_error_t vnns_network_create(vnns_network_t **out_network, const vnns_network_config_t *config) {
    if (!out_network || !config || !config->layers) return VNNS_ERR_NULL_PTR;
    if (config->num_layers < 1) return VNNS_ERR_INVALID_SIZE;

    /* Re-seed RNG — use counter + time to guarantee a unique seed every call */
    static unsigned int create_counter = 0;
    create_counter++;
    unsigned int seed = (unsigned int)time(NULL) * 2654435761u + create_counter * 1013904223u;
    vnns_math_seed(seed);

    vnns_network_t *net = (vnns_network_t *)calloc(1, sizeof(vnns_network_t));
    if (!net) return VNNS_ERR_OUT_OF_MEMORY;

    net->num_layers = config->num_layers;
    net->layers = (vnns_layer_t **)calloc((size_t)config->num_layers, sizeof(vnns_layer_t *));
    if (!net->layers) { free(net); return VNNS_ERR_OUT_OF_MEMORY; }

    net->loss = config->loss;
    net->optimizer_type = config->optimizer_type;
    net->learning_rate = config->learning_rate > 0.0f ? config->learning_rate : 0.001f;
    net->momentum = config->momentum > 0.0f ? config->momentum : 0.9f;
    net->beta1 = config->beta1 > 0.0f ? config->beta1 : 0.9f;
    net->beta2 = config->beta2 > 0.0f ? config->beta2 : 0.999f;
    net->epsilon = config->epsilon > 0.0f ? config->epsilon : 1e-8f;
    net->clip_gradient = config->clip_gradient >= 0.0f ? config->clip_gradient : 5.0f;
    net->batch_size = config->batch_size > 0 ? config->batch_size : 32;
    net->adam_t = 0;

    net->input_size = config->layers[0].input_size;
    net->output_size = config->layers[config->num_layers - 1].output_size;

    for (int i = 0; i < config->num_layers; i++) {
        net->layers[i] = vnns_layer_create(&config->layers[i]);
        if (!net->layers[i]) {
            vnns_network_free(net);
            return VNNS_ERR_OUT_OF_MEMORY;
        }
    }

    int max_size = net->input_size;
    for (int i = 0; i < config->num_layers; i++) {
        if (config->layers[i].output_size > max_size) max_size = config->layers[i].output_size;
    }

    net->temp_output = (float *)calloc((size_t)max_size, sizeof(float));
    net->temp_d_input = (float *)calloc((size_t)max_size, sizeof(float));
    net->temp_target = (float *)calloc((size_t)net->output_size, sizeof(float));

    if (!net->temp_output || !net->temp_d_input || !net->temp_target) {
        vnns_network_free(net);
        return VNNS_ERR_OUT_OF_MEMORY;
    }

    /* DAG initialization */
    if (config->num_nodes > 0 && config->node_sizes && config->layer_from_node) {
        vnns_error_t dag_err = network_init_dag(net, config);
        if (dag_err != VNNS_OK) {
            vnns_network_free(net);
            return dag_err;
        }
    }

    *out_network = net;
    return VNNS_OK;
}

void vnns_network_free(vnns_network_t *network) {
    if (!network) return;
    for (int i = 0; i < network->num_layers; i++) {
        vnns_layer_free(network->layers[i]);
    }
    free(network->layers);
    free(network->temp_output);
    free(network->temp_d_input);
    free(network->temp_target);
    if (network->num_nodes > 0) network_free_dag(network);
    free(network);
}

vnns_error_t vnns_network_forward(vnns_network_t *network, const float *input, float *output) {
    if (!network || !input || !output) return VNNS_ERR_NULL_PTR;

    if (network->num_nodes > 0) {
        network_forward_dag(network, input, output);
        return VNNS_OK;
    }

    const float *current_input = input;
    for (int i = 0; i < network->num_layers; i++) {
        float *layer_out = (i == network->num_layers - 1) ? output : network->temp_output;
        vnns_layer_forward(network->layers[i], current_input, layer_out);
        current_input = layer_out;
    }

    return VNNS_OK;
}

vnns_error_t vnns_network_backward(vnns_network_t *network, const float *input, const float *target) {
    if (!network || !input || !target) return VNNS_ERR_NULL_PTR;

    /* Forward pass to cache activations */
    float *output = network->temp_output;
    vnns_network_forward(network, input, output);

    /* Compute output layer error — scale by 1/output_size to match mean loss */
    int out_size = network->output_size;
    float *d_output = network->temp_d_input;
    float loss_scale = (network->loss != VNNS_LOSS_CATEGORICAL_CROSSENTROPY)
        ? 1.0f / (float)out_size : 1.0f;

    for (int i = 0; i < out_size; i++) {
        d_output[i] = vnns_math_loss_derivative_from_output(output[i], target[i], network->loss) * loss_scale;
    }

    /* If softmax + categorical crossentropy, simplify to (output - target) */
    vnns_layer_t *last_layer = network->layers[network->num_layers - 1];
    if (vnns_layer_get_activation(last_layer) == VNNS_ACT_SOFTMAX &&
        network->loss == VNNS_LOSS_CATEGORICAL_CROSSENTROPY) {
        for (int i = 0; i < out_size; i++) {
            d_output[i] = output[i] - target[i];
        }
    }

    /* Zero gradients */
    for (int i = 0; i < network->num_layers; i++) {
        vnns_layer_zero_gradients(network->layers[i]);
    }

    /* Backpropagate */
    const float *current_d_output = d_output;
    for (int i = network->num_layers - 1; i >= 0; i--) {
        vnns_layer_t *layer = network->layers[i];
        const float *layer_input = (i == 0) ? input : vnns_layer_get_last_output(network->layers[i - 1]);

        vnns_layer_accumulate_gradients(layer, layer_input, current_d_output, 1.0f);

        if (i > 0) {
            vnns_layer_backward(layer, layer_input, current_d_output, network->temp_d_input);
            current_d_output = network->temp_d_input;
        }
    }

    return VNNS_OK;
}

vnns_error_t vnns_network_train_batch(vnns_network_t *network, const float *data, const float *labels, int batch_size) {
    if (!network || !data || !labels) return VNNS_ERR_NULL_PTR;
    if (batch_size < 1) return VNNS_ERR_INVALID_SIZE;

    if (network->num_nodes > 0) {
        network_train_batch_dag(network, data, labels, batch_size);
        return VNNS_OK;
    }

    /* Accumulate gradients over batch */
    for (int i = 0; i < network->num_layers; i++) {
        vnns_layer_zero_gradients(network->layers[i]);
    }

    /* Compute max layer size for temp buffers */
    int max_size = network->input_size;
    for (int i = 0; i < network->num_layers; i++) {
        if (network->layers[i]->output_size > max_size)
            max_size = network->layers[i]->output_size;
    }

    float *output = (float *)malloc((size_t)max_size * sizeof(float));
    float *d_output = (float *)malloc((size_t)max_size * sizeof(float));
    float *d_input = (float *)malloc((size_t)max_size * sizeof(float));

    if (!output || !d_output || !d_input) {
        free(output); free(d_output); free(d_input);
        return VNNS_ERR_OUT_OF_MEMORY;
    }

    float batch_inv = 1.0f / (float)batch_size;

    for (int b = 0; b < batch_size; b++) {
        const float *sample_input = &data[b * network->input_size];
        const float *sample_label = &labels[b * network->output_size];

        /* Forward */
        const float *current_input = sample_input;
        for (int i = 0; i < network->num_layers; i++) {
            float *layer_out = (i == network->num_layers - 1) ? output : d_input;
            vnns_layer_forward(network->layers[i], current_input, layer_out);
            current_input = layer_out;
        }

        /* Output error — scale by 1/output_size to match mean loss */
        float loss_scale = (network->loss != VNNS_LOSS_CATEGORICAL_CROSSENTROPY)
            ? 1.0f / (float)network->output_size : 1.0f;
        for (int i = 0; i < network->output_size; i++) {
            d_output[i] = vnns_math_loss_derivative_from_output(output[i], sample_label[i], network->loss) * loss_scale;
        }

        vnns_layer_t *last_layer = network->layers[network->num_layers - 1];
        if (vnns_layer_get_activation(last_layer) == VNNS_ACT_SOFTMAX &&
            network->loss == VNNS_LOSS_CATEGORICAL_CROSSENTROPY) {
            for (int i = 0; i < network->output_size; i++) {
                d_output[i] = output[i] - sample_label[i];
            }
        }

        /* Backprop */
        const float *cur_d = d_output;
        for (int i = network->num_layers - 1; i >= 0; i--) {
            vnns_layer_t *layer = network->layers[i];
            const float *layer_in = (i == 0) ? sample_input : vnns_layer_get_last_output(network->layers[i - 1]);
            vnns_layer_accumulate_gradients(layer, layer_in, cur_d, batch_inv);
            if (i > 0) {
                vnns_layer_backward(layer, layer_in, cur_d, d_input);
                cur_d = d_input;
            }
        }
    }

    /* Update weights */
    network->adam_t++;
    for (int i = 0; i < network->num_layers; i++) {
        switch (network->optimizer_type) {
            case VNNS_OPTIMIZER_SGD:
                vnns_layer_update_sgd(network->layers[i], network->learning_rate, network->clip_gradient);
                break;
            case VNNS_OPTIMIZER_SGD_MOMENTUM:
                vnns_layer_update_sgd_momentum(network->layers[i], network->learning_rate, network->momentum, network->clip_gradient);
                break;
            case VNNS_OPTIMIZER_ADAM:
                vnns_layer_update_adam(network->layers[i], network->learning_rate, network->beta1, network->beta2, network->epsilon, network->adam_t, network->clip_gradient);
                break;
            case VNNS_OPTIMIZER_RMSPROP:
                vnns_layer_update_rmsprop(network->layers[i], network->learning_rate, 0.99f, network->epsilon, network->clip_gradient);
                break;
            default:
                break;
        }
    }

    free(output);
    free(d_output);
    free(d_input);
    return VNNS_OK;
}

vnns_error_t vnns_network_train_epoch(vnns_network_t *network, const float *data, const float *labels, int sample_count, vnns_metrics_t *metrics) {
    if (!network || !data || !labels || !metrics) return VNNS_ERR_NULL_PTR;
    if (sample_count < 1) return VNNS_ERR_INVALID_SIZE;

    clock_t start = clock();
    float total_loss = 0.0f;
    float total_acc = 0.0f;

    int num_batches = (sample_count + network->batch_size - 1) / network->batch_size;

    float *output = (float *)malloc((size_t)network->output_size * sizeof(float));
    if (!output) return VNNS_ERR_OUT_OF_MEMORY;

    for (int b = 0; b < num_batches; b++) {
        int batch_start = b * network->batch_size;
        int batch_end = batch_start + network->batch_size;
        if (batch_end > sample_count) batch_end = sample_count;
        int bs = batch_end - batch_start;

        vnns_network_train_batch(network, &data[batch_start * network->input_size], &labels[batch_start * network->output_size], bs);

        /* Compute batch metrics */
        for (int i = batch_start; i < batch_end; i++) {
            vnns_network_forward(network, &data[i * network->input_size], output);
            total_loss += vnns_math_loss(output, (float *)&labels[i * network->output_size], network->output_size, network->loss);
            total_acc += vnns_math_accuracy(output, (float *)&labels[i * network->output_size], network->output_size, network->output_size, network->loss);
        }
    }

    free(output);

    metrics->loss = total_loss / (float)sample_count;
    metrics->accuracy = total_acc / (float)sample_count;
    metrics->elapsed_ms = (float)(clock() - start) * 1000.0f / (float)CLOCKS_PER_SEC;

    return VNNS_OK;
}

vnns_error_t vnns_network_train(vnns_network_t *network, const float *data, const float *labels, int sample_count, int epochs, vnns_epoch_callback_t callback, void *user_data) {
    if (!network || !data || !labels) return VNNS_ERR_NULL_PTR;
    if (sample_count < 1 || epochs < 1) return VNNS_ERR_INVALID_SIZE;

    vnns_metrics_t metrics;
    for (int e = 0; e < epochs; e++) {
        vnns_error_t err = vnns_network_train_epoch(network, data, labels, sample_count, &metrics);
        if (err != VNNS_OK) return err;

        metrics.epoch = e + 1;
        if (callback) {
            callback(e + 1, metrics.loss, metrics.accuracy, user_data);
        }
    }

    return VNNS_OK;
}

vnns_error_t vnns_network_evaluate(vnns_network_t *network, const float *data, const float *labels, int sample_count, vnns_metrics_t *metrics) {
    if (!network || !data || !labels || !metrics) return VNNS_ERR_NULL_PTR;
    if (sample_count < 1) return VNNS_ERR_INVALID_SIZE;

    float total_loss = 0.0f;
    float total_acc = 0.0f;

    float *output = (float *)malloc((size_t)network->output_size * sizeof(float));
    if (!output) return VNNS_ERR_OUT_OF_MEMORY;

    for (int i = 0; i < sample_count; i++) {
        vnns_network_forward(network, &data[i * network->input_size], output);
        total_loss += vnns_math_loss(output, (float *)&labels[i * network->output_size], network->output_size, network->loss);
        total_acc += vnns_math_accuracy(output, (float *)&labels[i * network->output_size], network->output_size, network->output_size, network->loss);
    }

    free(output);

    metrics->loss = total_loss / (float)sample_count;
    metrics->accuracy = total_acc / (float)sample_count;
    metrics->epoch = 0;
    metrics->elapsed_ms = 0.0f;

    return VNNS_OK;
}

vnns_error_t vnns_network_predict(vnns_network_t *network, const float *input, float *output) {
    return vnns_network_forward(network, input, output);
}

int vnns_network_get_input_size(const vnns_network_t *network) { return network ? network->input_size : 0; }
int vnns_network_get_output_size(const vnns_network_t *network) { return network ? network->output_size : 0; }
int vnns_network_get_layer_count(const vnns_network_t *network) { return network ? network->num_layers : 0; }

int vnns_network_get_total_params(const vnns_network_t *network) {
    if (!network) return 0;
    int total = 0;
    for (int i = 0; i < network->num_layers; i++) {
        total += vnns_layer_get_weight_count(network->layers[i]);
        if (vnns_layer_get_use_bias(network->layers[i])) total += vnns_layer_get_output_size(network->layers[i]);
    }
    return total;
}

vnns_layer_t *vnns_network_get_layer(const vnns_network_t *network, int index) {
    if (!network || index < 0 || index >= network->num_layers) return NULL;
    return network->layers[index];
}

vnns_error_t vnns_network_set_learning_rate(vnns_network_t *network, float lr) {
    if (!network || lr <= 0.0f) return VNNS_ERR_INVALID_SIZE;
    network->learning_rate = lr;
    return VNNS_OK;
}

vnns_error_t vnns_network_set_clip_gradient(vnns_network_t *network, float clip) {
    if (!network || clip < 0.0f) return VNNS_ERR_INVALID_SIZE;
    network->clip_gradient = clip;
    return VNNS_OK;
}

float vnns_network_get_learning_rate(const vnns_network_t *network) {
    return network ? network->learning_rate : 0.0f;
}

vnns_error_t vnns_network_save(const vnns_network_t *network, const char *path) {
    if (!network || !path) return VNNS_ERR_NULL_PTR;

    FILE *f = fopen(path, "wb");
    if (!f) return VNNS_ERR_OUT_OF_MEMORY;

    fwrite(&network->num_layers, sizeof(int), 1, f);
    fwrite(&network->loss, sizeof(vnns_loss_t), 1, f);
    fwrite(&network->optimizer_type, sizeof(vnns_optimizer_t), 1, f);
    fwrite(&network->learning_rate, sizeof(float), 1, f);

    for (int i = 0; i < network->num_layers; i++) {
        vnns_layer_t *layer = network->layers[i];
        int in_size = vnns_layer_get_input_size(layer);
        int out_size = vnns_layer_get_output_size(layer);
        vnns_activation_t act = vnns_layer_get_activation(layer);
        int ub = vnns_layer_get_use_bias(layer);
        int wc = vnns_layer_get_weight_count(layer);
        int bc = vnns_layer_get_bias_count(layer);
        float *w = vnns_layer_get_weights(layer);
        float *b = vnns_layer_get_biases(layer);

        fwrite(&in_size, sizeof(int), 1, f);
        fwrite(&out_size, sizeof(int), 1, f);
        fwrite(&act, sizeof(vnns_activation_t), 1, f);
        fwrite(&ub, sizeof(int), 1, f);
        fwrite(w, sizeof(float), (size_t)wc, f);
        if (ub) {
            fwrite(b, sizeof(float), (size_t)bc, f);
        }
    }

    fclose(f);
    return VNNS_OK;
}

vnns_error_t vnns_network_load(vnns_network_t **out_network, const char *path) {
    if (!out_network || !path) return VNNS_ERR_NULL_PTR;

    FILE *f = fopen(path, "rb");
    if (!f) return VNNS_ERR_NULL_PTR;

    int num_layers;
    fread(&num_layers, sizeof(int), 1, f);

    vnns_loss_t loss;
    fread(&loss, sizeof(vnns_loss_t), 1, f);

    vnns_optimizer_t opt;
    fread(&opt, sizeof(vnns_optimizer_t), 1, f);

    float lr;
    fread(&lr, sizeof(float), 1, f);

    vnns_layer_config_t *configs = (vnns_layer_config_t *)calloc((size_t)num_layers, sizeof(vnns_layer_config_t));
    if (!configs) { fclose(f); return VNNS_ERR_OUT_OF_MEMORY; }

    for (int i = 0; i < num_layers; i++) {
        fread(&configs[i].input_size, sizeof(int), 1, f);
        fread(&configs[i].output_size, sizeof(int), 1, f);
        fread(&configs[i].activation, sizeof(vnns_activation_t), 1, f);
        fread(&configs[i].use_bias, sizeof(int), 1, f);
        configs[i].weight_init_type = 0;
        configs[i].weight_init_scale = 0.5f;
    }

    vnns_network_config_t net_config;
    net_config.num_layers = num_layers;
    net_config.layers = configs;
    net_config.loss = loss;
    net_config.optimizer_type = opt;
    net_config.learning_rate = lr;
    net_config.momentum = 0.9f;
    net_config.beta1 = 0.9f;
    net_config.beta2 = 0.999f;
    net_config.epsilon = 1e-8f;
    net_config.clip_gradient = 5.0f;
    net_config.batch_size = 32;

    vnns_error_t err = vnns_network_create(out_network, &net_config);
    free(configs);
    if (err != VNNS_OK) { fclose(f); return err; }

    for (int i = 0; i < num_layers; i++) {
        vnns_layer_t *layer = (*out_network)->layers[i];
        int wc = vnns_layer_get_weight_count(layer);
        int bc = vnns_layer_get_bias_count(layer);
        int ub = vnns_layer_get_use_bias(layer);
        float *w = vnns_layer_get_weights(layer);
        float *b = vnns_layer_get_biases(layer);
        fread(w, sizeof(float), (size_t)wc, f);
        if (ub) {
            fread(b, sizeof(float), (size_t)bc, f);
        }
    }

    fclose(f);
    return VNNS_OK;
}
