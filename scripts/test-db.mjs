import 'dotenv/config';
import { spawn } from 'node:child_process';
const child=spawn(process.execPath,['--test','tests/api.test.mjs'],{stdio:'inherit',windowsHide:true,env:{...process.env,RUN_DB_TESTS:'1'}});
child.on('exit',code=>{process.exitCode=code||0});
child.on('error',()=>{console.error('Could not start integration tests.');process.exitCode=1});
