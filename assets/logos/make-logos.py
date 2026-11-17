# The product logos, in the sizes the builds use: python3 make-logos.py (PIL needed). src/ holds the artwork as drawn.
#   <name>.png      512 px square, trimmed and centred: plugin and app icons (CMake ICON_BIG), the installer art
#   <name>-96.png   small copy for the panels' headers
#   <name>.ico      16 to 256 px: the VST3 bundle icon (PlugIn.ico) and the VisuMaker app icon
import os
from PIL import Image
D=os.path.dirname(os.path.abspath(__file__))
for name in ['visusampler','hypersynth','nodefx']:
    im=Image.open(os.path.join(D,'src',name+'.png')).convert('RGBA')
    im=im.crop(im.getchannel('A').getbbox()); s=int(max(im.size)*1.06)
    sq=Image.new('RGBA',(s,s),(0,0,0,0)); sq.alpha_composite(im,((s-im.width)//2,(s-im.height)//2))
    sq.resize((512,512),Image.LANCZOS).save(os.path.join(D,name+'.png'),optimize=True)
    sq.resize((96,96),Image.LANCZOS).save(os.path.join(D,name+'-96.png'),optimize=True)
    sq.resize((256,256),Image.LANCZOS).save(os.path.join(D,name+'.ico'),sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
print('ok')
