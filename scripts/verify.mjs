import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {dirname,delimiter} from 'node:path';
// Next/PostCSS spawn Node by name, even when this runner used an absolute path.
const env={...process.env,PATH:[dirname(process.execPath),process.env.PATH].filter(Boolean).join(delimiter)};
const tests=['tests','lib'].flatMap(dir=>readdirSync(dir).filter(name=>name.endsWith('.test.mjs')).map(name=>`${dir}/${name}`));
const checks=[['lint',['node_modules/eslint/bin/eslint.js']],['typecheck',['node_modules/typescript/bin/tsc','--noEmit']],['unit and API tests',['--test',...tests]],['dashboard release',['scripts/test-dashboard-release.mjs']],['production build',['node_modules/next/dist/bin/next','build']]];
for(const [name,args] of checks){
  console.log(`Running ${name}`);
  const result=spawnSync(process.execPath,args,{stdio:'inherit',env});
  if(result.error){console.error(result.error.message);process.exit(1);}
  if(result.status!==0)process.exit(result.status??1);
}
