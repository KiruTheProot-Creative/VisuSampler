/* ---------- geometry / light ---------- */
function lightVec(){const a=S.light*Math.PI/180;return{lx:Math.sin(a),ly:-Math.cos(a)};}
const f1=v=>v.toFixed(1);
function arc(a0,a1,r){
  if(Math.abs(a1-a0)<.05) return '';
  if(Math.abs(a1-a0)>=359.9) a1=a0+(a1>a0?359.9:-359.9);
  const p=a=>[50+r*Math.sin(a*Math.PI/180),50-r*Math.cos(a*Math.PI/180)];
  const [x0,y0]=p(a0),[x1,y1]=p(a1);
  return 'M'+x0.toFixed(2)+' '+y0.toFixed(2)+'A'+r+' '+r+' 0 '+(Math.abs(a1-a0)>180?1:0)+' '+(a1>a0?1:0)+' '+x1.toFixed(2)+' '+y1.toFixed(2);
}
function knobGeom(el,v){
  const ang=el.start+(el.end-el.start)*v;
  const base=el.ringFrom==='center'?(el.start+el.end)/2:el.start;
  return{ang,lo:Math.min(base,ang),hi:Math.max(base,ang)};
}
function ringMask(el,g){
  const a=g.lo-el.start,b=g.hi-el.start;
  return 'conic-gradient(from '+el.start+'deg,transparent '+a+'deg,#000 '+a+'deg,#000 '+b+'deg,transparent '+b+'deg)';
}
function faderMetrics(el){
  const vert=el.orient==='v',L=vert?el.h:el.w,C=vert?el.w:el.h,hl=Math.max(8,L*el.handleLen);
  return{vert,L,C,hl};
}

