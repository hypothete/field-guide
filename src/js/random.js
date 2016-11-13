window.FG = window.FG || {};

(function(FG, FastSimplexNoise){

  'use strict';
  var out = document.querySelector('#output');
  FG.seed = new Math.seedrandom('asdf');
  FG.can = document.querySelector('canvas');
  FG.ctx = FG.can.getContext('2d');
  FG.can.width = FG.can.height = 512;
  FG.log = function(outTxt){
    var ppp = document.createElement('p');
    ppp.textContent = outTxt;
    out.appendChild(ppp);
  };

})(window.FG, window.FastSimplexNoise);