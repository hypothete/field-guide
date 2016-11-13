(function(FG, tinycolor){

  'use strict';

  var tempRamp = [
    tinycolor('#ffffff'),
    tinycolor('#d96feb'),
    tinycolor('#904ac4'),
    tinycolor('#301c8d'),
    tinycolor('#07bbe0'),
    tinycolor('#00d688'),
    tinycolor('#60cd0f'),
    tinycolor('#feff04'),
    tinycolor('#f87906'),
    tinycolor('#d32502'),
    tinycolor('#a00902')
  ];

  var biomeRamp = [
    tinycolor('#ba744f'), //dirt
    tinycolor('#f5f4b6'), //sand
    tinycolor('#726d36'), //plains
    tinycolor('#137700') //rainforest
  ];

  var waterRamp = [
    tinycolor('#024e7d'),
    tinycolor('#000a44'),
    tinycolor('#000033')
  ];

  function sampleRamp(temp, ramp){
    //-18 - 38
    var tempPct = (temp/255)*(ramp.length-1);
    var tempLowIndex = Math.floor(tempPct);
    var tempHighIndex = Math.ceil(tempPct);
    var startCol = ramp[tempLowIndex];
    var endCol = ramp[tempHighIndex];
    return tinycolor.mix(startCol, endCol, 100*(tempPct - tempLowIndex)/(tempHighIndex-tempLowIndex));
  }

  function mix(a,b,x){
    return(1-x)*a+x*b;
  }

  function distSq(u,v){
    var du = v.x - u.x;
    var dv = v.y - u.y;
    return du*du + dv*dv;
  }

  FG.worldMap = {
    terrain: FG.ctx.getImageData(0,0,FG.can.width,FG.can.height),
    sealevel:64,
    snowline: 128,
    terrainSimplex: new FastSimplexNoise({
      random: FG.seed,
      frequency: 0.002,
      min: 0,
      max: 255,
      octaves: 6
    }),
    windSimplex: new FastSimplexNoise({
      random: FG.seed,
      frequency: 0.008,
      min: 0,
      max: 255,
      octaves: 1
    }),
    points: [],
    loadTerrain: function(){
      //red channel = altitude
      //green = temperature
      var i, ix, iy, frag;

      for(i=0; i<this.terrain.data.length; i+=4){
        ix = Math.floor(i/4) % FG.can.width;
        iy = Math.floor((i/4) / FG.can.width);
        frag = Math.floor(this.terrainSimplex.in2D(ix, iy));

        //altitude
        frag = frag > this.sealevel ? Math.floor(255*(frag-this.sealevel)/(255-this.sealevel)) : 0;
        this.terrain.data[i] = frag;

        //temperature
        if(frag <= this.sealevel){
          this.terrain.data[i+1] = 174 - 46*(1 - frag/this.sealevel);
        }
        else if(frag > this.snowline){
          this.terrain.data[i+1] = 4*(frag-this.snowline)/(255-this.snowline);
        }
        else{
          this.terrain.data[i+1] = 4 + 170 * (1-(frag - this.sealevel)/(this.snowline - this.sealevel));
        }

        this.terrain.data[i+3] = 255;
      }

      //second pass - rain in the blue channel
      for(i=0; i<this.terrain.data.length; i+=4){
        ix = Math.floor(i/4) % FG.can.width;
        iy = Math.floor((i/4) / FG.can.width);
        var ar = this.terrain.data[i];
        var ay = Math.cos(Math.PI*1.37*iy/FG.can.height-2)*128+128;
        var ap = this.windSimplex.in2D(ix,iy);
        this.terrain.data[i+2] = Math.max(mix(ay,ap,ar/128), ar);
      }
    },

    findClosest: function(pt, pts){
      var closest;
      var closeDist = Infinity;
      for(var pi in pts){
        var qt = pts[pi];
        var qdist = distSq(pt, qt);
        if(qdist < closeDist){
          closest = qt;
          closeDist = qdist;
        }
      }
      return closest;
    },

    samplePoints: function(pts, candidates, w, h){
      var farthest, farDist = 0;
      for(var i=0; i<candidates; i++){
        var randPt = {
          x: Math.round(Math.random()*w),
          y: Math.round(Math.random()*h)
        };
        var cDist = distSq(this.findClosest(randPt, pts),randPt);
        if(cDist > farDist){
          farDist = cDist;
          farthest = randPt;
        }
      }
      return farthest;
    },

    loadPoints: function(){
      var candidates = 10;
      var count = 200;
      this.points.push({ x: Math.round(Math.random()*FG.can.width), y: Math.round(Math.random()*FG.can.height)});
      while(this.points.length < count){
        var sample = this.samplePoints(this.points, candidates, FG.can.width, FG.can.height);
        var sampleOnLand = this.getTerrain(sample);
        if(sampleOnLand > this.sealevel){
          sample.temp = FG.worldMap.getTemp(sample);
          sample.z = FG.worldMap.getTerrain(sample);
          sample.rain = FG.worldMap.getRain(sample);
          sample.visited = false;
          this.points.push(sample);
        }
      }
      this.points.shift();
    },

    getUnvisitedPoints: function(){
      var unPts = [];
      for(var i=0; i<this.points.length; i++){
        var ptI = this.points[i];
        if(!ptI.visited){
          unPts.push(ptI);
        }
      }
      return unPts;
    },

    getTerrain: function(vec){
      return this.terrain.data[Math.floor((vec.x+vec.y*FG.can.width))*4];
    },

    getTemp: function(vec){
      return this.terrain.data[Math.floor((vec.x+vec.y*FG.can.width))*4 + 1];
    },

    getRain: function(vec){
      return this.terrain.data[Math.floor((vec.x+vec.y*FG.can.width))*4 + 2];
    },

    drawTerrain: function(){
      FG.ctx.putImageData(this.terrain,0,0);
      var terraincolor = FG.ctx.getImageData(0,0,FG.can.width,FG.can.height);
      for(var i=0; i<terraincolor.data.length; i+=4){
        var ar = this.terrain.data[i];
        var pr, pg, pb;

        if(ar > this.sealevel){
          var bb = ar /(255 - this.sealevel);

          //shadow
          if(ix > 0 && i > FG.can.width*4){
            var an = this.terrain.data[i-FG.can.width*4];
            var aw = this.terrain.data[i-4];
            if(an > ar){
              bb *= 0.5;
            }
            if(aw > ar){
              bb *= 0.5;
            }
          }
          var localTemp = this.terrain.data[i+1];
          var localRain = this.terrain.data[i+2];
          var moreRain = 255*(localTemp+localRain)/384;
          var ph = sampleRamp(moreRain, biomeRamp).toRgb();
          pr = ph.r * bb;
          pg = ph.g * bb;
          pb = ph.b * bb;

          if(ar > this.snowline){
            pg *= 3;
            pr = pb = pg;
            pb *= 1.25;
          }

          var ix = Math.floor(i/4) % FG.can.width;

        }
        else{
          var pw = sampleRamp(255*(1-ar/this.sealevel),waterRamp).toRgb();
          pr = pw.r;
          pg = pw.g;
          pb = pw.b;
        }
        terraincolor.data[i]   = Math.max(0,pr);
        terraincolor.data[i+1] = Math.max(0,pg);
        terraincolor.data[i+2] = Math.max(0,pb);
        terraincolor.data[i+3] = 255;
      }
      FG.ctx.putImageData(terraincolor,0,0);
    },
    drawTemperature: function(){
      FG.ctx.putImageData(this.terrain,0,0);
      var terraincolor = FG.ctx.getImageData(0,0,FG.can.width,FG.can.height);
      for(var i=0; i<terraincolor.data.length; i+=4){
        var ar = this.terrain.data[i+1];
        var tColor = sampleRamp(ar, tempRamp).toRgb();

        terraincolor.data[i]   = tColor.r;
        terraincolor.data[i+1] = tColor.g;
        terraincolor.data[i+2] = tColor.b;
        terraincolor.data[i+3] = 255;
      }
      FG.ctx.putImageData(terraincolor,0,0);
    },
    drawRain: function(){
      FG.ctx.putImageData(this.terrain,0,0);
      var terraincolor = FG.ctx.getImageData(0,0,FG.can.width,FG.can.height);
      for(var i=0; i<terraincolor.data.length; i+=4){
        var ar = this.terrain.data[i+2];

        terraincolor.data[i] = 0;
        terraincolor.data[i+1] = 0;
        terraincolor.data[i+2] = ar;
        terraincolor.data[i+3] = 255;
      }
      FG.ctx.putImageData(terraincolor,0,0);
    },
    drawPoints: function(){
      FG.ctx.fillStyle = '#ffff00';
      for(var i=0; i<this.points.length; i++){
        FG.ctx.beginPath();
        FG.ctx.arc(this.points[i].x, this.points[i].y, 2, 0, Math.PI*2, false);
        FG.ctx.fill();
      }
    }
  };

})(window.FG, window.tinycolor);