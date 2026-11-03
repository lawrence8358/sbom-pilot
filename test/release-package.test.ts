import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('release identity accepts actual-form HTTPS metadata, rejects malformed, credential and placeholder URLs', () => {
  const helper = pathToFileURL(resolve('scripts/release-identity.mjs')).href;
  const code = `
    import assert from 'node:assert/strict';
    import { validateReleaseIdentity as validate } from ${JSON.stringify(helper)};
    assert.deepEqual(validate('verified-publisher','https://github.com/owner/project.git'),{publisher:'verified-publisher',repository:'https://github.com/owner/project.git'});
    for (const address of [undefined,'','https://','http://github.com/owner/project','https://<public-repository-url>','https://github.com/<owner>/<repo>','https://github.com/%3Cowner%3E/repo','https://example.com/project','https://private.example.test/project','https://localhost/repo','https://public-repository-url/repo','https://user:synthetic-password@github.com/owner/project','https://user@github.com/owner/project','https://github.com/owner/project?token=synthetic-password','https://github.com/owner/project#fragment']) {
      assert.throws(()=>validate('verified-publisher',address), error=>!error.message.includes('synthetic-password'));
    }
    for(const publisher of [undefined,'','local-dev-placeholder','<actual-publisher-id>']) assert.throws(()=>validate(publisher,'https://github.com/owner/project'));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('actual release packaging rejects bad repository before inventory reads or creating a manifest', () => {
  for (const repository of ['https://', 'https://<public-repository-url>', 'https://fixture:synthetic-password@github.com/owner/project']) {
    const result = spawnSync(process.execPath, ['scripts/package.mjs'], { encoding: 'utf8', env: { ...process.env, SBOM_PILOT_PUBLISHER: 'verified-publisher', SBOM_PILOT_REPOSITORY_URL: repository } });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /有效、無認證、非佔位/);
    assert.doesNotMatch(result.stderr, /synthetic-password|ENOENT|manifest.json/);
  }
});
