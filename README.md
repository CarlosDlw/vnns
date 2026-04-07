# VNNS — Visual Neural Network Sandbox

A browser-based neural network designer and trainer. Build, visualize, and train neural networks entirely in your browser — no server required.

**[Try it live →](https://carlosdlw.github.io/vnns/)**

## Features

**Canvas Editor**
- Drag & drop layers and neurons
- Auto-connect layers, manual connection mode
- Undo/Redo, Auto Layout, Snap to Grid
- Semantic zoom (full detail → collapsed → minimal)
- Context menus, keyboard shortcuts

**Training**
- C backend compiled to WebAssembly — trains in-browser
- 4 optimizers: SGD, Adam, RMSProp, AdaGrad
- 9 activations: ReLU, Sigmoid, Tanh, Softmax, LeakyReLU, ELU, GELU, Swish, Linear
- 4 loss functions: MSE, Cross-Entropy, Binary Cross-Entropy, MAE
- Gradient clipping, configurable learning rate, batch size, train/test split

**Visualization**
- Real-time loss/accuracy charts
- Weight-colored connections (positive blue, negative red)
- Neuron activation heatmap
- Tooltips on hover (weights, biases, activations)

**Templates**
- XOR (binary classifier)
- Iris (multi-class)
- Regression (sine curve)
- Autoencoder

**I/O**
- Import/Export network topology as JSON
- Export canvas as PNG

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | HTML5 Canvas, vanilla JS, CSS |
| Backend | C → WebAssembly (Emscripten) |
| Charts | Chart.js 4.4.7 |
| Icons | VS Code Codicons |

## Building the WASM backend

Requires [Emscripten](https://emscripten.org/docs/getting_started/downloads.html):

```bash
cd backend
make clean && make
```

This produces `build/vnns.js` and `build/vnns.wasm`.

## Running locally

Serve the root directory with any static file server:

```bash
npx serve .
# or
python -m http.server 8000
```

Open `http://localhost:8000` in your browser.

## License

MIT
