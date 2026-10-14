import test from 'node:test';
import assert from 'node:assert/strict';
import { server } from '../server.mjs';
import { dailyCode } from '../security.mjs';
test('encoder exposes only its page and authenticated key-broker access', async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  process.env.PUBLIC_ORIGINS=base; process.env.PROXY_SECRET='test-proxy-secret';process.env.BROKER_SECRET='test-broker-secret';
  const proxy={'x-still-proxy-secret':process.env.PROXY_SECRET,'x-still-client-ip':'198.51.100.10','x-still-timezone':'Pacific/Kiritimati'};
  const broker={...proxy,'x-still-broker-secret':process.env.BROKER_SECRET,'x-still-site':'decoder'};
  const post=(path,data,headers={})=>fetch(base+'/api/'+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
  try {
    assert.equal((await fetch(base+'/collection')).status,404);
    assert.equal((await (await fetch(base)).text()).includes('id="collection"'),false);
    assert.equal((await post('login',{password:dailyCode('Pacific/Kiritimati')},proxy)).status,403);
    assert.equal((await post('login',{password:dailyCode('Pacific/Kiritimati')},{...broker,'x-still-broker-secret':'wrong'})).status,403);
    assert.equal((await post('seal',{key:Buffer.alloc(32).toString('base64'),words:5},broker)).status,403);
    assert.equal((await post('seal',{key:Buffer.alloc(32).toString('base64'),words:5},{...proxy,Origin:'https://attacker.test'})).status,403);
    const sealed=await post('seal',{key:Buffer.alloc(32,9).toString('base64'),words:10},proxy);assert.equal(sealed.status,201);const{id}=await sealed.json();
    assert.equal((await post('login',{password:'wrong'},broker)).status,401);
    const login=await post('login',{password:dailyCode('Pacific/Kiritimati')},broker);assert.equal(login.status,200);const headers={...broker,Cookie:login.headers.get('set-cookie').split(';')[0]};
    const read=await post('open',{id},headers);assert.equal(read.status,200);assert.equal((await read.json()).duration,4000);
    assert.equal((await post('open',{id},headers)).status,410);
    assert.equal((await post('logout',{},headers)).status,200);
    assert.equal((await post('heartbeat',{},headers)).status,401);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
