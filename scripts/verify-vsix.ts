import { readFileSync } from 'fs';
import { resolve } from 'path';
import { open, type ZipFile } from 'yauzl';

const DEV_ROOT = resolve(process.cwd());
const PKG_PATH = resolve(DEV_ROOT, 'package.json');

const REQUIRED_FILES = [
  'extension/dist/extension.cjs',
  'extension/dist/server/bundle.mjs',
  'extension/dist/client/index.html',
  'extension/dist/client/app.js',
  'extension/dist/client/styles.css',
  'extension/dist/client/vendor-socket.io.min.js',
  'extension/package.json',
  'extension/selectors.json',
  'extension/media/icon.png',
];

const FORBIDDEN_PATTERNS = [
  'node_modules/',
  '.env',
  'openvsx_token',
  'azure_token',
  'src/',
  'scripts/',
  '.cursor/',
];

function openZip(vsixPath: string): Promise<ZipFile> {
  return new Promise((resolveZip, reject) => {
    open(vsixPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) reject(err ?? new Error(`Could not open ${vsixPath}`));
      else resolveZip(zipfile);
    });
  });
}

function listZipEntries(vsixPath: string): Promise<string[]> {
  return new Promise((resolveList, reject) => {
    open(vsixPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err ?? new Error(`Could not open ${vsixPath}`));
        return;
      }

      const entries: string[] = [];
      zipfile.on('entry', (entry) => {
        entries.push(entry.fileName);
        zipfile.readEntry();
      });
      zipfile.on('end', () => resolveList(entries));
      zipfile.on('error', reject);
      zipfile.readEntry();
    });
  });
}

async function readZipText(vsixPath: string, fileName: string): Promise<string> {
  const zipfile = await openZip(vsixPath);
  return new Promise((resolveText, reject) => {
    zipfile.on('entry', (entry) => {
      if (entry.fileName !== fileName) {
        zipfile.readEntry();
        return;
      }

      zipfile.openReadStream(entry, (err, stream) => {
        if (err || !stream) {
          reject(err ?? new Error(`Could not read ${fileName}`));
          return;
        }

        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolveText(Buffer.concat(chunks).toString('utf-8')));
        stream.on('error', reject);
      });
    });
    zipfile.on('end', () => reject(new Error(`Entry not found: ${fileName}`)));
    zipfile.on('error', reject);
    zipfile.readEntry();
  });
}

async function main(): Promise<void> {
  const vsixArg = process.argv[2];
  let vsixPath: string;

  if (vsixArg) {
    vsixPath = resolve(DEV_ROOT, vsixArg);
  } else {
    const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf-8'));
    vsixPath = resolve(DEV_ROOT, 'releases', `cursor-remote-${pkg.version}.vsix`);
  }

  console.log(`Verifying ${vsixPath}\n`);

  let files: string[];
  try {
    files = await listZipEntries(vsixPath);
  } catch {
    console.error(`✗ Could not read ${vsixPath}. Was it built?`);
    process.exit(1);
  }

  let errors = 0;

  console.log('— Required files —');
  for (const required of REQUIRED_FILES) {
    const found = files.some(f => f === required || f.endsWith('/' + required));
    if (found) {
      console.log(`  ✓ ${required}`);
    } else {
      console.error(`  ✗ MISSING: ${required}`);
      errors++;
    }
  }

  console.log('\n— Forbidden patterns —');
  for (const pattern of FORBIDDEN_PATTERNS) {
    const matches = files.filter(f => {
      const inner = f.replace(/^extension\//, '');
      if (pattern.endsWith('/')) {
        return inner.startsWith(pattern);
      }
      const segments = inner.split('/');
      return segments.some(seg => seg === pattern);
    });
    if (matches.length === 0) {
      console.log(`  ✓ No ${pattern}`);
    } else {
      console.error(`  ✗ FOUND ${matches.length} files matching "${pattern}":`);
      for (const m of matches.slice(0, 5)) console.error(`      ${m}`);
      if (matches.length > 5) console.error(`      … and ${matches.length - 5} more`);
      errors++;
    }
  }

  const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf-8'));
  if (files.includes('extension/package.json')) {
    try {
      const innerPkgRaw = await readZipText(vsixPath, 'extension/package.json');
      const innerPkg = JSON.parse(innerPkgRaw).version ?? '';
      if (innerPkg === pkg.version) {
        console.log(`\n✓ Version match: ${pkg.version}`);
      } else {
        console.error(`\n✗ Version mismatch: VSIX has ${innerPkg}, repo has ${pkg.version}`);
        errors++;
      }
    } catch (err) {
      console.error(`\n✗ Could not read extension/package.json from VSIX: ${err instanceof Error ? err.message : err}`);
      errors++;
    }
  }

  const totalFiles = files.filter(f => !f.endsWith('/')).length;
  console.log(`\nTotal files in VSIX: ${totalFiles}`);

  if (errors > 0) {
    console.error(`\n✗ ${errors} verification error(s). Fix before publishing.`);
    process.exit(1);
  }

  console.log('\n✓ VSIX verification passed.');
}

main().catch((err) => {
  console.error(`✗ Verification failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
