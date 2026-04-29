import fs from 'fs';
import path from 'path';
console.log('CWD:', process.cwd());
const p = path.join(process.cwd(), 'data', 'elections.json');
console.log('Path:', p);
console.log('Exists:', fs.existsSync(p));
