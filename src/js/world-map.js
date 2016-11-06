(function(FG){

  'use strict';

  FG.worldMap = {
    terrain: FG.ctx.getImageData(0,0,FG.can.width,FG.can.height),
    temperature: FG.ctx.getImageData(0,0,FG.can.width,FG.can.height),
    sealevel:80,
    snowline: 128,
    loadTerrain: function(){
      for(var i=0; i<this.terrain.data.length; i+=4){
        var ix = Math.floor(i/4) % FG.can.width;
        var iy = Math.floor((i/4) / FG.can.width);
        var frag = Math.floor(FG.simplex.in2D(ix, iy));
        frag = frag > this.sealevel ? Math.floor(255*(frag-this.sealevel)/(255-this.sealevel)) : 0;
        this.terrain.data[i+1]=this.terrain.data[i+2]=this.terrain.data[i] = frag;
        this.terrain.data[i+3] = 255;
      }
    },
    loadTemperature: function(){
      for(var i=0; i<this.temperature.data.length; i+=4){

        var frag = this.terrain.data[i];

        if(frag <= this.sealevel){
          frag = 12 + 8*frag/this.sealevel;
        }
        else if(frag > this.snowline){
          frag = 0;
        }
        else{
          frag = 35*(1-(frag - this.sealevel)/(this.snowline - this.sealevel));
        }
        this.temperature.data[i+1]=this.temperature.data[i+2]=this.temperature.data[i] = frag;
        this.temperature.data[i+3] = 255;
      }
    },
    getTemp: function(vec){
      return this.temperature.data[Math.floor((vec.x+vec.y*FG.can.width))*4];
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
      FG.ctx.putImageData(this.temperature,0,0);
    }
  };

})(window.FG);