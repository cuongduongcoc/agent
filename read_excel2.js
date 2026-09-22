const XLSX = require('xlsx');
const wb = XLSX.readFile('D:\\ReadyShield_Demo_Dataset (4).xlsx');

function dumpSheet(name, maxRows) {
  const ws = wb.Sheets[name];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  console.log(`\n===== ${name} (${data.length} rows) =====`);
  for (let i = 0; i < Math.min(data.length, maxRows || data.length); i++) {
    const row = data[i].filter(c => c !== null && c !== '');
    if (row.length > 0) console.log(`R${i}: ${JSON.stringify(row)}`);
  }
}

dumpSheet('05_ScoringEngine');
dumpSheet('06_AgentLoopData');
dumpSheet('02_ProductCatalogue');
