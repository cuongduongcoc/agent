// data-loader.js — Load ReadyShield demo dataset from Excel
const XLSX = require('xlsx');
const path = require('path');

const EXCEL_PATH = process.env.EXCEL_PATH || 'C:\\ThaiPH\\AI\\ReadyShield_Demo_Dataset (4).xlsx';

let _cache = null;

function load() {
  if (_cache) return _cache;

  const wb = XLSX.readFile(EXCEL_PATH);

  // --- 04_FullDataset: 5000 customers with all columns ---
  const ws4 = wb.Sheets['04_FullDataset'];
  const rows4 = XLSX.utils.sheet_to_json(ws4, { header: 1, defval: null });
  const headers4 = rows4[3];
  const customers = {};
  for (let i = 4; i < rows4.length; i++) {
    const r = rows4[i];
    if (!r[0]) continue;
    const obj = {};
    headers4.forEach((h, j) => { obj[h] = r[j]; });
    customers[obj.customer_id] = obj;
  }

  // --- 03_CustomerProfiles: 20 demo customers (readable summary) ---
  const ws3 = wb.Sheets['03_CustomerProfiles'];
  const rows3 = XLSX.utils.sheet_to_json(ws3, { header: 1, defval: null });
  const headers3 = rows3[4];
  const profiles = {};
  for (let i = 5; i < rows3.length; i++) {
    const r = rows3[i];
    if (!r[0]) continue;
    const obj = {};
    headers3.forEach((h, j) => { obj[h] = r[j]; });
    profiles[obj.customer_id] = obj;
  }

  // --- 06_AgentLoopData: G0 real-time, G6 interaction, G7 loop state ---
  const ws6 = wb.Sheets['06_AgentLoopData'];
  const rows6 = XLSX.utils.sheet_to_json(ws6, { header: 1, defval: null });

  // G0 — Real-time behaviour signals (header at row 18, data from row 19)
  const g0Headers = rows6[18];
  const realtime = {};
  for (let i = 19; i < rows6.length; i++) {
    const r = rows6[i];
    if (!r[0] || !g0Headers) break;
    if (typeof r[0] !== 'string' || !r[0].startsWith('VN')) continue;
    const obj = {};
    g0Headers.forEach((h, j) => { if (h) obj[h] = r[j]; });
    realtime[obj.customer_id] = obj;
  }

  // G6 — Interaction history (header at row 42, data from row 43)
  const g6Headers = rows6[42];
  const interactions = {};
  for (let i = 43; i < rows6.length; i++) {
    const r = rows6[i];
    if (!r[0] || !g6Headers) break;
    if (typeof r[0] !== 'string' || !r[0].startsWith('VN')) continue;
    const obj = {};
    g6Headers.forEach((h, j) => { if (h) obj[h] = r[j]; });
    interactions[obj.customer_id] = obj;
  }

  // G7 — Agent loop state (header at row 66, data from row 67)
  const g7Headers = rows6[66];
  const loopStates = {};
  for (let i = 67; i < rows6.length; i++) {
    const r = rows6[i];
    if (!r[0] || !g7Headers) break;
    if (typeof r[0] !== 'string' || !r[0].startsWith('VN')) continue;
    const obj = {};
    g7Headers.forEach((h, j) => { if (h) obj[h] = r[j]; });
    loopStates[obj.customer_id] = obj;
  }

  // --- 07_RealProductCatalogue ---
  const ws7 = wb.Sheets['07_RealProductCatalogue'];
  const rows7 = XLSX.utils.sheet_to_json(ws7, { header: 1, defval: null });
  const headers7 = rows7[3];
  const products = [];
  for (let i = 4; i < rows7.length; i++) {
    const r = rows7[i];
    if (!r[0]) continue;
    const obj = {};
    headers7.forEach((h, j) => { obj[h] = r[j]; });
    products.push(obj);
  }

  // --- 08_RealProductPremiumTable ---
  const ws8 = wb.Sheets['08_RealProductPremiumTable'];
  const rows8 = XLSX.utils.sheet_to_json(ws8, { header: 1, defval: null });
  const headers8 = rows8[3];
  const premiums = [];
  for (let i = 4; i < rows8.length; i++) {
    const r = rows8[i];
    if (!r[0]) continue;
    const obj = {};
    headers8.forEach((h, j) => { obj[h] = r[j]; });
    premiums.push(obj);
  }

  _cache = { customers, profiles, realtime, interactions, loopStates, products, premiums };
  return _cache;
}

function getCustomer(id) {
  const d = load();
  return {
    full: d.customers[id] || null,
    profile: d.profiles[id] || null,
    realtime: d.realtime[id] || null,
    interaction: d.interactions[id] || null,
    loopState: d.loopStates[id] || null,
  };
}

function getProducts() {
  const d = load();
  return d.products.map(p => {
    const tierPremiums = d.premiums.filter(pr => pr.product_id === p.product_id && pr.tier_name === p.tier_name);
    const minPremium = tierPremiums.length > 0 ? Math.min(...tierPremiums.map(pr => pr.annual_premium_vnd)) : null;
    return { ...p, min_premium_vnd: minPremium };
  });
}

function getPremiums() {
  return load().premiums;
}

function lookupPremium(productId, tierName, age, gender) {
  const premiums = load().premiums;
  return premiums.find(p =>
    p.product_id === productId &&
    p.tier_name === tierName &&
    age >= p.age_min && age <= p.age_max &&
    (!p.gender || p.gender === gender || p.gender === 'Nam/Nữ' || p.gender === 'Cả hai')
  );
}

// List demo customer IDs (from profiles sheet — 20 curated demo customers)
function getDemoCustomerIds() {
  return Object.keys(load().profiles);
}

// Get recommended product from sheet 3 ("Sản phẩm đề xuất" column)
function getRecommendedProduct(customerId) {
  const d = load();
  const profile = d.profiles[customerId];
  if (!profile) return null;
  const recommendation = profile['Sản phẩm đề xuất'];
  if (!recommendation || recommendation === 'Not applicable') return null;
  const parts = recommendation.split(' — ');
  const productName = parts[0]?.trim();
  const tierName = parts[1]?.trim();
  const product = d.products.find(p => p.product_name === productName && p.tier_name === tierName);
  return product || null;
}

module.exports = { load, getCustomer, getProducts, getPremiums, lookupPremium, getDemoCustomerIds, getRecommendedProduct };
