import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { commandFromString } from 'azure-pipelines-task-lib/taskcommand';

for (const failure of ['none', 'workflow', 'attachment']) {
  test(`Task emits a retained UTF-8 tab attachment and direct link in log and ${failure} result`, async () => {
    const root = await mkdtemp(join(process.cwd(), '.test-build', 'task-adapter-'));
    try {
      const entry = join(root, 'index.cjs');
      await build({
        entryPoints: ['src/index.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: entry,
        external: ['azure-pipelines-task-lib/*'],
        plugins: [{ name: 'workflow-boundary', setup(builder) {
          builder.onResolve({ filter: /^\.\/workflow$/ }, () => ({ path: 'fixture', namespace: 'workflow-fixture' }));
          builder.onLoad({ filter: /.*/, namespace: 'workflow-fixture' }, () => ({ contents: `
            exports.runWorkflow = async (_config, _temp, services) => {
              await services.publishTabReport({schemaVersion:1, generatedAt:'2026-11-11T00:00:00Z', exceeded:false, dtSkipped:false,
                sboms:{product:'產品.json',full:'完整.json'},product:{status:'disabled',findings:[]},devExtra:{status:'disabled',findings:[]}});
              if (process.env.FIXTURE_FAILURE === 'workflow') throw new Error('workflow broken');
            };
          ` }));
        } }],
      });
      // 附件 SDK 拋錯屬同步排程失敗，必須反映在 Task 結果。
      const preload = join(root, 'preload.cjs');
      const { writeFile } = await import('node:fs/promises');
      await writeFile(preload, `if(process.env.FIXTURE_FAILURE === 'attachment') require('azure-pipelines-task-lib/task').addAttachment = () => { throw new Error('attachment broken'); };`);
      const child = spawnSync(process.execPath, ['--require', preload, entry], {
        encoding: 'utf8', env: { ...process.env, BUILD_BUILDID: '42', RELEASE_RELEASEID: '',
          SYSTEM_COLLECTIONURI: 'https://dev.azure.com/example/', SYSTEM_TEAMPROJECT: '團隊 A&B',
          AGENT_TEMPDIRECTORY: root, INPUT_PROJECTPATH: process.cwd(), FIXTURE_FAILURE: failure },
      });
      assert.equal(child.status, 0, child.stderr);
      const commands = child.stdout.split(/\r?\n/).filter(line => line.startsWith('##vso[')).map(commandFromString);
      assert.ok(!commands.some(command => command.command === 'task.uploadsummary'));
      assert.ok(!commands.some(command => command.command === 'artifact.upload'));
      const attachments = commands.filter(command => command.command === 'task.addattachment');
      assert.equal(attachments.length, failure === 'attachment' ? 0 : 1);
      if (attachments[0]) {
        assert.deepEqual(attachments[0].properties, { type: 'sbom-pilot.osv-report', name: 'osv-report' });
        const report = JSON.parse(await readFile(attachments[0].message, 'utf8'));
        assert.equal(report.schemaVersion, 1);
        assert.equal(report.sboms.product, '產品.json');
        assert.equal(report.product.status, 'disabled');
      }
      const link = 'https://dev.azure.com/example/%E5%9C%98%E9%9A%8A%20A%26B/_build/results?buildId=42&view=LawrenceShen.sbom-pilot.osv-report-tab';
      assert.ok(child.stdout.split(/\r?\n/).some(line => !line.startsWith('##vso[') && line.includes(link)), child.stdout);
      const completed = commands.find(command => command.command === 'task.complete');
      assert.ok(completed);
      assert.equal(completed.properties.result, failure === 'none' ? 'Succeeded' : 'Failed');
      assert.ok(completed.message.includes(link), completed.message);
      if (failure !== 'none') assert.ok(completed.message.includes(`${failure} broken`));
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
