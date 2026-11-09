import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readTaskConfig, validateConfig } from '../src/config';
import { runWorkflow } from '../src/workflow';
import { scanArguments } from '../src/scan';
import type { Command } from '../src/process';
import type { ToolContext } from '../src/tools';

async function fixture(action: (root: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'sbom-solution-'));
  try { await action(await realpath(directory)); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
const config = (projectPath: string, extra: Record<string,string | undefined> = {}) =>
  readTaskConfig(name => ({ projectPath, environment: 'dotnet', runOsv: 'false', ...extra })[name]);

test('solution input restores exactly once and scopes scanner to graph members even with unrelated stale assets', () => fixture(async root => {
  const solution = join(root, 'Product.sln');
  await writeFile(solution, 'fixture solution');
  const projects = ['App', 'Library', 'Tools'].map(name => join(root, name, `${name}.csproj`));
  for (const file of projects) {
    await mkdir(join(dirname(file), 'obj'), { recursive: true });
    await writeFile(file, '<Project Sdk="Microsoft.NET.Sdk"/>');
    await writeFile(join(dirname(file),'obj','project.assets.json'), JSON.stringify({ targets:{},libraries:{},project:{restore:{projectPath:file}} }));
  }
  const graph = { projects: Object.fromEntries(projects.slice(0,2).map(file => [file, { restore: { projectPath:file,outputPath:join(dirname(file),'obj'),projectStyle:'PackageReference' } }])) };
  const commands: Command[] = [];
  const logs: string[] = [];
  const tools: ToolContext = { node:process.execPath,npmCli:'npm',cdxgenCli:'cdxgen',nodeVersion:'24.22.2',cdxgenVersion:'13.6.0',env:{ ...process.env } };
  await runWorkflow(config(solution), join(root,'temp'), {
    log: message => logs.push(message),prepare:async()=>tools,
    run:async command => {
      commands.push(command);
      const graphArg=command.args.find(value=>value.startsWith('-p:RestoreGraphOutputPath='));
      if(graphArg) await writeFile(graphArg.slice('-p:RestoreGraphOutputPath='.length),JSON.stringify(command.args[1] === projects[2] ? { projects: { ...graph.projects, [projects[2]]: { restore: { projectPath:projects[2],outputPath:join(dirname(projects[2]),'obj'),projectStyle:'PackageReference' } } } } : graph));
      return { stdout:command.args[0]==='--list-sdks'?`10.0.101 [${join(root,'sdk')}]`:'10.0.101',stderr:'' };
    },
    generate:async request => {
      assert.equal(commands.filter(command=>command.args[0]==='restore').length,1);
      assert.equal(commands.find(command=>command.args[0]==='restore')!.args[1],solution);
      assert.equal(commands.filter(command=>command.args.includes('-t:GenerateRestoreGraphFile')).length,1);
      assert.equal(tools.dotnetAssets?.length,2);
      const args=scanArguments(request);
      const include=args[args.indexOf('--include-regex')+1];
      assert.ok(include.includes('App/obj/project.assets.json'));
      assert.equal(include.includes('Tools/'),false);
      assert.ok(logs.some(line=>line.includes('開始產生 SBOM')));
      await writeFile(request.outputPath,JSON.stringify({bomFormat:'CycloneDX',specVersion:'1.6',version:1,components:[]}));
    },publish:async()=>{},
  });
}));

test('artifact defaults and custom names flow through the output path and publisher', () => fixture(async root => {
  for (const extra of [{}, { artifactName:'CycloneSBOM',sbomFileName:'PrimeX.cdx.json' }]) {
    let generated='';let published='';
    await runWorkflow(config(root,extra),join(root,'temp'),{
      log:()=>{},prepare:async()=>({node:'node',npmCli:'npm',cdxgenCli:'cdxgen',nodeVersion:'24.22.2',cdxgenVersion:'13.6.0',env:{}}),installer:{install:async()=>{}},
      generate:async request=>{generated=request.outputPath;await writeFile(generated,JSON.stringify({bomFormat:'CycloneDX',specVersion:'1.6',version:1,components:[]}));},
      publish:async (...values: unknown[])=>{published=String(values[1]);},
    });
    assert.equal(generated,join(root,'temp','sbom',extra.sbomFileName??'sbom.cdx.json'));
    assert.equal(published,extra.artifactName??'SBOM');
  }
}));

test('artifact names and JSON filenames cannot traverse, inject commands, or use Windows device names', () => fixture(async root => {
  for(const name of ['../bad','bad\\file','bad\nname','CON','x:stream','x|y','trailing.']) {
    for(const field of ['artifactName','sbomFileName']) await assert.rejects(validateConfig(config(root,{[field]:name})),/名稱|檔名/);
  }
  await assert.rejects(validateConfig(config(root,{sbomFileName:'bom.xml'})),/JSON|json/);
}));
