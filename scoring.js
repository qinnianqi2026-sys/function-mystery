import {MODEL_BY_ID,referenceStrokes,toPixel} from './models.js';
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function pathLength(stroke){let n=0;for(let i=1;i<stroke.length;i++)n+=distance(stroke[i],stroke[i-1]);return n;}
export function cleanStrokes(strokes){
  return (Array.isArray(strokes)?strokes:[]).map(s=>(Array.isArray(s)?s:[]).filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1000&&p.y>=0&&p.y<=610).map(p=>({x:p.x,y:p.y}))).filter(s=>s.length>1&&pathLength(s)>4);
}
export function bounds(strokes){
  const points=strokes.flat();if(!points.length)return null;
  let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
  for(const p of points){xmin=Math.min(xmin,p.x);xmax=Math.max(xmax,p.x);ymin=Math.min(ymin,p.y);ymax=Math.max(ymax,p.y);}
  return {xmin,xmax,ymin,ymax,cx:(xmin+xmax)/2,cy:(ymin+ymax)/2,span:Math.max(xmax-xmin,ymax-ymin,1)};
}
export function normalize(strokes,stretch=1){
  const b=bounds(strokes);if(!b)return [];
  const shifted=strokes.map(s=>s.map(p=>({x:(p.x-b.cx)*stretch,y:p.y-b.cy}))), t=bounds(shifted);
  return shifted.map(s=>s.map(p=>({x:p.x/t.span,y:p.y/t.span})));
}
export function resample(stroke,count){
  if(stroke.length<2)return stroke;const total=pathLength(stroke);
  if(!total)return [stroke[0]];let index=1,acc=0;const out=[];
  for(let k=0;k<count;k++){
    const goal=total*k/(count-1);
    while(index<stroke.length-1&&acc+distance(stroke[index-1],stroke[index])<goal){acc+=distance(stroke[index-1],stroke[index]);index++;}
    const a=stroke[index-1],b=stroke[index],d=distance(a,b),t=d?clamp((goal-acc)/d):0;
    out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  }
  return out;
}
function cloud(strokes,count=280){
  const total=strokes.reduce((n,s)=>n+pathLength(s),0);
  return strokes.flatMap(s=>resample(s,Math.max(8,Math.round(count*pathLength(s)/Math.max(total,.0001)))));
}
function nearDistances(a,b){return a.map(p=>{let d=Infinity;for(const q of b)d=Math.min(d,distance(p,q));return d;});}
function compare(user,reference){
  const u=cloud(user),r=cloud(reference),ud=nearDistances(u,r),rd=nearDistances(r,u);
  const mean=(ud.reduce((a,b)=>a+b,0)/ud.length+rd.reduce((a,b)=>a+b,0)/rd.length)/2;
  const precision=ud.filter(d=>d<.065).length/ud.length,recall=rd.filter(d=>d<.065).length/rd.length;
  const f1=precision+recall?2*precision*recall/(precision+recall):0;
  const contour=55*Math.exp(-mean*14),coverage=45*f1;
  let score=contour+coverage;const deductions=[];
  function deduct(id,label,next){deductions.push({id,label,value:Math.round(score)-Math.round(next),raw:score-next});score=next;}
  const branchCoverage=reference.map(s=>{const ds=nearDistances(resample(s,65),u);return ds.filter(d=>d<.075).length/ds.length;});
  deduct('branches','缺少分支',branchCoverage.some(c=>c<.35)?Math.min(score,58):score);
  const userLength=user.reduce((n,s)=>n+pathLength(s),0),refLength=reference.reduce((n,s)=>n+pathLength(s),0),ratio=userLength/refLength;
  deduct('extra','重复或多余线条',ratio>1.7?score*Math.exp(-.55*(ratio-1.7)):score);
  deduct('incomplete','图形不完整',ratio<.65?score*Math.max(.35,ratio/.65):score);
  return {score,precision,recall,branchCoverage,ratio,mean,contour,coverage,deductions};
}
export function scoreDrawing(model,input,{grid=false}={}){
  const strokes=cleanStrokes(input),b=bounds(strokes),ink=strokes.reduce((n,s)=>n+pathLength(s),0);
  if(!b||ink<18||b.span<12)return {shape:0,coordinate:0,total:0,validInk:false,reason:'有效笔迹太少。画出完整走势后再试试。',precision:0,recall:0,referenceId:model.id,normalizedUser:[],normalizedReference:[],breakdown:{contour:0,coverage:0,base:0,deductions:[{id:'branches',label:'缺少分支',value:0},{id:'extra',label:'重复或多余线条',value:0},{id:'incomplete',label:'图形不完整',value:0}],position:0,anchors:0,coordinateReason:'有效笔迹太少，尚不能评价坐标关系。'},suggestions:['先画出完整的主体走势。']};
  const user=normalize(strokes);let best=null;
  for(const candidate of [model,...(model.peers||[]).map(id=>MODEL_BY_ID[id])]){
    for(const stretch of [.85,1,1.18]){
      const reference=normalize(referenceStrokes(candidate),stretch),result=compare(user,reference);
      if(!best||result.score>best.score)best={...result,reference,referenceId:candidate.id};
    }
  }
  const shape=Math.round(clamp(best.score/100)*100);
  let coordinate=0,position=0,anchorsPoints=0;
  const coordinateReason=!grid?'未开启坐标纸，本次不计算坐标奖励。':shape<55?'形状分未达到 55，先完善主体形状。':'按实际曲线位置与关键点计算，打开网格本身不加分。';
  if(grid&&shape>=55){
    const canonical=referenceStrokes(model),u=cloud(strokes),r=cloud(canonical),ud=nearDistances(u,r),rd=nearDistances(r,u);
    const precision=ud.filter(d=>d<28).length/ud.length,recall=rd.filter(d=>d<28).length/rd.length;
    const f1=precision+recall?2*precision*recall/(precision+recall):0;
    const anchors=model.anchors.map(([x,y])=>toPixel(model,x,y)).map(p=>Math.min(...u.map(q=>distance(p,q))));
    const anchorScore=anchors.length?anchors.reduce((n,d)=>n+Math.exp(-d/24),0)/anchors.length:f1;
    coordinate=Math.round(20*clamp(.7*f1+.3*anchorScore));
    position=Math.round(14*f1);anchorsPoints=coordinate-position;
  }
  let reason=shape>=85?'主体轮廓、方向和覆盖都很接近。':shape>=60?'整体轮廓已经出现，再留意弯曲、转折与完整程度。':'可以先想清整体走势，再把关键形状画完整。';
  if(best.branchCoverage.some(c=>c<.35))reason+=' 参考图中有分支还没有被完整表达。';
  if(best.ratio>1.7)reason+=' 重复或多余线条较多，可以用擦除工具整理。';
  if(grid)reason+=coordinate?' 坐标位置也与标准模型接近。':' 坐标奖励要看实际位置，打开网格本身不加分。';
  const suggestions=[];
  if(best.branchCoverage.some(c=>c<.35))suggestions.push('有部分参考走势覆盖不足，请结合对照图检查分支与延伸。');
  if(best.ratio>1.7)suggestions.push('减少重复描画和偏离主体的线条，擦除后再比较。');
  if(best.ratio<.65)suggestions.push('图形表达偏短，试着把主体走势画得更完整。');
  if(shape<85)suggestions.push('结合对照图调整弯曲、方向和相对比例；这些分项评价几何接近程度。');
  if(grid&&coordinate<15)suggestions.push(shape<55?'先提高形状接近程度，再调整坐标关系。':'留意标准模型的关键点与实际坐标位置。');
  if(!suggestions.length)suggestions.push('主体形状已很接近，可以对照参考图观察细节。');
  const contour=Math.round(best.contour),base=Math.round(best.contour+best.coverage);
  return {shape,coordinate,total:shape+coordinate,validInk:true,reason,precision:best.precision,recall:best.recall,referenceId:best.referenceId,normalizedUser:user,normalizedReference:best.reference,
    breakdown:{contour,coverage:base-contour,base,deductions:best.deductions,position,anchors:anchorsPoints,coordinateReason},suggestions:suggestions.slice(0,3)};
}
