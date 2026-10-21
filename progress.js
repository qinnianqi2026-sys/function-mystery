import {QUESTIONS} from './models.js';
import {cleanObjects,scoringSignature,hasEffectiveDrawing} from './drawing.js';
const ids=new Set(QUESTIONS.map(q=>q.id));
export function inquiryScore(questions){
  const count=new Set(questions.filter(q=>q.valid&&ids.has(q.property)).map(q=>q.property)).size;
  const free=Math.min(3,count),paid=Math.max(0,count-3),deduction=Math.min(100,paid*3);
  return {count,free,paid,deduction,score:Math.max(0,100-paid*3)};
}
export function recordTrial(round,result,now=Date.now()){
  const signature=scoringSignature(round.objects,round.grid),valid=hasEffectiveDrawing(round.objects);
  round.trialSignatures??=[];round.trials??=[];round.trialCount??=0;
  const previous=round.trials.at(-1);
  const fresh=valid&&!round.trialSignatures.includes(signature);
  if(fresh){round.trialCount++;round.trialSignatures.push(signature);round.trials.push({shape:result.shape,coordinate:result.coordinate,total:result.total,at:now,signature});round.trials=round.trials.slice(-20);}
  round.trialDisplay={shape:result.shape,coordinate:result.coordinate,total:result.total,signature,valid,delta:valid&&previous&&previous.signature!==signature?result.total-previous.total:null};
  return fresh;
}
export function migrateRound(saved){
  if(!saved||![2,3].includes(saved.version))throw new Error('Unknown save version');
  const old=saved.version===2;
  const migrateObjects=s=>old?cleanObjects((Array.isArray(s)?s:[]).map(points=>({type:'pen',points,scored:true}))):cleanObjects(s);
  const state={...saved,version:3,objects:migrateObjects(old?saved.strokes:saved.objects)};
  delete state.strokes;
  state.undo=(Array.isArray(saved.undo)?saved.undo:[]).map(migrateObjects);
  state.redo=(Array.isArray(saved.redo)?saved.redo:[]).map(migrateObjects);
  state.questions=(Array.isArray(saved.questions)?saved.questions:[]).filter(q=>q&&typeof q.question==='string').map(q=>q.pending?{...q,pending:false,answer:'刷新中止了回答',retry:true}:q);
  state.trialCount=old?0:Math.max(0,Number(saved.trialCount)||0);
  state.trials=old?[]:(Array.isArray(saved.trials)?saved.trials:[]).slice(-20);
  state.trialSignatures=old?[]:(Array.isArray(saved.trialSignatures)?saved.trialSignatures:[]).filter(s=>typeof s==='string');
  state.trialDisplay=old?null:saved.trialDisplay||null;
  state.finalSubmissions=old?0:Math.min(1,Math.max(0,Number(saved.finalSubmissions)||0));
  if(old&&state.ended)state.legacyRules=true;
  return state;
}
