/* ---------- interface runtime: the Designer's drawing and test-mode code, driven by the VST window ----------
   This file is appended after the shared Maker parts (see apps/maker/build.py). Editing-only functions are stubbed. */
function placeSel(){} function select(){} function startMove(){} function startResize(){} function renderLayers(){} function renderRight(){}
function fxRefreshParams(){} function syncPosFields(){} function sel(){return null;} function flash(){}
function drag(mv,end){const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);if(end)end();};window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);}
S.mode='test';S.view='design';S.zoom='fit';
stageEl.classList.add('test');
function layout(){
  const W=S.canvas.w,H=S.canvas.h,aw=Math.max(50,stageEl.clientWidth),ah=Math.max(50,stageEl.clientHeight);
  const z=Math.max(.1,Math.min(aw/W,ah/H)),prev=S.z;S.z=z;
  vp.style.width=(W*z)+'px';vp.style.height=(H*z)+'px';
  canvas.style.cssText='width:'+W+'px;height:'+H+'px;background:'+S.canvas.bg+';transform:scale('+z+')';
  if(Math.abs(prev-z)>.001)rerenderAll();
}
new ResizeObserver(()=>layout()).observe(stageEl);
/* tell the plugin when the chosen list changes, so the engine plays it */
let lastList=-2;
function reportList(){const l=curList(),i=l?S.lists.indexOf(l):-1;if(i!==lastList){lastList=i;parent.postMessage({t:'list',index:i},'*');}}
let lastListB=-9;
function reportListB(){const l=curListB(),i=l?S.lists.indexOf(l):-3;if(i!==lastListB){lastListB=i;parent.postMessage({t:'listB',index:i},'*');}}
let lastPatch=[-9,-9];
function reportPatch(){if(!patchModeOn())return;[0,1].forEach(l=>{const i=patchIdx(l);if(i!==lastPatch[l]){lastPatch[l]=i;parent.postMessage({t:'patch',layer:l,index:i},'*');}});}
function choosePatch(l,i){const t=patchTag(l);if(t)setStep(t,i);}
function chooseListB(i){const l=S.lists[i],bt=bankTagB(),lt=listTagB();if(!l||!bt||!lt)return;setStep(bt,l.bank);setStep(lt,listsInBank(l.bank).indexOf(l));}
const setTag0=setTag;
setTag=function(t,v){setTag0(t,v);reportList();reportListB();reportPatch();parent.postMessage({t:'tag',name:t.name,value:t.value},'*');};
function chooseList(i){const l=S.lists[i];if(!l)return;const bt=bankTag(),lt=listTag();if(bt)setStep(bt,l.bank);if(lt)setStep(lt,listsInBank(l.bank).indexOf(l));}
window.addEventListener('message',async e=>{
  const m=e.data||{};
  if(m.t==='load'){
    const p=m.project||{};
    Object.assign(S,{canvas:p.canvas||S.canvas,light:p.light==null?315:p.light,bpm:p.bpm||120,sig:p.sig||{n:4,d:4},els:p.els||[],pages:p.pages||[],tags:p.tags||[],groups:p.groups||[],lists:p.lists||[],banks:p.banks||[],gset:p.gset||{}});
    S.assets={};addTexAssets();
    Object.keys(m.assets||{}).forEach(id=>{const a=m.assets[id];S.assets[id]={name:a.name,w:a.w||256,h:a.h||256,svg:/svg/.test(a.mime||''),mips:[{s:Math.max(a.w||256,a.h||256),url:a.url}]};});
    for(const fam of Object.keys(m.fonts||{})){try{const ff=new FontFace(fam,'url('+m.fonts[fam]+')');await ff.load();document.fonts.add(ff);}catch(err){}}
    mountAll();layout();
    /* knob and page positions saved with the DAW project */
    Object.keys(m.tags||{}).forEach(name=>{const t=tagByName(name);if(t&&t.kind!=='bank'&&t.kind!=='list')t.value=Math.min(1,Math.max(0,+m.tags[name]||0));});
    if(m.tags&&Object.keys(m.tags).length){rerenderAll();showPage();}
    if(m.list!=null&&m.list>=0)chooseList(m.list);else refreshDisplays();
    if(m.listB!=null&&m.listB>=0)chooseListB(m.listB);
    if(m.patch!=null&&m.patch>=0)choosePatch(0,m.patch);if(m.patchB!=null&&m.patchB>=0)choosePatch(1,m.patchB);
    lastList=-2;reportList();lastListB=-9;reportListB();lastPatch=[-9,-9];reportPatch();
    document.fonts.ready.then(()=>rerenderAll());
  }else if(m.t==='list'){chooseList(m.index);}
  else if(m.t==='listB'){chooseListB(m.index);}
  else if(m.t==='patch'){choosePatch(m.layer,m.index);}
  else if(m.t==='tags'){   /* moved by DAW automation or a MIDI controller: show it, do not send it back */
    Object.keys(m.values||{}).forEach(n=>{const t=tagByName(n);if(t)setTag0(t,+m.values[n]);});
  }
});
parent.postMessage({t:'ready'},'*');

/* right-click a knob, fader, button or dropdown: the plugin shows its automation slot and MIDI learn */
canvas.addEventListener('contextmenu',e=>{
  const n=e.target.closest('.el');if(!n)return;const el=S.els.find(x=>x.id===n.dataset.id),t=el&&el.tag&&tagById(el.tag);
  if(!t||t.sys)return;e.preventDefault();parent.postMessage({t:'ctx',name:t.name,x:e.clientX,y:e.clientY},'*');
});
