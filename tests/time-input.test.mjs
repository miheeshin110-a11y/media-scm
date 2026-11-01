import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {actualDateTime} from '../lib/scm-model.ts';

const exports={};
runInNewContext(ts.transpileModule(readFileSync(new URL('../app/time-input.tsx',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:createRequire(import.meta.url)});
const {TimeInput}=exports;
const controls=(value,onChange)=>TimeInput({value,onChange,label:'방송시간'}).props.children;

test('midnight is selectable as 00시 and is saved on the selected day, not noon or the next day',()=>{
 let value='';const [hour]=controls('',v=>value=v);
 hour.props.onChange({target:{value:'00'}});
 assert.equal(value,'00:00');
 assert.equal(actualDateTime('2026-11-01',value),'2026-11-01 00:00');
 const html=renderToStaticMarkup(TimeInput({value,onChange:()=>{},label:'방송시간'}));
 assert.match(html,/<option value="00" selected="">00시 \(자정\)<\/option>/);
 assert.doesNotMatch(html,/type="time"|오전|오후/);
});

test('noon and 23:59 remain distinct; all minute values including 00 are available',()=>{
 let value='';controls('00:30',v=>value=v)[0].props.onChange({target:{value:'12'}});assert.equal(value,'12:30');
 controls('12:59',v=>value=v)[0].props.onChange({target:{value:'23'}});assert.equal(value,'23:59');
 controls(value,v=>value=v)[2].props.onChange({target:{value:'00'}});assert.equal(value,'23:00');
 const [, ,minute]=controls('',()=>{});assert.equal(minute.props.children[1].length,60);
});

test('unknown time stays empty and can be cleared again without converting it to midnight',()=>{
 let value='';const [hour,,minute]=controls('',v=>value=v);
 assert.equal(hour.props.value,'');assert.equal(minute.props.value,'');assert.equal(value,'');
 controls('00:00',v=>value=v)[0].props.onChange({target:{value:''}});assert.equal(value,'');
 controls('',v=>value=v)[2].props.onChange({target:{value:'05'}});assert.equal(value,'00:05');
});
