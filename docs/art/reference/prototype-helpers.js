function h(n){const s=Math.sin(n*127.1)*43758.5453;return s-Math.floor(s)}
function noise(x,y){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
 const a=h(xi+yi*57),b=h(xi+1+yi*57),c=h(xi+(yi+1)*57),d=h(xi+1+(yi+1)*57);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v}
function fbm(x,y){let s=0,f=1,am=.5;for(let i=0;i<5;i++){s+=am*noise(x*f,y*f);f*=2;am*=.5}return s}
function rgb(hx){const n=parseInt(hx.slice(1),16);return[n>>16&255,n>>8&255,n&255]}
const LIGHT=(()=>{const x=-.75,y=-.45,l=Math.hypot(x,y);return{x:x/l,y:y/l}})();
function fit(c){const r=c.getBoundingClientRect(),d=Math.min(2,devicePixelRatio||1);c.width=Math.round(r.width*d);c.height=Math.round(r.height*d);return d}

/* planet surface as ImageData; mode controls palette/style. returns {lum} too for dithering */
function planetImg(R,o){
  const sz=Math.ceil(R*2),img=new ImageData(sz,sz),A=rgb(o.a||"#000000"),B=rgb(o.b||"#000000");
  for(let y=0;y<sz;y++)for(let x=0;x<sz;x++){
    const nx=(x-R)/R,ny=(y-R)/R,d2=nx*nx+ny*ny;if(d2>1)continue;const nz=Math.sqrt(1-d2);
    const lon=Math.atan2(nx,nz)+(o.spin||0),lat=Math.asin(ny);let col;
    if(o.gas){const band=lat*3.4+Math.sin(lon*2+lat*6)*.1+fbm(lon*1.3,lat*9)*.35;const bs=o.bands.map(rgb);col=bs[Math.floor(((band%1)+1)%1*bs.length)].slice();
      const st=Math.exp(-(((lon-.3)**2)/.02+((lat-.25)**2)/.006));if(st>.05)col=col.map((c,i)=>c*(1-st*.7)+[190,110,80][i]*st*.7);}
    else{const n=fbm(lon*2.2+o.seed,lat*2.2+7),n2=fbm(lon*8,lat*8);const k=Math.min(1,Math.max(0,(n-.38)*2));col=A.map((c,i)=>c*(1-k)+B[i]*k);col=col.map(c=>c*(.82+n2*.36));
      if(o.craters){for(let i=0;i<9;i++){const cl=(h(i*3.3+o.seed)-.5)*2.6,ct=(h(i*5.1+o.seed)-.5)*2,cr=.08+h(i*1.9)*.18;const dd=Math.hypot(lon-cl,lat-ct)/cr;if(dd<1)col=col.map(c=>c*(dd>.8?1.12:.78))}}}
    const ndl=(nx*LIGHT.x+ny*LIGHT.y)*.92+nz*.42;const lit=Math.max(0,Math.min(1,ndl*1.15+.04));
    let out=col.map(c=>c*(.06+.94*lit)*(.72+.28*Math.pow(nz,.35)));
    if(o.clouds){const cl=fbm(lon*3+9,lat*5);const ca=Math.max(0,(cl-.56)*2.2)*lit;out=out.map((c,i)=>c*(1-ca)+(o.cloudCol||[236,232,224])[i]*ca)}
    if(o.lights&&lit<.06){const cx=Math.floor(lon*110),cy=Math.floor(lat*110);const cl=noise(lon*3+2,lat*3+5);if(h(cx*9.1+cy*3.7)>.95&&cl>.6&&Math.abs(lat)<.6){const f=(1-lit/.06)*.45;out=[out[0]+250*f,out[1]+180*f,out[2]+100*f]}}
    if(o.rim){const rim=Math.pow(1-nz,3)*Math.max(0,(nx*LIGHT.x+ny*LIGHT.y)+.3);out=out.map((c,i)=>c+o.rim[i]*rim)}
    const i4=(y*sz+x)*4;img.data[i4]=Math.min(255,out[0]);img.data[i4+1]=Math.min(255,out[1]);img.data[i4+2]=Math.min(255,out[2]);img.data[i4+3]=d2>.98?Math.round(255*(1-(d2-.98)/.02)):255;
  }return img}
const imgCache=new Map();
function planet(g,cx,cy,R,o,key){let oc=imgCache.get(key);if(!oc||oc.R!==R||oc.spin!==o.spin){const im=planetImg(R,o);oc=new OffscreenCanvas(im.width,im.height);oc.getContext("2d").putImageData(im,0,0);oc.R=R;oc.spin=o.spin;imgCache.set(key,oc)}g.drawImage(oc,cx-R,cy-R)}
function glow(g,x,y,r,col){const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,col);gr.addColorStop(1,"rgba(0,0,0,0)");g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,7);g.fill()}
function stars(g,W,H,n,col,seed=1){for(let i=0;i<n;i++){const x=h(i*3.31+seed)*W,y=h(i*7.17+seed)*H,a=.15+h(i*1.7+seed)*.6,s=h(i*9.3)>.94?2:1.1;g.fillStyle=col.replace("A",a.toFixed(2));g.fillRect(x,y,s*W/1200,s*W/1200)}}
function hauler(g,s){g.beginPath();g.moveTo(-3*s,-16*s);g.lineTo(3*s,-16*s);g.lineTo(5*s,-12*s);g.lineTo(5*s,6*s);g.lineTo(9*s,9*s);g.lineTo(9*s,15*s);g.lineTo(3*s,15*s);g.lineTo(2*s,12*s);g.lineTo(-2*s,12*s);g.lineTo(-3*s,15*s);g.lineTo(-9*s,15*s);g.lineTo(-9*s,9*s);g.lineTo(-5*s,6*s);g.lineTo(-5*s,-5*s);g.lineTo(-7*s,-5*s);g.lineTo(-7*s,-1*s);g.lineTo(-5*s,-1*s);g.lineTo(-5*s,-12*s);g.closePath()}
function ship(g,x,y,s,rot,t,o={}){g.save();g.translate(x,y);g.rotate(rot);
  if(o.flame!==false){const f=reduce?1:.75+.25*Math.sin(t*.025);glow(g,0,19*s,9*s*f,o.flameCol||"rgba(255,210,140,.6)")}
  hauler(g,s);g.fillStyle=o.fill||"#e9e7e0";g.fill();if(o.stroke){g.strokeStyle=o.stroke;g.lineWidth=o.lw||.9*s;g.stroke()}
  if(o.detail!==false){g.strokeStyle=o.seam||"rgba(7,8,12,.5)";g.lineWidth=.5*s;g.beginPath();[-6,0,6].forEach(k=>{g.moveTo(-5*s,k*s);g.lineTo(5*s,k*s)});g.stroke();
    g.fillStyle=o.window||"#0f1218";g.fillRect(-2*s,-14*s,4*s,2.4*s);if(o.mark){g.fillStyle=o.mark;g.fillRect(1*s,-4.5*s,3*s,1.5*s)}}
  g.restore()}
function orbit(g,cx,cy,rx,ry,col,dash,lw){g.save();g.setLineDash(dash);g.strokeStyle=col;g.lineWidth=lw;g.beginPath();g.ellipse(cx,cy,rx,ry,0,0,7);g.stroke();g.restore()}
function comet(g,x,y,W,col,tail){g.save();const L=W*.12;const gr=g.createLinearGradient(x,y,x+L,y-L*.35);gr.addColorStop(0,tail);gr.addColorStop(1,"rgba(0,0,0,0)");g.strokeStyle=gr;g.lineWidth=W*.004;g.lineCap="round";g.beginPath();g.moveTo(x,y);g.lineTo(x+L,y-L*.35);g.stroke();g.fillStyle=col;g.beginPath();g.arc(x,y,W*.0025,0,7);g.fill();glow(g,x,y,W*.012,tail);g.restore()}
function mono(g,txt,x,y,sz,col,al="left"){g.font=`${sz}px "JetBrains Mono", monospace`;g.fillStyle=col;g.textAlign=al;g.fillText(txt,x,y)}
function ring(g,cx,cy,R,col,front){g.save();g.translate(cx,cy);g.rotate(-.32);for(let i=0;i<4;i++){g.beginPath();const k=1.55+i*.09;if(front)g.ellipse(0,0,R*k,R*k*.24,0,0,Math.PI);else g.ellipse(0,0,R*k,R*k*.24,0,Math.PI,2*Math.PI);g.strokeStyle=col.replace("A",(front?.35:.18)-i*.05);g.lineWidth=R*.045;g.stroke()}g.restore()}

const ROCK={a:"#c57a58",b:"#5c3224",seed:3,craters:1,lights:1};
const GAS={gas:1,bands:["#d8b48a","#9a7a58","#5a4838","#e0c8a0","#b89670"],a:"#7a6a58",b:"#2e241c"};
