(function(FG){
  'use strict';
  var out = document.querySelector('#output');
  var terrainbtn = document.querySelector('#terrain');
  var tempbtn = document.querySelector('#temp');
  var rainbtn = document.querySelector('#rain');

  FG.worldMap.loadTerrain();
  //FG.worldMap.drawTerrain();
  //FG.worldMap.drawTemperature();
  FG.worldMap.drawRain();

  terrainbtn.onclick = function(){
    FG.worldMap.drawTerrain();
  };
  tempbtn.onclick = function(){
    FG.worldMap.drawTemperature();
  };
  rainbtn.onclick = function(){
    FG.worldMap.drawRain();
  };

  FG.can.onclick = function(evt){
    var mousePos = getMousePos(evt);

    var altitude = FG.worldMap.getTerrain(mousePos);
    var localTemp = FG.worldMap.getTemp(mousePos);
    var localRain = FG.worldMap.getRain(mousePos);

    console.log(mousePos.x, mousePos.y)

    logOut('------------------------------');

    if(altitude < FG.worldMap.sealevel){
      logOut('sea');
    }
    else{
      logOut('land');
    }

    logOut('terrain: '+altitude);

    logOut('temperature: '+localTemp);

    logOut('rain: '+localRain);
  };

  function prependChild(parent, newChild) {
    parent.insertBefore(newChild, parent.firstChild);
  }

  function logOut(outTxt){
    var ppp = document.createElement('p');
    ppp.textContent = outTxt;
    prependChild(out, ppp);
    if(out.children.length > 10){
      out.removeChild(out.lastChild);
    }
  }

  function getMousePos(e) {
      var rect = FG.can.getBoundingClientRect();
      return {
        x: e.pageX - rect.left,
        y: e.pageY - rect.top
      };
  }
})(window.FG);