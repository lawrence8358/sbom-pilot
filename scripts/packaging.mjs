import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { packagingConfig } from './packaging-state.mjs';
import { packageExtension, createSubmission } from './marketplace-package.mjs';

const [command, ...args] = process.argv.slice(2);
if (!['check', 'package', 'preview', 'submission'].includes(command) || args.some(arg => !['--private', '--preview'].includes(arg)) || (args.includes('--preview') && command !== 'check') || (command === 'preview' && args.length) || (args.includes('--private') && args.includes('--preview'))) {
  throw new Error('用法：packaging:check [--preview | --private]、packaging:package [--private]、packaging:preview、packaging:submission [--private]。');
}
const options = { local: command === 'preview' || args.includes('--preview'), privatePackage: args.includes('--private') };
const { manifest, mode } = await packagingConfig(options);
if (command === 'check') {
  console.log(`CHECK ${mode}: ${manifest.publisher}.${manifest.id} ${manifest.version}; public=${manifest.public}`);
} else if (command === 'submission') {
  await createSubmission(join('packages', mode, `${manifest.publisher}.${manifest.id}-${manifest.version}.vsix.provenance.json`), options);
} else {
  const build = spawnSync(process.execPath, ['scripts/build.mjs', ...(options.local ? ['--local'] : [])], { stdio: 'inherit' });
  if (build.error || build.status !== 0) throw new Error('建置失敗，未建立新封裝。', { cause: build.error });
  const receipt = await packageExtension({ ...options, output: join('packages', mode) });
  await createSubmission(receipt, { ...options, allowPreview: command === 'preview' });
}
