/* ---------- About, log file, projects opened from Explorer (desktop app) ----------
   About shows the version and build, copies them for a bug report and opens the log folder
   (Documents/VisuSampler/Logs). Messages that report a failure also go into the log. */
const ABOUT={info:null};
async function aboutInfo(){
  const D=window.visuDesktop;
  if(!ABOUT.info)ABOUT.info=D&&D.info?await D.info().catch(()=>null):null;
  return ABOUT.info||{version:'0.0.1',build:'preview',os:navigator.userAgent,logFile:''};
}
function aboutText(i){return'VisuMaker '+i.version+' (build '+i.build+(i.date?', '+i.date:'')+')\n'+i.os+(i.electron?' · Electron '+i.electron:'')+'\nAudio: '+(typeof ENG!=='undefined'&&ENG&&ENG.native?'native':'browser');}
async function aboutOpen(){
  const i=await aboutInfo(),D=window.visuDesktop;
  if($('#aboutBox'))return;
  const ov=document.createElement('div');ov.id='aboutBox';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-label','About VisuMaker');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999';
  const box=document.createElement('div');
  box.style.cssText='background:var(--panel,#383838);color:var(--fg,#ddd);border:1px solid var(--line,#1d1d1d);border-radius:6px;padding:18px 20px;width:440px;box-shadow:0 10px 40px rgba(0,0,0,.5);font:13px var(--f-body,sans-serif)';
  const h=document.createElement('div');h.style.cssText='font-size:16px;font-weight:600;margin-bottom:2px';h.textContent='VisuMaker '+i.version;
  const b=document.createElement('div');b.style.cssText='color:var(--muted,#aaa);margin-bottom:12px';b.textContent='Build '+i.build+(i.date?' · '+i.date:'');
  const p=document.createElement('pre');p.style.cssText='white-space:pre-wrap;background:rgba(0,0,0,.25);padding:8px 10px;border-radius:4px;margin:0 0 10px;font:11px var(--f-mono,monospace);color:var(--fg,#ddd)';p.textContent=aboutText(i);
  const n=document.createElement('div');n.style.cssText='color:var(--muted,#aaa);line-height:1.5;margin-bottom:14px';
  n.textContent=i.logFile?'Found a bug, or have a question? Come say hi on the KCS Discord, and include this info and VisuMaker.log from the log folder.':'The log file is written by the desktop app.';
  const row=document.createElement('div');row.style.cssText='display:flex;gap:8px;justify-content:flex-end';
  const mk=(txt,cls,fn)=>{const x=document.createElement('button');x.type='button';x.className='btn'+(cls?' '+cls:'');x.textContent=txt;x.addEventListener('click',fn);return x;};
  const close=()=>ov.remove();
  row.append(mk('Copy info','',async e=>{try{await navigator.clipboard.writeText(aboutText(i));e.target.textContent='Copied';}catch(err){e.target.textContent='Could not copy';}}));
  if(D&&D.openLogs)row.append(mk('Open log folder','',()=>D.openLogs()));
  row.prepend(mk('Discord','',openCommunity));
  const c=mk('Close','primary',close);row.append(c);
  const lic=document.createElement('div');lic.style.cssText='color:var(--muted,#aaa);font-size:11px;line-height:1.5;margin:-6px 0 14px';
  lic.textContent='Free software under the GNU GPL v3 (or later), with no warranty. What you make is yours: share or sell your instruments and libraries under any terms you like. Nothing is collected or sent; logs and backups stay on your computer.';
  box.append(h,b,p,n,lic,row);ov.append(box);document.body.append(ov);c.focus();
  ov.addEventListener('keydown',e=>{if(e.key==='Escape')close();});ov.addEventListener('click',e=>{if(e.target===ov)close();});
}
const COMMUNITY_URL='https://discord.gg/JFnu6HTwgs';   /* Kiru's Creative Suite (KCS) on Discord */
function openCommunity(){const D=window.visuDesktop;if(D&&D.log)D.log('info','opened the community link');window.open(COMMUNITY_URL,'_blank','noopener');}
(function(){
  const t=$('#tipsBtn');if(!t)return;
  const d=document.createElement('button');d.type='button';d.className='btn ghost community';d.id='communityBtn';
  d.innerHTML='<svg class="ico" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M3 2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8l-3.5 2.8V12H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm1.5 4.2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm3.5 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm3.5 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/></svg>Discord';d.title="Join Kiru's Creative Suite (KCS) on Discord: help, news and libraries. Opens in your browser.";
  d.addEventListener('click',openCommunity);t.before(d);
  const a=document.createElement('button');a.type='button';a.className='btn ghost';a.id='aboutBtn';a.textContent='About';a.title='Version, build and the log file (for bug reports)';
  a.addEventListener('click',aboutOpen);t.after(a);
})();
/* failures that are shown to the user also go into the log */
{const D=window.visuDesktop;if(D&&D.log){const f0=flash;flash=function(m){try{if(/could not|failed|error|not saved|missing/i.test(String(m)))D.log('warn','message: '+m);}catch(e){}return f0.apply(this,arguments);};
  window.addEventListener('unhandledrejection',e=>{try{D.log('error','unhandled: '+(e.reason&&e.reason.stack||e.reason));}catch(err){}});}}
/* a .vmproj double-clicked in Explorer (at start, or while VisuMaker runs) */
async function openFromExplorer(){
  const D=window.visuDesktop;if(!D||!D.takeOpenRequest)return;
  const r=await D.takeOpenRequest().catch(()=>null);
  if(r&&r.bytes)await openBytes(r.bytes,r.file);
}
