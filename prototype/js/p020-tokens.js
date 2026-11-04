/* ---------- tags, lists, tokens ---------- */
const tagById=id=>S.tags.find(t=>t.id===id)||null;
const tagByName=n=>S.tags.find(t=>t.name===n)||null;
const bankTag=()=>tagByName('bank');
const listTag=()=>tagByName('list');
const syncList=t=>t.basis==='bar'?SYNC_BAR:SYNC;
function listsInBank(b){if(b===undefined)b=bankIdx();return S.lists.filter(l=>l.bank===b);}
function stepsOf(t){
  if(t.kind==='sync') return syncList(t).map(s=>s.l);
  if(t.kind==='list'){const a=listsInBank().map(l=>l.name);return a.length?a:['-'];}
  if(t.kind==='bank') return S.banks.map(b=>b.letter);
  return t.steps;
}
const stepCount=t=>t.kind==='number'?0:stepsOf(t).length;
function stepIdx(t){const n=stepsOf(t).length;return n<2?0:clamp(Math.round(t.value*(n-1)),0,n-1);}
const bankIdx=()=>{const t=bankTag();return t?stepIdx(t):0;};
const listIdx=()=>{const t=listTag();return t?stepIdx(t):0;};
const curList=()=>listsInBank()[listIdx()]||null;
const barBeats=sg=>sg.n*4/sg.d;
function syncBeats(t,sg){const s=syncList(t)[stepIdx(t)];return t.basis==='bar'?s.b*barBeats(sg):s.b;}
const msOfBeats=b=>b*60000/S.bpm;
function realOf(t){
  if(t.kind!=='number') return t.value;
  if(t.scale==='log'&&t.min>0&&t.max>0) return t.min*Math.pow(t.max/t.min,t.value);
  return t.min+(t.max-t.min)*t.value;
}
function realToNorm(t,r){
  if(t.max===t.min) return 0;
  if(t.scale==='log'&&t.min>0&&t.max>0&&r>0) return Math.log(r/t.min)/Math.log(t.max/t.min);
  return (r-t.min)/(t.max-t.min);
}
function numStr(t){
  const r=realOf(t);
  if(t.unit==='Hz'&&Math.abs(r)>=1000) return (r/1000).toFixed(2)+' kHz';
  return r.toFixed(t.dec)+(t.unit?(t.unit==='%'?'':' ')+t.unit:'');
}
const msStr=ms=>ms>=1000?(ms/1000).toFixed(2)+' s':Math.round(ms)+' ms';
function sigFrom(str){const m=String(str).split('/');return{n:Math.max(1,+m[0]||4),d:Math.max(1,+m[1]||4)};}
function fmtTag(t,fmt){
  fmt=(fmt||'number').trim();
  if(/^\d+\/\d+$/.test(fmt)) return t.kind==='sync'?msStr(msOfBeats(syncBeats(t,sigFrom(fmt)))):'-';
  switch(fmt.toLowerCase()){
    case 'percent': return Math.round(t.value*100)+'%';
    case 'number': case 'value': return t.kind==='number'?numStr(t):stepsOf(t)[stepIdx(t)];
    case 'name': case 'sync': return t.kind==='number'?'-':stepsOf(t)[stepIdx(t)];
    case 'ms': return t.kind==='sync'?msStr(msOfBeats(syncBeats(t,S.sig))):'-';
    case 'raw': return t.value.toFixed(3);
    default: return '?'+fmt;
  }
}
function loadStr(){return RT.load>=1?'READY':'LOADING '+Math.round(RT.load*100)+'%';}
function listToken(p){
  const bl=listsInBank(),idx=listIdx(),n=bl.length,letter=(S.banks[bankIdx()]||{letter:'?'}).letter;
  let i=idx; if(p.mid.indexOf('next')>=0&&n) i=(idx+1)%n; else if(p.mid.indexOf('prev')>=0&&n) i=(idx-1+n)%n;
  const l=bl[i],f=p.n===1?'name':p.fmt.toLowerCase();
  switch(f){
    case 'name': return l?l.name:'-';
    case 'number': return l?pad2(i+1):'--';
    case 'id': return letter+(l?pad2(i+1):'--');
    case 'count': return String(n);
    case 'bank': return letter;
    case 'loading': return loadStr();
    case 'groups': return l?String(l.groups.length):'0';
    default: return '?'+p.fmt;
  }
}
function bankToken(p){
  const b=S.banks[bankIdx()]||{letter:'?',name:''},f=p.n===1?'letter':p.fmt.toLowerCase();
  switch(f){
    case 'letter': return b.letter;
    case 'name': return b.name||b.letter;
    case 'count': return String(listsInBank().length);
    default: return '?'+p.fmt;
  }
}
function parseToken(inner){
  const s=inner.trim().replace(/[\[\]]/g,'').replace(/^display\./i,'').replace(/:/g,'.');
  if(/^\d+\/\d+$/.test(s)) return{sig:s,mid:[],n:1,fmt:'',name:''};
  const seg=s.split('.').filter(x=>x.length);
  return{name:seg[0]||'',mid:seg.slice(1,-1),fmt:seg.length>1?seg[seg.length-1]:'number',n:seg.length};
}
function expand(text){
  return esc(text).replace(/\{([^{}]*)\}/g,function(all,inner){
    const p=parseToken(inner);
    if(p.sig) return esc(msStr(msOfBeats(barBeats(sigFrom(p.sig)))));
    switch(p.name){
      case 'bpm': return String(Math.round(S.bpm));
      case 'timesig': return esc(p.fmt==='bar'||p.fmt==='ms'?msStr(msOfBeats(barBeats(S.sig))):p.fmt==='num'?String(S.sig.n):p.fmt==='den'?String(S.sig.d):S.sig.n+'/'+S.sig.d);
      case 'list': return esc(listToken(p));
      case 'bank': return esc(bankToken(p));
    }
    const t=tagByName(p.name);
    if(!t) return '<span class="bad">{'+p.name+'?}</span>';
    return esc(fmtTag(t,p.fmt));
  });
}
function renameInTexts(o,n){
  S.els.forEach(e=>{
    ['text','label'].forEach(k=>{
      if(typeof e[k]!=='string') return;
      e[k]=e[k].replace(/\{([^{}]*)\}/g,(all,inner)=>{
        const p=parseToken(inner);
        if(p.sig||p.name!==o) return all;
        return '{'+[n].concat(p.mid,p.n>1?[p.fmt]:[]).join('.')+'}';
      });
    });
  });
}
function usesTagText(name){
  const rx=new RegExp('\\{[^{}]*\\b'+name+'\\b');
  return S.els.filter(e=>(typeof e.text==='string'&&rx.test(e.text))||(typeof e.label==='string'&&rx.test(e.label))).length;
}
/* keep bank and list tags valid after the banks or lists change */
function restoreIdx(bi,li){
  const b=bankTag(),l=listTag(),nb=stepCount(b);
  if(b) b.value=nb>1?clamp(bi,0,nb-1)/(nb-1):0;
  const nl=l?stepCount(l):0;
  if(l) l.value=nl>1?clamp(li,0,nl-1)/(nl-1):0;
}
