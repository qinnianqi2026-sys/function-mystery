// Read-only view of fm-history-v3. Entries stay immutable; legacy v2 records are only labeled.
import {MODEL_BY_ID,DIFFICULTY_NAMES} from './models.js';

const DAY=86400000;
const numeric=value=>{
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
};
const REASONS=new Set(['submit','timeout','reveal']);

export function normalizeHistory(input){
  if(!Array.isArray(input))return [];
  return input.filter(entry=>entry&&typeof entry==='object').map((entry,index)=>{
    const model=typeof entry.modelId==='string'?MODEL_BY_ID[entry.modelId]:null;
    const version=numeric(entry.ruleVersion);
    return {
      id:typeof entry.id==='string'?entry.id:'legacy-'+index,
      modelId:model?model.id:null,
      modelNumber:model?model.number:null,
      name:model?model.name:(entry.modelId?'未收录模型':'旧版记录'),
      difficulty:model?model.difficulty:null,
      difficultyName:model?DIFFICULTY_NAMES[model.difficulty]:'旧版',
      shape:numeric(entry.shape),
      coordinate:numeric(entry.coordinate),
      total:numeric(entry.total),
      inquiry:numeric(entry.inquiry),
      questions:numeric(entry.questions),
      trials:numeric(entry.trials),
      elapsed:numeric(entry.elapsed),
      hints:numeric(entry.hints),
      practice:!!entry.practice,
      legacy:!!entry.legacyRules||version===null||version<3,
      reason:REASONS.has(entry.reason)?entry.reason:null,
      at:numeric(entry.at)
    };
  });
}

export function filterHistory(entries,{difficulty='all',days='all',officialsOnly=false}={},now=Date.now()){
  const window=days==='all'?null:Number(days)*DAY;
  return entries.filter(entry=>{
    if(difficulty!=='all'&&entry.difficulty!==difficulty)return false;
    if(officialsOnly&&entry.practice)return false;
    if(window!==null&&(!entry.at||now-entry.at>window))return false;
    return true;
  });
}

export function summarizeHistory(entries){
  const values=key=>entries.map(entry=>entry[key]).filter(value=>typeof value==='number');
  const totals=values('total'),inquiries=values('inquiry');
  return {
    count:entries.length,
    bestTotal:totals.length?Math.max(...totals):null,
    bestInquiry:inquiries.length?Math.max(...inquiries):null,
    averageTotal:totals.length?Math.round(totals.reduce((sum,value)=>sum+value,0)/totals.length):null
  };
}
