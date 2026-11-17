# The installer's artwork (Inno Setup wizard images): python3 make-art.py, from the repository's fonts. PIL needed.
# The preview at the end is only for looking; it is written next to this script's working folder.
import random, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
UI=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','..','assets','fonts')+'/'
OUT=os.path.dirname(os.path.abspath(__file__))+'/'
LOGOS=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','..','assets','logos')+'/'
UNB=UI+'Unbounded.ttf'; MONO=UI+'JetBrainsMono.ttf'
PANEL=(29,30,33); INK=(239,232,214); QUIET=(169,162,145); LCD=(142,224,255); ACC=(226,85,47)
def wood(w,h,seed=3):
    r=random.Random(seed); im=Image.new('RGB',(w,h)); px=im.load()
    phase=[r.uniform(0,6.28) for _ in range(4)]
    for y in range(h):
        for x in range(w):
            g=math.sin(y*0.045+math.sin(x*0.02+phase[0])*2.2+phase[1])*0.5+math.sin(y*0.13+phase[2])*0.25
            v=0.55+0.18*g+r.uniform(-0.04,0.04)
            px[x,y]=(int(120*v+20),int(68*v+8),int(36*v+4))
    return im
def brushed(w,h,seed=1,base=PANEL):
    r=random.Random(seed); im=Image.new('RGB',(w,h),base); d=ImageDraw.Draw(im)
    for y in range(h):
        k=r.uniform(-2.5,2.5); d.line([(0,y),(w,y)],fill=tuple(max(0,min(255,int(c+k))) for c in base))
    return im.filter(ImageFilter.GaussianBlur(0.4))
def vignette(im,amt=0.55):
    w,h=im.size; m=Image.new('L',(w,h),0); d=ImageDraw.Draw(m)
    for i in range(40):
        t=i/40; d.ellipse([-w*0.3+t*w*0.25,-h*0.3+t*h*0.25,w*1.3-t*w*0.25,h*1.3-t*h*0.25],fill=int(255*t))
    m=m.filter(ImageFilter.GaussianBlur(w/12)); dark=Image.new('RGB',(w,h),(6,6,8))
    return Image.composite(im,Image.blend(im,dark,amt),m)
def screw(d,x,y,s):
    d.ellipse([x-s,y-s,x+s,y+s],fill=(70,72,78),outline=(20,20,22)); d.line([x-s*0.6,y-s*0.2,x+s*0.6,y+s*0.2],fill=(25,25,28),width=max(1,int(s*0.3)))
def keys(d,x0,y0,w,h,n):
    kw=w/n
    for i in range(n): d.rectangle([x0+i*kw+1,y0,x0+(i+1)*kw-1,y0+h],fill=(238,232,214),outline=(150,140,120))
    pat=[1,1,0,1,1,1,0]
    for i in range(n-1):
        if pat[i%7]: bx=x0+(i+1)*kw-kw*0.32; d.rectangle([bx,y0,bx+kw*0.64,y0+h*0.6],fill=(18,18,20))
def big(W,H):   # the welcome / finish page image (left side), drawn large and scaled down
    S=4; w,h=W*S,H*S; im=brushed(w,h,2); d=ImageDraw.Draw(im)
    wd=wood(w//9,h); im.paste(wd,(0,0)); d.line([(w//9,0),(w//9,h)],fill=(8,8,9),width=S*2)
    for (x,y) in [(w//9+14*S,12*S),(w-12*S,12*S),(w//9+14*S,h-12*S),(w-12*S,h-12*S)]: screw(d,x,y,4*S)
    cx=w//9+(w-w//9)//2
    f=ImageFont.truetype(UNB,int(w*0.13))
    for i,line in enumerate(['KIRU','CAS']):
        tb=d.textbbox((0,0),line,font=f); tw=tb[2]-tb[0]; y=int(h*0.16)+i*int(w*0.17)
        d.text((cx-tw/2,y+S*2),line,font=f,fill=(0,0,0)); d.text((cx-tw/2,y),line,font=f,fill=INK)
    fs=ImageFont.truetype(UNB,int(w*0.038)); t='CREATIVE AUDIO SUITE'; tb=d.textbbox((0,0),t,font=fs)
    d.text((cx-(tb[2]-tb[0])/2,int(h*0.16)+int(w*0.36)),t,font=fs,fill=QUIET)
    # an LCD strip
    lx0,lx1,ly=w//9+16*S,w-14*S,int(h*0.58); d.rounded_rectangle([lx0,ly,lx1,ly+int(h*0.075)],radius=3*S,fill=(7,12,17),outline=(0,0,0))
    fm=ImageFont.truetype(MONO,int(w*0.055)); t='SETUP'; tb=d.textbbox((0,0),t,font=fm)
    glow=Image.new('RGBA',im.size,(0,0,0,0)); gd=ImageDraw.Draw(glow); gd.text((cx-(tb[2]-tb[0])/2,ly+int(h*0.075)/2-(tb[3]-tb[1])/2-tb[1]),t,font=fm,fill=LCD+(255,))
    im.paste(Image.alpha_composite(Image.new('RGBA',im.size,(0,0,0,0)),glow.filter(ImageFilter.GaussianBlur(3*S))).convert('RGB'),(0,0),glow.filter(ImageFilter.GaussianBlur(3*S)))
    d=ImageDraw.Draw(im); d.text((cx-(tb[2]-tb[0])/2,ly+int(h*0.075)/2-(tb[3]-tb[1])/2-tb[1]),t,font=fm,fill=LCD)
    # the three products' logos (assets/logos), on a shadow
    sz=int(min((lx1-lx0)*0.29,h*0.12)); y=int(h*0.415)
    for i,name in enumerate(['visusampler','hypersynth','nodefx']):
        lg=Image.open(LOGOS+name+'.png').convert('RGBA').resize((sz,sz),Image.LANCZOS)
        x=lx0+int((lx1-lx0)*(0.18+0.32*i))-sz//2
        sh=Image.new('RGBA',lg.size,(0,0,0,0)); sh.putalpha(lg.getchannel('A').point(lambda v:int(v*0.7)))
        im.paste((0,0,0),(x+S,y+2*S),sh.filter(ImageFilter.GaussianBlur(2*S)).getchannel('A')); im.paste(lg,(x,y),lg)
    d=ImageDraw.Draw(im)
    # three LEDs and a sliders row
    for i,c in enumerate([ACC,(234,138,31),LCD]):
        x=lx0+int((lx1-lx0)*(0.2+0.3*i)); y=int(h*0.71); d.ellipse([x-5*S,y-5*S,x+5*S,y+5*S],fill=c)
    keys(d,w//9+8*S,int(h*0.8),w-w//9-16*S,int(h*0.17),7)
    im=vignette(im,0.35)
    return im.resize((W,H),Image.LANCZOS)
for (W,H) in [(164,314),(202,386),(246,459),(328,604),(410,797)]:
    big(W,H).save(OUT+f'wizard-{W}.png')
def small(N):
    S=4; n=N*S; im=Image.new('RGBA',(n,n),(0,0,0,0)); d=ImageDraw.Draw(im)
    d.rounded_rectangle([0,0,n-1,n-1],radius=n*0.18,fill=PANEL+(255,),outline=(0,0,0,255),width=S)
    keys(d,n*0.16,n*0.52,n*0.68,n*0.3,4)
    f=ImageFont.truetype(UNB,int(n*0.32)); tb=d.textbbox((0,0),'K',font=f); d.text((n/2-(tb[2]-tb[0])/2-tb[0],n*0.1-tb[1]),'K',font=f,fill=INK)
    d.ellipse([n*0.78,n*0.1,n*0.88,n*0.2],fill=ACC+(255,))
    return im.resize((N,N),Image.LANCZOS)
for N in [55,69,83,110,138]: small(N).save(OUT+f'small-{N}.png')
def back(W,H):
    im=brushed(W,H,7,base=(24,25,28)); d=ImageDraw.Draw(im)
    d.rectangle([0,0,W,int(H*0.012)],fill=(60,36,20)); d.rectangle([0,H-int(H*0.012),W,H],fill=(60,36,20))
    return vignette(im,0.45)
for (W,H) in [(600,450),(900,675),(1200,900)]: back(W,H).save(OUT+f'back-{W}.png')
# a preview of the welcome page, roughly as Inno lays it out
pv=back(600,450).convert('RGB'); pv.paste(big(202,386).convert('RGB'),(0,0)); d=ImageDraw.Draw(pv)
d.text((222,24),'Welcome to the Kiru Creative Audio Suite Setup',font=ImageFont.truetype(UNB,12),fill=INK)
d.text((222,60),'This will install HyperSynth 0.0.1 on your computer.',font=ImageFont.truetype(MONO,11),fill=(200,200,200))
d.rectangle([0,386,600,450],fill=(18,18,20)); d.rounded_rectangle([420,404,500,430],4,fill=(55,57,62)); d.text((440,410),'Next >',fill=INK)
pv.paste(small(55),(530,10),small(55))
pv.save('installer-preview.png')
print('ok')
# the setup's own icon (title bar, taskbar, the .exe in Explorer)
small(256).save(OUT+'setup.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
