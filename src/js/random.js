window.FG = window.FG || {};

(function(FG, FastSimplexNoise){

  'use strict';
  var out = document.querySelector('#output');
  FG.seed = new Math.seedrandom('asdf');
  FG.can = document.querySelector('canvas');
  FG.ctx = FG.can.getContext('2d');
  FG.can.width = FG.can.height = 512;
  FG.log = function(textArray){
    var ddd = document.createElement('div');
    ddd.classList.add('entry');
    for(var t=0; t<textArray.length; t++){
      var ppp = document.createElement('p');
      ppp.textContent = textArray[t];
      ddd.appendChild(ppp);
    }
    out.appendChild(ddd);
  };

  FG.json = function(url){
    return new Promise(function(res){
      var jsonReq = new XMLHttpRequest();
      jsonReq.onreadystatechange = function() {
          if (jsonReq.readyState == XMLHttpRequest.DONE) {
              res(JSON.parse(jsonReq.responseText));
          }
      };
      jsonReq.open('GET', url);
      jsonReq.send(null);
    });
  };

  FG.pick = function(list){
    return list[Math.round(Math.random()*list.length)];
  };

})(window.FG, window.FastSimplexNoise);