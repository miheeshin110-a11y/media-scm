import {editingItem} from './workflow.ts';
import type {Item} from './scm-model.ts';
const stable=(v:unknown):unknown=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k,val])=>k!=='sync'&&val!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,val])=>[k,stable(val)])):v;
export function unchangedRecord(next:Item,old:Item|undefined){return Boolean(old&&(old.version||0)>0&&next.id===old.id&&JSON.stringify(stable(editingItem(next)))===JSON.stringify(stable(editingItem(old))));}
