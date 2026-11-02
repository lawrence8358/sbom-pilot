import { spawnSync } from 'node:child_process';
import { cp, rm, readdir } from 'node:fs/promises';
await rm('.test-build', { recursive: true, force: true });
const compile = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc'], { stdio: 'inherit' });
if (compile.status !== 0) process.exit(compile.status ?? 1);
await cp('src/schemas', '.test-build/src/schemas', { recursive: true });
const tests = (await readdir('.test-build/test')).filter(name => name.endsWith('.test.js')).map(name => `.test-build/test/${name}`);
const test = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit' });
process.exitCode = test.status ?? 1;
