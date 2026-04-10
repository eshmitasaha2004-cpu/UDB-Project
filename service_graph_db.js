/**
 * Product-Manufacturer Graph Correlation — Port 2102
 * Database: Neo4j (Graph Database)
 * Why Neo4j? Relationships between products and manufacturers are
 * FIRST-CLASS citizens in graph databases. Finding "all manufacturers
 * who supply components for GPU products" is O(log n) via graph
 * traversal vs O(n²) in relational JOINs. Perfect for supply chain,
 * recommendations, and network analysis.
 *
 * Graph Model:
 *   (:Product {id, name, category}) -[:MANUFACTURED_BY]-> (:Manufacturer {id, name})
 *   (:Product) -[:COMPATIBLE_WITH]-> (:Product)
 *   (:Manufacturer) -[:SUPPLIES]-> (:Manufacturer) [supply chain]
 */

const express = require('express');
const app = express();
const PORT = 2102;

// ─── Neo4j In-Memory Graph Engine ────────────────────────────────────────────
class GraphDB {
  constructor() {
    this.nodes = new Map();    // id -> { id, labels, properties }
    this.edges = new Map();    // id -> { id, from, to, type, properties }
    this.nodeCounter = 0;
    this.edgeCounter = 0;
  }

  createNode(labels, properties) {
    const id = `n${++this.nodeCounter}`;
    const node = { id, labels: Array.isArray(labels) ? labels : [labels], properties: { ...properties, _id: id } };
    this.nodes.set(id, node);
    return node;
  }

  createEdge(fromId, toId, type, properties = {}) {
    const id = `e${++this.edgeCounter}`;
    const edge = { id, from: fromId, to: toId, type, properties };
    this.edges.set(id, edge);
    return edge;
  }

  findNodes(label, filter = {}) {
    return Array.from(this.nodes.values()).filter(n =>
      n.labels.includes(label) &&
      Object.entries(filter).every(([k, v]) => n.properties[k] === v)
    );
  }

  findEdges(type, fromId, toId) {
    return Array.from(this.edges.values()).filter(e =>
      (!type || e.type === type) &&
      (!fromId || e.from === fromId) &&
      (!toId || e.to === toId)
    );
  }

  // Graph traversal: find all products by manufacturer
  getProductsByManufacturer(manufacturerId) {
    const edges = this.findEdges('MANUFACTURED_BY', null, manufacturerId);
    return edges.map(e => this.nodes.get(e.from)).filter(Boolean);
  }

  // Find manufacturer of a product
  getManufacturerOfProduct(productId) {
    const edges = this.findEdges('MANUFACTURED_BY', productId, null);
    return edges.map(e => this.nodes.get(e.to)).filter(Boolean);
  }

  // Multi-hop: find all products compatible with a given product
  getCompatibleProducts(productId, depth = 1) {
    const visited = new Set([productId]);
    const result = [];
    let frontier = [productId];

    for (let d = 0; d < depth; d++) {
      const next = [];
      for (const nodeId of frontier) {
        const edges = this.findEdges('COMPATIBLE_WITH', nodeId, null);
        for (const e of edges) {
          if (!visited.has(e.to)) {
            visited.add(e.to);
            next.push(e.to);
            const node = this.nodes.get(e.to);
            if (node) result.push({ ...node, hopDistance: d + 1 });
          }
        }
      }
      frontier = next;
    }
    return result;
  }

  // Shortest path between two products (BFS)
  shortestPath(fromId, toId) {
    if (fromId === toId) return [fromId];
    const visited = new Set([fromId]);
    const queue = [[fromId, [fromId]]];

    while (queue.length) {
      const [current, path] = queue.shift();
      const allEdges = Array.from(this.edges.values()).filter(e => e.from === current || e.to === current);
      for (const edge of allEdges) {
        const neighbor = edge.from === current ? edge.to : edge.from;
        if (!visited.has(neighbor)) {
          const newPath = [...path, { via: edge.type, node: neighbor }];
          if (neighbor === toId) return newPath;
          visited.add(neighbor);
          queue.push([neighbor, newPath]);
        }
      }
    }
    return null;
  }

  // Degree centrality — who has the most connections?
  getCentrality() {
    const degree = new Map();
    for (const edge of this.edges.values()) {
      degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
      degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
    }
    return Array.from(degree.entries())
      .map(([id, deg]) => ({ node: this.nodes.get(id), degree: deg }))
      .filter(x => x.node)
      .sort((a, b) => b.degree - a.degree);
  }

  stats() {
    return {
      totalNodes: this.nodes.size,
      totalEdges: this.edges.size,
      nodesByLabel: this._countByLabel(),
      edgesByType: this._countByType()
    };
  }

  _countByLabel() {
    const counts = {};
    for (const n of this.nodes.values())
      n.labels.forEach(l => counts[l] = (counts[l] || 0) + 1);
    return counts;
  }

  _countByType() {
    const counts = {};
    for (const e of this.edges.values())
      counts[e.type] = (counts[e.type] || 0) + 1;
    return counts;
  }
}

// ─── Seed Graph Data ──────────────────────────────────────────────────────────
const graph = new GraphDB();

// Manufacturers (nodes)
const nvidia  = graph.createNode('Manufacturer', { id: 'mfr-nvidia',  name: 'NVIDIA Corporation',  country: 'USA',  founded: 1993, specialty: 'GPUs & AI chips' });
const intel   = graph.createNode('Manufacturer', { id: 'mfr-intel',   name: 'Intel Corporation',   country: 'USA',  founded: 1968, specialty: 'CPUs & Chipsets' });
const samsung = graph.createNode('Manufacturer', { id: 'mfr-samsung', name: 'Samsung Electronics', country: 'Korea',founded: 1969, specialty: 'Memory & Storage' });
const corsair = graph.createNode('Manufacturer', { id: 'mfr-corsair', name: 'Corsair Gaming',      country: 'USA',  founded: 1994, specialty: 'PC components' });
const asus    = graph.createNode('Manufacturer', { id: 'mfr-asus',    name: 'ASUS',                country: 'Taiwan',founded: 1989, specialty: 'Motherboards & peripherals' });
const tsmc    = graph.createNode('Manufacturer', { id: 'mfr-tsmc',    name: 'TSMC',                country: 'Taiwan',founded: 1987, specialty: 'Semiconductor fabrication' });

// Products (nodes)
const gpu    = graph.createNode('Product', { id: 'prod-gpu',    name: 'RTX 4090 GPU',      category: 'Electronics', price: 1599.99 });
const cpu    = graph.createNode('Product', { id: 'prod-cpu',    name: 'Core i9-14900K',    category: 'Processors',  price: 549.99 });
const ram    = graph.createNode('Product', { id: 'prod-ram',    name: 'DDR5 32GB RAM',     category: 'Electronics', price: 189.99 });
const ssd    = graph.createNode('Product', { id: 'prod-ssd',    name: 'Samsung 4TB SSD',   category: 'Storage',     price: 299.99 });
const mb     = graph.createNode('Product', { id: 'prod-mb',     name: 'ROG Motherboard',   category: 'Motherboards',price: 449.99 });

// MANUFACTURED_BY edges
graph.createEdge(gpu.id,  nvidia.id,  'MANUFACTURED_BY', { since: 2022, contract: 'direct' });
graph.createEdge(cpu.id,  intel.id,   'MANUFACTURED_BY', { since: 2023, contract: 'direct' });
graph.createEdge(ram.id,  corsair.id, 'MANUFACTURED_BY', { since: 2021, contract: 'OEM' });
graph.createEdge(ssd.id,  samsung.id, 'MANUFACTURED_BY', { since: 2020, contract: 'direct' });
graph.createEdge(mb.id,   asus.id,    'MANUFACTURED_BY', { since: 2022, contract: 'direct' });

// SUPPLIES edges (supply chain: who supplies whom)
graph.createEdge(tsmc.id,   nvidia.id,  'SUPPLIES', { component: 'Ada Lovelace chips', node: '4nm' });
graph.createEdge(tsmc.id,   intel.id,   'SUPPLIES', { component: 'Meteor Lake tiles',  node: '3nm' });
graph.createEdge(samsung.id, corsair.id,'SUPPLIES', { component: 'DDR5 DRAM dies',     node: '10nm' });

// COMPATIBLE_WITH edges (product interoperability graph)
graph.createEdge(gpu.id, mb.id,  'COMPATIBLE_WITH', { interface: 'PCIe 5.0 x16', verified: true });
graph.createEdge(cpu.id, mb.id,  'COMPATIBLE_WITH', { interface: 'LGA1700',       verified: true });
graph.createEdge(ram.id, mb.id,  'COMPATIBLE_WITH', { interface: 'DDR5 DIMM',     verified: true });
graph.createEdge(ssd.id, mb.id,  'COMPATIBLE_WITH', { interface: 'M.2 PCIe 4.0',  verified: true });
graph.createEdge(cpu.id, ram.id, 'COMPATIBLE_WITH', { interface: 'DDR5 channel',   verified: true });

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Service info
app.get('/', (req, res) => {
  res.json({
    service: 'Product-Manufacturer Graph DB',
    database: 'Neo4j (Graph Database)',
    port: PORT,
    graphStats: graph.stats(),
    justification: 'Neo4j chosen because manufacturer-product relationships form a multi-hop graph. Cypher queries traverse relationships in O(k) hops vs SQL JOINs that scan entire tables. Supply chain analysis, compatibility checks, and centrality metrics are native graph operations.',
    cypher: {
      findProductsByManufacturer: 'MATCH (p:Product)-[:MANUFACTURED_BY]->(m:Manufacturer {name: $name}) RETURN p',
      supplyChain: 'MATCH path = (tsmc:Manufacturer)-[:SUPPLIES*1..3]->(m:Manufacturer)-[:MANUFACTURED_BY]<-(p:Product) RETURN path',
      compatibilityCheck: 'MATCH (a:Product)-[:COMPATIBLE_WITH]-(b:Product) WHERE a.id = $id RETURN b'
    }
  });
});

// Get full graph for visualization
app.get('/graph', (req, res) => {
  const nodes = Array.from(graph.nodes.values());
  const edges = Array.from(graph.edges.values()).map(e => ({
    ...e,
    fromNode: graph.nodes.get(e.from)?.properties?.name,
    toNode: graph.nodes.get(e.to)?.properties?.name
  }));
  res.json({ nodes, edges, stats: graph.stats() });
});

// All manufacturers
app.get('/manufacturers', (req, res) => {
  const manufacturers = graph.findNodes('Manufacturer');
  const enriched = manufacturers.map(m => ({
    ...m,
    productsManufactured: graph.getProductsByManufacturer(m.id).length,
    supplies: graph.findEdges('SUPPLIES', m.id, null).map(e => graph.nodes.get(e.to)?.properties?.name)
  }));
  res.json({ count: enriched.length, manufacturers: enriched });
});

// Products by manufacturer
app.get('/manufacturer/:id/products', (req, res) => {
  const mfr = graph.findNodes('Manufacturer').find(n => n.properties.id === req.params.id);
  if (!mfr) return res.status(404).json({ error: 'Manufacturer not found' });
  const products = graph.getProductsByManufacturer(mfr.id);
  res.json({ manufacturer: mfr.properties, productCount: products.length, products: products.map(p => p.properties) });
});

// All products with their manufacturer
app.get('/products', (req, res) => {
  const products = graph.findNodes('Product');
  const enriched = products.map(p => {
    const mfrs = graph.getManufacturerOfProduct(p.id);
    const compatible = graph.getCompatibleProducts(p.id, 2);
    return {
      ...p.properties,
      manufacturer: mfrs[0]?.properties || null,
      compatibleWith: compatible.map(c => c.properties?.name)
    };
  });
  res.json({ count: enriched.length, products: enriched });
});

// Compatibility check
app.get('/product/:id/compatible', (req, res) => {
  const product = Array.from(graph.nodes.values()).find(n => n.properties.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const compatible = graph.getCompatibleProducts(product.id, 2);
  res.json({
    product: product.properties.name,
    compatibleProducts: compatible.map(c => ({ ...c.properties, hopDistance: c.hopDistance }))
  });
});

// Supply chain traversal
app.get('/supply-chain', (req, res) => {
  const suppliers = graph.findNodes('Manufacturer');
  const chain = suppliers.map(s => ({
    supplier: s.properties.name,
    suppliesTo: graph.findEdges('SUPPLIES', s.id, null).map(e => ({
      manufacturer: graph.nodes.get(e.to)?.properties?.name,
      component: e.properties.component,
      node: e.properties.node
    }))
  })).filter(s => s.suppliesTo.length > 0);
  res.json({ supplyChain: chain });
});

// Centrality analysis
app.get('/analysis/centrality', (req, res) => {
  const centrality = graph.getCentrality();
  res.json({
    description: 'Node degree centrality — higher = more connections = more important in the network',
    centrality: centrality.map(c => ({
      name: c.node.properties.name,
      labels: c.node.labels,
      degree: c.degree,
      role: c.degree >= 4 ? 'Hub' : c.degree >= 2 ? 'Connector' : 'Leaf'
    }))
  });
});

// Shortest path
app.get('/path', (req, res) => {
  const { from, to } = req.query;
  const allNodes = Array.from(graph.nodes.values());
  const fromNode = allNodes.find(n => n.properties.name?.toLowerCase().includes(from?.toLowerCase()));
  const toNode   = allNodes.find(n => n.properties.name?.toLowerCase().includes(to?.toLowerCase()));
  if (!fromNode || !toNode) return res.status(404).json({ error: 'One or both nodes not found' });
  const path = graph.shortestPath(fromNode.id, toNode.id);
  res.json({ from: fromNode.properties.name, to: toNode.properties.name, path });
});

app.listen(PORT, () => {
  console.log(`🔵 Graph DB Service running on port ${PORT}`);
  console.log(`🕸️  Neo4j simulation | ${graph.stats().totalNodes} nodes, ${graph.stats().totalEdges} edges`);
});

module.exports = { app, graph };
