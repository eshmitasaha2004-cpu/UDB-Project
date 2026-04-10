/**
 * Inventory Stack Management API — Port 2101
 * Database: MongoDB (Document Store / NoSQL)
 * Why MongoDB? Inventory items are schema-flexible documents.
 * Products have varying attributes — electronics differ from food.
 * MongoDB's BSON documents handle nested data naturally without joins.
 * CRUD: add, view/id, view/all, update/id, delete/id
 */

const express = require('express');
const crypto = require('crypto');
const app = express();
const PORT = 2101;

// MongoDB simulation (replace with mongoose in production)
class MongoCollection {
  constructor(name) {
    this.name = name;
    this.documents = new Map();
  }

  // INSERT ONE
  insertOne(doc) {
    const _id = crypto.randomBytes(12).toString('hex');
    const document = {
      _id,
      ...doc,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.documents.set(_id, document);
    return { insertedId: _id, acknowledged: true };
  }

  // FIND ONE
  findById(id) {
    return this.documents.get(id) || null;
  }

  // FIND ALL (with optional filter)
  find(filter = {}) {
    const docs = Array.from(this.documents.values());
    if (!Object.keys(filter).length) return docs;
    return docs.filter(doc =>
      Object.entries(filter).every(([k, v]) =>
        typeof v === 'string'
          ? doc[k]?.toLowerCase().includes(v.toLowerCase())
          : doc[k] === v
      )
    );
  }

  // UPDATE ONE
  updateById(id, updates) {
    const doc = this.documents.get(id);
    if (!doc) return { matchedCount: 0, modifiedCount: 0 };
    const updated = { ...doc, ...updates, _id: id, updatedAt: new Date().toISOString() };
    this.documents.set(id, updated);
    return { matchedCount: 1, modifiedCount: 1 };
  }

  // DELETE ONE
  deleteById(id) {
    if (!this.documents.has(id)) return { deletedCount: 0 };
    this.documents.delete(id);
    return { deletedCount: 1 };
  }

  countDocuments() { return this.documents.size; }
}

// Initialize MongoDB collection with seed data
const inventoryDB = new MongoCollection('inventory');

const seedProducts = [
  { name: 'RTX 4090 GPU', category: 'Electronics', quantity: 15, price: 1599.99, sku: 'GPU-4090', manufacturer: 'mfr-nvidia', unit: 'piece', location: 'Warehouse-A', minStock: 5 },
  { name: 'DDR5 32GB RAM', category: 'Electronics', quantity: 50, price: 189.99, sku: 'RAM-DDR5-32', manufacturer: 'mfr-corsair', unit: 'piece', location: 'Warehouse-A', minStock: 10 },
  { name: 'Samsung 4TB SSD', category: 'Storage', quantity: 30, price: 299.99, sku: 'SSD-4TB-SAM', manufacturer: 'mfr-samsung', unit: 'piece', location: 'Warehouse-B', minStock: 8 },
  { name: 'Intel Core i9-14900K', category: 'Processors', quantity: 25, price: 549.99, sku: 'CPU-I9-14900K', manufacturer: 'mfr-intel', unit: 'piece', location: 'Warehouse-A', minStock: 5 },
  { name: 'ASUS ROG Motherboard', category: 'Motherboards', quantity: 12, price: 449.99, sku: 'MB-ASUS-ROG', manufacturer: 'mfr-asus', unit: 'piece', location: 'Warehouse-C', minStock: 3 },
];

seedProducts.forEach(p => inventoryDB.insertOne(p));

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// Service info
app.get('/', (req, res) => {
  res.json({
    service: 'Inventory Stack Management',
    database: 'MongoDB (Document Store)',
    port: PORT,
    totalProducts: inventoryDB.countDocuments(),
    justification: 'MongoDB chosen for flexible document schema — inventory items vary wildly in attributes. No JOIN overhead, horizontal scaling, and native JSON support make it ideal for heterogeneous product catalogs.',
    endpoints: {
      'POST /inventory/add': 'Add new product',
      'GET /inventory/view/all': 'View all products',
      'GET /inventory/view/:id': 'View product by ID',
      'PUT /inventory/update/:id': 'Update product by ID',
      'DELETE /inventory/delete/:id': 'Delete product by ID',
      'GET /inventory/search?q=': 'Search products',
      'GET /inventory/low-stock': 'Products below minimum stock'
    }
  });
});

// ADD — POST /inventory/add
app.post('/inventory/add', (req, res) => {
  const { name, category, quantity, price, sku, manufacturer, unit, location, minStock } = req.body;

  if (!name || quantity === undefined || !price) {
    return res.status(400).json({ error: 'name, quantity, and price are required' });
  }

  const result = inventoryDB.insertOne({
    name, category: category || 'Uncategorized',
    quantity: Number(quantity), price: Number(price),
    sku: sku || `SKU-${Date.now()}`,
    manufacturer: manufacturer || null,
    unit: unit || 'piece',
    location: location || 'Warehouse-A',
    minStock: Number(minStock) || 5,
    stockStatus: quantity < (minStock || 5) ? 'low' : 'ok'
  });

  const doc = inventoryDB.findById(result.insertedId);
  res.status(201).json({ success: true, message: 'Product added to inventory', product: doc });
});

// VIEW ALL — GET /inventory/view/all
app.get('/inventory/view/all', (req, res) => {
  const { category, sort } = req.query;
  let products = inventoryDB.find(category ? { category } : {});

  if (sort === 'price') products.sort((a, b) => a.price - b.price);
  if (sort === 'quantity') products.sort((a, b) => b.quantity - a.quantity);
  if (sort === 'name') products.sort((a, b) => a.name.localeCompare(b.name));

  res.json({
    success: true, count: products.length,
    totalValue: products.reduce((s, p) => s + p.price * p.quantity, 0).toFixed(2),
    products
  });
});

// VIEW BY ID — GET /inventory/view/:id
app.get('/inventory/view/:id', (req, res) => {
  const product = inventoryDB.findById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found', id: req.params.id });
  res.json({ success: true, product });
});

// UPDATE BY ID — PUT /inventory/update/:id
app.put('/inventory/update/:id', (req, res) => {
  const result = inventoryDB.updateById(req.params.id, req.body);
  if (result.matchedCount === 0) return res.status(404).json({ error: 'Product not found' });
  const updated = inventoryDB.findById(req.params.id);
  res.json({ success: true, message: 'Product updated', product: updated });
});

// DELETE BY ID — DELETE /inventory/delete/:id
app.delete('/inventory/delete/:id', (req, res) => {
  const product = inventoryDB.findById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  inventoryDB.deleteById(req.params.id);
  res.json({ success: true, message: 'Product deleted', deleted: product });
});

// SEARCH
app.get('/inventory/search', (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query param q is required' });
  const results = inventoryDB.find().filter(p =>
    p.name.toLowerCase().includes(q.toLowerCase()) ||
    p.category?.toLowerCase().includes(q.toLowerCase()) ||
    p.sku?.toLowerCase().includes(q.toLowerCase())
  );
  res.json({ success: true, query: q, count: results.length, results });
});

// LOW STOCK
app.get('/inventory/low-stock', (req, res) => {
  const products = inventoryDB.find().filter(p => p.quantity < (p.minStock || 5));
  res.json({ success: true, count: products.length, lowStockItems: products });
});

app.listen(PORT, () => {
  console.log(`🟢 Inventory API running on port ${PORT}`);
  console.log(`📦 MongoDB simulation | ${inventoryDB.countDocuments()} products seeded`);
});

module.exports = { app, inventoryDB };
