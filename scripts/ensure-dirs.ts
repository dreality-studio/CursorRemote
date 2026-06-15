import { mkdirSync } from 'fs';

for (const dir of process.argv.slice(2)) {
  mkdirSync(dir, { recursive: true });
}
