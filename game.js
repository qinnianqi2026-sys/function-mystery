import {MODELS,MODEL_BY_ID,QUESTIONS,DIFFICULTY_NAMES,referenceStrokes,toPixel} from './models.js';
import {scoreDrawing,cleanStrokes} from './scoring.js';
import {localQuestion,resolveAnswer,questionGuard} from './questions.js';
import {sampleObject,cleanObjects,scoringStrokes,scoringSignature,objectHandles,handlePoint,translateObject} from './drawing.js';
import {inquiryScore,recordTrial,migrateRound} from './progress.js';
import {normalizeHistory,filterHistory,summarizeHistory} from './history.js';
import {emptyCampaign,normalizeCampaign,campaignFromHistory,recordCampaign,summarizeCampaign,firstUncleared,nextModelAfter,modelByNumber} from './campaign.js';
import {clockStatus,elapsedAt,settleClock,ASK_TIMEOUT} from './session.js';

const $=s=>document.querySelector(s),board=$('#drawing-board'),ctx=board.getContext('2d');
const resultBoard=$('#result-board'),resultCtx=resultBoard.getContext('2d');
const SAVE_KEY='fm-active-v3',SETTINGS_KEY='fm-settings-v2',HISTORY_KEY='fm-history-v3',ONBOARD_KEY='fm-onboarded-v1',CAMPAIGN_KEY='fm-campaign-v1';
let round=null,undo=[],redo=[],drawing=null,tool='pen',selectedId=null,bankCategory='all',draft=null,request=null,suggestionCursor=0,storageWarned=false,historyFilter={difficulty:'all',days:'all',officialsOnly:false};
const boardView={zoom:1,tx:0,ty:0},pointers=new Map();let gesture=null;
let keyboardIntent=false,keyboardCursor={x:500,y:305},keyboardStroke=null,lastInput='pointer',keyboardHelpTimer=null;
const clone=value=>JSON.parse(JSON.stringify(value));
function read(key){try{return localStorage.getItem(key);}catch{return null;}}
function write(key,value){try{localStorage.setItem(key,value);return true;}catch{if(!storageWarned){storageWarned=true;toast('浏览器无法保存，本次仍可游玩。');}return false;}}
function parse(key,fallback){try{return JSON.parse(read(key))??fallback;}catch{return fallback;}}
function validSettings(value){return {difficulty:['easy','medium','hard'].includes(value?.difficulty)?value.difficulty:'easy',time:['none','60','180','300'].includes(String(value?.time))?String(value.time):'none'};}
let settings=validSettings(parse(SETTINGS_KEY,{}));
let history=parse(HISTORY_KEY,null);if(!Array.isArray(history)){history=parse('fm-history-v2',[]);history=Array.isArray(history)?history.map(h=>({...h,ruleVersion:2,legacyRules:true})):[];write(HISTORY_KEY,JSON.stringify(history));}
let campaign=loadCampaign();
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatTime=ms=>{const s=Math.floor(Math.max(0,ms)/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
function toast(message){const node=$('#toast');node.textContent=message;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),2800);}
function model(){return MODEL_BY_ID[round.modelId];}
function snapshot(){
  if(!round)return null;const now=Date.now();
  return {...clone(round),elapsedMs:elapsedAt(round,now),clockAt:now,waitingSince:null,undo:clone(undo.slice(-15)),redo:clone(redo.slice(-15))};
}
function save(){if(round)write(SAVE_KEY,JSON.stringify(snapshot()));}
function clearRequest(){
  const pending=round?.questions.find(q=>q.pending);
  if(pending){pending.pending=false;pending.answer='回答已中止';pending.retry=true;}
  if(request){request.controller.abort();clearTimeout(request.timer);request=null;}
  if(round?.waitingSince)settleClock(round);
}
function pickModel(){
  const pool=MODELS.filter(m=>m.difficulty===settings.difficulty);
  const current=round?.modelId,available=pool.filter(m=>m.id!==current);
  return (available.length?available:pool)[Math.floor(Math.random()*(available.length||pool.length))];
}
function start(target=null,practice=false){
  pointers.clear();gesture=null;keyboardStroke=null;keyboardIntent=false;setKeyboardHelp(false);
  if(document.body.classList.contains('board-focus'))setBoardFocus(false);
  const selected=target||firstUncleared(campaign)||pickModel();clearRequest();undo=[];redo=[];drawing=null;tool='pen';selectedId=null;suggestionCursor=0;bankCategory='all';
  round={version:3,id:crypto.randomUUID(),modelId:selected.id,objects:[],trialCount:0,trials:[],trialSignatures:[],trialDisplay:null,finalSubmissions:0,grid:false,questions:[],hintCount:0,
    elapsedMs:0,clockAt:Date.now(),waitingSince:null,timeLimit:settings.time==='none'?0:Number(settings.time),
    practice,ended:false,result:null};
  $('#result-dialog').close();$('#levels-dialog').close();resetBoardView();setLevelUrl(selected);showGame();updateCampaignUI();save();
}
function loadCampaign(){
  const stored=parse(CAMPAIGN_KEY,null);
  if(stored&&typeof stored==='object')return normalizeCampaign(stored);
  const derived=campaignFromHistory(history);
  write(CAMPAIGN_KEY,JSON.stringify(derived));
  return derived;
}
function setLevelUrl(selected){
  try{const url=new URL(location.href);url.searchParams.set('p',String(selected.number));window.history.replaceState(null,'',url);}catch{}
}
function requestedLevel(){
  const value=new URLSearchParams(location.search).get('p');
  if(!value)return null;
  const number=Number(value);
  return Number.isInteger(number)?modelByNumber(number):null;
}
function updateHomeButton(){
  if(round&&!round.ended){$('#start-game').innerHTML='继续这题 <span>→</span>';return;}
  const next=firstUncleared(campaign);
  $('#start-game').innerHTML=next?'继续挑战 · 第 '+next.number+' 关 <span>→</span>':'再挑战一关 <span>→</span>';
}
function updateCampaignUI(){
  const summary=summarizeCampaign(campaign),next=firstUncleared(campaign),complete=summary.cleared===summary.total;
  $('#welcome-progress').textContent=complete
    ?'挑战进度：'+summary.total+' / '+summary.total+' · 全部完成 · 最佳合计 '+summary.bestTotalSum+' / '+(summary.total*120)
    :(summary.cleared
      ?'挑战进度：已完成 '+summary.cleared+' / '+summary.total+' · 最佳合计 '+summary.bestTotalSum+' / '+(summary.cleared*120)
      :'挑战进度：还没有完成关卡。');
  updateHomeButton();
  if($('#levels-dialog').open)renderLevels();
}
function showHome(){$('#game-screen').hidden=true;$('#welcome-screen').hidden=false;$('#skip-to-board').hidden=true;updateCampaignUI();save();updateClock();window.scrollTo({top:0,behavior:'instant'});$('#start-game').focus({preventScroll:true});}
function showGame(){$('#welcome-screen').hidden=true;$('#game-screen').hidden=false;$('#skip-to-board').hidden=false;updateRound();window.scrollTo({top:0,behavior:'instant'});if(lastInput==='keyboard')board.focus({preventScroll:true});}
function updateRound(){
  $('#round-label').textContent='谜题 '+String(model().number).padStart(2,'0')+' · '+DIFFICULTY_NAMES[model().difficulty]+(round.practice?' · 已揭晓练习':'');
  $('#clue-text').textContent=model().clue;$('#focus-clue').textContent='线索 · '+model().clue;$('#canvas-mode-label').textContent=round.grid?'标准坐标纸':'空白纸';
  $('#grid-toggle').classList.toggle('active',round.grid);$('#grid-toggle').setAttribute('aria-pressed',String(round.grid));
  $('.canvas-wrap').classList.toggle('grid',round.grid);
  $('#submit-drawing').innerHTML=round.ended?'查看本题结果 <span>↗</span>':'交卷揭晓 <span>↗</span>';
  $('#reveal-answer').disabled=round.ended;$('#question-input').disabled=round.ended;
  $('#question-form button').disabled=round.ended;$('#pen').classList.toggle('active',tool==='pen');$('#erase').classList.toggle('active',tool==='erase');
  $('#canvas-mode-help').textContent=(round.grid?'坐标奖励按标准模型位置评价；开网格本身不加分。':'主要看形状。位置与整体大小不影响形状分。')+' 手机上可双指缩放查看细节。';
  renderQuestions();renderSuggestions();updateClock();drawBoard();
}
function pushUndo(){undo.push(clone(round.objects));if(undo.length>40)undo.shift();redo=[];}
function path(target,points){
  if(points.length<2)return;target.beginPath();target.moveTo(points[0].x,points[0].y);
  for(let i=1;i<points.length;i++)target.lineTo(points[i].x,points[i].y);target.stroke();
}
function tickStep(span){const raw=span/7,power=10**Math.floor(Math.log10(raw));return [1,2,5,10].map(n=>n*power).find(n=>n>=raw);}
function label(n){return Math.abs(n)<1e-9?'0':Number(n.toFixed(2)).toString();}
function drawGrid(target,m,w,h){
  const v=m.view,dx=tickStep(v.xmax-v.xmin),dy=tickStep(v.ymax-v.ymin),origin=toPixel(m,0,0,w,h);
  target.save();target.lineWidth=1;target.strokeStyle='#e7eae3';
  for(let x=Math.ceil(v.xmin/dx)*dx;x<=v.xmax;x+=dx){const p=toPixel(m,x,0,w,h);target.beginPath();target.moveTo(p.x,0);target.lineTo(p.x,h);target.stroke();}
  for(let y=Math.ceil(v.ymin/dy)*dy;y<=v.ymax;y+=dy){const p=toPixel(m,0,y,w,h);target.beginPath();target.moveTo(0,p.y);target.lineTo(w,p.y);target.stroke();}
  target.strokeStyle='#a9b9ad';target.lineWidth=1.7;target.beginPath();target.moveTo(0,origin.y);target.lineTo(w,origin.y);target.moveTo(origin.x,0);target.lineTo(origin.x,h);target.stroke();
  target.fillStyle='#78867b';target.font='17px system-ui';target.textAlign='center';target.textBaseline='top';
  for(let x=Math.ceil(v.xmin/dx)*dx;x<=v.xmax;x+=dx){const p=toPixel(m,x,0,w,h);if(p.x>18&&p.x<w-18)target.fillText(label(x),p.x,Math.min(h-23,Math.max(3,origin.y+7)));}
  target.textAlign='right';target.textBaseline='middle';
  for(let y=Math.ceil(v.ymin/dy)*dy;y<=v.ymax;y+=dy){if(Math.abs(y)<1e-9)continue;const p=toPixel(m,0,y,w,h);if(p.y>18&&p.y<h-18)target.fillText(label(y),Math.max(30,Math.min(w-10,origin.x-8)),p.y);}
  target.textAlign='left';target.fillText('x',w-22,Math.max(18,origin.y-15));target.fillText('y',Math.min(w-15,origin.x+13),20);target.restore();
}
const toolIds=['pen','line','curve','circle','select','erase'];
const toolHelp={pen:'自由画笔 · 可分多笔完成',line:'拖动绘制直线 · 调整端点或移动整条线',curve:'拖动建立曲线 · 再拖动四个控制点调整',circle:'辅助圆 · 虚线标记不参与评分',select:'选择图形 · 拖动整体或选中的控制点',erase:'按对象擦除 · 可撤销'};
function paintObject(target,o,selected=false){
  target.save();target.strokeStyle=o.type==='circle'?'#8d9f90':'#d97961';target.lineWidth=selected?6:5;
  if(o.type==='circle')target.setLineDash([10,9]);path(target,sampleObject(o));target.restore();
}
function buildObject(kind,a,b,id=crypto.randomUUID()){
  const dx=b.x-a.x,dy=b.y-a.y;
  if(kind==='circle')return {id,type:'circle',scored:false,center:a,radius:Math.min(Math.hypot(dx,dy),a.x,1000-a.x,a.y,610-a.y)};
  if(kind==='line')return {id,type:'line',scored:true,a,b};
  return {id,type:'curve',scored:true,a,b,c1:{x:Math.max(0,Math.min(1000,a.x+dx/3-dy*.2)),y:Math.max(0,Math.min(610,a.y+dy/3+dx*.2))},c2:{x:Math.max(0,Math.min(1000,a.x+dx*2/3-dy*.2)),y:Math.max(0,Math.min(610,a.y+dy*2/3+dx*.2))}};
}
function drawBoard(){
  const dpr=Math.min(2,window.devicePixelRatio||1);
  if(board.width!==1000*dpr){board.width=1000*dpr;board.height=610*dpr;}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,1000,610);
  if(round?.grid)drawGrid(ctx,model(),1000,610);
  ctx.lineCap='round';ctx.lineJoin='round';
  const objects=round?.objects||[];
  objects.forEach(o=>paintObject(ctx,o,o.id===selectedId&&!round.ended));
  if(drawing?.object)paintObject(ctx,drawing.object);
  if(drawing?.points)paintObject(ctx,{type:'pen',points:drawing.points});
  const selected=objects.find(o=>o.id===selectedId);
  if(selected&&!round.ended){
    ctx.save();ctx.strokeStyle='#9eb6a5';ctx.lineWidth=1.5;
    if(selected.type==='curve'){ctx.setLineDash([5,6]);path(ctx,[selected.a,selected.c1]);path(ctx,[selected.b,selected.c2]);ctx.setLineDash([]);}
    const radius=Math.max(5,5*1000/Math.max(board.getBoundingClientRect().width,1));
    for(const key of objectHandles(selected)){
      const p=handlePoint(selected,key);ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fillStyle=key.startsWith('c')&&key!=='center'?'#dce8df':'#fffefa';ctx.fill();ctx.strokeStyle='#2f6b55';ctx.stroke();
    }
    ctx.restore();
  }
  if(keyboardIntent&&round&&!round.ended){
    ctx.save();
    if(keyboardStroke){
      if(keyboardStroke.kind==='pen')paintObject(ctx,{type:'pen',points:[...keyboardStroke.points,{...keyboardCursor}]});
      else paintObject(ctx,buildObject(keyboardStroke.kind,keyboardStroke.start,{...keyboardCursor}));
    }
    const radius=Math.max(4,7*1000/Math.max(board.getBoundingClientRect().width,1));
    ctx.strokeStyle='#2f6b55';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.arc(keyboardCursor.x,keyboardCursor.y,radius,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(keyboardCursor.x-radius*1.7,keyboardCursor.y);ctx.lineTo(keyboardCursor.x+radius*1.7,keyboardCursor.y);ctx.moveTo(keyboardCursor.x,keyboardCursor.y-radius*1.7);ctx.lineTo(keyboardCursor.x,keyboardCursor.y+radius*1.7);ctx.stroke();
    ctx.restore();
  }
  $('#stroke-count').textContent=objects.length+' 个图形';
  $('#score-drawing').textContent=scoringStrokes(objects).length?'已绘制':objects.length?'仅辅助标记':'空白';
  $('#canvas-hint').hidden=!!objects.length||!!drawing||!!keyboardStroke;
  for(const id of toolIds){$('#'+id).setAttribute('aria-pressed',String(tool===id));$('#'+id).classList.toggle('active',tool===id);$('#'+id).disabled=!!round?.ended;}
  for(const id of ['grid-toggle','clear','trial-drawing','board-focus'])$('#'+id).disabled=!!round?.ended;
  $('#undo').disabled=!!round?.ended||!undo.length;$('#redo').disabled=!!round?.ended||!redo.length;
  $('#pen-state').textContent=toolHelp[tool];board.style.cursor=tool==='erase'?'cell':tool==='select'?'move':'crosshair';
  renderTrial();
}
const clampView=(value,min,max)=>Math.min(max,Math.max(min,value));
function updateZoomChip(){
  const status=$('#zoom-status');
  status.hidden=boardView.zoom<=1.001;
  $('#zoom-level').textContent=(Math.round(boardView.zoom*100)/100)+'×';
  board.dataset.zoom=boardView.zoom.toFixed(2);
}
function applyBoardView(){
  boardView.zoom=clampView(boardView.zoom,1,3);
  const width=board.offsetWidth||1,height=board.offsetHeight||1;
  boardView.tx=clampView(boardView.tx,width-width*boardView.zoom,0);
  boardView.ty=clampView(boardView.ty,height-height*boardView.zoom,0);
  if(boardView.zoom<=1.001){boardView.zoom=1;boardView.tx=0;boardView.ty=0;board.style.transform='';}
  else board.style.transform='translate('+boardView.tx+'px,'+boardView.ty+'px) scale('+boardView.zoom+')';
  updateZoomChip();
}
function resetBoardView(){boardView.zoom=1;boardView.tx=0;boardView.ty=0;board.style.transform='';updateZoomChip();}
function pointerPair(){
  const values=[...pointers.values()];if(values.length<2)return null;
  const [a,b]=values;return {distance:Math.hypot(a.x-b.x,a.y-b.y),mid:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};
}
function startPinch(){
  const pair=pointerPair();
  if(drawing)cancelDrawing();
  if(!pair||pair.distance<20)return;
  const rect=board.getBoundingClientRect();
  gesture={distance:pair.distance,zoom:boardView.zoom,left:rect.left-boardView.tx,top:rect.top-boardView.ty,
    contentX:(pair.mid.x-rect.left)/boardView.zoom,contentY:(pair.mid.y-rect.top)/boardView.zoom};
}
function movePinch(){
  const pair=pointerPair();if(!pair||!gesture)return;
  const zoom=clampView(gesture.zoom*pair.distance/gesture.distance,1,3);
  boardView.zoom=zoom;
  boardView.tx=pair.mid.x-gesture.left-gesture.contentX*zoom;
  boardView.ty=pair.mid.y-gesture.top-gesture.contentY*zoom;
  applyBoardView();
}
function zoomAt(clientX,clientY,targetZoom){
  const rect=board.getBoundingClientRect();
  const left=rect.left-boardView.tx,top=rect.top-boardView.ty;
  const contentX=(clientX-rect.left)/boardView.zoom,contentY=(clientY-rect.top)/boardView.zoom;
  boardView.zoom=clampView(targetZoom,1,3);
  boardView.tx=clientX-left-contentX*boardView.zoom;
  boardView.ty=clientY-top-contentY*boardView.zoom;
  applyBoardView();drawBoard();
}
function point(event){const r=board.getBoundingClientRect();return {x:Math.min(1000,Math.max(0,(event.clientX-r.left)/r.width*1000)),y:Math.min(610,Math.max(0,(event.clientY-r.top)/r.height*610))};}
function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
function hitObject(p){const threshold=12*1000/Math.max(board.getBoundingClientRect().width,1);return round.objects.findLastIndex(o=>sampleObject(o).some((q,i,s)=>i&&segmentDistance(p,s[i-1],q)<threshold));}
function eraseAt(p){const index=hitObject(p);if(index<0)return;round.objects.splice(index,1);selectedId=null;drawBoard();}
function currentHandlesHit(p){
  const o=round.objects.find(o=>o.id===selectedId);if(!o)return null;
  const threshold=22*1000/Math.max(board.getBoundingClientRect().width,1);
  return objectHandles(o).map(key=>({key,d:Math.hypot(p.x-handlePoint(o,key).x,p.y-handlePoint(o,key).y)})).filter(h=>h.d<=threshold).sort((a,b)=>a.d-b.d)[0]?.key||null;
}
board.addEventListener('pointerdown',event=>{
  if(!round||round.ended)return;
  if(keyboardStroke)keyboardStroke=null;
  keyboardIntent=false;setKeyboardHelp(false);
  if(event.button===0)pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(pointers.size>=2){
    if(!gesture)startPinch();
    try{board.setPointerCapture(event.pointerId);}catch{}
    event.preventDefault();
    return;
  }
  if(event.button!==0||drawing)return;updateClock();if(round.ended)return;
  board.setPointerCapture(event.pointerId);const p=point(event),before=clone(round.objects);
  const handle=tool!=='pen'&&tool!=='erase'?currentHandlesHit(p):null;
  drawing={pointer:event.pointerId,start:p,before};
  if(handle){drawing.edit=selectedId;drawing.handle=handle;drawing.original=clone(round.objects.find(o=>o.id===selectedId));}
  else if(tool==='select'){
    const index=hitObject(p);selectedId=index>=0?round.objects[index].id:null;
    if(selectedId){drawing.edit=selectedId;drawing.original=clone(round.objects[index]);}
  }else if(tool==='erase')eraseAt(p);
  else if(tool==='pen'){selectedId=null;drawing.points=[p];}
  else{selectedId=null;drawing.kind=tool;}
  drawBoard();event.preventDefault();
});
function moveDrawing(event){
  if(pointers.has(event.pointerId))pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(!gesture&&pointers.size>=2)startPinch();
  if(gesture){
    if(pointers.size>=2){movePinch();event.preventDefault();}
    return;
  }
  if(!drawing||drawing.pointer!==event.pointerId)return;
  const p=point(event);
  if(tool==='erase'){eraseAt(p);return;}
  if(drawing.edit){
    const index=round.objects.findIndex(o=>o.id===drawing.edit);if(index<0)return;
    let o=clone(drawing.original);
    if(drawing.handle){
      if(drawing.handle==='radius')o.radius=Math.max(0,Math.min(Math.hypot(p.x-o.center.x,p.y-o.center.y),o.center.x,1000-o.center.x,o.center.y,610-o.center.y));
      else if(drawing.handle==='center')o=translateObject(o,p.x-o.center.x,p.y-o.center.y);
      else o[drawing.handle]=p;
    }else o=translateObject(o,p.x-drawing.start.x,p.y-drawing.start.y);
    if(cleanObjects([o]).length)round.objects[index]=o;
  }else if(drawing.points){
    for(const e of event.getCoalescedEvents?.()||[event]){const q=point(e),last=drawing.points.at(-1);if(Math.hypot(q.x-last.x,q.y-last.y)>1.7)drawing.points.push(q);}
  }else if(drawing.kind){
    drawing.object=buildObject(drawing.kind,drawing.start,p,drawing.object?.id);
  }
  drawBoard();
}
board.addEventListener('pointermove',moveDrawing);
function finishStroke(event){
  if(event&&event.pointerType==='mouse'&&event.button!==0)return;
  if(event&&pointers.has(event.pointerId))pointers.delete(event.pointerId);
  if(gesture){if(pointers.size<2){gesture=null;drawBoard();}return;}
  if(!drawing||(event&&drawing.pointer!==event.pointerId))return;
  if(event)moveDrawing(event);
  if(drawing.points&&drawing.points.length>1)round.objects.push(...cleanObjects([{id:crypto.randomUUID(),type:'pen',points:drawing.points,scored:true}]));
  if(drawing.object){const items=cleanObjects([drawing.object]);if(items.length){round.objects.push(items[0]);selectedId=items[0].id;}}
  if(JSON.stringify(drawing.before)!==JSON.stringify(round.objects)){undo.push(drawing.before);if(undo.length>40)undo.shift();redo=[];}
  drawing=null;drawBoard();save();
}
function cancelDrawing(){if(!drawing)return;round.objects=drawing.before;drawing=null;if(!round.objects.some(o=>o.id===selectedId))selectedId=null;drawBoard();save();}
function cancelPointer(event){
  if(event&&pointers.has(event.pointerId))pointers.delete(event.pointerId);
  if(pointers.size<2)gesture=null;
  cancelDrawing();
}
board.addEventListener('pointerup',finishStroke);board.addEventListener('pointercancel',cancelPointer);
board.addEventListener('wheel',event=>{
  if(!(event.ctrlKey||event.metaKey)||drawing||gesture)return;
  event.preventDefault();
  zoomAt(event.clientX,event.clientY,boardView.zoom*Math.exp(-event.deltaY*.0015));
},{passive:false});
$('#zoom-reset').onclick=()=>{resetBoardView();drawBoard();};
const typeNames={pen:'自由笔迹',line:'直线',curve:'曲线',circle:'辅助圆'};
function announce(text){$('#canvas-status').textContent=text;}
function setKeyboardHelp(show,delay=false){
  clearTimeout(keyboardHelpTimer);
  if(show){$('#keyboard-help').hidden=false;return;}
  if(!delay){$('#keyboard-help').hidden=true;return;}
  keyboardHelpTimer=setTimeout(()=>{$('#keyboard-help').hidden=true;drawBoard();},220);
}
function keyboardStep(){return Math.max(3,Math.round(20/boardView.zoom));}
function moveKeyboardCursor(dx,dy,fast=false){
  const step=keyboardStep()*(fast?3:1);
  keyboardCursor.x=clampView(keyboardCursor.x+dx*step,0,1000);keyboardCursor.y=clampView(keyboardCursor.y+dy*step,0,610);
  drawBoard();announce('光标 '+Math.round(keyboardCursor.x)+', '+Math.round(keyboardCursor.y));
}
function cancelKeyboardStroke(message=true){if(!keyboardStroke)return;keyboardStroke=null;drawBoard();if(message)announce('已取消键盘图形。');}
function finishKeyboardPen(){
  if(!keyboardStroke||keyboardStroke.kind!=='pen')return;
  const points=keyboardStroke.points.map(point=>({...point})),last=points.at(-1);
  if(Math.hypot(keyboardCursor.x-last.x,keyboardCursor.y-last.y)>1)points.push({...keyboardCursor});
  if(points.length<2){announce('至少需要两个点：用方向键移动，空格加点。');return;}
  const items=cleanObjects([{id:crypto.randomUUID(),type:'pen',points,scored:true}]);
  if(!items.length){announce('笔迹太短，继续加点。');return;}
  pushUndo();round.objects.push(...items);keyboardStroke=null;save();drawBoard();
  announce('已添加自由笔迹，共 '+round.objects.length+' 个图形。');
}
function finishKeyboardObject(){
  if(!keyboardStroke||keyboardStroke.kind==='pen')return;
  const items=cleanObjects([buildObject(keyboardStroke.kind,keyboardStroke.start,{...keyboardCursor})]);
  if(!items.length){announce('图形太小：移动光标后再按空格。');return;}
  pushUndo();round.objects.push(items[0]);selectedId=items[0].id;keyboardStroke=null;save();drawBoard();
  announce('已添加'+typeNames[items[0].type]+'，共 '+round.objects.length+' 个图形。');
}
function selectObjectAtCursor(){
  const index=hitObject(keyboardCursor);
  if(index<0){announce('光标附近没有图形，按 [ 或 ] 依次选择。');return;}
  selectedId=round.objects[index].id;tool='select';drawBoard();
  announce('已选择'+typeNames[round.objects[index].type]+'。');
}
function cycleSelection(direction){
  if(keyboardStroke)cancelKeyboardStroke(false);
  if(!round.objects.length){announce('画板上还没有图形。');return;}
  let index=round.objects.findIndex(object=>object.id===selectedId);
  index=index<0?(direction>0?0:round.objects.length-1):(index+direction+round.objects.length)%round.objects.length;
  selectedId=round.objects[index].id;tool='select';drawBoard();
  announce('已选择'+typeNames[round.objects[index].type]+'，第 '+(index+1)+' / '+round.objects.length+' 个。');
}
function nudgeSelected(dx,dy,fast=false){
  const index=round.objects.findIndex(object=>object.id===selectedId);
  if(index<0){announce('先用 [ 或 ] 选择图形。');return;}
  const object=round.objects[index],step=keyboardStep()*(fast?3:1),moved=translateObject(object,dx*step,dy*step);
  if(JSON.stringify(moved)===JSON.stringify(object)){announce('图形已到画板边界。');return;}
  pushUndo();round.objects[index]=moved;save();drawBoard();announce('已移动'+typeNames[object.type]+'。');
}
function deleteSelected(){
  const index=round.objects.findIndex(object=>object.id===selectedId);
  if(index<0){announce('没有选中的图形。');return;}
  const type=round.objects[index].type;pushUndo();round.objects.splice(index,1);selectedId=null;save();drawBoard();
  announce('已删除'+typeNames[type]+'。');
}
function eraseAtCursor(){
  const index=hitObject(keyboardCursor);
  if(index<0){announce('光标附近没有图形。');return;}
  const type=round.objects[index].type;pushUndo();round.objects.splice(index,1);selectedId=null;save();drawBoard();
  announce('已擦除'+typeNames[type]+'。');
}
function handleBoardKeydown(event){
  if(!round||round.ended||event.key==='Tab')return;
  keyboardIntent=true;setKeyboardHelp(true);
  if(event.ctrlKey||event.metaKey||event.altKey)return;
  const arrows={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(arrows[event.key]){
    event.preventDefault();const [dx,dy]=arrows[event.key];
    if(keyboardStroke)moveKeyboardCursor(dx,dy,event.shiftKey);
    else if(tool==='select'&&selectedId)nudgeSelected(dx,dy,event.shiftKey);
    else moveKeyboardCursor(dx,dy,event.shiftKey);
    return;
  }
  if(event.key==='Escape'){
    if(keyboardStroke){event.preventDefault();event.stopPropagation();cancelKeyboardStroke();}
    return;
  }
  if(event.key==='Delete'||event.key==='Backspace'){
    event.preventDefault();
    if(selectedId)deleteSelected();else announce('没有选中的图形；按 [ 或 ] 选择。');
    return;
  }
  const bracket=event.code==='BracketRight'||event.key===']'?1:event.code==='BracketLeft'||event.key==='['?-1:0;
  if(bracket){event.preventDefault();cycleSelection(bracket);return;}
  const space=event.code==='Space'||event.key===' ';
  const enter=event.key==='Enter';
  if(!space&&!enter)return;
  event.preventDefault();
  if(tool==='select'&&!keyboardStroke){
    if(selectedId)announce('已选中图形：方向键移动，Delete 删除。');
    else selectObjectAtCursor();
    return;
  }
  if(tool==='erase'&&!keyboardStroke){eraseAtCursor();return;}
  if(!keyboardStroke){
    if(tool==='pen'){keyboardStroke={kind:'pen',points:[{...keyboardCursor}]};announce('已开始自由笔迹：方向键移动，空格加点，Enter 完成。');}
    else{keyboardStroke={kind:tool,start:{...keyboardCursor}};announce('起点已设定：移动光标后按空格或 Enter 完成。');}
    drawBoard();return;
  }
  if(keyboardStroke.kind==='pen'){
    if(space){
      const last=keyboardStroke.points.at(-1);
      if(Math.hypot(keyboardCursor.x-last.x,keyboardCursor.y-last.y)<1){announce('光标没有移动，先按方向键。');return;}
      keyboardStroke.points.push({...keyboardCursor});drawBoard();announce('已添加第 '+keyboardStroke.points.length+' 个点。');
    }else finishKeyboardPen();
  }else finishKeyboardObject();
}
board.addEventListener('focus',()=>{
  keyboardIntent=lastInput==='keyboard'&&!!round&&!round.ended;
  setKeyboardHelp(keyboardIntent);
  if(keyboardIntent)announce('键盘模式：方向键移动光标，空格放置点，Enter 完成，Esc 取消。');
  drawBoard();
});
board.addEventListener('blur',()=>{
  keyboardIntent=false;keyboardStroke=null;setKeyboardHelp(false,true);drawBoard();
});
board.addEventListener('keydown',handleBoardKeydown);
$('#skip-to-board').onclick=event=>{event.preventDefault();board.focus({preventScroll:true});board.scrollIntoView({block:'center',behavior:'instant'});};
document.addEventListener('pointerdown',()=>{lastInput='pointer';},true);
document.addEventListener('keydown',()=>{lastInput='keyboard';},true);
for(const id of toolIds)$('#'+id).onclick=()=>{finishStroke();keyboardStroke=null;tool=id;if(id==='pen'||id==='erase')selectedId=null;drawBoard();};
$('#undo').onclick=()=>{if(round.ended||!undo.length)return;finishStroke();redo.push(clone(round.objects));round.objects=undo.pop();selectedId=null;drawBoard();save();};
$('#redo').onclick=()=>{if(round.ended||!redo.length)return;finishStroke();undo.push(clone(round.objects));round.objects=redo.pop();selectedId=null;drawBoard();save();};
$('#clear').onclick=()=>{if(round.ended||!round.objects.length)return;finishStroke();pushUndo();round.objects=[];selectedId=null;drawBoard();save();};
$('#grid-toggle').onclick=()=>{if(round.ended)return;finishStroke();round.grid=!round.grid;updateRound();save();};
document.addEventListener('keydown',event=>{
  if(event.target.matches('input,textarea'))return;
  if(event.key==='Escape'){
    if(drawing){event.preventDefault();cancelDrawing();}
    else if(document.body.classList.contains('board-focus')){event.preventDefault();setBoardFocus(false);}
    else if(boardView.zoom>1.001){event.preventDefault();resetBoardView();drawBoard();}
  }
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();$(event.shiftKey?'#redo':'#undo').click();}
});
function evaluate(){return scoreDrawing(model(),scoringStrokes(round.objects),{grid:round.grid});}
function renderTrial(){
  if(!round)return;const d=round.trialDisplay,stale=!!d&&d.signature!==scoringSignature(round.objects,round.grid);
  $('#trial-count').textContent=round.trialCount+' 次试评';$('#process-trials').textContent=round.trialCount;
  $('#trial-panel').classList.toggle('stale',stale);$('#trial-scores').hidden=!d;
  $('#trial-state').textContent=!d?'试评不限次数，不扣分，也不会揭晓答案。':stale?'修改前的结果 · 图形已改变，再试评查看当前分数。':!d.valid?'有效笔迹太少，画出完整主体后再试评；本次不计次数。':round.ended?'本题试评记录 · 最终成绩见结算。':'当前绘图的精确分数 · 可以继续修改，交卷才揭晓。';
  if(d){$('#trial-shape').textContent=d.shape;$('#trial-coordinate').textContent='+'+d.coordinate;$('#trial-total').textContent='合计 '+d.total+' / 120';}
  $('#trial-delta').textContent=d?.delta==null?'':(d.delta>0?'比上次提高 '+d.delta:d.delta<0?'比上次降低 '+Math.abs(d.delta):'与上次相同')+' 分';
}
$('#trial-drawing').onclick=()=>{
  if(round.ended)return;finishStroke();updateClock();if(round.ended)return;
  recordTrial(round,evaluate());renderTrial();save();
};
const categoryLabels={all:'全部',symmetry:'对称性',monotonicity:'走势',structure:'分支与连续性',domain:'定义域',range:'取值范围',extremum:'极值',point:'坐标关系',period:'周期与渐近线'};
function category(q){return ['continuity','smoothness','structure'].includes(q.category)?'structure':['period','asymptote'].includes(q.category)?'period':q.category;}
function renderBank(){
  $('#question-categories').innerHTML=Object.entries(categoryLabels).map(([id,name])=>'<button type="button" data-category="'+id+'" class="'+(bankCategory===id?'active':'')+'" aria-pressed="'+(bankCategory===id)+'">'+name+'</button>').join('');
  $('#question-categories').querySelectorAll('button').forEach(b=>b.onclick=()=>{bankCategory=b.dataset.category;renderBank();});
  $('#bank-questions').innerHTML=QUESTIONS.filter(q=>bankCategory==='all'||category(q)===bankCategory).map(q=>{
    const answered=round.questions.find(a=>a.valid&&a.property===q.id);
    // Canonical answers come from the same local fact table even if a prior free question was negated.
    return '<button type="button" class="suggestion '+(answered?'answered':'')+'" data-property="'+q.id+'" title="'+escape(q.meaning)+'"><span class="bank-text"><span class="bank-q">'+escape(q.text)+'</span><small>'+escape(q.meaning)+'</small></span>'+(answered?'<strong>'+escape(resolveAnswer(model(),{property:q.id,negated:false,clear:true}).answer)+' · 已问</strong>':'')+'</button>';
  }).join('');
  $('#bank-questions').querySelectorAll('button').forEach(b=>{const answered=round.questions.some(q=>q.valid&&q.property===b.dataset.property);b.disabled=(round.ended||!!request)&&!answered;b.onclick=()=>{if(answered){toast('已回答的问题可以免费查看，不重复计数。');return;}ask(QUESTIONS.find(q=>q.id===b.dataset.property).text);};});
}
function renderSuggestions(){
  const answered=new Set(round.questions.filter(q=>q.valid).map(q=>q.property));
  const options=[],categories=new Set();
  for(let i=0;i<QUESTIONS.length;i++){
    const q=QUESTIONS[(i+suggestionCursor)%QUESTIONS.length];
    if(!answered.has(q.id)&&!categories.has(q.category)){options.push(q);categories.add(q.category);}
    if(options.length===3)break;
  }
  $('#suggested-questions').innerHTML=options.length?options.map(q=>'<button class="suggestion" type="button" data-key="'+q.id+'" title="'+escape(q.meaning)+'">'+escape(q.text)+'</button>').join(''):'<p class="questions-done">示例性质已探索完，可以换一种问法。</p>';
  $('#suggested-questions').querySelectorAll('button').forEach(button=>{button.disabled=round.ended||!!request;button.onclick=()=>ask(QUESTIONS.find(q=>q.id===button.dataset.key).text);});
}
$('#refresh-questions').onclick=()=>{suggestionCursor=(suggestionCursor+3)%QUESTIONS.length;renderSuggestions();};
function renderQuestions(){
  const inquiry=inquiryScore(round.questions),valid=inquiry.count;
  $('#process-score').textContent=inquiry.score+' / 100';
  $('#question-cost').textContent=valid<3?'已问 '+valid+' 个，还有 '+(3-valid)+' 个免费问题。':'已问 '+valid+' 个；再问一个新问题将扣 3 分解谜分，绘图分不受影响。';
  renderBank();
  $('#question-count').textContent=valid+' 次';$('#score-questions').textContent=valid;
  $('#question-log').innerHTML=round.questions.length?round.questions.map(q=>'<div class="log-item"><span class="qmark">?</span><div><div>'+escape(q.question)+'</div><div class="answer '+(q.answer==='不是'?'no':'')+'">'+escape(q.pending?'判断中…':q.answer)+'</div>'+(q.message?'<p class="answer-message">'+escape(q.message)+'</p>':'')+(q.retry&&!round.ended?'<button class="retry-question" data-retry="'+escape(q.id)+'">重试</button>':'')+'</div></div>').join(''):'<div class="empty-log">还没有问题。<br>先从一个性质开始吧。</div>';
  $('#question-log').querySelectorAll('[data-retry]').forEach(button=>button.onclick=()=>ask(round.questions.find(q=>q.id===button.dataset.retry).question));
  $('#question-log').scrollTop=$('#question-log').scrollHeight;
}
async function ask(text){
  const question=text.trim();if(!question||round.ended||request)return;
  updateClock();if(round.ended)return;
  const known=localQuestion(question);
  if(round.questions.some(q=>q.valid&&(known?q.property===known.property:q.question===question))){toast(known?'这个性质已回答：'+resolveAnswer(model(),known).answer+'。重复查看免费。':'这个问题已得到回答，重复查看免费。');return;}
  const item={id:crypto.randomUUID(),question,pending:true,answer:'',valid:false},owner=round.id;
  round.questions.push(item);$('#question-input').value='';$('#ask-status').hidden=true;
  if(known){
    Object.assign(item,resolveAnswer(model(),known),{pending:false,valid:true});
    renderQuestions();renderSuggestions();save();return;
  }
  if(questionGuard(question)){
    Object.assign(item,{pending:false,answer:'请改问',message:'请一次只问一个性质，答案将在交卷后揭晓。'});
    renderQuestions();save();return;
  }
  settleClock(round);round.waitingSince=Date.now();
  const controller=new AbortController(),pendingRequest={controller,timer:null};
  request=pendingRequest;pendingRequest.timer=setTimeout(()=>controller.abort(),ASK_TIMEOUT);
  $('#ask-status').hidden=false;$('#ask-status').textContent='正在理解问题，计时暂时停止…';
  $('#question-input').disabled=true;$('#question-form button').disabled=true;renderQuestions();renderSuggestions();save();
  try{
    const response=await fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({modelId:round.modelId,question}),signal:controller.signal});
    const data=await response.json();if(round.id!==owner||round.ended)return;
    if(data.status==='ok'&&['是','不是'].includes(data.answer)&&QUESTIONS.some(q=>q.id===data.property)){
      Object.assign(item,{pending:false,answer:data.answer,valid:true,property:data.property,retry:false});
    }else Object.assign(item,{pending:false,answer:data.status==='clarify'?'请改问':'暂未回答',message:data.message||'问答暂时不可用，请重试。',retry:data.status!=='clarify'});
    $('#ask-status').hidden=true;
    if(data.status==='offline')setService('本地问题库可用',false);
  }catch(error){
    if(round.id!==owner||round.ended)return;
    Object.assign(item,{pending:false,answer:'暂未回答',retry:true,message:error.name==='AbortError'?'等待已超过 15 秒，可重试或使用示例问题。':'本地问答服务不可用，示例问题仍可使用。'});
    $('#ask-status').hidden=true;
  }finally{
    clearTimeout(pendingRequest.timer);
    if(round.id===owner&&request===pendingRequest){
      settleClock(round);request=null;$('#question-input').disabled=round.ended;$('#question-form button').disabled=round.ended;
      renderQuestions();renderSuggestions();updateClock();save();
    }
  }
}
$('#question-form').onsubmit=event=>{event.preventDefault();ask($('#question-input').value);};
function updateClock(){
  if(!round)return;const clock=clockStatus(round);
  if(!round.ended)round.hintCount=Math.max(round.hintCount,clock.hints);
  $('#hint-list').innerHTML=model().hints.map((hint,i)=>i<round.hintCount?'<div class="hint-revealed"><span>✦</span><p>'+escape(hint)+'</p></div>':'<div class="hint-locked"><span>◌</span><p>第 '+(i+1)+' 个特征尚未浮现。</p></div>').join('');
  $('#clue-count').textContent=round.hintCount+' / 3';$('#score-hints').textContent=round.hintCount+' / 3';
  $('#hint-timer').textContent=round.hintCount===3?'已发现':round.ended?'已结束':Math.ceil(clock.nextHint/1000)+'s';
  $('#timer strong').textContent=round.ended?'本题已结束':request?'问答等待中':round.timeLimit?formatTime(clock.remaining):'不限时 · '+formatTime(clock.elapsed);
  $('#focus-timer').textContent=round.ended?'本题已结束':request?'问答等待中':round.timeLimit?formatTime(clock.remaining)+' 剩余':'不限时 · '+formatTime(clock.elapsed);
  const homeStatus=$('#home-status');
  if(homeStatus){
    homeStatus.hidden=round.ended;
    if(!round.ended){
      homeStatus.textContent=round.timeLimit?'本题仍在计时 · '+formatTime(clock.remaining)+' 剩余':'本题计时中 · 已用 '+formatTime(clock.elapsed);
      homeStatus.classList.toggle('urgent',!!round.timeLimit&&clock.remaining<=15000);
    }
  }
  $('#timer').classList.toggle('urgent',!round.ended&&clock.remaining!==null&&clock.remaining<=15000);
  $('#timer').classList.toggle('running',!round.ended&&!request);
  if(clock.timedOut&&!round.ended)end('timeout');
}
function end(reason='submit'){
  if(round.ended){openResult();return;}
  if(reason==='reveal')round.practice=true;
  finishStroke();pointers.clear();gesture=null;keyboardStroke=null;keyboardIntent=false;setKeyboardHelp(false);const clock=clockStatus(round);round.elapsedMs=clock.elapsed;round.hintCount=Math.max(round.hintCount,clock.hints);
  clearRequest();round.elapsedMs=clock.elapsed;round.ended=true;round.clockAt=Date.now();round.waitingSince=null;
  round.finalSubmissions=1;round.result={...evaluate(),inquiry:inquiryScore(round.questions),endReason:reason,elapsed:round.elapsedMs,at:Date.now()};
  if(!round.practice){
    const outcome=recordCampaign(campaign,{modelId:round.modelId,total:round.result.total,inquiry:round.result.inquiry.score,at:round.result.at});
    campaign=outcome.campaign;write(CAMPAIGN_KEY,JSON.stringify(campaign));
    round.campaignOutcome={newBest:outcome.newBest,previousBest:outcome.previousBest,cleared:outcome.cleared};
  }
  history.unshift({id:round.id,modelId:round.modelId,shape:round.result.shape,coordinate:round.result.coordinate,total:round.result.total,elapsed:round.elapsedMs,questions:inquiryScore(round.questions).count,inquiry:round.result.inquiry.score,trials:round.trialCount,finalSubmissions:1,ruleVersion:3,hints:round.hintCount,practice:round.practice,reason});
  history=history.slice(0,100);write(HISTORY_KEY,JSON.stringify(history));save();updateRound();updateCampaignUI();
  write(ONBOARD_KEY,'1');$('#first-run-tip').hidden=true;
  if($('#history-dialog').open)renderHistory();
  if(document.body.classList.contains('board-focus'))setBoardFocus(false);
  openResult();
}
function openResult(){
  const result=round.result;if(!result)return;
  const inquiry=inquiryScore(round.questions),detail=result.breakdown;
  $('#result-kicker').textContent=(round.legacyRules?'旧规则存档 · ':round.practice?'已揭晓练习 · ':'')+(result.endReason==='timeout'?'时间到 · 模型揭晓':result.endReason==='reveal'?'主动揭晓 · 本次记录':'模型揭晓');
  $('#result-name').textContent=model().name;$('#result-formula').textContent=model().formula;$('#result-symbol').textContent=model().symbol;
  $('#shape-score').textContent=result.shape;$('#coordinate-score').textContent='+'+result.coordinate;
  $('#total-score').textContent=result.total+' / 120';$('#inquiry-score').textContent=inquiry.score+' / 100';
  $('#inquiry-formula').textContent='回答 '+inquiry.count+' 个不同问题，前 3 个免费，扣 '+inquiry.deduction+' 分，得 '+inquiry.score+' 分。';
  const best=campaign.models[round.modelId]?.bestTotal??null;
  $('#result-best').textContent=best===null?'—':best+' / 120';
  $('#result-record').hidden=!(round.campaignOutcome?.newBest&&!round.practice);
  $('#result-summary').textContent='模型：'+model().name+'。绘图 '+result.total+' / 120，形状 '+result.shape+'，坐标奖励 '+result.coordinate+'；提问节约 '+inquiry.score+' / 100；用时 '+formatTime(result.elapsed)+'。';
  $('#score-reason').textContent=result.endReason==='reveal'?'主动揭晓 · 练习记录':result.shape>=85?'轮廓已经很接近了。':result.shape>=60?'再看一看关键转折。':'先抓住模型的整体走势。';
  $('#result-feedback').textContent=model().explanation;
  $('#result-suggestions').innerHTML=result.suggestions.map(text=>'<li>'+escape(text)+'</li>').join('');
  const row=(label,value,kind='')=>'<div class="breakdown-row '+kind+'"><span>'+label+'</span><strong>'+value+'</strong></div>';
  $('#score-breakdown').innerHTML=row('轮廓接近',detail.contour+' / 55')+row('曲线覆盖',detail.coverage+' / 45')+row('形状基础分',detail.base+' / 100','subtotal')+
    detail.deductions.map(d=>row(escape(d.label),(d.value?'-':'')+d.value,'deduction')).join('')+row('最终形状分',result.shape+' / 100','subtotal')+
    row('坐标位置',detail.position+' / 14')+row('关键点位置',detail.anchors+' / 6')+'<p class="breakdown-explanation">'+escape(detail.coordinateReason)+'</p>'+row('绘图合计',result.total+' / 120','subtotal');
  $('#score-details').open=false;
  $('#result-time').textContent=formatTime(result.elapsed);$('#result-questions').textContent=inquiry.count;$('#result-question-split').textContent=inquiry.free+' / '+inquiry.paid;
  $('#result-trials').textContent=round.trialCount;$('#result-submissions').textContent=round.finalSubmissions;$('#result-hints').textContent=round.hintCount+' / 3';
  $('#result-end-reason').textContent='结束方式：'+({submit:'主动交卷',timeout:'超时交卷',reveal:'直接揭晓'}[result.endReason]||'已结束')+(round.legacyRules?' · 旧存档未追溯统计新增计数':'');
  $('#comparison-note').textContent=round.grid?'按原坐标位置叠加；绿色为标准模型。':'已对齐位置与整体大小；方向和相对比例保留。';
  const next=nextModelAfter(round.modelId);
  $('#next-game').innerHTML=next?'下一关 <span>→</span>':'查看关卡';
  $('#show-reference').checked=true;if(!$('#result-dialog').open)$('#result-dialog').showModal();drawResult();
}
function drawResult(){
  if(!round?.result)return;const dpr=Math.min(2,window.devicePixelRatio||1),w=900,h=360;
  resultBoard.width=w*dpr;resultBoard.height=h*dpr;resultCtx.setTransform(dpr,0,0,dpr,0,0);resultCtx.clearRect(0,0,w,h);
  let user,reference;
  if(round.grid){
    const scale=.52,offsetX=(w-1000*scale)/2,offsetY=(h-610*scale)/2;
    resultCtx.save();resultCtx.translate(offsetX,offsetY);resultCtx.scale(scale,scale);drawGrid(resultCtx,model(),1000,610);resultCtx.restore();
    const fit=s=>s.map(p=>({x:offsetX+p.x*scale,y:offsetY+p.y*scale}));
    user=scoringStrokes(round.objects).map(fit);reference=referenceStrokes(model()).map(fit);
  }else{
    const u=round.result.normalizedUser,r=round.result.normalizedReference;
    const points=[...u.flat(),...r.flat()];let sx=1,sy=1;
    if(points.length){sx=Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x));sy=Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y));}
    const scale=Math.min(w*.84/Math.max(sx,.05),h*.8/Math.max(sy,.05));
    const fit=s=>s.map(p=>({x:w/2+p.x*scale,y:h/2+p.y*scale}));
    user=u.map(fit);reference=r.map(fit);
    if(!reference.length){reference=referenceStrokes(model(),w,h);}
  }
  resultCtx.lineWidth=3;resultCtx.lineCap='round';resultCtx.lineJoin='round';
  if($('#show-reference').checked){resultCtx.strokeStyle='#2f6b55';reference.forEach(s=>path(resultCtx,s));}
  resultCtx.strokeStyle='#d97961';user.forEach(s=>path(resultCtx,s));
}
function canReplaceRound(){
  if(!round||round.ended)return true;
  if(!round.objects.length&&!round.questions.length)return true;
  return window.confirm('当前题目还有进度，切换关卡会替换它。继续？');
}
function renderLevels(){
  const summary=summarizeCampaign(campaign);
  const complete=summary.cleared===summary.total;
  $('#levels-summary').innerHTML=complete
    ?'<strong>'+summary.total+' / '+summary.total+' 全部完成</strong> · 最佳合计 <strong>'+summary.bestTotalSum+'</strong> / '+(summary.total*120)
    :(summary.cleared
      ?'已完成 <strong>'+summary.cleared+'</strong> / '+summary.total+' · 最佳合计 <strong>'+summary.bestTotalSum+'</strong> / '+(summary.cleared*120)
      :'还没有完成关卡。每关正式交卷并留下有效笔迹后，会记录最佳成绩。');
  $('#levels-groups').innerHTML=['easy','medium','hard'].map(difficulty=>{
    const models=MODELS.filter(model=>model.difficulty===difficulty);
    const cleared=models.filter(model=>campaign.models[model.id]?.cleared).length;
    return '<section class="level-section"><h3>'+DIFFICULTY_NAMES[difficulty]+'<span>'+cleared+' / '+models.length+'</span></h3><div class="level-grid">'+
      models.map(model=>{
        const record=campaign.models[model.id],current=round&&!round.ended&&round.modelId===model.id;
        const cleared=!!record?.cleared,best=record?.bestTotal??null;
        const status=cleared?'已完成':'未挑战';
        const label='谜题 '+String(model.number).padStart(2,'0')+'，'+DIFFICULTY_NAMES[model.difficulty]+'，'+status+(best!==null?'，最佳 '+best+' / 120':'')+(current?'，进行中':'');
        return '<button type="button" class="level-card'+(cleared?' is-cleared':'')+(current?' is-current':'')+'" data-level="'+model.number+'" aria-label="'+escape(label)+'">'+
          '<span class="level-number">'+String(model.number).padStart(2,'0')+'</span><span class="level-diff">'+DIFFICULTY_NAMES[model.difficulty]+'</span>'+
          (best!==null?'<span class="level-best">'+best+' <small>/ 120</small></span>':'<span class="level-empty">未挑战</span>')+
          (cleared?'<span class="level-check" aria-hidden="true">✓</span>':'')+
          (current?'<span class="level-current-tag">进行中</span>':'')+
        '</button>';
      }).join('')+'</div></section>';
  }).join('');
  $('#levels-groups').querySelectorAll('[data-level]').forEach(button=>button.onclick=()=>{
    const model=modelByNumber(Number(button.dataset.level));if(model)selectLevel(model);
  });
  const next=firstUncleared(campaign);
  $('#levels-next').textContent=next?'继续第 '+next.number+' 关':'全部完成';
  $('#levels-next').disabled=!next;
}
function openLevels(){
  renderLevels();
  if(!$('#levels-dialog').open)$('#levels-dialog').showModal();
}
function selectLevel(model){
  if(round&&!round.ended&&round.modelId===model.id){$('#levels-dialog').close();showGame();return;}
  if(!canReplaceRound())return;
  $('#levels-dialog').close();start(model);
}
function startRandom(){
  if(!canReplaceRound())return;
  $('#levels-dialog').close();start(pickModel());
}
function historyTimestamp(ms){
  if(!ms)return '';
  const date=new Date(ms),pad=value=>String(value).padStart(2,'0');
  return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+' '+pad(date.getHours())+':'+pad(date.getMinutes());
}
function historyLabel(entry){
  const parts=[entry.name];
  parts.push(entry.total===null?'绘图未记录':'绘图 '+entry.total+' / 120');
  if(entry.shape!==null)parts.push('形状 '+entry.shape);
  if(entry.coordinate!==null)parts.push('坐标 +'+entry.coordinate);
  if(entry.inquiry!==null)parts.push('提问节约 '+entry.inquiry);
  if(entry.questions!==null)parts.push(entry.questions+' 个问题');
  if(entry.elapsed!==null)parts.push('用时 '+formatTime(entry.elapsed));
  if(entry.practice)parts.push('练习');
  if(entry.legacy)parts.push('旧规则');
  return parts.join('，');
}
function renderHistory(){
  const stored=parse(HISTORY_KEY,null);if(Array.isArray(stored))history=stored;
  const entries=normalizeHistory(history),shown=filterHistory(entries,historyFilter),summary=summarizeHistory(shown);
  $('#history-difficulty').querySelectorAll('button').forEach(button=>{
    const selected=button.dataset.value===historyFilter.difficulty;
    button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
  });
  $('#history-days').value=historyFilter.days;
  $('#history-official').checked=historyFilter.officialsOnly;
  $('#history-summary').innerHTML=summary.count
    ?'共 <strong>'+summary.count+'</strong> 条 · 最高绘图 <strong>'+(summary.bestTotal??'—')+'</strong> / 120 · 最高提问节约 <strong>'+(summary.bestInquiry??'—')+'</strong> / 100'
    :(entries.length?'没有符合筛选条件的记录。':'还没有已完成的题目。交卷后成绩会出现在这里。');
  $('#history-list').innerHTML=shown.length?shown.map(entry=>{
    const meta=[];
    if(entry.questions!==null)meta.push(entry.questions+' 个问题');
    if(entry.trials!==null)meta.push(entry.trials+' 次试评');
    if(entry.hints!==null)meta.push('线索 '+entry.hints+' / 3');
    if(entry.elapsed!==null)meta.push('用时 '+formatTime(entry.elapsed));
    if(entry.at)meta.push(historyTimestamp(entry.at));
    const tags=[];
    if(entry.practice)tags.push('<span class="history-tag">练习</span>');
    if(entry.legacy)tags.push('<span class="history-tag legacy">旧规则</span>');
    if(entry.reason==='timeout')tags.push('<span class="history-tag timeout">超时</span>');
    const origin=entry.modelNumber?'谜题 '+String(entry.modelNumber).padStart(2,'0')+' · '+entry.difficultyName:'';
    return '<article class="history-item" aria-label="'+escape(historyLabel(entry))+'">'+
      '<div class="history-item-main">'+
        '<div class="history-model"><strong>'+escape(entry.name)+'</strong>'+(origin?'<span>'+escape(origin)+'</span>':'')+'</div>'+
        '<div class="history-drawing"><strong>'+(entry.total??'—')+'</strong><small>'+(entry.total===null?'未记录':'<span>/ 120</span>'+(entry.shape!==null?'<span class="hist-shape"> · 形状 '+entry.shape+'</span>':'')+(entry.coordinate!==null?'<span class="hist-coord"> · 坐标 +'+entry.coordinate+'</span>':''))+'</small></div>'+
        '<div class="history-inquiry"><span>提问节约</span><strong>'+(entry.inquiry??'—')+'</strong></div>'+
      '</div>'+
      '<div class="history-meta">'+tags.join('')+meta.map(text=>'<span>'+escape(text)+'</span>').join('')+'</div>'+
    '</article>';
  }).join(''):'<div class="history-empty">'+(entries.length?'调整筛选条件试试。':'完成一题后，绘图与提问成绩会保存在这里。')+'</div>';
}
function openHistory(){
  const stored=parse(HISTORY_KEY,null);if(Array.isArray(stored))history=stored;
  renderHistory();
  if(!$('#history-dialog').open)$('#history-dialog').showModal();
}
$('#history-open').onclick=openHistory;
$('#history-close').onclick=()=>$('#history-dialog').close();
$('#levels-open').onclick=openLevels;$('#levels-result').onclick=openLevels;$('#round-label').onclick=openLevels;
$('#levels-close').onclick=()=>$('#levels-dialog').close();
$('#levels-history').onclick=()=>{$('#levels-dialog').close();openHistory();};
$('#levels-next').onclick=()=>{const next=firstUncleared(campaign);if(!next)return;if(!canReplaceRound())return;$('#levels-dialog').close();start(next);};
$('#levels-random').onclick=startRandom;
$('#history-difficulty').querySelectorAll('button').forEach(button=>button.onclick=()=>{historyFilter.difficulty=button.dataset.value;renderHistory();});
$('#history-days').onchange=()=>{historyFilter.days=$('#history-days').value;renderHistory();};
$('#history-official').onchange=()=>{historyFilter.officialsOnly=$('#history-official').checked;renderHistory();};
function setBoardFocus(active){
  const on=!!active,button=$('#board-focus');
  keyboardStroke=null;keyboardIntent=false;setKeyboardHelp(false);
  document.body.classList.toggle('board-focus',on);resetBoardView();
  button.setAttribute('aria-pressed',String(on));
  button.textContent=on?'退出':'专注';
  button.title=on?'退出专注画板':'专注画板';
  button.setAttribute('aria-label',button.title);
  if(!on)button.focus({preventScroll:true});
  requestAnimationFrame(()=>drawBoard());
}
$('#board-focus').onclick=()=>{finishStroke();setBoardFocus(!document.body.classList.contains('board-focus'));};
function canvasRoundRect(context,x,y,width,height,radius){
  context.beginPath();context.moveTo(x+radius,y);context.arcTo(x+width,y,x+width,y+height,radius);context.arcTo(x+width,y+height,x,y+height,radius);context.arcTo(x,y+height,x,y,radius);context.arcTo(x,y,x+width,y,radius);context.closePath();
}
function wrapCanvasText(context,text,x,y,maxWidth,lineHeight){
  const lines=[];let line='';
  for(const character of [...text]){
    const candidate=line+character;
    if(line&&context.measureText(candidate).width>maxWidth){lines.push(line);line=character;}
    else line=candidate;
  }
  if(line)lines.push(line);
  lines.forEach((value,index)=>context.fillText(value,x,y+index*lineHeight));
  return y+lines.length*lineHeight;
}
function buildShareCard(){
  const width=1080,height=1350,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d'),result=round.result;
  const font=(size,weight=400,family='"PingFang SC","Noto Sans SC",system-ui,sans-serif')=>weight+' '+size+'px '+family;
  context.fillStyle='#f7f5ef';context.fillRect(0,0,width,height);
  context.fillStyle='#fffefa';context.strokeStyle='#e9e7de';context.lineWidth=2;canvasRoundRect(context,44,44,width-88,height-88,12);context.fill();context.stroke();
  // Brand mark.
  context.fillStyle='#2f6b55';canvasRoundRect(context,92,92,54,54,14);context.fill();
  context.strokeStyle='#fffefa';context.lineWidth=3.5;context.lineCap='round';context.beginPath();context.moveTo(104,128);context.bezierCurveTo(112,108,122,108,130,124);context.bezierCurveTo(136,134,140,132,144,116);context.stroke();
  context.fillStyle='#242522';context.font=font(32,700);context.fillText('函数谜绘',166,126);
  context.fillStyle='#6f7269';context.font=font(14,500);context.fillText('FUNCTION MYSTERY',168,152);
  // Level and model.
  context.fillStyle='#2f6b55';context.font=font(20,700);context.fillText('24 关函数挑战 · 第 '+String(model().number).padStart(2,'0')+' 关 · '+DIFFICULTY_NAMES[model().difficulty],92,210);
  context.fillStyle='#242522';context.font=font(54,700);context.fillText(model().name,92,278);
  context.fillStyle='#d97961';context.font='500 26px ui-monospace,SFMono-Regular,Menlo,monospace';context.fillText(model().formula,92,318);
  // Scores.
  const scoreText=String(result.total);
  context.fillStyle='#2f6b55';context.font=font(112,700);const scoreWidth=context.measureText(scoreText).width;context.fillText(scoreText,92,448);
  context.fillStyle='#6f7269';context.font=font(34);context.fillText('/ 120',92+scoreWidth+18,448);
  context.font=font(23);context.fillText('形状 '+result.shape+' · 坐标 +'+result.coordinate+' · 提问节约 '+result.inquiry.score+' · 用时 '+formatTime(result.elapsed),92,494);
  context.strokeStyle='#deddd4';context.lineWidth=1.5;context.beginPath();context.moveTo(92,530);context.lineTo(width-92,530);context.stroke();
  // Clue.
  context.fillStyle='#2f6b55';context.font=font(19,700);context.fillText('线索',92,572);
  context.fillStyle='#242522';context.font=font(28);wrapCanvasText(context,'“'+model().clue+'”',92,614,width-184,42);
  // Result comparison.
  const showReference=$('#show-reference').checked;
  if(!showReference){$('#show-reference').checked=true;drawResult();}
  const graphX=90,graphY=716,graphWidth=900,graphHeight=360;
  context.fillStyle='#fffefa';context.strokeStyle='#deddd4';context.lineWidth=1.5;canvasRoundRect(context,graphX,graphY,graphWidth,graphHeight,4);context.fill();context.stroke();
  context.drawImage(resultBoard,graphX,graphY,graphWidth,graphHeight);
  if(!showReference){$('#show-reference').checked=false;drawResult();}
  context.strokeStyle='#d97961';context.lineWidth=4;context.beginPath();context.moveTo(92,1108);context.lineTo(130,1108);context.stroke();
  context.fillStyle='#6f7269';context.font=font(18);context.fillText('你的笔迹',140,1115);
  context.strokeStyle='#2f6b55';context.beginPath();context.moveTo(260,1108);context.lineTo(298,1108);context.stroke();
  context.fillStyle='#6f7269';context.fillText('参考模型',308,1115);
  context.strokeStyle='#deddd4';context.beginPath();context.moveTo(92,1150);context.lineTo(width-92,1150);context.stroke();
  // Footer.
  context.fillStyle='#2f6b55';context.font=font(25,700);context.fillText('一句线索，三个问题，一个函数。',92,1202);
  context.fillStyle='#6f7269';context.font=font(18);context.fillText('24 关 · 免费网页游戏 · 适合高中生和喜欢谜题的人',92,1236);
  const url=new URL(location.href),isLocal=/^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)||url.protocol==='file:';
  const shareUrl=isLocal?'':url.origin+url.pathname+'?p='+model().number;
  context.font=font(17);context.fillText(shareUrl||'在浏览器打开分享链接开始挑战',92,1282);
  return canvas;
}
async function saveShareCard(){
  if(!round?.result)return;
  try{
    const canvas=buildShareCard();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob){toast('成绩卡生成失败，请重试。');return;}
    const filename='function-mystery-'+String(model().number).padStart(2,'0')+'.png';
    const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=filename;document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(link.href),2000);toast('成绩卡已保存。');
  }catch{toast('成绩卡生成失败，请重试。');}
}
async function copyChallengeLink(){
  if(!round)return;
  const url=new URL(location.href);url.searchParams.set('p',String(model().number));url.searchParams.delete('ai');url.hash='';
  try{await navigator.clipboard.writeText(url.toString());toast('挑战链接已复制，发给朋友一起挑战。');}
  catch{toast('无法访问剪贴板，请手动复制地址栏链接。');}
}
$('#share-result').onclick=saveShareCard;
$('#copy-level-link').onclick=copyChallengeLink;
$('#show-reference').onchange=drawResult;
$('#submit-drawing').onclick=()=>end('submit');$('#reveal-answer').onclick=()=>end('reveal');
$('#result-close').onclick=()=>$('#result-dialog').close();
$('#retry-game').onclick=()=>start(model(),true);
$('#next-game').onclick=()=>{const next=nextModelAfter(round?.modelId);if(next)start(next);else openLevels();};
$('#quit-game').onclick=()=>{
  finishStroke();showHome();
};
$('#start-game').onclick=()=>{if(round&&!round.ended)showGame();else{const next=firstUncleared(campaign);start(next||null);}};
$('.brand').onclick=event=>{event.preventDefault();showHome();};
function openHow(){write(ONBOARD_KEY,'1');$('#first-run-tip').hidden=true;if(!$('#how-dialog').open)$('#how-dialog').showModal();}
$('#how-to-play').onclick=openHow;$('#how-header').onclick=openHow;
$('#settings-how').onclick=()=>{$('#settings-dialog').close();openHow();};
$('#reset-progress').onclick=()=>{$('#settings-dialog').close();if(!$('#reset-dialog').open)$('#reset-dialog').showModal();};
$('#reset-close').onclick=()=>$('#reset-dialog').close();$('#reset-cancel').onclick=()=>$('#reset-dialog').close();
$('#reset-confirm').onclick=()=>{campaign=emptyCampaign();write(CAMPAIGN_KEY,JSON.stringify(campaign));updateCampaignUI();$('#reset-dialog').close();toast('挑战进度已清除。');};
$('#how-close').onclick=()=>$('#how-dialog').close();$('#how-start').onclick=()=>{$('#how-dialog').close();if(!round)start();else{showGame();if(round.ended)openResult();}};
$('#first-run-how').onclick=openHow;
$('#first-run-dismiss').onclick=()=>{write(ONBOARD_KEY,'1');$('#first-run-tip').hidden=true;};
$('#settings-open').onclick=()=>{
  draft=clone(settings);renderSettings();$('#settings-dialog').showModal();
};
function renderSettings(){
  $('#difficulty-options').querySelectorAll('button').forEach(b=>{b.classList.toggle('selected',b.dataset.value===draft.difficulty);b.setAttribute('aria-pressed',String(b.dataset.value===draft.difficulty));});
  $('#time-options').querySelectorAll('button').forEach(b=>{b.classList.toggle('selected',b.dataset.value===draft.time);b.setAttribute('aria-pressed',String(b.dataset.value===draft.time));});
}
$('#difficulty-options').querySelectorAll('button').forEach(b=>b.onclick=()=>{draft.difficulty=b.dataset.value;renderSettings();});
$('#time-options').querySelectorAll('button').forEach(b=>b.onclick=()=>{draft.time=b.dataset.value;renderSettings();});
$('#settings-form').onsubmit=event=>{
  if(event.submitter?.value==='cancel')return;
  settings=validSettings(draft);write(SETTINGS_KEY,JSON.stringify(settings));toast('设置已保存，将在新题生效。');
};
if($('#new-game'))$('#new-game').onclick=()=>{$('#settings-dialog').close();settings=validSettings(draft);write(SETTINGS_KEY,JSON.stringify(settings));start(pickModel());};
function setService(text,offline){$('#service-pill').classList.toggle('offline',offline);$('#service-pill').innerHTML='<i></i>'+escape(text);}
async function serviceStatus(){
  try{const response=await fetch('/api/status');if(!response.ok)throw new Error('status');const data=await response.json();setService(data.configured?'本地题库 · AI 可选':'本地问题库可用',false);$('#service-help').textContent=data.message;}
  catch{setService('本地问题库可用',false);$('#service-help').textContent='本地示例问答仍可使用；自由问答需要运行本地服务。';}
}
function restore(){
  const raw=read(SAVE_KEY)||read('fm-active-v2');if(!raw)return false;
  try{
    const saved=JSON.parse(raw);
    if(![2,3].includes(saved.version)||!MODEL_BY_ID[saved.modelId]||!Number.isFinite(saved.elapsedMs)||!Number.isFinite(saved.clockAt)||!Array.isArray(saved.questions)||![0,60,180,300].includes(saved.timeLimit))throw new Error('invalid save');
    round=migrateRound(saved);round.waitingSince=null;round.hintCount=Math.max(0,Math.min(3,Number(round.hintCount)||0));
    undo=round.undo;redo=round.redo;selectedId=null;
    if(round.ended)round.result={...round.result,...evaluate(),inquiry:inquiryScore(round.questions)};
    $('#welcome-screen').hidden=true;$('#game-screen').hidden=false;updateRound();save();return true;
  }catch{write(SAVE_KEY+'-corrupt',raw);return false;}
}
window.addEventListener('pagehide',()=>{finishStroke();save();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){pointers.clear();gesture=null;cancelDrawing();}if(round){updateClock();save();}});
window.addEventListener('blur',()=>{pointers.clear();gesture=null;cancelDrawing();});
window.addEventListener('resize',()=>{if(!$('#game-screen').hidden)applyBoardView();drawBoard();if($('#result-dialog').open)drawResult();});
setInterval(()=>{if(round){const old=round.hintCount;updateClock();if(round.hintCount!==old)save();}},200);
setInterval(save,3000);
if(new URLSearchParams(location.search).get('ai')==='1')$('#ai-questions').hidden=false;
serviceStatus();
if(!restore())start(requestedLevel()||undefined);else{resetBoardView();updateCampaignUI();}
if(!read(ONBOARD_KEY)&&round&&!round.ended)$('#first-run-tip').hidden=false;
