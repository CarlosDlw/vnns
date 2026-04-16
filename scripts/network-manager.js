class NetworkManager {
  constructor() {
    this.neurons = new Map();
    this.layers = new Map();
    this.connections = new Map();
    this._nextNeuronId = 1;
    this._nextLayerId = 1;
    this._nextConnectionId = 1;
    this._onChange = null;
  }

  _notifyChange() {
    if (this._onChange) this._onChange();
  }

  // Layers
  createLayer(options = {}) {
    const id = options.id || `layer_${this._nextLayerId++}`;
    const layer = {
      id,
      name: options.name || `Layer ${this._nextLayerId - 1}`,
      type: options.type || 'dense',
      activation: options.activation || 'relu',
      dropoutRate: options.dropoutRate || 0,
      useBatchNorm: options.useBatchNorm || false,
      neurons: [],
      position: options.position || { x: 0, y: 0 },
      style: options.style || {},
      metadata: options.metadata || {}
    };
    this.layers.set(id, layer);
    this._notifyChange();
    return layer;
  }

  getLayer(id) {
    return this.layers.get(id) || null;
  }

  getAllLayers() {
    return Array.from(this.layers.values());
  }

  updateLayer(id, updates) {
    const layer = this.layers.get(id);
    if (!layer) return null;
    Object.assign(layer, updates);
    return layer;
  }

  deleteLayer(id) {
    const layer = this.layers.get(id);
    if (!layer) return false;

    layer.neurons.forEach(neuronId => this.neurons.delete(neuronId));

    for (const [connId, conn] of this.connections) {
      if (conn.fromLayer === id || conn.toLayer === id) {
        this.connections.delete(connId);
      }
    }

    this.layers.delete(id);
    this._notifyChange();
    return true;
  }

  reorderLayers(orderedIds) {
    const newMap = new Map();
    orderedIds.forEach(id => {
      if (this.layers.has(id)) {
        newMap.set(id, this.layers.get(id));
      }
    });
    this.layers = newMap;
  }

  // Neurons
  createNeuron(options = {}) {
    const id = options.id || `neuron_${this._nextNeuronId++}`;
    const neuron = {
      id,
      layerId: options.layerId || null,
      position: options.position || { x: 0, y: 0 },
      bias: options.bias ?? 0,
      weights: options.weights || {},
      activation: options.activation || null,
      style: options.style || {},
      metadata: options.metadata || {}
    };
    this.neurons.set(id, neuron);

    if (neuron.layerId) {
      const layer = this.layers.get(neuron.layerId);
      if (layer) {
        layer.neurons.push(id);
      }
    }

    this._notifyChange();
    return neuron;
  }

  getNeuron(id) {
    return this.neurons.get(id) || null;
  }

  getAllNeurons() {
    return Array.from(this.neurons.values());
  }

  getNeuronsByLayer(layerId) {
    const layer = this.layers.get(layerId);
    if (!layer) return [];
    return layer.neurons.map(id => this.neurons.get(id)).filter(Boolean);
  }

  updateNeuron(id, updates) {
    const neuron = this.neurons.get(id);
    if (!neuron) return null;

    if (updates.layerId && updates.layerId !== neuron.layerId) {
      const oldLayer = this.layers.get(neuron.layerId);
      if (oldLayer) {
        oldLayer.neurons = oldLayer.neurons.filter(nid => nid !== id);
      }
      neuron.layerId = updates.layerId;
      const newLayer = this.layers.get(updates.layerId);
      if (newLayer && !newLayer.neurons.includes(id)) {
        newLayer.neurons.push(id);
      }
    }

    Object.assign(neuron, updates);
    return neuron;
  }

  deleteNeuron(id) {
    const neuron = this.neurons.get(id);
    if (!neuron) return false;

    if (neuron.layerId) {
      const layer = this.layers.get(neuron.layerId);
      if (layer) {
        layer.neurons = layer.neurons.filter(nid => nid !== id);
      }
    }

    for (const [connId, conn] of this.connections) {
      if (conn.fromNeuron === id || conn.toNeuron === id) {
        this.connections.delete(connId);
      }
    }

    this.neurons.delete(id);
    this._notifyChange();
    return true;
  }

  // Connections
  createConnection(options = {}) {
    const id = options.id || `conn_${this._nextConnectionId++}`;
    const connection = {
      id,
      fromNeuron: options.fromNeuron || null,
      toNeuron: options.toNeuron || null,
      fromLayer: options.fromLayer || null,
      toLayer: options.toLayer || null,
      weight: options.weight ?? 0,
      style: options.style || {},
      metadata: options.metadata || {}
    };
    this.connections.set(id, connection);
    this._notifyChange();
    return connection;
  }

  getConnection(id) {
    return this.connections.get(id) || null;
  }

  getAllConnections() {
    return Array.from(this.connections.values());
  }

  getConnectionsByLayer(layerId, direction = 'both') {
    return Array.from(this.connections.values()).filter(conn => {
      if (direction === 'outgoing') return conn.fromLayer === layerId;
      if (direction === 'incoming') return conn.toLayer === layerId;
      return conn.fromLayer === layerId || conn.toLayer === layerId;
    });
  }

  getConnectionsByNeuron(neuronId, direction = 'both') {
    return Array.from(this.connections.values()).filter(conn => {
      if (direction === 'outgoing') return conn.fromNeuron === neuronId;
      if (direction === 'incoming') return conn.toNeuron === neuronId;
      return conn.fromNeuron === neuronId || conn.toNeuron === neuronId;
    });
  }

  getConnectionsBetweenLayers(fromLayerId, toLayerId) {
    return Array.from(this.connections.values()).filter(
      conn => conn.fromLayer === fromLayerId && conn.toLayer === toLayerId
    );
  }

  updateConnection(id, updates) {
    const connection = this.connections.get(id);
    if (!connection) return null;
    Object.assign(connection, updates);
    return connection;
  }

  deleteConnection(id) {
    const result = this.connections.delete(id);
    if (result) this._notifyChange();
    return result;
  }

  deleteConnectionsByNeuron(neuronId) {
    let count = 0;
    for (const [connId, conn] of this.connections) {
      if (conn.fromNeuron === neuronId || conn.toNeuron === neuronId) {
        this.connections.delete(connId);
        count++;
      }
    }
    if (count > 0) this._notifyChange();
    return count;
  }

  deleteConnectionsByLayer(layerId) {
    let count = 0;
    for (const [connId, conn] of this.connections) {
      if (conn.fromLayer === layerId || conn.toLayer === layerId) {
        this.connections.delete(connId);
        count++;
      }
    }
    if (count > 0) this._notifyChange();
    return count;
  }

  // Bulk operations
  connectLayers(fromLayerId, toLayerId, options = {}) {
    const fromLayer = this.layers.get(fromLayerId);
    const toLayer = this.layers.get(toLayerId);
    if (!fromLayer || !toLayer) return [];

    const created = [];
    const weightInit = options.weightInit || 'random';

    for (const fromNeuronId of fromLayer.neurons) {
      for (const toNeuronId of toLayer.neurons) {
        let weight = 0;
        if (weightInit === 'random') weight = (Math.random() - 0.5) * 0.5;
        else if (weightInit === 'xavier') weight = (Math.random() - 0.5) * Math.sqrt(6 / (fromLayer.neurons.length + toLayer.neurons.length));
        else if (weightInit === 'he') weight = (Math.random() - 0.5) * Math.sqrt(6 / fromLayer.neurons.length);

        const conn = this.createConnection({
          fromNeuron: fromNeuronId,
          toNeuron: toNeuronId,
          fromLayer: fromLayerId,
          toLayer: toLayerId,
          weight,
          ...options
        });
        created.push(conn);
      }
    }
    return created;
  }

  // State
  clear() {
    this.neurons.clear();
    this.layers.clear();
    this.connections.clear();
    this._nextNeuronId = 1;
    this._nextLayerId = 1;
    this._nextConnectionId = 1;
    this._notifyChange();
  }

  toJSON() {
    return {
      layers: Array.from(this.layers.values()),
      neurons: Array.from(this.neurons.values()),
      connections: Array.from(this.connections.values()),
      counters: {
        nextNeuronId: this._nextNeuronId,
        nextLayerId: this._nextLayerId,
        nextConnectionId: this._nextConnectionId
      }
    };
  }

  fromJSON(data) {
    this.clear();
    if (data.layers) data.layers.forEach(l => this.layers.set(l.id, l));
    if (data.neurons) data.neurons.forEach(n => this.neurons.set(n.id, n));
    if (data.connections) data.connections.forEach(c => this.connections.set(c.id, c));
    if (data.counters) {
      this._nextNeuronId = data.counters.nextNeuronId || 1;
      this._nextLayerId = data.counters.nextLayerId || 1;
      this._nextConnectionId = data.counters.nextConnectionId || 1;
    }
    this._notifyChange();
  }

  // Stats
  getStats() {
    return {
      layerCount: this.layers.size,
      neuronCount: this.neurons.size,
      connectionCount: this.connections.size,
      layers: Array.from(this.layers.values()).map(l => ({
        id: l.id,
        name: l.name,
        type: l.type,
        neuronCount: l.neurons.length
      }))
    };
  }
}

window.NetworkManager = NetworkManager;
