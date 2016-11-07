window.FG = window.FG || {};

(function(FG, FastSimplexNoise){

  'use strict';

  FG.seed = new Math.seedrandom('qzzxzx');
  FG.can = document.querySelector('canvas');
  FG.ctx = FG.can.getContext('2d');
  FG.can.width = FG.can.height = 512;

})(window.FG, window.FastSimplexNoise);