const XLSX = require('xlsx');
const wb = XLSX.readFile('D:\\ReadyShield_Demo_Dataset (4).xlsx');

// Customer profiles (20 demo)
const ws3 = wb.Sheets['03_CustomerProfiles'];
const d3 = XLSX.utils.sheet_to_json(ws3, { header: 1, defval: null });
console.log('===== 03_CustomerProfiles headers (row 4) =====');
console.log(JSON.stringify(d3[4], null, 2));
console.log('\n===== First 3 customers =====');
for (let i = 5; i < 8; i++) console.log(JSON.stringify(d3[i]));

// Real product catalogue
const ws7 = wb.Sheets['07_RealProductCatalogue'];
const d7 = XLSX.utils.sheet_to_json(ws7, { header: 1, defval: null });
console.log('\n===== 07_RealProductCatalogue headers (row 3) =====');
console.log(JSON.stringify(d7[3], null, 2));
console.log('\n===== All products =====');
for (let i = 4; i < d7.length; i++) {
  const row = d7[i].filter(c => c !== null && c !== '');
  if (row.length > 0) console.log(`R${i}: ${JSON.stringify(row.slice(0, 6))}`);
}

// Premium table sample
const ws8 = wb.Sheets['08_RealProductPremiumTable'];
const d8 = XLSX.utils.sheet_to_json(ws8, { header: 1, defval: null });
console.log('\n===== 08_RealProductPremiumTable headers (row 3) =====');
console.log(JSON.stringify(d8[3], null, 2));
console.log('\n===== Sample premiums =====');
for (let i = 4; i < 12; i++) console.log(JSON.stringify(d8[i]));
