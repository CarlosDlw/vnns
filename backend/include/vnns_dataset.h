#ifndef VNNS_DATASET_H
#define VNNS_DATASET_H

#include "vnns_types.h"

/* ---- Dataset Creation / Destruction ---- */
vnns_error_t vnns_dataset_create(vnns_dataset_t **out_dataset, const float *data, const float *labels, int sample_count, int feature_count, int label_count);
void vnns_dataset_free(vnns_dataset_t *dataset);

/* ---- Splitting ---- */
vnns_error_t vnns_dataset_split(vnns_dataset_t *dataset, float train_ratio, float val_ratio, unsigned int seed, int shuffle, vnns_split_t *out_split);
void vnns_split_free(vnns_split_t *split);

/* ---- Normalization ---- */
vnns_error_t vnns_dataset_normalize(vnns_dataset_t *dataset, vnns_normalization_t norm, int *skip_features, int skip_count);

/* ---- Accessors ---- */
float *vnns_dataset_get_data(const vnns_dataset_t *dataset);
float *vnns_dataset_get_labels(const vnns_dataset_t *dataset);
int vnns_dataset_get_sample_count(const vnns_dataset_t *dataset);
int vnns_dataset_get_feature_count(const vnns_dataset_t *dataset);
int vnns_dataset_get_label_count(const vnns_dataset_t *dataset);

#endif /* VNNS_DATASET_H */
