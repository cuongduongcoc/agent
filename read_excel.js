const XLSX = require('xlsx');
const wb = XLSX.readFile('D:\\ReadyShield_Demo_Dataset (4).xlsx');
const result = { sheetNames: wb.SheetNames, sheets: {} };
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  result.sheets[name] = {
    rows: data.length,
    cols: data[0] ? data[0].length : 0,
    header: data[0] || [],
    firstRows: data.slice(0, 6)
  };
}
console.log(JSON.stringify(result, null, 2));
