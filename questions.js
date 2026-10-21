import {QUESTIONS} from './models.js';
export const PROPERTY_IDS=QUESTIONS.map(q=>q.id);
const clean=s=>s.trim().replace(/[？?。！!\s]/g,'').replace(/X/g,'x').replace(/Y/g,'y');
const exact=new Map(QUESTIONS.map(q=>[clean(q.text),{property:q.id,negated:false,clear:true}]));
const aliases={
  even:['它左右对称吗','它是偶函数吗','它关于y轴对称吗','它是左右对称的吗','它是不是偶函数'],
  odd:['它是奇函数吗','它关于原点对称吗','它关于原点中心对称吗','它是不是奇函数'],
  multipleBranches:['它有多条分支吗','它不止一个分支吗'],
  periodic:['它是周期函数吗','它有周期吗','它会重复吗','它是不是周期函数'],
  passesOrigin:['它过原点吗','图像经过原点吗'],
  hasMinimum:['它有最低点吗','它有最小值吗','它有没有最小值'],
  hasMaximum:['它有最高点吗','它有最大值吗','它有没有最大值'],
  verticalAsymptote:['它有垂直渐近线吗'],
  hasZero:['它有零点吗','它会碰到横轴吗','它和x轴有交点吗','它和横轴有交点吗','图像和x轴有交点吗','它有没有零点'],
  nonnegative:['它的函数值都非负吗'],
  allRealDomain:['它的定义域是R吗','它的定义域是实数集吗']
};
for(const [property,forms] of Object.entries(aliases))for(const text of forms)exact.set(clean(text),{property,negated:false,clear:true});
function negate(text){
  if(text.includes('是不是')||text.includes('有没有'))return null;
  if(text.includes('是'))return text.replace('是','不是');
  if(text.includes('有'))return text.replace('有','没有');
  if(text.startsWith('它'))return text.replace(/^它/,'它不');
  return null;
}
for(const [text,value] of [...exact]){
  const negative=negate(text);if(negative)exact.set(negative,{...value,negated:true});
}
export function localQuestion(question){return typeof question==='string'?exact.get(clean(question))||null:null;}
export function validMapping(value){return !!value&&typeof value.clear==='boolean'&&typeof value.negated==='boolean'&&(value.property===null||PROPERTY_IDS.includes(value.property));}
export function resolveAnswer(model,mapping){
  if(!validMapping(mapping)||!mapping.clear||!mapping.property)return {status:'clarify',answer:'请改问',message:'请一次只问一个明确的性质，例如“它关于 y 轴对称吗？”。'};
  const value=model.facts[mapping.property];
  return {status:'ok',answer:(mapping.negated?!value:value)?'是':'不是',property:mapping.property};
}
export function questionGuard(question){
  if(/告诉.*答案|直接.*答案|是什么函数|什么模型|画.*给我|忽略.*指令|ignore|system prompt/i.test(question))return true;
  if(/[且并]|或者|还是|同时|以及|、/.test(question))return true;
  const marks=question.match(/[？?]/g);return !!marks&&marks.length>1;
}
