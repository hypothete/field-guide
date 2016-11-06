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

  function sampleRamp(temp){
    //-18 - 38
    var tempPct = (temp/255)*(tempRamp.length-1);
    var tempLowIndex = Math.floor(tempPct);
    var tempHighIndex = Math.round(tempPct);
    var startCol = tempRamp[tempLowIndex];
    var endCol = tempRamp[tempHighIndex];
    return tinycolor.mix(startCol, endCol, 100*(tempPct - tempLowIndex));
  }

  FG.worldMap = {
    terrain: FG.ctx.getImageData(0,0,FG.can.width,FG.can.height),
    sealevel:80,
    snowline: 128,
    loadTerrain: function(){
      //red channel = altitude
      //green = temperature
      var i, ix, iy, frag;

      for(i=0; i<this.terrain.data.length; i+=4){
        ix = Math.floor(i/4) % FG.can.width;
        iy = Math.floor((i/4) / FG.can.width);
        frag = Math.floor(FG.simplex.in2D(ix, iy));

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

      //just going to blow rain left to right for now
      for(i=0; i<this.terrain.data.length; i+=4){
        ix = Math.floor(i/4) % FG.can.width;
        iy = Math.floor((i/4) / FG.can.width);
        var ar = this.terrain.data[i];

        if(ar > this.sealevel) {
          var leftRain = 0;

          //reduce by temperature
          var localTemp = this.terrain.data[i+1];
          var tempScale = 1-localTemp/255;

          if(ix > 0){
            var aw = this.terrain.data[i-4];
            var awr = this.terrain.data[i-4+2];

            if(aw > ar){
              leftRain = awr-tempScale*Math.random()*8;
            }
            else{
              leftRain = awr-tempScale*Math.random()*2;
            }
          }

          else if(iy > 0){ //spread from north neighbor if possible
            leftRain = this.terrain.data[i-4*FG.can.width+2];
          }

          else{
            leftRain = Math.random()*255;
          }

          leftRain = Math.round(Math.max(Math.min(255, leftRain), 0));

          this.terrain.data[i+2] = leftRain;
        }
        else{
          this.terrain.data[i+2] = 255;
        }
      }
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

          pr = 224 * bb;
          pg = 128 * bb;
          pb = 64 * bb;

          if(ar > this.snowline){
            pg *= 3;
            pr = pb = pg;
            pb *= 1.25;
          }

          var ix = Math.floor(i/4) % FG.can.width;

        }
        else{
          pr = 16;
          pg = 0;
          pb = 128 * ar / this.sealevel;
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
        var tColor = sampleRamp(ar).toRgb();

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
    }
  };

})(window.FG, window.tinycolor);