const express = require('express');
const cors = require('cors');

const app = express();

// ===== Middleware =====
app.use(cors());
app.use(express.json());

// ===== Serve static files from public/ =====
app.use(express.static('public'));

// ===== In-Memory Storage =====
let transactions = [];
let nextId = 1;

// ===== Helper Functions =====
function generateId() {
  return String(nextId++);
}

function getCurrentTimestamp() {
  return new Date().toISOString();
}

// ===== Routes =====

// GET /api/health — Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// GET /api/transactions — Retrieve all transactions
app.get('/api/transactions', (req, res) => {
  res.json(transactions);
});

// POST /api/transactions — Create a new transaction
app.post('/api/transactions', (req, res) => {
  const { type, category, amount, date, note } = req.body;

  // Basic validation
  const errors = [];
  if (!type || !['income', 'expense'].includes(type)) {
    errors.push('type must be "income" or "expense"');
  }
  if (typeof amount !== 'number' || amount <= 0) {
    errors.push('amount must be a positive number');
  }
  if (!category || typeof category !== 'string' || category.trim() === '') {
    errors.push('category is required and must be a non-empty string');
  }
  if (!date || isNaN(Date.parse(date))) {
    errors.push('date must be a valid ISO date string');
  }

  if (errors.length > 0) {
    return res.status(400).json({ valid: false, errors });
  }

  const now = getCurrentTimestamp();
  const newTransaction = {
    id: generateId(),
    type,
    category: category.trim(),
    amount,
    date,
    note: note || '',
    createdAt: now,
    updatedAt: now,
  };

  transactions.push(newTransaction);
  res.status(201).json(newTransaction);
});

// PUT /api/transactions/:id — Update an existing transaction
app.put('/api/transactions/:id', (req, res) => {
  const { id } = req.params;
  const index = transactions.findIndex((t) => t.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  const { type, category, amount, date, note } = req.body;

  // Basic validation
  const errors = [];
  if (type !== undefined && !['income', 'expense'].includes(type)) {
    errors.push('type must be "income" or "expense"');
  }
  if (amount !== undefined && (typeof amount !== 'number' || amount <= 0)) {
    errors.push('amount must be a positive number');
  }
  if (category !== undefined && (typeof category !== 'string' || category.trim() === '')) {
    errors.push('category is required and must be a non-empty string');
  }
  if (date !== undefined && isNaN(Date.parse(date))) {
    errors.push('date must be a valid ISO date string');
  }

  if (errors.length > 0) {
    return res.status(400).json({ valid: false, errors });
  }

  const now = getCurrentTimestamp();
  const existing = transactions[index];

  const updatedTransaction = {
    ...existing,
    type: type !== undefined ? type : existing.type,
    category: category !== undefined ? category.trim() : existing.category,
    amount: amount !== undefined ? amount : existing.amount,
    date: date !== undefined ? date : existing.date,
    note: note !== undefined ? note : existing.note,
    updatedAt: now,
  };

  transactions[index] = updatedTransaction;
  res.json(updatedTransaction);
});

// DELETE /api/transactions/:id — Delete a transaction
app.delete('/api/transactions/:id', (req, res) => {
  const { id } = req.params;
  const index = transactions.findIndex((t) => t.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  const deletedTransaction = transactions.splice(index, 1)[0];
  res.json({ message: 'Transaction deleted successfully', transaction: deletedTransaction });
});

// ===== Export for Vercel Serverless =====
module.exports = app;

// ===== Start server locally (if run directly) =====
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}