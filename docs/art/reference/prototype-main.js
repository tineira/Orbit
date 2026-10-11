
/* ================= Halley source image ================= */
const SOURCES=[
  {k:"halley",label:"Halley (Grok, uniforme)",url:"data:image/webp;base64,<omitted: see assets/>",view:[1,.5,.35]},
];
const H_={img:null,ok:false,name:""};
const statusEl=document.getElementById("status");
function setStatus(s){statusEl.textContent=s}
function loadUrl(src){
  const im=new Image();im.decoding="async";
  im.onload=()=>{H_.img=im;H_.ok=true;H_.name=src.label;setStatus("Señal: "+src.label);markSrc(src.k);H_.drawn=0};
  im.onerror=()=>{if(!H_.ok){setStatus("NO SIGNAL. Tu navegador no pudo cargar "+src.label+" desde claudia.gallery. Arrastra una imagen oficial.")}};
  im.src=src.url;
}
const srcBox=document.getElementById("srcs");
SOURCES.forEach(s=>{const b=document.createElement("button");b.textContent=s.label;b.dataset.k=s.k;b.setAttribute("aria-pressed","false");b.onclick=()=>{if(typeof cur!=="undefined"&&cur){try{cur.v.pause();cur.stop()}catch(e){}}markTalk("");if(PWR.off!==null)powerOn(true);setStatus("Buscando señal…");loadUrl(s)};srcBox.appendChild(b)});
function markSrc(k){srcBox.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.k===k)))}
function loadFile(f){if(!f||!f.type.startsWith("image/"))return;const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{H_.img=im;H_.ok=true;H_.name=f.name;setStatus("Señal: "+f.name);markSrc("")};im.src=r.result};r.readAsDataURL(f)}

loadUrl(SOURCES[0]);

/* ================= Halley speaks: Tomas's Grok clips (voice Skye) ================= */
const CLIPS=[{k:"c4",webm:"data:video/webm;base64,<omitted: see assets/>",label:"halley-01",url:"data:video/mp4;base64,<omitted: see assets/>"},{k:"c1",webm:"data:video/webm;base64,<omitted: see assets/>",label:"halley-02",url:"data:video/mp4;base64,<omitted: see assets/>"},{k:"c2",webm:"data:video/webm;base64,<omitted: see assets/>",label:"halley-03",url:"data:video/mp4;base64,<omitted: see assets/>"},{k:"c3",webm:"data:video/webm;base64,<omitted: see assets/>",label:"halley-04",url:"data:video/mp4;base64,<omitted: see assets/>"}];
let AC=null,noiseB=null;const talkBox=document.getElementById("talk"),cabinEl=document.getElementById("cabin");
let cur=null;
function markTalk(k){talkBox.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.k===k)))}

// Digital distortion: bit depth, sample-and-hold (lower rate) and short dropouts/stutters. One knob, 0..1.
function makeCrush(ctx,getA){
  const sp=ctx.createScriptProcessor(1024,1,1);let h=0,c=0,mode=0,left=0,bi=0,rp=0;const buf=new Float32Array(2048),sr=ctx.sampleRate;
  sp.onaudioprocess=e=>{const i=e.inputBuffer.getChannelData(0),o=e.outputBuffer.getChannelData(0),a=getA();
    if(a<=.001){o.set(i);return}
    const levels=Math.pow(2,16-a*12),hold=1+Math.floor(a*a*14);
    for(let n=0;n<i.length;n++){
      buf[bi]=i[n];bi=(bi+1)&2047;
      if(left<=0){const r=Math.random();mode=r<a*.004?1:(r<a*.008?2:0);left=mode?Math.floor(sr*(.02+Math.random()*.06)):256;if(mode===2)rp=(bi-600)&2047}
      left--;let x=i[n];
      if(mode===1)x=0;else if(mode===2){x=buf[rp];rp=(rp+1)&2047;if(((rp-((bi-600)&2047))&2047)>500)rp=(bi-600)&2047}
      if(c++%hold===0)h=Math.round(x*levels)/levels;o[n]=h}};
  return sp}
function playClip(c){
  if(cur){try{cur.v.pause();cur.stop()}catch(e){}}
  AC=AC||new AudioContext();AC.resume();
  if(!noiseB){noiseB=AC.createBuffer(1,AC.sampleRate*2,AC.sampleRate);const d=noiseB.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}
  const v=document.createElement("video");v.src=(v.canPlayType('video/mp4; codecs="avc1.640028, mp4a.40.2"')?c.url:c.webm);v.playsInline=true;v.preload="auto";
  const src=AC.createMediaElementSource(v);
  // cabin chain: thin speaker band, a presence bump, a little drive, then static under it
  const hp=AC.createBiquadFilter();hp.type="highpass";hp.frequency.value=320;
  const pk=AC.createBiquadFilter();pk.type="peaking";pk.frequency.value=1900;pk.Q.value=1.1;pk.gain.value=5;
  const lp=AC.createBiquadFilter();lp.type="lowpass";lp.frequency.value=3400;lp.Q.value=.8;
  const sh=AC.createWaveShaper();const cv=new Float32Array(1024);for(let i=0;i<1024;i++){const x=i/511.5-1;cv[i]=Math.tanh(x*2.2)/Math.tanh(2.2)}sh.curve=cv;
  const wet=AC.createGain(),dry=AC.createGain();
  const cr=makeCrush(AC,()=>+ctl("dig").value);src.connect(cr);const head=cr;cur&&(cur.cr=null);
  head.connect(hp);hp.connect(pk);pk.connect(lp);lp.connect(sh);sh.connect(wet);wet.connect(AC.destination);
  head.connect(dry);dry.connect(AC.destination);
  const nz=AC.createBufferSource();nz.buffer=noiseB;nz.loop=true;const bp=AC.createBiquadFilter();bp.type="bandpass";bp.frequency.value=2600;bp.Q.value=.6;
  const ng=AC.createGain();nz.connect(bp);bp.connect(ng);ng.connect(AC.destination);nz.start();
  const base=()=>cabinEl.checked?.005*(+ctl("stat").value)*2:0;const apply=()=>{const on=cabinEl.checked;wet.gain.value=on?1.15:0;dry.gain.value=on?0:1;ng.gain.value=base()};apply();ctl("stat").oninput=apply;
  cabinEl.onchange=apply;
  // crackle: short noise bursts while she talks
  const crk=setInterval(()=>{if(!cabinEl.checked||v.paused)return;const b0=base();if(b0>0&&Math.random()<.15){const t=AC.currentTime;ng.gain.setValueAtTime(b0*3,t);ng.gain.exponentialRampToValueAtTime(b0,t+.05)}},120);
  const stop=()=>{clearInterval(crk);const t=AC.currentTime;ng.gain.setTargetAtTime(0,t,.08);setTimeout(()=>{try{nz.stop()}catch(e){}},400)};
  v.addEventListener("ended",()=>{stop();setTimeout(powerOff,250);setStatus("Fin de la línea. "+c.label+" Monitor apagado.")});
  v.addEventListener("loadeddata",()=>{v.width=v.videoWidth;v.height=v.videoHeight;H_.img=v;H_.ok=true;H_.name=c.label;
    setStatus("Halley habla: "+c.label);markSrc("");markTalk(c.k)},{once:true});
  // corrupt memory: with heavy damage the clip jumps back and repeats a piece (picture and voice together)
  let skips=0;const rew=setInterval(()=>{if(v.paused||v.ended)return;const d=+ctl("dmgH").value;if(d<.6)return;
    const maxSkips=1+Math.round((d-.6)*7.5);if(skips>=maxSkips||v.currentTime<1)return;
    if(!H_.freezeUntil&&Math.random()<(d-.55)*.3){const fc=document.createElement("canvas");fc.width=v.videoWidth;fc.height=v.videoHeight;fc.getContext("2d").drawImage(v,0,0);H_.frozen=fc;H_.freezeUntil=performance.now()+600+Math.random()*700;H_.glitchAt=performance.now();return}
    if(Math.random()<(d-.55)*.35){skips++;v.currentTime=Math.max(.2,v.currentTime-(.4+Math.random()*.9));H_.glitchAt=performance.now()}},280);
  v.addEventListener("ended",()=>clearInterval(rew));
  H_.freezeUntil=0;H_.frozen=null;cur={v,stop};SUB={text:c.label.replace(/ \(.*\)$/,""),kind:"ship",until:performance.now()+8000};powerOn(true);setTimeout(()=>{if(cur&&cur.v===v)v.play().catch(()=>setStatus("Toca de nuevo para reproducir con sonido."))},600);
}
CLIPS.forEach(c=>{const b=document.createElement("button");b.textContent="▶ "+c.label;b.dataset.k=c.k;b.setAttribute("aria-pressed","false");b.onclick=()=>playClip(c);talkBox.appendChild(b)});
const ctl=id=>document.getElementById(id);



function dataUrlBuf(u){const b=atob(u.slice(u.indexOf(",")+1)),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a.buffer}
/* ================= Pilot thoughts: Tomas's Grok clips (voice Gus), audio only ================= */
const THOUGHTS=[{text:"thought-01",m4a:"data:audio/mp4;base64,<omitted: see assets/>",webm:"data:audio/webm;base64,<omitted: see assets/>"},{text:"thought-02",m4a:"data:audio/mp4;base64,<omitted: see assets/>",webm:"data:audio/webm;base64,<omitted: see assets/>"},{text:"thought-03",m4a:"data:audio/mp4;base64,<omitted: see assets/>",webm:"data:audio/webm;base64,<omitted: see assets/>"},{text:"thought-04",m4a:"data:audio/mp4;base64,<omitted: see assets/>",webm:"data:audio/webm;base64,<omitted: see assets/>"},{text:"thought-05",m4a:"data:audio/mp4;base64,<omitted: see assets/>",webm:"data:audio/webm;base64,<omitted: see assets/>"},{text:"thought-06",m4a:"data:audio/mp4;base64,<omitted: see assets/>",webm:"data:audio/webm;base64,<omitted: see assets/>"}];
let SUB=null; // {text,kind,until}
const thBox=document.getElementById("thoughts"),thFilt=document.getElementById("thfilt");
async function playThought(th,btn){
  AC=AC||new AudioContext();AC.resume();
  if(!th.buf){for(const u of [th.m4a,th.webm]){try{th.buf=await AC.decodeAudioData(dataUrlBuf(u));break}catch(e){}}}
  if(!th.buf)return;
  const src=AC.createBufferSource();src.buffer=th.buf;
  // same chain as "thought" in src/game/audio.ts (dry, close, in the head); the slider blends from clean (0) to the game's values (1)
  const hp=AC.createBiquadFilter();hp.type="highpass";const sh=AC.createBiquadFilter();sh.type="lowshelf";sh.frequency.value=220;
  const lp=AC.createBiquadFilter();lp.type="lowpass";lp.Q.value=.55;const g=AC.createGain();
  src.connect(hp);hp.connect(sh);sh.connect(lp);lp.connect(g);g.connect(AC.destination);
  const apply=()=>{const k=+thFilt.value;hp.frequency.value=20+50*k;sh.gain.value=5.5*k;lp.frequency.value=Math.exp(Math.log(16000)+(Math.log(1750)-Math.log(16000))*k);g.gain.value=1.8+.8*k};
  apply();thFilt.oninput=apply;src.start();
  SUB={text:th.text,kind:"thought",until:performance.now()+th.buf.duration*1000+1200};
  thBox.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",String(b===btn)));
}
THOUGHTS.forEach(th=>{const b=document.createElement("button");b.textContent="▶ "+th.text;b.setAttribute("aria-pressed","false");b.onclick=()=>playThought(th,b);thBox.appendChild(b)});

/* CRT power, ported from the mass spec (src/game/draw.ts): on = dot -> line -> raster + flash; off = raster -> line -> lingering dot -> dark. */
const PWR={on:-1e9,off:null};
const c01=v=>Math.max(0,Math.min(1,v)),easeOut=u=>1-(1-u)**3;
function crtEnv(now){
  let vx=1,vy=1,flash=0,dotA=0,fade=1;
  if(PWR.off!==null){const a=now-PWR.off;if(reduce)return{dark:true};
    vy=Math.max(.03,1-c01(a/140)**2);vx=a<=140?1:Math.max(.02,1-c01((a-140)/170)**2);
    dotA=c01((a-230)/60)*c01(1-(a-300)/340);fade=a<360?1:c01(1-(a-360)/290);if(fade<=.01&&dotA<=.01)return{dark:true}}
  else{const a=now-PWR.on;if(!reduce&&a>=0&&a<480){vx=a<60?.02:Math.max(.02,easeOut(c01((a-60)/140)));vy=a<190?.03:Math.max(.03,easeOut(c01((a-190)/250)));
    flash=a<90?c01(a/90):c01(1-(a-90)/320);dotA=a<130?c01(1-a/130)*.9:0}}
  const lineA=c01((.4-vy)/.37)*c01((vx-.02)*3);
  return{dark:false,vx,vy,flash,dotA,fade,lineA};
}
const TV={m4a:"data:audio/mp4;base64,<omitted: see assets/>",webm:"data:audio/webm;base64,<omitted: see assets/>",buf:null};
async function tvBuf(){if(TV.buf)return TV.buf;AC=AC||new AudioContext();
  for(const u of [TV.m4a,TV.webm]){try{TV.buf=await AC.decodeAudioData(dataUrlBuf(u));return TV.buf}catch(e){}}return null}
async function tvSound(on){AC=AC||new AudioContext();AC.resume();const buf=await tvBuf();if(!buf)return;
  const t=AC.currentTime,dur=on?.6:.75,off=on?0:Math.max(0,Math.min(2.88,buf.duration-dur));
  const src=AC.createBufferSource();src.buffer=buf;const g=AC.createGain();g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.62,t+.012);g.gain.setValueAtTime(.62,t+dur-.12);g.gain.linearRampToValueAtTime(.0001,t+dur);
  src.connect(g);g.connect(AC.destination);src.start(t,off,dur)}
function powerOn(withSound){PWR.on=performance.now();PWR.off=null;if(withSound)tvSound(true)}
function powerOff(){if(PWR.off===null){PWR.off=performance.now();tvSound(false)}}

/* Green phosphor monitor. Uses only compositing (no pixel readback), so cross-origin images work. */
function drawCRT(g,x,y,w,H2,t,small){
  g.save();const r=Math.min(w,H2)*.06;g.beginPath();g.roundRect(x,y,w,H2,r);g.clip();
  g.fillStyle="#030a05";g.fillRect(x,y,w,H2);
  const jitter=(!reduce&&Math.sin(t*.0017)>.985)?w*.012*Math.sin(t*.05):0;
  const E=crtEnv(performance.now());
  if(E.dark){const v0=g.createLinearGradient(x,y,x+w,y+H2);v0.addColorStop(0,"rgba(120,160,130,.06)");v0.addColorStop(.5,"rgba(0,0,0,0)");g.fillStyle=v0;g.fillRect(x,y,w,H2);g.restore();
    g.strokeStyle="#1f241e";g.lineWidth=Math.max(2,w*.018);g.beginPath();g.roundRect(x,y,w,H2,r);g.stroke();return}
  const cx0=x+w/2,cy0=y+H2/2;g.save();g.globalAlpha=E.fade;g.translate(cx0,cy0);g.scale(E.vx,E.vy);g.translate(-cx0,-cy0);
  const dmgE=document.getElementById("dmgH"),dmg=dmgE?+dmgE.value:0,lost=!reduce&&dmg>.5&&h(Math.floor(t/140)*1.37)<(dmg-.5)*.5;
  if(H_.img&&!lost){
    if(H_.freezeUntil&&performance.now()>H_.freezeUntil){H_.freezeUntil=0;H_.frozen=null;H_.glitchAt=performance.now()}
    const im=H_.freezeUntil?H_.frozen:H_.img,z=+ctl("zoom").value,fx=+ctl("px").value,fy=+ctl("py").value;
    const sc=Math.max(w/im.width,H2/im.height)*z,dw=im.width*sc,dh=im.height*sc;
    const dx=x+(w-dw)*fx+jitter,dy=y+(H2-dh)*fy;
    // horizontal distortion: draw in strips, each shifted by a slow wave, a fast ripple, tear bands and a sync pull
    const hd=+ctl("hdist").value,tt=reduce?1234:t,strip=small?2:3,ep=Math.floor(tt/260);
    const tears=[];if(hd>0)for(let k=0;k<4;k++){if(k<1+Math.round(hd*2)||h(ep*7.1+k)<hd*.4)tears.push({y:h(ep*3.3+k*1.9)*H2,hh:H2*(.015+h(ep*5.7+k)*.09),off:(h(ep*9.1+k)<.5?-1:1)*(.03+h(ep*4.3+k)*.12)*w*hd})}
    const gl=H_.glitchAt&&performance.now()-H_.glitchAt<160;if(gl)tears.push({y:H2*.15,hh:H2*.7,off:w*.08*(h(tt)<.5?-1:1)});const sync=!reduce&&h(Math.floor(tt/900)*2.3)>1-hd*.5;const syncY=H2*(.3+h(Math.floor(tt/900))*.5);
    for(let yy=0;yy<H2;yy+=strip){
      let off=hd*(Math.sin(yy*.03+tt*.0021)*w*.012+Math.sin(yy*.21+tt*.019)*w*.004);
      tears.forEach(tr=>{if(yy>=tr.y&&yy<tr.y+tr.hh)off+=tr.off});
      if(sync&&yy>syncY)off+=(yy-syncY)*.35*hd;
      const syy=(y+yy-dy)/sc;if(syy<0||syy>im.height)continue;
      g.drawImage(im,0,syy,im.width,strip/sc,dx+off,y+yy,dw,strip);
    }
    if(hd>0){g.fillStyle=`rgba(220,255,230,${.25*hd})`;tears.forEach(tr=>g.fillRect(x,y+tr.y,w,1));
      if(sync){g.fillStyle=`rgba(200,255,220,${.18*hd})`;g.fillRect(x,y+syncY,w,2)}}
    g.globalCompositeOperation="saturation";g.fillStyle="#808080";g.fillRect(x,y,w,H2);   // to gray
    g.globalCompositeOperation="multiply";g.fillStyle="#5cff8a";g.fillRect(x,y,w,H2);      // phosphor
    g.globalCompositeOperation="screen";g.fillStyle="rgba(10,40,18,.55)";g.fillRect(x,y,w,H2); // lifted blacks
    g.globalCompositeOperation="source-over";
  }else{
    const n=small?300:1600;for(let i=0;i<n;i++){const k=h_(i,t);g.fillStyle=`rgba(140,255,170,${(k*.35).toFixed(3)})`;g.fillRect(x+h(i*3.7+k)*w,y+h(i*5.3+k)*H2,2,2)}
    mono(g,"NO SIGNAL",x+w/2,y+H2/2,Math.max(10,w*.06),"rgba(140,255,170,.85)","center");
    mono(g,"HAL-E 07",x+w/2,y+H2/2+w*.07,Math.max(8,w*.035),"rgba(140,255,170,.5)","center");
  }
  // glow, scanlines, rolling bar, noise, vignette
  glow(g,x+w/2,y+H2/2,Math.max(w,H2)*.7,"rgba(70,200,110,.10)");
  const step=small?2:3;g.fillStyle="rgba(0,0,0,.38)";for(let yy=y;yy<y+H2;yy+=step)g.fillRect(x,yy,w,step*.45);
  if(!reduce){const roll=(t*.04)%(H2*1.4)-H2*.2;const gr=g.createLinearGradient(0,y+roll,0,y+roll+H2*.12);gr.addColorStop(0,"rgba(140,255,170,0)");gr.addColorStop(.5,"rgba(140,255,170,.07)");gr.addColorStop(1,"rgba(140,255,170,0)");g.fillStyle=gr;g.fillRect(x,y+roll,w,H2*.12)}
  const na=+ctl("noiseA").value;if(na>0){const n=Math.round(w*H2/(small?260:120)*na);for(let i=0;i<n;i++){const k=h_(i,t);g.fillStyle=`rgba(160,255,180,${(k*.22*na).toFixed(3)})`;g.fillRect(x+h(i*1.7+k)*w,y+h(i*2.9+k)*H2,1.5,1.5)}}
  g.restore();
  if(E.flash>.01){const fg=g.createRadialGradient(cx0,cy0,2,cx0,cy0,Math.max(w,H2)*.55);fg.addColorStop(0,`rgba(214,255,228,${.5*E.flash})`);fg.addColorStop(.5,`rgba(150,240,180,${.22*E.flash})`);fg.addColorStop(1,"rgba(120,220,150,0)");g.fillStyle=fg;g.fillRect(x,y,w,H2)}
  if(E.lineA>.02){const hw=(w/2-4)*Math.max(.02,E.vx);g.save();g.shadowColor="rgba(160,255,195,.9)";g.shadowBlur=9;g.strokeStyle=`rgba(222,255,234,${Math.min(1,E.lineA)*E.fade})`;g.lineWidth=1.6;g.beginPath();g.moveTo(cx0-hw,cy0);g.lineTo(cx0+hw,cy0);g.stroke();g.restore()}
  if(E.dotA>.01){glow(g,cx0,cy0,Math.max(4,w*.03),`rgba(214,255,228,${.8*E.dotA})`);g.fillStyle=`rgba(240,255,245,${E.dotA})`;g.beginPath();g.arc(cx0,cy0,Math.max(1.2,w*.006),0,7);g.fill()}
  const v=g.createRadialGradient(x+w/2,y+H2/2,Math.min(w,H2)*.35,x+w/2,y+H2/2,Math.max(w,H2)*.72);v.addColorStop(0,"rgba(0,0,0,0)");v.addColorStop(1,"rgba(0,0,0,.75)");g.fillStyle=v;g.fillRect(x,y,w,H2);
  g.restore();
  g.strokeStyle="#1f241e";g.lineWidth=Math.max(2,w*.018);g.beginPath();g.roundRect(x,y,w,H2,r);g.stroke();
}
function h_(i,t){return h(i*1.31+(reduce?0:Math.floor(t/70))*7.7)}

/* ================= eclipse logic, ported from src/game/draw.ts ================= */
function umbraRadius(o,star,along,sep){return o.r-(along*(star.r-o.r))/sep}
function penumbraRadius(o,star,along,sep){return o.r+(along*(star.r+o.r))/sep}
function axis(o,star){const dx=o.x-star.x,dy=o.y-star.y,sep=Math.hypot(dx,dy)||1;return{ux:dx/sep,uy:dy/sep,sep}}
function pointUmbra(x,y,o,star){
  if(Math.hypot(x-o.x,y-o.y)<o.r+4)return 0;const{ux,uy,sep}=axis(o,star);const rx=x-o.x,ry=y-o.y,along=rx*ux+ry*uy;if(along<o.r*.55)return 0;
  const perp=Math.abs(rx*uy-ry*ux),um=umbraRadius(o,star,along,sep);if(um>0&&perp<=um)return 1;const pen=penumbraRadius(o,star,along,sep),inner=Math.max(0,um);
  if(perp>=pen||pen<=inner)return 0;return 1-(perp-inner)/(pen-inner)}
function stampShadows(g,p,star,bodies){
  const L={x:star.x-p.x,y:star.y-p.y};const ll=Math.hypot(L.x,L.y);L.x/=ll;L.y/=ll;const lit=Math.atan2(L.y,L.x);
  g.save();g.translate(p.x,p.y);g.beginPath();g.arc(0,0,p.r,0,7);g.clip();g.beginPath();g.arc(0,0,p.r+2,lit-Math.PI/2,lit+Math.PI/2);g.lineTo(0,0);g.closePath();g.clip();
  for(const o of bodies){if(o===p)continue;if(Math.hypot(p.x-o.x,p.y-o.y)<o.r+p.r*.12)continue;
    const{ux,uy,sep}=axis(o,star);const rx=p.x-o.x,ry=p.y-o.y,along=rx*ux+ry*uy;if(along<o.r*.45)continue;
    const um=umbraRadius(o,star,along,sep),occ=o.r/Math.max(along,1),sa=star.r/Math.max(sep+along,1);const peak=um>0?1:Math.min(1,(occ/Math.max(sa,1e-6))**2);if(peak<.08)continue;
    const core=um>0?um:o.r*Math.sqrt(peak),rad=Math.max(2.5,core*(um>0?1.4:1.55)),push=p.r*.3;
    const cx=o.x+ux*along-p.x+L.x*push,cy=o.y+uy*along-p.y+L.y*push;if(Math.hypot(cx,cy)>p.r+rad)continue;
    const a=Math.min(.84*.58,.5)*(.4+.6*peak);const gr=g.createRadialGradient(cx,cy,0,cx,cy,rad);const ct=Math.min(.78,Math.max(0,um)/rad);
    gr.addColorStop(0,`rgba(7,8,12,${a})`);if(um>0&&peak>.85&&ct>.08)gr.addColorStop(ct,`rgba(7,8,12,${a*.9})`);gr.addColorStop(1,"rgba(7,8,12,0)");
    g.fillStyle=gr;g.beginPath();g.arc(cx,cy,rad,0,7);g.fill()}
  g.restore()}

/* ================= ships ================= */
const HULL="#e9e7e0",DARK="#07080c";
function poly(g,pts,s){g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x*s,y*s):g.moveTo(x*s,y*s));g.closePath()}
function hazard(g,x,y,w,hh,s){g.save();g.beginPath();g.rect(x*s,y*s,w*s,hh*s);g.clip();g.fillStyle="#d9b23a";g.fillRect(x*s,y*s,w*s,hh*s);g.fillStyle="#141414";for(let k=-hh;k<w+hh;k+=2.2){g.beginPath();g.moveTo((x+k)*s,y*s);g.lineTo((x+k+1.1)*s,y*s);g.lineTo((x+k+1.1-hh)*s,(y+hh)*s);g.lineTo((x+k-hh)*s,(y+hh)*s);g.fill()}g.restore()}
const SPRITE=new Image();SPRITE.src="data:image/webp;base64,<omitted: see assets/>";
const sprCan=document.createElement("canvas");let VIS="light";
function drawSprite(g,def,x,y,s,rot,t,o){
  const hh=42*s,ww=hh*SPRITE.width/Math.max(1,SPRITE.height),dim=1-.72*(o.umbra||0);if(!SPRITE.complete||!SPRITE.width)return;
  g.save();g.translate(x,y);g.rotate(rot);
  if(!o.dead)[-.2,.2].forEach((nx,i)=>{const f=reduce?1:.75+.25*Math.sin(t*.025+i);glow(g,nx*ww,hh*.5,hh*.16*f,`rgba(255,200,130,${.6*dim})`)});
  sprCan.width=Math.ceil(ww)+2;sprCan.height=Math.ceil(hh)+2;const c=sprCan.getContext("2d");c.clearRect(0,0,sprCan.width,sprCan.height);
  if(VIS!=="halo")c.filter="brightness(1.75) contrast(1.15)";c.drawImage(SPRITE,1,1,ww,hh);c.filter="none";c.globalCompositeOperation="source-atop";
  if(dim<1){c.fillStyle=`rgba(7,8,12,${1-dim})`;c.fillRect(0,0,sprCan.width,sprCan.height)}
  if(o.damaged){c.fillStyle="rgba(7,8,12,.95)";c.beginPath();c.moveTo(ww*.82,hh*.42);c.lineTo(ww*.99,hh*.47);c.lineTo(ww*.99,hh*.62);c.lineTo(ww*.8,hh*.55);c.fill()}
  c.globalCompositeOperation="source-over";
  if(VIS!=="light"){g.save();g.shadowColor="rgba(92,255,138,.85)";g.shadowBlur=Math.max(4,5*s);g.globalAlpha=.9;g.drawImage(sprCan,-ww/2-1,-hh/2-1);g.restore()}
  g.drawImage(sprCan,-ww/2-1,-hh/2-1);
  if(VIS!=="light"&&!o.card){const bx=ww*.75,by=hh*.62,k=Math.max(3,4*s);g.strokeStyle="rgba(140,255,170,.7)";g.lineWidth=Math.max(1,.45*s);g.beginPath();
    [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([a,b])=>{g.moveTo(a*bx,b*by+(-b)*k);g.lineTo(a*bx,b*by);g.lineTo(a*bx+(-a)*k,b*by)});g.stroke()}
  if(o.damaged&&!reduce&&Math.sin(t*.013)>.55){glow(g,ww*.32,hh*.02,4*s,"rgba(255,170,90,.6)");g.fillStyle="rgba(255,200,140,.95)";g.fillRect(ww*.32,hh*.02,Math.max(1.2,.7*s),Math.max(1.2,.7*s))}
  const blink=reduce?1:(.55+.45*Math.sin(t*.004));[[-.5,-.2,"255,70,60"],[.5,-.2,"80,255,140"]].forEach(([nx,ny,col],i)=>{if(o.damaged&&i===1)return;glow(g,nx*ww,ny*hh,Math.max(3,2.6*s),`rgba(${col},${.5*blink})`)});
  g.restore()}
const SHIPS=[
 {n:"TOMAS · GROK",name:"Carguero de Perihelion",sub:"Casco aclarado para que se lea sobre el negro, sin halo. Se oscurece al pasar por la sombra de un cuerpo, como en el juego.",img:1,dmg:{out:1}},
];
function drawShipDef(g,def,x,y,s,rot,t,o={}){
  if(def.img)return drawSprite(g,def,x,y,s,rot,t,o);
  const dim=1-.72*(o.umbra||0);g.save();g.translate(x,y);g.rotate(rot);g.lineJoin="round";
  // engine glow (none on a dead ship)
  if(!o.dead)def.noz.forEach(([nx,ny],i)=>{const f=reduce?1:.75+.25*Math.sin(t*.025+i);const flipped=ny<0&&def.n==="SALVAGE";glow(g,nx*s,(ny+(flipped?-1:3))*s,5*s*f,`rgba(255,210,140,${.55*dim})`)});
  const c=Math.round(233*dim),fill=o.dead?"rgb(120,118,112)":`rgb(${c},${Math.round(231*dim)},${Math.round(224*dim)})`;
  const sh=g.createLinearGradient(-20*s,-24*s,20*s,24*s);sh.addColorStop(0,fill);sh.addColorStop(1,o.dead?fill:`rgb(${Math.round(c*.72)},${Math.round(231*dim*.72)},${Math.round(224*dim*.7)})`);
  def.parts.forEach(p=>{poly(g,p,s);g.fillStyle=sh;g.fill();g.strokeStyle=DARK;g.lineWidth=Math.max(1,.8*s);g.stroke()});
  if(s>1.4){
    g.strokeStyle=`rgba(7,8,12,.5)`;g.lineWidth=.45*s;g.beginPath();def.seams.forEach(([a,b,c2,d])=>{g.moveTo(a*s,b*s);g.lineTo(c2*s,d*s)});g.stroke();
    g.globalAlpha=dim;def.haz.forEach(([a,b,w,hh])=>hazard(g,a,b,w,hh,s));g.globalAlpha=1;
    g.fillStyle="#0f1218";def.win.forEach(([a,b,w,hh])=>g.fillRect(a*s,b*s,w*s,hh*s));
    if(!o.dead&&!o.damaged){g.fillStyle="rgba(140,200,255,.35)";def.win.forEach(([a,b,w,hh])=>g.fillRect(a*s,b*s,w*s*.35,hh*s*.5))}
  }
  if(o.damaged){const d=def.dmg;poly(g,d.hole,s);g.fillStyle=DARK;g.fill();
    if(s>1.4){g.fillStyle="#9a978f";g.fillRect(d.patch[0]*s,d.patch[1]*s,d.patch[2]*s,d.patch[3]*s);g.strokeStyle="rgba(7,8,12,.6)";g.lineWidth=.45*s;g.strokeRect(d.patch[0]*s,d.patch[1]*s,d.patch[2]*s,d.patch[3]*s);
      g.beginPath();for(let k=0;k<3;k++){g.moveTo((d.patch[0]+.6+k*1.3)*s,d.patch[1]*s);g.lineTo((d.patch[0]+.6+k*1.3)*s,(d.patch[1]+d.patch[3])*s)}g.stroke()}
    const hx=d.hole.reduce((a,p)=>a+p[0],0)/d.hole.length,hy=d.hole.reduce((a,p)=>a+p[1],0)/d.hole.length;
    if(!reduce&&Math.sin(t*.013+hx)>.55){g.fillStyle="rgba(255,190,120,.95)";g.fillRect(hx*s,hy*s,Math.max(1.2,.7*s),Math.max(1.2,.7*s));glow(g,hx*s,hy*s,3*s,"rgba(255,170,90,.35)")}}
  // nav lights: red port, green starboard, white strobe aft
  def.nav.forEach(([nx,ny,k],i)=>{if(o.damaged&&i===def.dmg.out)return;
    const on=reduce?1:(k==="w"?(Math.floor(t/90)%14===0?1:0):(.55+.45*Math.sin(t*.004+i)));if(!on)return;
    const col=k==="r"?"255,70,60":k==="g"?"80,255,140":"255,255,255";glow(g,nx*s,ny*s,Math.max(3,2.6*s),`rgba(${col},${.5*on})`);g.fillStyle=`rgba(${col},${on})`;g.fillRect(nx*s-.6,ny*s-.6,1.4,1.4)});
  g.restore()}

/* ================= main scene ================= */
const scene=document.getElementById("scene"),mon=document.getElementById("mon");
let SH=SHIPS[0];
function drawScene(t){
  const d=Math.min(2,devicePixelRatio||1);const g=scene.getContext("2d"),W=scene.width,H=scene.height,u=W/1200;
  g.fillStyle="#07080c";g.fillRect(0,0,W,H);stars(g,W,H,170,"rgba(220,228,240,A)");
  glow(g,-W*.05,-H*.1,W*.45,"rgba(243,227,176,.06)");
  const star={x:-W*2.2*.75,y:-W*2.2*.45,r:W*.35};
  // gas giant
  const gx=W*.74,gy=H*.27,gR=H*.19;glow(g,gx,gy,gR*1.35,"rgba(230,190,140,.12)");ring(g,gx,gy,gR,"rgba(220,200,170,A)",false);
  planet(g,gx,gy,gR,{...GAS,rim:[70,48,26]},"gas"+gR);ring(g,gx,gy,gR,"rgba(220,200,170,A)",true);
  // abandoned rock with its tower turning with it
  const spinA=reduce?0:Math.floor(t/400)*400*.00035;const ax=W*.14,ay=H*.78,aR=H*.075;
  glow(g,ax,ay,aR*1.35,"rgba(170,190,210,.10)");planet(g,ax,ay,aR,{a:"#7a8794",b:"#2f3640",seed:9,craters:1,clouds:0,spin:spinA,rim:[60,80,100]},"ab"+aR);
  {const lat=.3;let a=(.6-spinA)%(2*Math.PI);if(a<-Math.PI)a+=2*Math.PI;const ca=Math.cos(a);if(ca>0){const x=ax+aR*Math.sin(a)*Math.cos(lat),y=ay+aR*Math.sin(lat),p=(reduce?1:.6+.4*Math.sin(t*.004))*Math.min(1,ca*4);glow(g,x,y,7*u*d/2,`rgba(255,214,150,${.9*p})`);g.fillStyle=`rgba(255,240,210,${p})`;g.fillRect(x-u,y-u,2*u,2*u)}}
  mono(g,"AST-3 · ABANDONED",ax+aR+8*u,ay-aR*.4,10*u,"rgba(236,234,228,.45)");
  // comet
  comet(g,W*.12,H*.17,W,"#e6f6ff","rgba(170,220,255,.55)");
  // asteroid 2 + its moon (eclipse)
  const px=W*.38,py=H*.6,R=H*.16;const ast={x:px,y:py,r:R};
  const mA=(reduce?3.92:t*.00018+3.45),moon={x:px+Math.cos(mA)*R*2.05,y:py+Math.sin(mA)*R*1.25,r:R*.36};
  orbit(g,px,py,R*2.05,R*1.25,"rgba(236,234,228,.10)",[3*u,6*u],u);
  const moonBehind=Math.sin(mA)<0;
  const drawMoon=()=>{glow(g,moon.x,moon.y,moon.r*1.3,"rgba(200,195,185,.08)");planet(g,moon.x,moon.y,moon.r,{a:"#c9c3b6",b:"#6e685c",seed:4,craters:1,rim:[60,60,60]},"moon"+moon.r);stampShadows(g,moon,star,[ast,moon])};
  if(moonBehind)drawMoon();
  glow(g,px,py,R*1.3,"rgba(255,170,120,.13)");planet(g,px,py,R,{...ROCK,clouds:1,rim:[120,70,40]},"rock2"+R);
  stampShadows(g,ast,star,[ast,moon]);
  if(!moonBehind)drawMoon();
  mono(g,"AST-2 · CAMP",px+R+12*u,py-R*.7,11*u,"rgba(236,234,228,.55)");
  // ship on a trajectory that passes through the asteroid's shadow
  const sA=reduce?.25:(t*.00012+.1)%(2*Math.PI);const ex=W*.6,ey=H*.12;
  const sx=px+Math.cos(sA)*R*3.1,sy=py+Math.sin(sA)*R*1.7;
  orbit(g,px,py,R*3.1,R*1.7,"rgba(236,234,228,.16)",[4*u,7*u],u);
  const um=Math.max(pointUmbra(sx,sy,ast,star),pointUmbra(sx,sy,moon,star));
  const vx=-Math.sin(sA)*R*3.1,vy=Math.cos(sA)*R*1.7,rot=Math.atan2(vy,vx)+Math.PI/2;
  drawShipDef(g,SH,sx,sy,1.05*u,rot,t,{umbra:um});
  if(um>.05)mono(g,"IN SHADOW",sx+16*u,sy-10*u,10*u,`rgba(236,234,228,${.5*um})`);
  // HUD: fuel; right column = Halley above mass spec, minimap
  mono(g,"FUEL 12%",W*.02,H*.05,12*u,"rgba(236,234,228,.7)");
  const mw=W*.12,mh=H*.15,mx=W-mw-W*.02,my=H-mh-H*.035;g.strokeStyle="rgba(236,234,228,.18)";g.lineWidth=u;g.strokeRect(mx,my,mw,mh);
  g.fillStyle="rgba(236,234,228,.7)";g.beginPath();g.arc(mx+mw*.4,my+mh*.6,2*u,0,7);g.fill();
  const sw=W*.1,sx2=mx-sw-W*.01;g.fillStyle="rgba(4,12,6,.92)";g.fillRect(sx2,my,sw,mh);g.strokeStyle="rgba(120,255,160,.35)";g.strokeRect(sx2,my,sw,mh);
  g.strokeStyle="rgba(140,255,170,.8)";g.beginPath();for(let i=0;i<=40;i++){const xx=sx2+i/40*sw,yy=my+mh*.8-Math.pow(h(i*1.3),3)*mh*.6;i?g.lineTo(xx,yy):g.moveTo(xx,yy)}g.stroke();
  const hw=sw,hh=mh*1.25,hx=sx2,hy=my-hh-H*.015;drawCRT(g,hx,hy,hw,hh,t,true);
  mono(g,"HAL-E 07",hx,hy-6*u,9*u,"rgba(140,255,170,.7)");
  // subtitle under the visor
  const now=performance.now(),live=SUB&&now<SUB.until;
  if(live){mono(g,SUB.text,W*.5,H*.93,13*u,SUB.kind==="thought"?"rgba(236,234,228,.92)":"rgba(140,255,170,.9)","center")}
  else{const line="<subtitle>";const n=reduce?line.length:Math.min(line.length,Math.floor((t/55)%160));
  mono(g,line.slice(0,n),W*.5,H*.93,13*u,"rgba(140,255,170,.9)","center")}
}
function drawMon(t){const g=mon.getContext("2d");g.fillStyle="#0d0e10";g.fillRect(0,0,mon.width,mon.height);const p=mon.width*.05;drawCRT(g,p,p,mon.width-2*p,mon.height-2*p,t,false)}

/* ship cards */
const shipBox=document.getElementById("ships"),cards=[];
SHIPS.forEach((s,i)=>{const c=document.createElement("div");c.className="card";
  c.innerHTML=`<div class="n">${String(i+1).padStart(2,"0")} · ${s.n}</div><b>${s.name}</b><canvas aria-label="${s.name}, sana y dañada"></canvas><p>${s.sub}</p>`;
  shipBox.appendChild(c);cards.push({s,c:c.querySelector("canvas")})});
shipBox.addEventListener("click",e=>{const b=e.target.closest("button[data-i]");if(!b)return;SH=SHIPS[+b.dataset.i];shipBox.querySelectorAll("button[data-i]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));scene.scrollIntoView({behavior:reduce?"auto":"smooth",block:"center"})});
function drawCard(cd,t){const c=cd.c,g=c.getContext("2d"),W=c.width,H=c.height;g.fillStyle="#07080c";g.fillRect(0,0,W,H);stars(g,W,H,40,"rgba(220,228,240,A)",cards.indexOf(cd)*3+1);
  const s=H/64;drawShipDef(g,cd.s,W*.28,H*.5,s,-.35,t,{card:1});drawShipDef(g,cd.s,W*.62,H*.5,s,-.35,t,{damaged:1,card:1});
  mono(g,"INTACT",W*.28,H*.95,Math.max(9,H*.05),"rgba(125,133,145,1)","center");mono(g,"AS FOUND",W*.62,H*.95,Math.max(9,H*.05),"rgba(125,133,145,1)","center");
  // game scale (current arrow is ~26 px tall)
  g.strokeStyle="rgba(125,133,145,.35)";g.strokeRect(W*.84,H*.32,W*.13,H*.36);drawShipDef(g,cd.s,W*.905,H*.5,(26/40)*(W/c.clientWidth),-.35,t,{});
  mono(g,"1:1",W*.905,H*.28,Math.max(9,H*.045),"rgba(125,133,145,1)","center")}

const all=[scene,mon,...cards.map(c=>c.c)];
function resize(){all.forEach(c=>fit(c));imgCache.clear()}
resize();addEventListener("resize",resize);
const vis=new Set();const io=new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting?vis.add(e.target):vis.delete(e.target)));all.forEach(c=>io.observe(c));
let first=true;
function frame(t){if(first||vis.has(scene))drawScene(t);if(first||vis.has(mon))drawMon(t);cards.forEach(cd=>{if(first||vis.has(cd.c))drawCard(cd,t)});first=false;if(!reduce)setTimeout(()=>requestAnimationFrame(frame),45)}
requestAnimationFrame(frame);
if(reduce){["zoom","px","py","noiseA","hdist"].forEach(id=>ctl(id).addEventListener("input",()=>{first=true;frame(0)}));setInterval(()=>{if(H_.img&&!H_.drawn){H_.drawn=1;first=true;frame(0)}},500)}
/* Ship damage drives Halley's signal. 0 = intact, 1 = Tomas's worst settings (11 oct 2026). Noise, zoom and framing stay put. */
const HAL_BEST={hdist:.13,dig:.1,stat:.06},HAL_WORST={hdist:1,dig:.89,stat:.16};
function setHalleyDamage(d){for(const k in HAL_BEST){const el=ctl(k);el.value=(HAL_BEST[k]+(HAL_WORST[k]-HAL_BEST[k])*d).toFixed(2);el.dispatchEvent(new Event("input"))}}
ctl("dmgH").addEventListener("input",e=>setHalleyDamage(+e.target.value));setHalleyDamage(0);
</script>
