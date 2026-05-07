import * as XLSX from 'xlsx';
import * as fs from 'fs';

try {
  const buf = fs.readFileSync('/tmp/export.xls');
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
  console.log('Headers:', Object.keys(json[0] || {}));
  console.log('First row:', JSON.stringify(json[0], null, 2));
  console.log('Total rows:', json.length);
} catch (err) {
  console.error(err);
}
