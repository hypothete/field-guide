var can = document.querySelector('canvas');
var ctx = can.getContext('2d');
can.width=can.height=256;
var candata = ctx.getImageData(0,0,can.width,can.height);

//Math.seedrandom('hello.');
var randA = Math.random();
var randB = Math.random();

//using this approach: http://www.bidouille.org/prog/plasma

for(var i=0; i<candata.data.length; i+=4){
  var ix = Math.floor(i/4) % can.width;
  var iy = Math.floor((i/4) / can.width);
  var cx=ix+can.width*Math.sin(Math.PI*2*randB);
  var cy=iy+can.height*Math.cos(Math.PI*2*randB);
  var frag;
  frag = Math.sin((ix+randA)/can.width*8*randA);
  frag += Math.sin( (ix*Math.cos(randB/10) + iy*Math.sin(randB/10))/(randA*2+10));
  frag += Math.sin((Math.sqrt((cx*cx+cy*cy)))/32)+0.5;
  frag *= 255;
  frag = Math.round(255*Math.pow(frag/255,2.2));
  frag = Math.min(Math.max(frag, 0), 255);
  candata.data[i+1]=candata.data[i+2]=candata.data[i] = frag;
  candata.data[i+3]=255;
}

ctx.putImageData(candata,0,0);