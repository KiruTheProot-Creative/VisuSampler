/* ---------- state ---------- */
const BANK_LETTERS='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const bankLetter=i=>i<26?BANK_LETTERS[i]:BANK_LETTERS[Math.floor(i/26)-1]+BANK_LETTERS[i%26];
const S={canvas:{w:960,h:540,bg:'#26222e'},light:315,bpm:120,sig:{n:4,d:4},mode:'design',view:'design',zoom:'fit',snap:true,sel:null,tab:'props',z:1,
  els:[],tags:[],assets:{},fonts:{},groups:[],lists:[],banks:[],userPresets:[],prevSnap:null,
  fx:{scope:'master',view:'nodes',graphs:{},sel:null,cable:null,pan:{x:30,y:20},flow:false,an:null}};
const SYNC=[{l:'1/32',b:.125},{l:'1/16T',b:1/6},{l:'1/16',b:.25},{l:'1/8T',b:1/3},{l:'1/8',b:.5},{l:'1/8.',b:.75},{l:'1/4T',b:2/3},{l:'1/4',b:1},{l:'1/4.',b:1.5},{l:'1/2',b:2},{l:'1/1',b:4}];
const SYNC_BAR=[{l:'1/8 bar',b:.125},{l:'1/4 bar',b:.25},{l:'1/2 bar',b:.5},{l:'1 bar',b:1},{l:'2 bars',b:2},{l:'4 bars',b:4}];
const BUILTIN_FONTS=['Figtree','Unbounded','JetBrains Mono','Pacifico','VT323'];
const nodes=new Map();
const closed=new Set();
const RT={hover:null,down:null,load:1};
const canvas=$('#canvas'), vp=$('#viewport'), stageEl=$('#stage'), rbody=$('#rbody');
const pad2=n=>String(n).padStart(2,'0');
function defaultBanks(names){
  const n=names||['Pianos','Pads','Bass','Keys','Brass','Strings','FX','User'];
  return n.map((x,i)=>({letter:bankLetter(i),name:x}));
}
