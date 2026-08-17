const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');

const financePath = path.join(__dirname, '../data/finance.json');
const readFinance = () => JSON.parse(fs.readFileSync(financePath, 'utf8'));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

// GET /api/finance/summary
router.get('/summary', requireAuth, (req, res) => {
  const data = readFinance();
  res.json({ success: true, ...data.summary });
});

// GET /api/finance/revenue-quarters
router.get('/revenue-quarters', requireAuth, (req, res) => {
  const data = readFinance();
  res.json({ success: true, ...data.revenueQuarters });
});

// GET /api/finance/cashflow
router.get('/cashflow', requireAuth, (req, res) => {
  const data = readFinance();
  res.json({ success: true, ...data.cashflow });
});

// GET /api/finance/ap-aging
router.get('/ap-aging', requireAuth, (req, res) => {
  const data = readFinance();
  res.json({ success: true, ...data.apAging });
});

// GET /api/finance/expenses
router.get('/expenses', requireAuth, (req, res) => {
  const data = readFinance();
  res.json({ success: true, ...data.expenseCategories });
});

// GET /api/finance/invoice-aging
router.get('/invoice-aging', requireAuth, (req, res) => {
  const data = readFinance();
  res.json({ success: true, ...data.invoiceAging });
});

module.exports = router;
