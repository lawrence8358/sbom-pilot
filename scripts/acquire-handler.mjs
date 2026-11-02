import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { rcompare } from 'semver';
import JSZip from 'jszip';
import { downloadBytes } from '../.test-build/src/network/http.js';

// Developer verification only. Agent handler provisioning remains the Agent's job.
if (process.platform !== 'win32') throw new Error('Use official Node Docker images for Linux handler verification.');
const major = process.argv[2] || '20';
if (!['20', '24'].includes(major)) throw new Error('Expected handler major20 or24.');
const index = JSON.parse((await downloadBytes('https://nodejs.org/dist/index.json')).toString());
const version = index.filter(item => item.version.startsWith(`v${major}.`) && item.files.includes(`win-${process.arch}-zip`)).map(item => item.version).sort(rcompare)[0];
if (!version) throw new Error('Official handler distribution unavailable.');
const name = `node-${version}-win-${process.arch}.zip`;
const base = `https://nodejs.org/dist/${version}`;
const [bytes, sums] = await Promise.all([downloadBytes(`${base}/${name}`), downloadBytes(`${base}/SHASUMS256.txt`)]);
const expected = sums.toString().split('\n').find(line => line.trim().endsWith(` ${name}`))?.split(/\s+/)[0];
if (!expected || createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Official handler checksum mismatch.');
const root = resolve('.smoke/handlers');
await mkdir(root, { recursive: true });
const zip = await JSZip.loadAsync(bytes);
for (const [name, entry] of Object.entries(zip.files)) {
  const target = resolve(root, name);
  if (!target.startsWith(`${root}${sep}`)) throw new Error('Unsafe archive path.');
  if (entry.dir) await mkdir(target, { recursive: true });
  else await writeFile(target, await entry.async('nodebuffer'));
}
console.log(join(root, `node-${version}-win-${process.arch}`, 'node.exe'));
