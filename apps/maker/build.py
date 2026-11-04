import glob,os
d=os.path.dirname(os.path.abspath(__file__))
def r(f): return open(os.path.join(d,'src',f),encoding='utf8').read()
CORE='../../packages/core/src/index.js'
imports='''import {
  resample,stretchCh,stretchAll,granularRender,wavetableRender,uniVoices,smDefaults,smOf,hash01,hann,MODES as CORE_MODES,
  detectTransients as coreDetectTransients,zoneData as coreZoneData,zoneInterp as coreZoneInterp,zoneRatio as coreZoneRatio,
  crc32,encodePCM,decodePCM,Pack,writeVsamp,readVsamp,verifyVsamp,fmtBytes,bytesPer,
  estimate as coreEstimate,chooseStep,zoneBakeReason as coreZoneBakeReason,buildExportSet as coreBuildExportSet
} from '%s';
''' % CORE
parts=sorted(glob.glob(os.path.join(d,'src','parts','p*.js')))
js='\n'.join(open(p,encoding='utf8').read() for p in parts)
app=imports+"(function(){\n'use strict';\n"+js+"\n})();\n"
open(os.path.join(d,'app.js'),'w',encoding='utf8').write(app)
css=r('style.css')+'\n'+r('style-extra.css')+'\n'+r('style-unity.css')
head=r('head.html').replace('/*@@CSS@@*/',css)
html='<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n'+head+'</head><body>\n'+r('body.html')+'\n<script type="module" src="app.js"></script>\n</body></html>\n'
open(os.path.join(d,'index.html'),'w',encoding='utf8').write(html)
print('built app.js',len(app),'index.html',len(html))
