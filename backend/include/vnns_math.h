#ifndef VNNS_MATH_H
#define VNNS_MATH_H

#include "vnns_types.h"

/* ---- Math Utilities ---- */
void vnns_math_seed(unsigned int seed);
float vnns_math_random_uniform(float low, float high);
float vnns_math_random_normal(float mean, float std);
float vnns_math_random_xavier(int fan_in, int fan_out);
float vnns_math_random_he(int fan_in);

/* ---- Internal RNG (for dataset shuffle) ---- */
int vnns_math_rand(void);

/* ---- Activation Functions ---- */
float vnns_math_activate(float x, vnns_activation_t act);
float vnns_math_activate_derivative(float x, vnns_activation_t act);
float vnns_math_activate_derivative_from_output(float output, vnns_activation_t act);

/* ---- Loss Functions ---- */
float vnns_math_loss(float *predicted, float *target, int size, vnns_loss_t loss);
float vnns_math_loss_derivative(float predicted, float target, vnns_loss_t loss);
float vnns_math_loss_derivative_from_output(float output, float target, vnns_loss_t loss);

/* ---- Accuracy ---- */
float vnns_math_accuracy(float *predicted, float *target, int pred_size, int target_size, vnns_loss_t loss_type);

/* ---- Vector Operations ---- */
void vnns_math_vec_add(float *a, float *b, float *out, int size);
void vnns_math_vec_sub(float *a, float *b, float *out, int size);
void vnns_math_vec_mul_scalar(float *a, float scalar, float *out, int size);
void vnns_math_vec_dot(float *a, float *b, int size, float *out);
void vnns_math_vec_copy(float *src, float *dst, int size);
void vnns_math_vec_zero(float *vec, int size);
void vnns_math_vec_max(float *vec, int size, float *out_max, int *out_idx);
void vnns_math_softmax(float *vec, int size);

#endif /* VNNS_MATH_H */
