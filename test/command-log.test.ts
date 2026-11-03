import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commandRedactor, withCommandLogging } from '../src/command-log';
import { runProcess, type Command } from '../src/process';
import { readTaskConfig, validateConfig } from '../src/config';

test('command diagnostics preserve real argv/cwd and run before invocation without printing child output', async () => {
  const values = ['', 'space value', '"quoted"', '正體中文', '**/_Design{,Front}/**', '\t\n\r\0\u001b\u0085\u2028'];
  const logs: string[] = [];
  const command: Command = { executable: process.execPath, args: ['-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', '--', ...values], cwd: process.cwd() };
  const snapshot = structuredClone(command);
  const run = withCommandLogging(async original => {
    assert.equal(original, command);
    assert.equal(logs.length, 1);
    // NUL cannot be passed to spawn; the display seam must still escape it.
    return { stdout: 'child-secret-output', stderr: 'child-secret-error' };
  }, line => logs.push(line), commandRedactor({}));
  await run(command);
  assert.deepEqual(command, snapshot);
  assert.equal(logs[0].split(/\r?\n/).length, 1);
  assert.doesNotMatch(logs[0], /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/);
  assert.deepEqual(JSON.parse(logs[0].slice('[command] '.length)).argv, command.args);
  assert.doesNotMatch(logs[0], /child-secret/);

  const executableValues = values.map(value => value.replaceAll('\0', ''));
  const actual = await withCommandLogging(runProcess, line => logs.push(line), commandRedactor({}))({ ...command, args: [...command.args.slice(0, 3), ...executableValues] });
  assert.deepEqual(JSON.parse(actual.stdout), executableValues);
});

test('Task-side diagnostics redact config, encoded, URI, inherited and child credentials before logging', async () => {
  const password = '密碼 " / + sensitive-428', username = 'account-sensitive-428', token = 'token-sensitive-428', key = 'dt-sensitive-428';
  const redact = commandRedactor({ dt: { apiUrl: 'https://dt.example.test', projectUuid: 'd40ce445-3566-49d5-bd8d-2601d73cf0d4', apiKey: key, skipTlsCertificateCheck: false }, npmCredentials: [{ registry: 'https://npm.example.test', token }], nugetCredentials: [{ source: 'Private', url: 'https://nuget.example.test', username, password }] });
  const secrets = [password, username, token, key, `${username}:${password}`, Buffer.from(password).toString('base64'), Buffer.from(`${username}:${password}`).toString('base64'), encodeURIComponent(password), encodeURIComponent(encodeURIComponent(password))];
  const argumentsBefore = [...secrets, '--api-key', 'unknown flag secret', '--password=unknown inline secret', 'https://unknown:unregistered@host.test/path?token=another-secret', 'Authorization: Bearer unknown-header-secret'];
  const command: Command = { executable: process.execPath, cwd: 'cwd Unicode 正體中文', args: argumentsBefore, env: { PRIVATE_TOKEN: 'child-token-secret', HTTPS_PROXY: 'http://proxy-user:proxy-password@host.test', FETCH_LICENSE: 'false', CDXGEN_NO_CACHE: 'true' } };
  command.args.push('child-token-secret', 'proxy-user', 'proxy-password');
  const snapshot = structuredClone(command);
  const logs: string[] = [];
  await assert.rejects(withCommandLogging(async original => { assert.equal(original, command); throw new Error('safe failure'); }, message => logs.push(message), redact)(command), /safe failure/);
  for (const secret of [...secrets, 'unknown flag secret', 'unknown inline secret', 'unregistered', 'another-secret', 'unknown-header-secret', 'child-token-secret', 'proxy-user', 'proxy-password']) assert.ok(!logs[0].includes(secret), `Diagnostic leaked a synthetic credential`);
  assert.match(logs[0], /\*\*\*/);
  assert.deepEqual(JSON.parse(logs[0].slice(10)).scan, { FETCH_LICENSE: 'false', CDXGEN_NO_CACHE: 'true' });
  assert.doesNotMatch(logs[0], /PRIVATE_TOKEN|HTTPS_PROXY/);
  assert.deepEqual(command, snapshot);
});

test('generic frontend defaults and legacy vue both normalize to the same javascript mode', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pilot-generic-'));
  try {
    const defaults = readTaskConfig(name => name === 'projectPath' ? root : undefined);
    assert.equal(defaults.environment, 'javascript');
    for (const environment of ['javascript', 'vue']) assert.equal((await validateConfig({ ...defaults, environment })).environment, 'javascript');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('nonsecret scan field names cannot bypass known-value redaction', async () => {
  const logs: string[] = [];
  const redact = commandRedactor({ npmCredentials: [{ registry: 'https://example.test', token: 'scan-field-secret' }] });
  await withCommandLogging(async () => ({ stdout: '', stderr: '' }), line => logs.push(line), redact)({ executable: process.execPath, args: [], cwd: process.cwd(), env: { FETCH_LICENSE: 'scan-field-secret', CDXGEN_NO_CACHE: 'scan-field-secret' } });
  assert.doesNotMatch(logs[0], /scan-field-secret/);
  assert.deepEqual(JSON.parse(logs[0].slice(10)).scan, { FETCH_LICENSE: '***', CDXGEN_NO_CACHE: '***' });
});

test('actual console receives only redacted command diagnostics before a real failing child', async () => {
  const script = `const {commandRedactor,withCommandLogging}=require('./.test-build/src/command-log');
    const {runProcess}=require('./.test-build/src/process');
    const token=process.env.FIXTURE_CREDENTIAL;
    const run=withCommandLogging(runProcess,console.log,commandRedactor({npmCredentials:[{registry:'https://example.test',token}]}));
    run({executable:process.execPath,args:['-e','process.stderr.write(process.env.FIXTURE_CREDENTIAL);process.exit(1)', '--',token,encodeURIComponent(token),Buffer.from(token).toString('base64')],cwd:process.cwd(),env:process.env}).catch(()=>console.log('expected safe failure'));`;
  const secret = 'console-sensitive / Unicode 密碼';
  const actual = await runProcess({ executable: process.execPath, args: ['-e', script], cwd: process.cwd(), env: { ...process.env, FIXTURE_CREDENTIAL: secret } });
  for (const value of [secret, encodeURIComponent(secret), Buffer.from(secret).toString('base64')]) assert.ok(!actual.stdout.includes(value));
  assert.equal(actual.stderr, '');
  assert.match(actual.stdout, /\[command\].*\*\*\*/);
  assert.match(actual.stdout, /expected safe failure/);
});
