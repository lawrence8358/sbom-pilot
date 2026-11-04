import { packageExtension } from './marketplace-package.mjs';

const args = process.argv.slice(2);
if (args.some(arg => !['--local', '--private'].includes(arg)) || (args.includes('--local') && args.includes('--private'))) {
  throw new Error('用法：node scripts/package.mjs [--local | --private]');
}
await packageExtension({ local: args.includes('--local'), privatePackage: args.includes('--private') });
