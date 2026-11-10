import test from 'node:test';
import assert from 'node:assert/strict';
import {ecountSetup} from '../lib/ecount-setup.ts';
const configured=()=>({ECOUNT_COMPANY_CODE:'temporary-company',ECOUNT_USER_ID:'temporary-user',ECOUNT_API_CERT_KEY:'temporary-key-never-return',ECOUNT_ZONE:'CC',ECOUNT_WAREHOUSES:JSON.stringify([{code:'temporary-wh',name:'임시 창고'}])});
test('missing or invalid warehouses never mark ECOUNT ready even when credentials are present',()=>{
 for(const value of [undefined,'[]','not-json','{}','[{}]',JSON.stringify([{code:'A',name:'같은 창고'},{code:'B',name:'같은 창고'}])]){
  const env={...configured(),ECOUNT_WAREHOUSES:value},before=structuredClone(env);
  assert.equal(ecountSetup(env).stage,'configuration-required');assert.deepEqual(env,before);
 }
});
test('credentials remain private and configuration presence does not imply working inventory integration',()=>{
 const env=configured(),before=structuredClone(env),result=ecountSetup(env),serialized=JSON.stringify(result);
 assert.equal(result.stage,'ready');assert.ok(result.checks.every(c=>c.configured));
 for(const key of ['ECOUNT_COMPANY_CODE','ECOUNT_USER_ID','ECOUNT_API_CERT_KEY'])assert.ok(!serialized.includes(env[key]));
 assert.deepEqual(env,before);
 const malformed=ecountSetup({...env,ECOUNT_WAREHOUSES:'private-invalid-json-do-not-echo'});
 assert.ok(!JSON.stringify(malformed).includes('private-invalid-json-do-not-echo'));
});
