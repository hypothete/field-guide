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
    var tempPct = (temp/38)*(tempRamp.length-1);
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

      for(var i=0; i<this.terrain.data.length; i+=4){
        var ix = Math.floor(i/4) % FG.can.width;
        var iy = Math.floor((i/4) / FG.can.width);
        var frag = Math.floor(FG.simplex.in2D(ix, iy));
        frag = frag > this.sealevel ? Math.floor(255*(frag-this.sealevel)/(255-this.sealevel)) : 0;
        this.terrain.data[i] = frag;

        if(frag <= this.sealevel){
          this.terrain.data[i+1] = 12 + 8*frag/this.sealevel;
        }
        else if(frag > this.snowline){
          this.terrain.data[i+1] = 0;
        }
        else{
          this.terrain.data[i+1] = 35*(1-(frag - this.sealevel)/(this.snowline - this.sealevel));
        }

        this.terrain.data[i+3] = 255;
      }
    },

    getTemp: function(vec){
      return this.terrain.data[Math.floor((vec.x+vec.y*FG.can.width))*4 + 1];
    },
    getTerrain: function(vec){
      return this.terrain.data[Math.floor((vec.x+vec.y*FG.can.width))*4];
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
    }
  };

})(window.FG, window.tinycolor);