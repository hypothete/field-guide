var can = document.querySelector('canvas');
var ctx = can.getContext('2d');
can.width=can.height=256;
var candata = ctx.getImageData(0,0,can.width,can.height);

var seedRandom = new Math.seedrandom('hello.');

var noiseGen = new FastSimplexNoise({
  random: seedRandom,
  frequency: 0.01,
  min: 0,
  max: 255,
  octaves: 8
});

//using this approach: http://www.bidouille.org/prog/plasma

for(var i=0; i<candata.data.length; i+=4){
  var ix = Math.floor(i/4) % can.width;
  var iy = Math.floor((i/4) / can.width);
  var frag = Math.floor(noiseGen.in2D(ix, iy));
  candata.data[i+1]=candata.data[i+2]=candata.data[i] = frag;
  candata.data[i+3] = 255;
}

ctx.putImageData(candata,0,0);