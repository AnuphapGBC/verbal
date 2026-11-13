import 'dotenv/config';
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
const files=(await readdir(new URL('../tests/',import.meta.url))).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>`tests/${name}`);
const child=spawn(process.execPath,['--test',...files],{stdio:'inherit',windowsHide:true,env:{...process.env,RUN_DB_TESTS:'1'}});
child.on('exit',code=>{process.exitCode=code||0});
child.on('error',()=>{console.error('Could not start integration tests.');process.exitCode=1});
