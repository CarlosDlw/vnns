#include "vnns_dataset.h"
#include "vnns_math.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>

struct vnns_dataset {
    float *data;
    float *labels;
    int sample_count;
    int feature_count;
    int label_count;
    int owns_data;
};

struct vnns_normalizer {
    float *min_vals;
    float *max_vals;
    float *means;
    float *stds;
    int feature_count;
    vnns_normalization_t type;
    int *skip_features;
    int skip_count;
};

vnns_error_t vnns_dataset_create(vnns_dataset_t **out_dataset, const float *data, const float *labels, int sample_count, int feature_count, int label_count) {
    if (!out_dataset || !data || !labels) return VNNS_ERR_NULL_PTR;
    if (sample_count < 1 || feature_count < 1 || label_count < 1) return VNNS_ERR_INVALID_SIZE;

    vnns_dataset_t *ds = (vnns_dataset_t *)calloc(1, sizeof(vnns_dataset_t));
    if (!ds) return VNNS_ERR_OUT_OF_MEMORY;

    size_t data_size = (size_t)sample_count * (size_t)feature_count * sizeof(float);
    size_t label_size = (size_t)sample_count * (size_t)label_count * sizeof(float);

    ds->data = (float *)malloc(data_size);
    ds->labels = (float *)malloc(label_size);
    if (!ds->data || !ds->labels) {
        free(ds->data); free(ds->labels); free(ds);
        return VNNS_ERR_OUT_OF_MEMORY;
    }

    memcpy(ds->data, data, data_size);
    memcpy(ds->labels, labels, label_size);
    ds->sample_count = sample_count;
    ds->feature_count = feature_count;
    ds->label_count = label_count;
    ds->owns_data = 1;

    *out_dataset = ds;
    return VNNS_OK;
}

void vnns_dataset_free(vnns_dataset_t *dataset) {
    if (!dataset) return;
    if (dataset->owns_data) {
        free(dataset->data);
        free(dataset->labels);
    }
    free(dataset);
}

static void shuffle_indices(int *indices, int count, unsigned int seed) {
    vnns_math_seed(seed);
    for (int i = count - 1; i > 0; i--) {
        int j = vnns_math_rand() % (i + 1);
        int tmp = indices[i];
        indices[i] = indices[j];
        indices[j] = tmp;
    }
}

vnns_error_t vnns_dataset_split(vnns_dataset_t *dataset, float train_ratio, float val_ratio, unsigned int seed, int shuffle, vnns_split_t *out_split) {
    if (!dataset || !out_split) return VNNS_ERR_NULL_PTR;
    if (train_ratio + val_ratio > 1.0f || train_ratio <= 0.0f || val_ratio < 0.0f) return VNNS_ERR_INVALID_SIZE;

    memset(out_split, 0, sizeof(vnns_split_t));

    int n = dataset->sample_count;
    int train_count = (int)((float)n * train_ratio);
    int val_count = (int)((float)n * val_ratio);
    int test_count = n - train_count - val_count;

    if (train_count < 1 || test_count < 1) return VNNS_ERR_INVALID_SIZE;

    int *indices = (int *)malloc((size_t)n * sizeof(int));
    if (!indices) return VNNS_ERR_OUT_OF_MEMORY;
    for (int i = 0; i < n; i++) indices[i] = i;

    if (shuffle) shuffle_indices(indices, n, seed);

    size_t data_stride = (size_t)dataset->feature_count * sizeof(float);
    size_t label_stride = (size_t)dataset->label_count * sizeof(float);

    out_split->train_count = train_count;
    out_split->val_count = val_count;
    out_split->test_count = test_count;

    if (train_count > 0) {
        out_split->train_data = (float *)malloc((size_t)train_count * dataset->feature_count * sizeof(float));
        out_split->train_labels = (float *)malloc((size_t)train_count * dataset->label_count * sizeof(float));
        if (!out_split->train_data || !out_split->train_labels) { free(indices); return VNNS_ERR_OUT_OF_MEMORY; }
        for (int i = 0; i < train_count; i++) {
            int idx = indices[i];
            memcpy(&out_split->train_data[i * dataset->feature_count], &dataset->data[idx * dataset->feature_count], data_stride);
            memcpy(&out_split->train_labels[i * dataset->label_count], &dataset->labels[idx * dataset->label_count], label_stride);
        }
    }

    if (val_count > 0) {
        out_split->val_data = (float *)malloc((size_t)val_count * dataset->feature_count * sizeof(float));
        out_split->val_labels = (float *)malloc((size_t)val_count * dataset->label_count * sizeof(float));
        if (!out_split->val_data || !out_split->val_labels) { free(indices); return VNNS_ERR_OUT_OF_MEMORY; }
        for (int i = 0; i < val_count; i++) {
            int idx = indices[train_count + i];
            memcpy(&out_split->val_data[i * dataset->feature_count], &dataset->data[idx * dataset->feature_count], data_stride);
            memcpy(&out_split->val_labels[i * dataset->label_count], &dataset->labels[idx * dataset->label_count], label_stride);
        }
    }

    if (test_count > 0) {
        out_split->test_data = (float *)malloc((size_t)test_count * dataset->feature_count * sizeof(float));
        out_split->test_labels = (float *)malloc((size_t)test_count * dataset->label_count * sizeof(float));
        if (!out_split->test_data || !out_split->test_labels) { free(indices); return VNNS_ERR_OUT_OF_MEMORY; }
        for (int i = 0; i < test_count; i++) {
            int idx = indices[train_count + val_count + i];
            memcpy(&out_split->test_data[i * dataset->feature_count], &dataset->data[idx * dataset->feature_count], data_stride);
            memcpy(&out_split->test_labels[i * dataset->label_count], &dataset->labels[idx * dataset->label_count], label_stride);
        }
    }

    free(indices);
    return VNNS_OK;
}

void vnns_split_free(vnns_split_t *split) {
    if (!split) return;
    free(split->train_data);
    free(split->train_labels);
    free(split->val_data);
    free(split->val_labels);
    free(split->test_data);
    free(split->test_labels);
    memset(split, 0, sizeof(vnns_split_t));
}

vnns_error_t vnns_dataset_normalize(vnns_dataset_t *dataset, vnns_normalization_t norm, int *skip_features, int skip_count) {
    if (!dataset) return VNNS_ERR_NULL_PTR;
    if (norm == VNNS_NORM_NONE || norm >= VNNS_NORM_COUNT) return VNNS_OK;

    int fc = dataset->feature_count;
    int sc = dataset->sample_count;

    float *mins = (float *)calloc((size_t)fc, sizeof(float));
    float *maxs = (float *)calloc((size_t)fc, sizeof(float));
    float *means = (float *)calloc((size_t)fc, sizeof(float));
    float *stds = (float *)calloc((size_t)fc, sizeof(float));
    if (!mins || !maxs || !means || !stds) { free(mins); free(maxs); free(means); free(stds); return VNNS_ERR_OUT_OF_MEMORY; }

    for (int i = 0; i < sc; i++) {
        for (int j = 0; j < fc; j++) {
            float v = dataset->data[i * fc + j];
            if (i == 0) { mins[j] = v; maxs[j] = v; }
            else { if (v < mins[j]) mins[j] = v; if (v > maxs[j]) maxs[j] = v; }
            means[j] += v;
        }
    }
    for (int j = 0; j < fc; j++) {
        means[j] /= (float)sc;
    }
    for (int i = 0; i < sc; i++) {
        for (int j = 0; j < fc; j++) {
            float diff = dataset->data[i * fc + j] - means[j];
            stds[j] += diff * diff;
        }
    }
    for (int j = 0; j < fc; j++) {
        stds[j] = sqrtf(stds[j] / (float)sc);
        if (stds[j] < 1e-8f) stds[j] = 1e-8f;
    }

    for (int i = 0; i < sc; i++) {
        for (int j = 0; j < fc; j++) {
            int skip = 0;
            for (int s = 0; s < skip_count; s++) { if (skip_features[s] == j) { skip = 1; break; } }
            if (skip) continue;

            if (norm == VNNS_NORM_MINMAX) {
                float range = maxs[j] - mins[j];
                if (range < 1e-8f) range = 1e-8f;
                dataset->data[i * fc + j] = (dataset->data[i * fc + j] - mins[j]) / range;
            } else if (norm == VNNS_NORM_STANDARD) {
                dataset->data[i * fc + j] = (dataset->data[i * fc + j] - means[j]) / stds[j];
            }
        }
    }

    free(mins); free(maxs); free(means); free(stds);
    return VNNS_OK;
}

float *vnns_dataset_get_data(const vnns_dataset_t *dataset) { return dataset ? dataset->data : NULL; }
float *vnns_dataset_get_labels(const vnns_dataset_t *dataset) { return dataset ? dataset->labels : NULL; }
int vnns_dataset_get_sample_count(const vnns_dataset_t *dataset) { return dataset ? dataset->sample_count : 0; }
int vnns_dataset_get_feature_count(const vnns_dataset_t *dataset) { return dataset ? dataset->feature_count : 0; }
int vnns_dataset_get_label_count(const vnns_dataset_t *dataset) { return dataset ? dataset->label_count : 0; }
