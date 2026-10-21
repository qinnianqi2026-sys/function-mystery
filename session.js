export const HINT_INTERVAL=45000;
export const ASK_TIMEOUT=15000;
export function elapsedAt(state,now=Date.now()){
  if(state.ended)return state.elapsedMs||0;
  const since=state.waitingSince??now;
  const paused=state.waitingSince?Math.min(ASK_TIMEOUT,Math.max(0,now-since)):0;
  return (state.elapsedMs||0)+Math.max(0,now-state.clockAt)-paused;
}
export function settleClock(state,now=Date.now()){
  state.elapsedMs=elapsedAt(state,now);state.clockAt=now;state.waitingSince=null;
}
export function clockStatus(state,now=Date.now()){
  const elapsed=elapsedAt(state,now),limit=state.timeLimit*1000;
  const timedOut=!!limit&&elapsed>=limit;
  const effective=timedOut?limit:elapsed;
  return {elapsed:effective,remaining:limit?Math.max(0,limit-elapsed):null,hints:Math.min(3,Math.floor(effective/HINT_INTERVAL)),nextHint:effective>=3*HINT_INTERVAL?null:HINT_INTERVAL-effective%HINT_INTERVAL,timedOut};
}
