window.FG = window.FG || {};

(function(FG, FastSimplexNoise){

  'use strict';

  FG.seed = new Math.seedrandom('asdf');
  FG.simplex = new FastSimplexNoise({
    random: FG.seed,
    frequency: 0.002,
    min: 0,
    max: 255,
    octaves: 6
  });

  FG.can = document.querySelector('canvas');
  FG.ctx = FG.can.getContext('2d');
  FG.can.width = FG.can.height = 512;

})(window.FG, window.FastSimplexNoise);