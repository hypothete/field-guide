(function(FG){
  'use strict';
  var out = document.querySelector('#output');

  FG.worldMap.loadTerrain();
  FG.worldMap.loadTemperature();
  FG.worldMap.drawTerrain();
  //worldMap.drawTemperature();

  FG.can.onclick = function(evt){
    var mousePos = getMousePos(evt);

    var altitude = FG.worldMap.getTerrain(mousePos);
    var localTemp = FG.worldMap.getTemp(mousePos);
    logOut('------------------------------');
    logOut('terrain: '+altitude);
    logOut('temperature: '+localTemp);
    if(altitude < FG.worldMap.sealevel){
      logOut('sea');
    }
    else{
      logOut('land');
    }
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