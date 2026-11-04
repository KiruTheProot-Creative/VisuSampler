import glob,os
d=os.path.dirname(os.path.abspath(__file__))
def r(f): return open(os.path.join(d,f),encoding='utf8').read()
js='\n'.join(open(p,encoding='utf8').read() for p in sorted(glob.glob(os.path.join(d,'js','p*.js'))))
css=r('style.css')+'\n'+r('style-extra.css')+'\n'+r('style-unity.css')
html=r('head.html').replace('/*@@CSS@@*/',css)+r('body.html')+"\n<script>\n(function(){\n'use strict';\n"+js+"\n})();\n</script>\n"
open(os.path.join(d,'visumaker-prototype-4.html'),'w',encoding='utf8').write(html)
open(os.path.join(d,'check.js'),'w',encoding='utf8').write("(function(){\n'use strict';\n"+js+"\n})();\n")
print('built',len(html),'bytes')
