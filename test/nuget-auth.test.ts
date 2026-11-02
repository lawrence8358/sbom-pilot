import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNuGetCredentials, withNuGetCredentials, type NuGetRestoreSettings } from '../src/dotnet/credentials';
import { readTaskConfig } from '../src/config';

const credential = { source: 'Private', url: 'https://feed.example/private/v3/index.json', username: 'build', password: 'safe-password' };
const project = (path: string, url = credential.url): NuGetRestoreSettings => ({ projectPath: path, configFilePaths: [`${path}.config`], sources: { [url]: {} } });

test('NuGet input validates identity and environment syntax without echoing secret values', () => {
  assert.deepEqual(parseNuGetCredentials(JSON.stringify([credential])), [credential]);
  assert.equal(readTaskConfig(name => name === 'projectPath' ? '/repo' : name === 'nugetCredentials' ? JSON.stringify([credential]) : undefined).nugetCredentials?.[0].source, 'Private');
  for (const entry of [{ ...credential, password: 'secret;Username=other' }, { ...credential, source: 'bad=name' }, { ...credential, url: 'https://user:secret@feed.example' }, { ...credential, username: 'name:other' }, { ...credential, password: 'secret\nvalue' }]) {
    assert.throws(() => parseNuGetCredentials(JSON.stringify([entry])), error => error instanceof Error && !error.message.includes(entry.password));
  }
  assert.throws(() => parseNuGetCredentials(JSON.stringify([credential, { ...credential, source: 'private', url: 'https://other.example' }])));
  assert.throws(() => parseNuGetCredentials('secret invalid JSON'), /nugetCredentials/);
});

test('NuGet credentials exist only in the restore child; public sources and proxy survive, both outcomes clean', async () => {
  const env = { HTTPS_PROXY: 'proxy', NuGetPackageSourceCredentials_Private: 'stale' };
  for (const fails of [false, true]) {
    let child: NodeJS.ProcessEnv | undefined;
    const result = withNuGetCredentials([credential], [project('/app')], async () => [
      { name: 'Private', url: credential.url, enabled: true },
      { name: 'Public', url: 'https://public.example/index.json', enabled: true },
    ], env, async injected => {
      child = injected;
      assert.equal(injected.HTTPS_PROXY, 'proxy');
      assert.equal(injected.NuGetPackageSourceCredentials_Private, 'Username=build;Password=safe-password;ValidAuthenticationTypes=Basic');
      assert.equal(injected.NuGetPackageSourceCredentials_Public, undefined);
      if (fails) throw new Error('restore failed');
      return 'done';
    });
    if (fails) await assert.rejects(result, /restore failed/); else assert.equal(await result, 'done');
    assert.equal(child?.NuGetPackageSourceCredentials_Private, undefined);
    assert.equal(env.NuGetPackageSourceCredentials_Private, 'stale');
  }
});

test('entire ProjectReference closure is checked before any credential reaches a restore', async () => {
  let restored = false;
  const other = 'https://attacker.example/index.json';
  await assert.rejects(withNuGetCredentials([credential], [project('/app'), project('/referenced', other)], async item => [
    { name: 'Private', url: item.projectPath === '/app' ? credential.url : other, enabled: true },
  ], {}, async () => { restored = true; }), /同名來源/);
  assert.equal(restored, false);
  await assert.rejects(withNuGetCredentials([credential], [project('/app')], async () => [
    { name: 'Private', url: credential.url, enabled: true },
    { name: 'Private', url: other, enabled: true, audit: true },
  ], {}, async () => { restored = true; }), /同名來源/);
  assert.equal(restored, false);
});

test('disabled/unused sources do not receive task credentials and unknown graph metadata fails closed', async () => {
  await withNuGetCredentials([credential], [project('/app', 'https://public.example')], async () => [
    { name: 'Private', url: 'https://disabled.example', enabled: false },
  ], {}, async env => assert.equal(env.NuGetPackageSourceCredentials_Private, undefined));
  await assert.rejects(withNuGetCredentials([credential], [{ projectPath: '/app' }], async () => [], {}, async () => undefined), /還原圖缺少/);
});
