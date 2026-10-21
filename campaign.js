// Campaign progress: which of the 24 levels are completed, plus personal bests.
import {MODELS,MODEL_BY_ID} from './models.js';

const CAMPAIGN_VERSION=1;
const numeric=value=>{
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
};
const entry=()=>({cleared:false,bestTotal:null,bestInquiry:null,plays:0,lastPlayed:null});

export function emptyCampaign(){return {version:CAMPAIGN_VERSION,models:{}};}

export function normalizeCampaign(input){
  const out=emptyCampaign();
  if(!input||typeof input!=='object'||!input.models||typeof input.models!=='object')return out;
  for(const [modelId,value] of Object.entries(input.models)){
    if(!MODEL_BY_ID[modelId]||!value||typeof value!=='object')continue;
    const bestTotal=numeric(value.bestTotal),bestInquiry=numeric(value.bestInquiry);
    const next=entry();
    next.bestTotal=bestTotal!==null&&bestTotal>0?bestTotal:null;
    next.bestInquiry=bestInquiry!==null?bestInquiry:null;
    next.cleared=!!value.cleared||next.bestTotal!==null;
    next.plays=Math.max(0,Math.floor(numeric(value.plays)??0));
    next.lastPlayed=numeric(value.lastPlayed);
    out.models[modelId]=next;
  }
  return out;
}

function applyResult(campaign,{modelId,total,inquiry=null,at=null}){
  const next=campaign.models[modelId]||entry();
  next.plays+=1;
  if(Number.isFinite(at))next.lastPlayed=at;
  if(Number.isFinite(total)&&total>0){
    next.cleared=true;
    next.bestTotal=next.bestTotal===null?total:Math.max(next.bestTotal,total);
    if(Number.isFinite(inquiry))next.bestInquiry=next.bestInquiry===null?inquiry:Math.max(next.bestInquiry,inquiry);
  }
  campaign.models[modelId]=next;
}

export function campaignFromHistory(history){
  const out=emptyCampaign();
  if(Array.isArray(history)){
    for(const result of history){
      if(!result||typeof result!=='object'||!MODEL_BY_ID[result.modelId]||result.practice)continue;
      const total=numeric(result.total);
      if(total===null||total<=0)continue;
      applyResult(out,{modelId:result.modelId,total,inquiry:numeric(result.inquiry),at:numeric(result.at)});
    }
  }
  return out;
}

export function recordCampaign(campaign,{modelId,total,inquiry=null,at=Date.now(),practice=false}={}){
  const next=normalizeCampaign(campaign);
  if(practice||!MODEL_BY_ID[modelId])return {campaign:next,newBest:false,cleared:false,previousBest:null};
  const previous=next.models[modelId]?.bestTotal??null;
  const valid=Number.isFinite(total)&&total>0;
  applyResult(next,{modelId,total:valid?total:0,inquiry:Number.isFinite(inquiry)?inquiry:null,at});
  return {campaign:next,newBest:valid&&(previous===null||total>previous),cleared:!!next.models[modelId]?.cleared,previousBest:previous};
}

export function summarizeCampaign(campaign){
  let cleared=0,bestTotalSum=0,bestInquirySum=0;
  for(const model of MODELS){
    const record=campaign.models[model.id];
    if(!record)continue;
    if(record.cleared)cleared++;
    if(record.bestTotal!==null)bestTotalSum+=record.bestTotal;
    if(record.bestInquiry!==null)bestInquirySum+=record.bestInquiry;
  }
  return {total:MODELS.length,cleared,bestTotalSum,bestInquirySum};
}

export function firstUncleared(campaign){return MODELS.find(model=>!campaign.models[model.id]?.cleared)||null;}
export function nextModelAfter(modelId){
  const current=MODEL_BY_ID[modelId];
  if(!current)return null;
  return MODELS.find(model=>model.number===current.number+1)||null;
}
export function modelByNumber(number){return MODELS.find(model=>model.number===Number(number))||null;}
