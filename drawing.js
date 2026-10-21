// Geometry stays in the original 1000 × 610 paper coordinates at every screen size.
import {cleanStrokes,pathLength,bounds} from './scoring.js';
const copy=v=>JSON.parse(JSON.stringify(v));
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const onPaper=p=>finite(p)&&p.x>=0&&p.x<=1000&&p.y>=0&&p.y<=610;
export function sampleObject(o){
  if(o.type==='pen')return o.points||[];
  if(o.type==='line')return [o.a,o.b];
  if(o.type==='curve')return Array.from({length:161},(_,i)=>{const t=i/160,s=1-t;return {x:s**3*o.a.x+3*s*s*t*o.c1.x+3*s*t*t*o.c2.x+t**3*o.b.x,y:s**3*o.a.y+3*s*s*t*o.c1.y+3*s*t*t*o.c2.y+t**3*o.b.y};});
  if(o.type==='circle')return Array.from({length:97},(_,i)=>({x:o.center.x+o.radius*Math.cos(i*Math.PI/48),y:o.center.y+o.radius*Math.sin(i*Math.PI/48)}));
  return [];
}
export function cleanObjects(objects){
  return (Array.isArray(objects)?objects:[]).flatMap(o=>{
    if(!o||!['pen','line','curve','circle'].includes(o.type))return [];
    const v=copy(o);v.id=typeof o.id==='string'?o.id:crypto.randomUUID();v.scored=v.type!=='circle';
    if(v.type==='pen'){v.points=cleanStrokes([v.points])[0];if(!v.points)return [];}
    if(v.type==='line'&&(!onPaper(v.a)||!onPaper(v.b)||Math.hypot(v.a.x-v.b.x,v.a.y-v.b.y)<=4))return [];
    if(v.type==='curve'&&(![v.a,v.b,v.c1,v.c2].every(onPaper)||pathLength(sampleObject(v))<=4))return [];
    if(v.type==='circle'&&(!onPaper(v.center)||!Number.isFinite(v.radius)||v.radius<=4||v.radius>Math.min(v.center.x,1000-v.center.x,v.center.y,610-v.center.y)))return [];
    return [v];
  });
}
export function scoringStrokes(objects){return cleanStrokes(objects.filter(o=>o.type!=='circle'&&o.scored!==false).map(sampleObject));}
export function hasEffectiveDrawing(objects){const s=scoringStrokes(objects),b=bounds(s);return !!b&&b.span>=12&&s.reduce((n,p)=>n+pathLength(p),0)>=18;}
export function scoringSignature(objects,grid){
  const value=JSON.stringify([!!grid,scoringStrokes(objects)]);let a=2166136261,b=5381;
  for(let i=0;i<value.length;i++){a=Math.imul(a^value.charCodeAt(i),16777619);b=Math.imul(b,33)^value.charCodeAt(i);}
  return value.length+':'+(a>>>0).toString(16)+':'+(b>>>0).toString(16);
}
export function objectHandles(o){return o.type==='line'?['a','b']:o.type==='curve'?['a','c1','c2','b']:o.type==='circle'?['center','radius']:[];}
export function handlePoint(o,key){return key==='radius'?{x:o.center.x+o.radius,y:o.center.y}:o[key];}
export function translateObject(o,dx,dy){
  const v=copy(o);const points=v.type==='pen'?v.points:v.type==='circle'?[v.center]:objectHandles(v).map(k=>v[k]);
  const margin=v.type==='circle'?v.radius:0;
  dx=Math.max(margin-Math.min(...points.map(p=>p.x)),Math.min(dx,1000-margin-Math.max(...points.map(p=>p.x))));
  dy=Math.max(margin-Math.min(...points.map(p=>p.y)),Math.min(dy,610-margin-Math.max(...points.map(p=>p.y))));
  points.forEach(p=>{p.x+=dx;p.y+=dy;});return v;
}
