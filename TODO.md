# VNNS — Roadmap / TODO

## Infraestrutura

- [x] Web Worker para treino (liberar main thread, UI não congela)
- [x] Modularização do main.js (canvas renderer, event handler, training controller, dataset manager, UI panels)

## Novos Tipos de Layer

- [x] Dropout layer (visualização de neurons "apagando" durante treino)
- [x] Batch Normalization
- [ ] Conv2D + Pooling + Flatten (suporte a imagens)

## Training & Otimização

- [x] Early Stopping (parar quando val_loss estagna por N epochs)
- [ ] Learning Rate Schedulers (step decay, cosine annealing, warmup)
- [ ] L1/L2 Regularization (weight decay configurável por layer)

## Datasets & Visualização

- [ ] MNIST loader (visualizar dígitos como pixels no canvas)
- [ ] Decision boundary plot em tempo real (classificação 2D, atualiza a cada N epochs)
- [ ] Confusion matrix na aba Predict

## Export & Sharing

- [ ] Gerar código Python (exportar rede como PyTorch ou TensorFlow)
- [ ] Share via URL (serializar topologia + hiperparâmetros na query string)

## UX

- [ ] Undo/Redo funcional (command pattern no NetworkManager)
- [ ] Keyboard shortcuts completos (Delete layer, Ctrl+D duplicar, setas para mover)
- [ ] Comparison mode (treinar 2+ configurações lado a lado, comparar curvas)
