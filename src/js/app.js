(function(FG){
  'use strict';
  
  var terrainbtn = document.querySelector('#terrain');
  var tempbtn = document.querySelector('#temp');
  var rainbtn = document.querySelector('#rain');
  var pathbtn = document.querySelector('#path');

  FG.worldMap.loadTerrain();
  FG.worldMap.drawTerrain();
  //FG.worldMap.drawTemperature();
  //FG.worldMap.drawRain();

  FG.worldMap.loadPoints();
  FG.worldMap.drawPoints();

  FG.player.place();
  for(var i=0; i<30; i++){
    FG.player.step();
  }
  FG.player.draw();
  FG.player.log();

  terrainbtn.onclick = function(){
    FG.worldMap.drawTerrain();
  };

  tempbtn.onclick = function(){
    FG.worldMap.drawTemperature();
  };

  rainbtn.onclick = function(){
    FG.worldMap.drawRain();
  };

  pathbtn.onclick = function(){
    FG.worldMap.drawPoints();
    FG.player.draw();
  };

  FG.can.onclick = function(evt){
    var mousePos = getMousePos(evt);

    var altitude = FG.worldMap.getTerrain(mousePos);
    var localTemp = FG.worldMap.getTemp(mousePos);
    var localRain = FG.worldMap.getRain(mousePos);

    FG.log('------------------------------');

    FG.log(mousePos.x+' '+mousePos.y)

    if(altitude < FG.worldMap.sealevel){
      FG.log('sea');
    }
    else{
      FG.log('land');
    }

    FG.log('terrain: '+altitude);

    FG.log('temperature: '+localTemp);

    FG.log('rain: '+localRain);
  };

  function prependChild(parent, newChild) {
    parent.insertBefore(newChild, parent.firstChild);
  }

  function getMousePos(e) {
      var rect = FG.can.getBoundingClientRect();
      return {
        x: e.pageX - rect.left,
        y: e.pageY - rect.top
      };
  }
})(window.FG);