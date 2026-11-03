import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validRestoreAssets } from '../src/dotnet/assets';

test('shared assets validation accepts object metadata and rejects truthy scalars, arrays, mismatched or missing project identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pilot-assets-')), file = join(root, 'project.assets.json'), projectPath = join(root, 'Product.csproj');
  const valid = { targets: {}, libraries: {}, project: { restore: { projectPath } } };
  try {
    await writeFile(file, JSON.stringify(valid)); assert.equal(await validRestoreAssets(file, projectPath), true);
    for (const value of [null, [], { ...valid, targets: 'truthy' }, { ...valid, libraries: true }, { ...valid, targets: [] }, { ...valid, libraries: [] }, { ...valid, project: [] }, { ...valid, project: { restore: [] } }, { ...valid, project: { restore: { projectPath: join(root, 'Other.csproj') } } }, { ...valid, project: { restore: { projectPath: '' } } }, { ...valid, project: { restore: {} } }]) {
      await writeFile(file, JSON.stringify(value)); assert.equal(await validRestoreAssets(file, projectPath), false);
    }
    await writeFile(file, 'invalid JSON'); assert.equal(await validRestoreAssets(file, projectPath), false);
    assert.equal(await validRestoreAssets(join(root, 'missing.json'), projectPath), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
