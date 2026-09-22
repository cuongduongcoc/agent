// server.js — Express server for NEXA interactive demo
const express = require('express');
const path = require('path');
const scenarios = require('./agent/scenarios');
const interactive = require('./agent/interactive');
const dataLoader = require('./data-loader');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── Existing scenario API (kept for reference) ─────────────────────
app.get('/api/scenarios', (req, res) => res.json(scenarios.getScenarios()));
app.get('/api/scenario/:id', (req, res) => res.json(scenarios.runScenario(req.params.id)));
app.get('/api/customer/:id', (req, res) => res.json(dataLoader.getCustomer(req.params.id)));
app.get('/api/products', (req, res) => res.json(dataLoader.getProducts()));

// ─── Interactive API ────────────────────────────────────────────────

// Get transaction types
app.get('/api/transactions', (req, res) => {
  res.json(Object.entries(interactive.TRANSACTION_TYPES).map(([id, t]) => ({
    id, label: t.label, icon: t.icon, desc: t.desc,
  })));
});

// Get refusal reasons
app.get('/api/refusal-reasons', (req, res) => {
  res.json(interactive.REFUSAL_REASONS);
});

// Get demo customers (20 curated)
app.get('/api/demo-customers', (req, res) => {
  const ids = dataLoader.getDemoCustomerIds();
  const customers = ids.map(id => {
    const { full, profile } = dataLoader.getCustomer(id);
    return {
      id,
      name: profile?.['Tên KH'] || id,
      age: full?.age,
      income: full?.monthly_income_trVND,
      needScore: full?.protection_need_score,
      needLevel: full?.need_level,
      readinessScore: full?.readiness_score,
      readinessLevel: full?.readiness_level,
      segment: full?.segment,
    };
  });
  res.json(customers);
});

// Analyze a transaction → return assessment + suggestion message
app.post('/api/analyze', (req, res) => {
  const { customerId, txType, amount } = req.body;
  const result = interactive.analyzeTransaction(customerId, txType, amount);
  if (result.error) return res.status(400).json(result);
  const message = interactive.buildSuggestionMessage(result);
  res.json({ ...result, message });
});

// Handle customer refusal → return follow-up question
app.post('/api/refuse', (req, res) => {
  const { reasonId, product } = req.body;
  const response = interactive.handleRefusal(reasonId, product);
  res.json(response);
});

// Handle customer acceptance → return enrollment + GCNBH
app.post('/api/accept', (req, res) => {
  const { customerId, product } = req.body;
  const response = interactive.handleAcceptance(customerId, product);
  res.json(response);
});

// Compare insurance products for a customer
app.get('/api/compare-products/:customerId', (req, res) => {
  const result = interactive.compareProducts(req.params.customerId);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// ─── Start ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  NEXA × MSB — Interactive AI Agent Demo`);
  console.log(`  ────────────────────────────────────────`);
  console.log(`  Server:  http://localhost:${PORT}`);
  console.log();
});
