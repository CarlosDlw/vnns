#ifndef VNNS_TYPES_H
#define VNNS_TYPES_H

#include <stddef.h>
#include <stdint.h>

/* ---- Activation Functions ---- */
typedef enum {
    VNNS_ACT_LINEAR = 0,
    VNNS_ACT_RELU,
    VNNS_ACT_LEAKY_RELU,
    VNNS_ACT_SIGMOID,
    VNNS_ACT_TANH,
    VNNS_ACT_SOFTMAX,
    VNNS_ACT_ELU,
    VNNS_ACT_GELU,
    VNNS_ACT_SWISH,
    VNNS_ACT_COUNT
} vnns_activation_t;

/* ---- Loss Functions ---- */
typedef enum {
    VNNS_LOSS_MSE = 0,
    VNNS_LOSS_BINARY_CROSSENTROPY,
    VNNS_LOSS_CATEGORICAL_CROSSENTROPY,
    VNNS_LOSS_MAE,
    VNNS_LOSS_HUBER,
    VNNS_LOSS_COUNT
} vnns_loss_t;

/* ---- Optimizer Types ---- */
typedef enum {
    VNNS_OPTIMIZER_SGD = 0,
    VNNS_OPTIMIZER_SGD_MOMENTUM,
    VNNS_OPTIMIZER_ADAM,
    VNNS_OPTIMIZER_RMSPROP,
    VNNS_OPTIMIZER_COUNT
} vnns_optimizer_t;

/* ---- Normalization Types ---- */
typedef enum {
    VNNS_NORM_NONE = 0,
    VNNS_NORM_MINMAX,
    VNNS_NORM_STANDARD,
    VNNS_NORM_COUNT
} vnns_normalization_t;

/* ---- Error Codes ---- */
typedef enum {
    VNNS_OK = 0,
    VNNS_ERR_NULL_PTR,
    VNNS_ERR_OUT_OF_MEMORY,
    VNNS_ERR_INVALID_INDEX,
    VNNS_ERR_INVALID_SIZE,
    VNNS_ERR_INVALID_ACTIVATION,
    VNNS_ERR_INVALID_LOSS,
    VNNS_ERR_INVALID_OPTIMIZER,
    VNNS_ERR_NOT_TRAINED,
    VNNS_ERR_DATA_MISMATCH,
    VNNS_ERR_COUNT
} vnns_error_t;

/* ---- Forward Declarations ---- */
typedef struct vnns_layer vnns_layer_t;
typedef struct vnns_network vnns_network_t;
typedef struct vnns_optimizer_state vnns_optimizer_state_t;
typedef struct vnns_dataset vnns_dataset_t;
typedef struct vnns_normalizer vnns_normalizer_t;

/* ---- Layer Config ---- */
typedef struct {
    int input_size;
    int output_size;
    vnns_activation_t activation;
    int use_bias;
    float weight_init_scale;
    int weight_init_type; /* 0=random, 1=xavier, 2=he */
    const uint8_t *mask; /* connection mask [input_size * output_size], NULL = fully connected */
    float dropout_rate;   /* 0.0 = disabled, e.g. 0.2 = drop 20% of outputs */
    int use_batch_norm;   /* 1 = enable batch normalization on this layer */
} vnns_layer_config_t;

/* ---- Network Config ---- */
typedef struct {
    int num_layers;
    vnns_layer_config_t *layers;
    vnns_loss_t loss;
    vnns_optimizer_t optimizer_type;
    float learning_rate;
    float momentum;
    float beta1;
    float beta2;
    float epsilon;
    float clip_gradient;
    int batch_size;

    /* DAG topology (num_nodes == 0 → sequential mode) */
    int num_nodes;
    int *node_sizes;
    int *node_activations;
    int *layer_from_node;
    int *layer_to_node;
} vnns_network_config_t;

/* ---- Training Metrics ---- */
typedef struct {
    float loss;
    float accuracy;
    int epoch;
    float elapsed_ms;
} vnns_metrics_t;

/* ---- Training Callback ---- */
typedef void (*vnns_epoch_callback_t)(int epoch, float loss, float accuracy, void *user_data);

/* ---- Dataset Split ---- */
typedef struct {
    float *train_data;
    float *train_labels;
    int train_count;
    float *val_data;
    float *val_labels;
    int val_count;
    float *test_data;
    float *test_labels;
    int test_count;
} vnns_split_t;

#endif /* VNNS_TYPES_H */
