/* ---------- FX catalog: first release, retro and pedals (see docs/fx-modules.md) ----------
   Param flags: opts = labelled choices (stored as an index), stat = changing it rebuilds the node, ir = regenerates a reverb impulse. */
const OPT=(k,label,opts,def,o)=>FP(k,label,0,opts.length-1,'',def||0,Object.assign({opts,step:1},o||{}));
FX_CATS.splice(0,FX_CATS.length,'Routing','Time','Modulation','Tone','Dynamics','Retro','Pedals','Modulators');
const MIXP=FP('mix','Mix',0,100,'%',30);
Object.assign(FXT,{
  /* ---- routing ---- */
  mixer:{label:'Mixer',kind:'fx',cat:'Routing',raw:1,ins:['in1','in2','in3','in4'],outs:['out'],cpu:.2,lat:0,hint:'Sums up to four paths back together. Use it after a Splitter or a Crossover.',
    params:[FP('l1','Level 1',-60,6,'dB',0),FP('l2','Level 2',-60,6,'dB',0),FP('l3','Level 3',-60,6,'dB',0),FP('l4','Level 4',-60,6,'dB',0)]},
  util:{label:'Utility',kind:'fx',cat:'Routing',raw:1,ins:['in'],outs:['out'],cpu:.1,lat:0,hint:'Gain, pan and stereo width.',
    params:[FP('gain','Gain',-60,12,'dB',0),FP('pan','Pan',-100,100,'',0),FP('width','Width',0,200,'%',100)]},
  xover:{label:'Crossover',kind:'fx',cat:'Routing',raw:1,ins:['in'],outs:['low','mid','high'],cpu:.6,lat:0,hint:'Splits the sound into low, mid and high bands, so each band can get its own effects.',
    params:[FP('f1','Low / mid',40,2000,'Hz',250),FP('f2','Mid / high',500,16000,'Hz',3000)]},
  mssplit:{label:'Mid/Side split',kind:'fx',cat:'Routing',raw:1,ins:['in'],outs:['mid','side'],cpu:.1,lat:0,hint:'Separates the centre from the sides. Join them again with Mid/Side join.',params:[]},
  msjoin:{label:'Mid/Side join',kind:'fx',cat:'Routing',raw:1,ins:['mid','side'],outs:['out'],cpu:.1,lat:0,hint:'Turns mid and side back into left and right.',params:[]},
  send:{label:'Send',kind:'fx',cat:'Routing',raw:1,ins:['in'],outs:['out'],cpu:.1,lat:0,hint:'Passes the sound through and also sends a copy to a bus. Pick up the bus with a Return, usually in the Master chain.',
    params:[OPT('bus','Bus',['Bus 1','Bus 2','Bus 3','Bus 4'],0,{stat:1}),FP('level','Send level',-60,6,'dB',-6)]},
  ret:{label:'Return',kind:'fx',cat:'Routing',raw:1,ins:[],outs:['out'],cpu:.1,lat:0,hint:'Outputs everything sent to its bus from any chain.',
    params:[OPT('bus','Bus',['Bus 1','Bus 2','Bus 3','Bus 4'],0,{stat:1}),FP('level','Level',-60,6,'dB',0)]},
  /* ---- time ---- */
  conv:{label:'Convolution',kind:'fx',cat:'Time',ins:['in'],outs:AO,cpu:5,lat:0,hint:'Puts the sound in a real room or through real gear. Pick an impulse file from your samples; it is packed into the library.',
    params:[FP('pre','Pre-delay',0,200,'ms',0),FP('len','Length',5,100,'%',100,{stat:1}),FP('mix','Mix',0,100,'%',30)],sample:'ir'},
  shimmer:{label:'Shimmer',kind:'fx',cat:'Time',ins:['in'],outs:AO,cpu:5,lat:0,fbOk:1,hint:'Bright reverb that blooms an octave up. Lovely on pads.',
    params:[FP('decay','Decay',1,20,'s',6,{ir:1}),FP('shine','Shimmer',0,100,'%',50),FP('mix','Mix',0,100,'%',35)]},
  /* ---- modulation ---- */
  flanger:{label:'Flanger',kind:'fx',cat:'Modulation',ins:['in'],outs:AO,cpu:1.5,lat:0,fbOk:1,hint:'Jet-plane sweep from a very short moving delay.',
    params:[FP('rate','Rate',0.02,5,'Hz',0.25),FP('depth','Depth',0,100,'%',60),FP('fb','Feedback',-95,95,'%',50),MIXP]},
  trem:{label:'Tremolo / Auto-pan',kind:'fx',cat:'Modulation',ins:['in'],outs:AO,cpu:.5,lat:0,hint:'Rhythmic volume or stereo movement.',
    params:[FP('rate','Rate',0.1,20,'Hz',5,{sync:1}),FP('depth','Depth',0,100,'%',60),OPT('shape','Shape',['Sine','Triangle','Square'],0,{stat:1}),OPT('mode','Mode',['Tremolo','Auto-pan'],0,{stat:1}),FP('mix','Mix',0,100,'%',100)]},
  rotary:{label:'Rotary speaker',kind:'fx',cat:'Modulation',ins:['in'],outs:AO,cpu:2,lat:0,fbOk:1,hint:'Spinning-speaker swirl. Switching the speed ramps up and down like the real thing.',
    params:[OPT('speed','Speed',['Slow','Fast'],0),FP('drive','Drive',0,100,'%',20),FP('mix','Mix',0,100,'%',100)]},
  vibrato:{label:'Vibrato',kind:'fx',cat:'Modulation',ins:['in'],outs:AO,cpu:1,lat:0,fbOk:1,hint:'Pitch wobble with no dry sound mixed in.',
    params:[FP('rate','Rate',0.1,12,'Hz',5.5),FP('depth','Depth',0,100,'%',30),FP('mix','Mix',0,100,'%',100)]},
  /* ---- tone ---- */
  peq:{label:'Parametric EQ',kind:'fx',cat:'Tone',ins:['in'],outs:AO,cpu:1.2,lat:0,hint:'Four bands: low shelf, two bells and a high shelf.',
    params:[FP('lf','Low freq',20,1000,'Hz',100),FP('lg','Low gain',-18,18,'dB',0),FP('m1f','Bell 1 freq',60,8000,'Hz',500),FP('m1g','Bell 1 gain',-18,18,'dB',0),FP('m1q','Bell 1 Q',0.2,12,'',1),
      FP('m2f','Bell 2 freq',200,16000,'Hz',2500),FP('m2g','Bell 2 gain',-18,18,'dB',0),FP('m2q','Bell 2 Q',0.2,12,'',1),FP('hf','High freq',1000,20000,'Hz',8000),FP('hg','High gain',-18,18,'dB',0),FP('mix','Mix',0,100,'%',100)]},
  crush:{label:'Bitcrusher',kind:'fx',cat:'Tone',ins:['in'],outs:AO,cpu:.8,lat:0,hint:'Fewer bits and a lower sample rate, with no smoothing filter, so it aliases.',
    params:[FP('bits','Bits',1,16,'bit',8),FP('rate','Sample rate',500,48000,'Hz',11025),OPT('comp','Companding',['Off','µ-law'],0),FP('mix','Mix',0,100,'%',100)]},
  lofi:{label:'Lo-fi',kind:'fx',cat:'Tone',ins:['in'],outs:AO,cpu:1.2,lat:0,fbOk:1,hint:'Worn, warbly, noisy: crackle, wow and flutter and hiss.',
    params:[FP('crackle','Crackle',0,100,'%',30),FP('wow','Wow and flutter',0,100,'%',30),FP('noise','Noise',0,100,'%',15),FP('tone','Tone',0,100,'%',60),FP('mix','Mix',0,100,'%',100)]},
  /* ---- dynamics ---- */
  transient:{label:'Transient shaper',kind:'fx',cat:'Dynamics',ins:['in'],outs:AO,cpu:1,lat:0,hint:'More or less punch at the start of each sound, more or less body after.',
    params:[FP('attack','Attack',-100,100,'%',30),FP('sustain','Sustain',-100,100,'%',0),FP('mix','Mix',0,100,'%',100)]},
  /* ---- retro ---- */
  morph:{label:'Morph Filter',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:1.5,lat:0,hint:'One knob blends through vowel-like filter shapes (A, E, I, O, U). Inspired by the morphing filters of late-90s romplers. Put an LFO on Morph.',
    params:[FP('morph','Morph',0,100,'%',30),FP('shift','Shift',-12,12,'st',0),FP('res','Resonance',0,100,'%',60),FP('mix','Mix',0,100,'%',100)]},
  vintage:{label:'Vintage Sampler',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:1,lat:0,hint:'The grit of old sampler converters: reduced bits and rate with no anti-alias filter, companding hiss and a dull output filter.',
    params:[OPT('model','Model',['8-bit companded','12-bit drum machine','12-bit studio','Custom'],1),FP('bits','Bits (custom)',4,16,'bit',12),FP('rate','Rate (custom)',4000,44100,'Hz',26040),
      FP('drive','Drive',0,100,'%',20),FP('age','Age',0,100,'%',30),FP('mix','Mix',0,100,'%',100)]},
  tapeecho:{label:'Tape Echo',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:2,lat:0,fbOk:1,hint:'Warm tape delay: the repeats wobble, darken and saturate more with every pass. Push the feedback for runaway echoes.',
    params:[FP('time','Time',30,1200,'ms',330,{sync:1}),FP('fb','Feedback',0,110,'%',45),FP('wobble','Wobble',0,100,'%',35),FP('sat','Saturation',0,100,'%',40),FP('tone','Tone',0,100,'%',45),FP('mix','Mix',0,100,'%',30)]},
  bbd:{label:'BBD Chorus',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:1.5,lat:0,fbOk:1,hint:'Dark, slightly noisy bucket-brigade chorus with the classic mode switch.',
    params:[OPT('mode','Mode',['I','II','I + II'],0),FP('noise','Hiss',0,100,'%',20),FP('mix','Mix',0,100,'%',50)]},
  ensemble:{label:'Ensemble',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:2,lat:0,fbOk:1,hint:'Lush three-voice chorus from 70s string machines.',
    params:[FP('depth','Depth',0,100,'%',60),FP('mix','Mix',0,100,'%',60)]},
  tapemach:{label:'Tape Machine',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:1.5,lat:0,fbOk:1,hint:'Tape saturation, low-end head bump, hiss and wow.',
    params:[FP('sat','Saturation',0,100,'%',35),FP('bump','Head bump',0,12,'dB',3),FP('hiss','Hiss',0,100,'%',10),FP('wow','Wow',0,100,'%',15),FP('age','Age',0,100,'%',25),FP('mix','Mix',0,100,'%',100)]},
  digiverb:{label:'80s Digital Reverb',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:4,lat:0,verb:'digital',hint:'Bright, grainy early-digital hall.',
    params:[FP('size','Size',0,100,'%',70,{ir:1}),FP('decay','Decay',0.3,10,'s',3,{ir:1}),FP('grit','Grit',0,100,'%',50,{ir:1}),FP('mix','Mix',0,100,'%',30)]},
  gatedverb:{label:'Gated Reverb',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:4,lat:0,verb:'gated',hint:'A big room that stops dead. The 80s drum sound.',
    params:[FP('gate','Gate time',80,800,'ms',300,{ir:1}),FP('size','Size',0,100,'%',80,{ir:1}),FP('mix','Mix',0,100,'%',40)]},
  spring:{label:'Spring Tank',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:3,lat:0,verb:'spring',hint:'Boingy spring reverb, as in guitar amps and dub.',
    params:[FP('decay','Decay',0.5,6,'s',2.2,{ir:1}),FP('drip','Drip',0,100,'%',50,{ir:1}),FP('mix','Mix',0,100,'%',30)]},
  vinyl:{label:'Vinyl',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:1,lat:0,fbOk:1,hint:'Crackle, rumble, wear and turntable wow.',
    params:[FP('crackle','Crackle',0,100,'%',40),FP('rumble','Rumble',0,100,'%',20),FP('wear','Wear',0,100,'%',30),FP('wow','Wow',0,100,'%',20),FP('mix','Mix',0,100,'%',100)]},
  radio:{label:'Radio / Phone',kind:'fx',cat:'Retro',ins:['in'],outs:AO,cpu:.8,lat:0,hint:'Narrow, crunchy, a little noisy.',
    params:[OPT('band','Band',['AM radio','Telephone','Walkie-talkie'],0),FP('crunch','Crunch',0,100,'%',30),FP('noise','Noise',0,100,'%',15),FP('mix','Mix',0,100,'%',100)]},
  /* ---- pedals (same DSP, stomp-box look; the footswitch is bypass) ---- */
  pod:{label:'Overdrive',kind:'fx',cat:'Pedals',pedal:'#3f8a4a',ins:['in'],outs:AO,cpu:1,lat:0,hint:'Mid-hump overdrive pedal.',
    params:[FP('drive','Drive',0,100,'%',45),FP('tone','Tone',0,100,'%',50),FP('level','Level',-24,12,'dB',0),FP('mix','Mix',0,100,'%',100)]},
  pfuzz:{label:'Fuzz',kind:'fx',cat:'Pedals',pedal:'#b05a2a',ins:['in'],outs:AO,cpu:1,lat:0,hint:'60s germanium-style fuzz.',
    params:[FP('fuzz','Fuzz',0,100,'%',70),FP('tone','Tone',0,100,'%',45),FP('level','Level',-24,12,'dB',-6),FP('mix','Mix',0,100,'%',100)]},
  pwah:{label:'Wah',kind:'fx',cat:'Pedals',pedal:'#2a2a2a',ins:['in'],outs:AO,cpu:.6,lat:0,hint:'Link Pedal to the Expression source (MIDI CC 11), the mod wheel or a knob. Auto mode follows how hard you play.',
    params:[FP('pos','Pedal',0,100,'%',50),OPT('mode','Mode',['Manual','Auto'],0),FP('q','Peak',1,20,'',7),FP('mix','Mix',0,100,'%',100)]},
  pcomp:{label:'Comp Pedal',kind:'fx',cat:'Pedals',pedal:'#2a5aa0',ins:['in'],outs:AO,cpu:1,lat:0,hint:'Squashy guitar compressor.',
    params:[FP('sustain','Sustain',0,100,'%',60),FP('level','Level',-24,12,'dB',0),FP('mix','Mix',0,100,'%',100)]},
  pvibe:{label:'Uni-Vibe',kind:'fx',cat:'Pedals',pedal:'#7a3a8a',ins:['in'],outs:AO,cpu:1.5,lat:0,hint:'Throbbing photocell-style vibe.',
    params:[FP('speed','Speed',0.3,10,'Hz',2),FP('intensity','Intensity',0,100,'%',70),FP('mix','Mix',0,100,'%',60)]},
  pvol:{label:'Volume Pedal',kind:'fx',cat:'Pedals',pedal:'#444',raw:1,ins:['in'],outs:['out'],cpu:.1,lat:0,hint:'Swells. Link Pedal to the Expression source.',
    params:[FP('pos','Pedal',0,100,'%',100)]},
  /* ---- modulators ---- */
  adsr:{label:'Envelope',kind:'mod',cat:'Modulators',ins:[],outs:['out'],cpu:.1,lat:0,hint:'Starts on every note: attack, decay, sustain, release.',
    params:[FP('a','Attack',0,5000,'ms',10),FP('d','Decay',0,5000,'ms',300),FP('s','Sustain',0,100,'%',60),FP('r','Release',0,8000,'ms',400),FP('depth','Depth',0,100,'%',100)]},
  midisrc:{label:'MIDI source',kind:'mod',cat:'Modulators',ins:[],outs:['out'],cpu:0,lat:0,hint:'Velocity, key, mod wheel, expression (CC 11), aftertouch or pitch bend as a control signal.',
    params:[OPT('src','Source',['Velocity','Key','Mod wheel','Expression','Aftertouch','Pitch bend'],0)]},
  rand:{label:'Random',kind:'mod',cat:'Modulators',ins:[],outs:['out'],cpu:.1,lat:0,hint:'Sample and hold: jumps to a new random value at the rate, smoothed if you like.',
    params:[FP('rate','Rate',0.1,30,'Hz',4),FP('smooth','Smooth',0,100,'%',20),FP('depth','Depth',0,100,'%',100)]}
});
/* upgrades to the original modules */
FXT.filter.label='Filter';FXT.filter.hint='Multi-mode filter: low-pass, high-pass, band-pass, notch or peak, 12 or 24 dB.';
FXT.filter.params=[OPT('type','Type',['Low-pass','High-pass','Band-pass','Notch','Peak'],0),FP('cutoff','Cutoff',20,20000,'Hz',8000),FP('res','Resonance',0,100,'%',20),
  OPT('slope','Slope',['12 dB','24 dB'],0,{stat:1}),FP('gain','Peak gain',-18,18,'dB',6),FP('mix','Mix',0,100,'%',100)];
FXT.dist.params=[OPT('type','Type',['Tube','Tape','Hard clip','Foldback','Fuzz','Soft clip','Bitcrush','Rectify','Sine shaper','Diode'],0,{stat:1}),FP('drive','Drive',0,100,'%',30),FP('tone','Tone',0,100,'%',50),FP('level','Level',-24,12,'dB',0),FP('mix','Mix',0,100,'%',100)];
FXT.delay.params.splice(3,0,OPT('pp','Mode',['Stereo','Ping-pong','Tape','Diffuse'],0,{stat:1}));
FXT.delay.hint='Echo. Modes: stereo, ping-pong, tape (wobbly, warm repeats) and diffuse (repeats smear into a wash). Time can sync to the project tempo.';
FXT.reverb.hint='Room, hall, plate, ambience, cathedral, spring and shimmer tails.';
FXT.reverb.params=[OPT('type','Type',['Room','Hall','Plate','Ambience','Cathedral','Spring','Shimmer'],1,{ir:1}),FP('size','Size',0,100,'%',60,{ir:1}),FP('decay','Decay',0.1,12,'s',2.4,{ir:1}),FP('damp','Damping',0,100,'%',40,{ir:1}),FP('pre','Pre-delay',0,200,'ms',10),FP('mix','Mix',0,100,'%',30)];
FXT.comp.params=[OPT('mode','Mode',['Compressor','Limiter','OTT'],0),FP('thresh','Threshold',-60,0,'dB',-18),FP('ratio','Ratio',1,20,':1',3),FP('attack','Attack',0.1,100,'ms',10),FP('release','Release',10,1000,'ms',150),FP('makeup','Makeup',0,24,'dB',0),FP('mix','Mix',0,100,'%',100)];
FXT.comp.ins=['in'];FXT.comp.hint='Evens out level. Limiter mode catches peaks at the threshold. OTT squashes three bands up and down at once (ratio = depth, attack = speed).';
FXT.chorus.params.unshift(OPT('mode','Mode',['Chorus','Flanger','Ensemble'],0));FXT.chorus.hint='Thickens the sound. Modes: chorus, flanger (jet sweep) and ensemble (lush string-machine chorus).';
FXT.limiter.params=[FP('ceiling','Ceiling',-12,0,'dB',-0.3),FP('release','Release',10,500,'ms',60),FP('mix','Mix',0,100,'%',100)];
FXT.lfo.params=[FP('rate','Rate',0.02,20,'Hz',1,{sync:1}),OPT('shape','Shape',['Sine','Triangle','Saw','Square','Random steps'],0),FP('depth','Depth',0,100,'%',100),OPT('retrig','Restart on note',['Off','On'],0)];
FXT.env.hint='Envelope follower: turns how loud its audio input is into a control signal.';
['delay','chorus','phaser'].forEach(k=>{FXT[k].fbOk=1;});
/* value text for choice parameters */
const fmtPar0=fmtPar;
fmtPar=function(q,v){return q.opts?q.opts[clamp(Math.round(v),0,q.opts.length-1)]:fmtPar0(q,v);};

/* Hz parameters with a wide range follow the ear (log scale) for knobs, macros and modulation */
Object.values(FXT).forEach(d=>(d.params||[]).forEach(q=>{if(q.unit==='Hz'&&q.min>0&&q.max/q.min>=50&&!q.opts)q.log=1;}));
