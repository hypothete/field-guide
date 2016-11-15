(function(FG){
  'use strict';
  
  var terrainbtn = document.querySelector('#terrain');
  var tempbtn = document.querySelector('#temp');
  var rainbtn = document.querySelector('#rain');
  var pathbtn = document.querySelector('#path');

  Promise.all([FG.json('js/landforms.json'),FG.json('js/vendor/xkcd.json')])
  .then(function(agg){
    FG.lists = FG.lists || {};
    FG.lists.landforms = agg[0];
    FG.lists.colors = agg[1];
    console.log(FG.lists);

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
  });

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

    var entrylines = [];

    entrylines.push('------------------------------');

    entrylines.push(mousePos.x+' '+mousePos.y);

    if(altitude < FG.worldMap.sealevel){
      entrylines.push('sea');
    }
    else{
      entrylines.push('land');
    }

    entrylines.push('terrain: '+altitude);

    entrylines.push('temperature: '+localTemp);

    entrylines.push('rain: '+localRain);

    FG.log(entrylines);
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