#!/usr/bin/env node
/**
 * Builds lib/client.js from the src/client fragments.
 *
 * The DSH client bundle must be ONE plain side-effect script with no ESM
 * import/export statements (the platform serves it through the module
 * loader). Keeping the sources as ordered fragments that share one IIFE
 * scope gives us real modular source files without any bundler, and the
 * fragment order below is the contract.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fragments = [
  '00-defs.js',
  '01-composite.js',
  '02-runtime.js',
  '03-settings-ui.js',
  '04-entry.js',
];

const banner = `// dsh-scenery client bundle — built artifact.
// Do not edit by hand: sources live in src/client/ and are concatenated by
// scripts/build.mjs (run \`npm run build\`). Served by DSH at
// /plugins/dsh-scenery/client.js (declared via dsh.client in package.json).
'use strict';
(() => {
`;

const tail = `
})();
`;

let body = '';
for (const f of fragments) {
  body += '\n//#region src/client/' + f + '\n';
  body += readFileSync(join(root, 'src', 'client', f), 'utf8');
  body += '\n//#endregion\n';
}

const out = banner + body + tail;
mkdirSync(join(root, 'lib'), { recursive: true });
writeFileSync(join(root, 'lib', 'client.js'), out, 'utf8');

// syntax sanity
for (const f of ['lib/index.js', 'lib/client.js']) {
  execFileSync(process.execPath, ['--check', join(root, f)], { stdio: 'inherit' });
}
console.log('built lib/client.js (' + (out.length / 1024).toFixed(1) + ' KB) + syntax checks passed');
