# Changelog

All notable changes to VNNS will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-04-16

### Added
- Web Worker for training — main thread stays responsive during training
- Version number in About VNNS modal
- Dropout regularization (inverted dropout: mask + scale during training, passthrough on inference)
- Dropout rate input (0–0.9) in layer properties panel
- Visual dropout overlay on canvas (dimmed neurons with red X during training)
- "Dropout Regularization" network template (4→16→16→3, rate 0.3, Iris dataset)
- Batch Normalization layer (post-linear, pre-activation; training uses true batch statistics, inference uses running mean/var EMA)
- BN toggle checkbox in layer properties panel
- BN badge indicator on canvas layer footer
- "Batch Normalization" network template (4→16(BN)→16(BN)→3, Iris dataset)
- BN parameters (gamma, beta, running_mean, running_var) included in weights JSON serialization for correct Worker→main thread sync
- Early Stopping: checkbox toggle + configurable Patience (1–500) and Min Delta (0–0.1) sliders
- Validation loss evaluation per epoch when val split > 0
- Val Loss metric displayed in training metrics panel
- Val Loss line (blue dashed) on loss chart with Train/Val legend

### Changed
- Modularized `main.js` (~5300 lines) into 7 focused modules:
  - `state.js` — global namespace, state, constants, utilities
  - `canvas-renderer.js` — canvas drawing, hit tests, minimap, tooltip
  - `training-controller.js` — Worker lifecycle, training flow, weight sync, activations
  - `dataset-manager.js` — file upload/parse, synthetic generators, manual editor
  - `predict-panel.js` — prediction inputs, decision boundary, forward pass animation
  - `ui-panels.js` — properties panel, context toolbar, menus, modals, templates
  - `main.js` — orchestrator (canvas/charts/history init, events, boot)

## [1.0.0] - Initial Release

### Added
- Visual neural network editor with drag-and-drop canvas
- Layer types: Dense (Input, Hidden, Output)
- 9 activation functions: ReLU, Sigmoid, Tanh, Softmax, LeakyReLU, ELU, GELU, Swish, Linear
- 4 optimizers: SGD, SGD+Momentum, Adam, RMSprop
- 5 loss functions: MSE, Binary/Categorical CrossEntropy, MAE, Huber
- C/WebAssembly backend for training computation
- Dataset support: CSV/JSON upload, paste, URL, synthetic generators
- Synthetic datasets: Moons, Circles, Spiral, Gaussian Blobs, Checkerboard, XOR, Iris, Regression, Autoencoder
- Network templates: Classifier, Deep, Wide, Autoencoder, Binary, Regression
- Real-time loss/accuracy charts
- Weight visualization and activation heatmap
- Decision boundary plot
- Forward pass animation
- Export/Import: JSON topology, PNG canvas, weights
- Undo/Redo system
- Keyboard shortcuts
- Dark/Light theme
- Minimap navigation
- Properties panel with per-layer/neuron editing
- Auto-connect with 6 connection modes
- Auto-layout
- Learn modal with neural network concepts and guides
