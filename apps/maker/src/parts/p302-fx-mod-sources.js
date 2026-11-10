/* ---------- what the modulators put out: shown live in the Effects editor (and played by the old JS path) ----------
   FXA holds the Web Audio FX state (p330); FXM what the keyboard plays. */
const FXA={ctx:null,gin:{},gout:{},min:null,sig:'',scopes:{},follow:{},buses:[],wl:null,wlReady:false,noise:null,timer:0,last:0};
const FXM={vel:0,key:60,gate:false,tOn:-1,tOff:-1,mod:0,expr:1,at:0,bend:.5,lvlOn:0};
/* ---- modulator outputs (used by modOut) ---- */
function lfoOut(g,n,t){
  const v=n.p,r=paramReal(g,n,FXT.lfo.params[0],t,false),hz=typeof r==='number'?r:r.v;
  const tt=v.retrig&&FXM.tOn>=0?t-FXM.tOn:t,ph=(tt*hz)%1,sh=Math.round(v.shape);
  const w=sh===1?1-Math.abs(ph*4-2):sh===2?ph*2-1:sh===3?(ph<.5?1:-1):sh===4?hash01(Math.floor(tt*hz)+n.id.length)*2-1:Math.sin(2*Math.PI*ph);
  return .5+.5*w*(v.depth/100);
}
function adsrOut(v,t){
  if(FXM.tOn<0) return 0;
  const a=v.a/1000,d=v.d/1000,s=v.s/100,r=v.r/1000;
  const level=x=>x<a?(a>0?x/a:1):x<a+d?1-(1-s)*((x-a)/Math.max(1e-4,d)):s;
  if(FXM.gate) return level(t-FXM.tOn);
  const rel=t-FXM.tOff; return rel>=r?0:FXM.lvlOn*(1-rel/Math.max(1e-4,r));
}
function midiSrcOut(src){
  const s=Math.round(src);
  if(s===5) return FXM.bend;                         /* pitch bend is bipolar */
  const v=s===0?FXM.vel/127:s===1?FXM.key/127:s===2?FXM.mod:s===3?FXM.expr:FXM.at;
  return .5+.5*v;
}
const RND={};
function randOut(n,t){
  const v=n.p,step=Math.floor(t*v.rate),st=RND[n.id]||(RND[n.id]={cur:.5,step:-1,target:.5});
  if(step!==st.step){st.step=step;st.target=hash01(step*7.31+n.id.length*13);}
  const k=v.smooth>0?Math.min(1,(1/60)/(v.smooth/100/v.rate+1e-3)):1; st.cur+=(st.target-st.cur)*k;
  return .5+(st.cur-.5)*(v.depth/100);
}
