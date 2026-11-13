import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { pool } from '../server/db.js';

const {accounts}=JSON.parse(await readFile(new URL('../.env.test-accounts.json',import.meta.url),'utf8'));
assert.equal(accounts.length,5);
const server=createApp().listen(0,'127.0.0.1');
await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}/api`;
const origin=process.env.APP_ORIGIN||'http://127.0.0.1:5173';
try {
  for(const account of accounts) {
    let cookie='';
    async function request(path,options={}) {
      return fetch(`${base}${path}`,{...options,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(options.body?{'Content-Type':'application/json'}:{})},body:options.body?JSON.stringify(options.body):undefined});
    }
    const login=await request('/auth/login',{method:'POST',body:{email:account.email,password:account.password}});
    assert.equal(login.status,200,`Sign-in failed for ${account.email}.`);
    cookie=login.headers.getSetCookie()[0].split(';')[0];
    try {
      const {user}=await login.json();
      assert.equal(user.id,account.id);
      assert.equal(user.role,account.role);
      const session=await request('/session');
      assert.equal((await session.json()).user.id,account.id);
      const overview=await request('/admin/overview');
      assert.equal(overview.status,account.role==='admin'?200:403);
      if(account.role==='tutor') {
        const teaching=await request('/teaching');
        assert.equal(teaching.status,200);
        const data=await teaching.json();
        assert.equal(data.tutor.userId,account.id);
        assert.ok(data.slots.length>0);
      }
      console.log(`PASS: ${account.role==='learner'?'student':account.role} ${account.email} sign-in, session, and role permissions.`);
    } finally {
      const logout=await request('/auth/logout',{method:'POST'});
      assert.equal(logout.status,200);
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
  await pool.end();
}
