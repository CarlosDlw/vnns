# Contributing to VNNS

Thanks for your interest in contributing! VNNS is a browser-based neural network sandbox built with C/WebAssembly and vanilla JavaScript.

## Getting Started

1. Fork and clone the repo
2. Install [Emscripten](https://emscripten.org/docs/getting_started/downloads.html) (only needed if modifying the C backend)
3. Serve the root directory with any static file server:
   ```bash
   npx serve .
   # or
   python -m http.server 8000
   ```
4. Open `http://localhost:8000` in your browser

## Building the WASM Backend

```bash
cd backend
make clean && make
```

This produces `build/vnns.js` and `build/vnns.wasm`.

## Project Structure

```
index.html              — Main HTML (UI layout, menus, panels)
styles/main.css         — All styles
scripts/
  main.js               — Canvas editor, rendering, UI logic (~4000 lines)
  network-manager.js    — Network data model (layers, neurons, connections)
  wasm-bridge.js        — JS ↔ WASM interface
backend/
  include/              — C header files
  src/                  — C source files
  build/                — Compiled WASM output
  Makefile              — Build configuration
```

## How to Contribute

### Reporting Bugs

Open an issue with:
- What you expected to happen
- What actually happened
- Browser and OS
- Steps to reproduce

### Suggesting Features

Open an issue with the `enhancement` label describing:
- What problem it solves
- How it should work
- Why it fits the project

### Submitting Code

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Test in at least Chrome and Firefox
4. If you changed the C backend, rebuild WASM and include the updated `build/vnns.js` and `build/vnns.wasm`
5. Open a Pull Request with a clear description of what changed and why

## Code Style

- **JavaScript:** Vanilla JS, no frameworks. Use `const`/`let`, no `var`. Camel case.
- **C:** Snake case (`vnns_network_create`). All public functions prefixed with `vnns_`.
- **CSS:** BEM-ish naming. Dark theme (VS Code inspired).
- No external dependencies beyond Chart.js and Codicons (already included via CDN).

## Areas Where Help is Needed

Check the issues labeled `good first issue` or `help wanted` for tasks that are ready to be picked up.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
