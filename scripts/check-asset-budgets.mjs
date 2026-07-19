import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/build/', import.meta.url));
const limits = new Map([['.js', 300 * 1024], ['.css', 160 * 1024]]);
const failures = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else {
      const limit = limits.get(entry.name.slice(entry.name.lastIndexOf('.')));
      if (limit && (await stat(path)).size > limit) failures.push(`${path} exceeds ${limit} bytes`);
    }
  }
}

try { await walk(root); } catch (error) {
  if (error.code === 'ENOENT') { console.error('Asset budget check: public/build is missing'); process.exit(1); }
  throw error;
}
if (failures.length) { failures.forEach((failure) => console.error(failure)); process.exit(1); }
console.log('Asset budget check: PASS');
