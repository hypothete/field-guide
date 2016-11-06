/*
Copyright 2014 David Bau.

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

(function (pool, math) {
//
// The following constants are related to IEEE 754 limits.
//
var global = this,
    width = 256,        // each RC4 output is 0 <= x < 256
    chunks = 6,         // at least six RC4 outputs for each double
    digits = 52,        // there are 52 significant digits in a double
    rngname = 'random', // rngname: name for Math.random and Math.seedrandom
    startdenom = math.pow(width, chunks),
    significance = math.pow(2, digits),
    overflow = significance * 2,
    mask = width - 1,
    nodecrypto;         // node.js crypto module, initialized at the bottom.

//
// seedrandom()
// This is the seedrandom function described above.
//
function seedrandom(seed, options, callback) {
  var key = [];
  options = (options == true) ? { entropy: true } : (options || {});

  // Flatten the seed string or build one from local entropy if needed.
  var shortseed = mixkey(flatten(
    options.entropy ? [seed, tostring(pool)] :
    (seed == null) ? autoseed() : seed, 3), key);

  // Use the seed to initialize an ARC4 generator.
  var arc4 = new ARC4(key);

  // This function returns a random double in [0, 1) that contains
  // randomness in every bit of the mantissa of the IEEE 754 value.
  var prng = function() {
    var n = arc4.g(chunks),             // Start with a numerator n < 2 ^ 48
        d = startdenom,                 //   and denominator d = 2 ^ 48.
        x = 0;                          //   and no 'extra last byte'.
    while (n < significance) {          // Fill up all significant digits by
      n = (n + x) * width;              //   shifting numerator and
      d *= width;                       //   denominator and generating a
      x = arc4.g(1);                    //   new least-significant-byte.
    }
    while (n >= overflow) {             // To avoid rounding up, before adding
      n /= 2;                           //   last byte, shift everything
      d /= 2;                           //   right using integer math until
      x >>>= 1;                         //   we have exactly the desired bits.
    }
    return (n + x) / d;                 // Form the number within [0, 1).
  };

  prng.int32 = function() { return arc4.g(4) | 0; }
  prng.quick = function() { return arc4.g(4) / 0x100000000; }
  prng.double = prng;

  // Mix the randomness into accumulated entropy.
  mixkey(tostring(arc4.S), pool);

  // Calling convention: what to return as a function of prng, seed, is_math.
  return (options.pass || callback ||
      function(prng, seed, is_math_call, state) {
        if (state) {
          // Load the arc4 state from the given state if it has an S array.
          if (state.S) { copy(state, arc4); }
          // Only provide the .state method if requested via options.state.
          prng.state = function() { return copy(arc4, {}); }
        }

        // If called as a method of Math (Math.seedrandom()), mutate
        // Math.random because that is how seedrandom.js has worked since v1.0.
        if (is_math_call) { math[rngname] = prng; return seed; }

        // Otherwise, it is a newer calling convention, so return the
        // prng directly.
        else return prng;
      })(
  prng,
  shortseed,
  'global' in options ? options.global : (this == math),
  options.state);
}
math['seed' + rngname] = seedrandom;

//
// ARC4
//
// An ARC4 implementation.  The constructor takes a key in the form of
// an array of at most (width) integers that should be 0 <= x < (width).
//
// The g(count) method returns a pseudorandom integer that concatenates
// the next (count) outputs from ARC4.  Its return value is a number x
// that is in the range 0 <= x < (width ^ count).
//
function ARC4(key) {
  var t, keylen = key.length,
      me = this, i = 0, j = me.i = me.j = 0, s = me.S = [];

  // The empty key [] is treated as [0].
  if (!keylen) { key = [keylen++]; }

  // Set up S using the standard key scheduling algorithm.
  while (i < width) {
    s[i] = i++;
  }
  for (i = 0; i < width; i++) {
    s[i] = s[j = mask & (j + key[i % keylen] + (t = s[i]))];
    s[j] = t;
  }

  // The "g" method returns the next (count) outputs as one number.
  (me.g = function(count) {
    // Using instance members instead of closure state nearly doubles speed.
    var t, r = 0,
        i = me.i, j = me.j, s = me.S;
    while (count--) {
      t = s[i = mask & (i + 1)];
      r = r * width + s[mask & ((s[i] = s[j = mask & (j + t)]) + (s[j] = t))];
    }
    me.i = i; me.j = j;
    return r;
    // For robust unpredictability, the function call below automatically
    // discards an initial batch of values.  This is called RC4-drop[256].
    // See http://google.com/search?q=rsa+fluhrer+response&btnI
  })(width);
}

//
// copy()
// Copies internal state of ARC4 to or from a plain object.
//
function copy(f, t) {
  t.i = f.i;
  t.j = f.j;
  t.S = f.S.slice();
  return t;
};

//
// flatten()
// Converts an object tree to nested arrays of strings.
//
function flatten(obj, depth) {
  var result = [], typ = (typeof obj), prop;
  if (depth && typ == 'object') {
    for (prop in obj) {
      try { result.push(flatten(obj[prop], depth - 1)); } catch (e) {}
    }
  }
  return (result.length ? result : typ == 'string' ? obj : obj + '\0');
}

//
// mixkey()
// Mixes a string seed into a key that is an array of integers, and
// returns a shortened string seed that is equivalent to the result key.
//
function mixkey(seed, key) {
  var stringseed = seed + '', smear, j = 0;
  while (j < stringseed.length) {
    key[mask & j] =
      mask & ((smear ^= key[mask & j] * 19) + stringseed.charCodeAt(j++));
  }
  return tostring(key);
}

//
// autoseed()
// Returns an object for autoseeding, using window.crypto and Node crypto
// module if available.
//
function autoseed() {
  try {
    if (nodecrypto) { return tostring(nodecrypto.randomBytes(width)); }
    var out = new Uint8Array(width);
    (global.crypto || global.msCrypto).getRandomValues(out);
    return tostring(out);
  } catch (e) {
    var browser = global.navigator,
        plugins = browser && browser.plugins;
    return [+new Date, global, plugins, global.screen, tostring(pool)];
  }
}

//
// tostring()
// Converts an array of charcodes to a string
//
function tostring(a) {
  return String.fromCharCode.apply(0, a);
}

//
// When seedrandom.js is loaded, we immediately mix a few bits
// from the built-in RNG into the entropy pool.  Because we do
// not want to interfere with deterministic PRNG state later,
// seedrandom will not call math.random on its own again after
// initialization.
//
mixkey(math.random(), pool);

//
// Nodejs and AMD support: export the implementation as a module using
// either convention.
//
if ((typeof module) == 'object' && module.exports) {
  module.exports = seedrandom;
  // When in node.js, try using crypto package for autoseeding.
  try {
    nodecrypto = require('crypto');
  } catch (ex) {}
} else if ((typeof define) == 'function' && define.amd) {
  define(function() { return seedrandom; });
}

// End anonymous scope, and pass initial values.
})(
  [],     // pool: entropy pool starts empty
  Math    // math: package containing random, pow, and seedrandom
);

/*
 * A speed-improved simplex noise algorithm for 2D, 3D and 4D in JavaScript.
 *
 * Based on example code by Stefan Gustavson (stegu@itn.liu.se).
 * Optimisations by Peter Eastman (peastman@drizzle.stanford.edu).
 * Better rank ordering method by Stefan Gustavson in 2012.
 *
 * This code was placed in the public domain by its original author,
 * Stefan Gustavson. You may use it as you see fit, but
 * attribution is appreciated.
 */

// Data ------------------------------------------------------------------------

var G2 = (3.0 - Math.sqrt(3.0)) / 6.0
var G3 = 1.0 / 6.0
var G4 = (5.0 - Math.sqrt(5.0)) / 20.0

var GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, -1], [0, 1, -1], [0, -1, -1]
]

var GRAD4 = [
  [0, 1, 1, 1], [0, 1, 1, -1], [0, 1, -1, 1], [0, 1, -1, -1],
  [0, -1, 1, 1], [0, -1, 1, -1], [0, -1, -1, 1], [0, -1, -1, -1],
  [1, 0, 1, 1], [1, 0, 1, -1], [1, 0, -1, 1], [1, 0, -1, -1],
  [-1, 0, 1, 1], [-1, 0, 1, -1], [-1, 0, -1, 1], [-1, 0, -1, -1],
  [1, 1, 0, 1], [1, 1, 0, -1], [1, -1, 0, 1], [1, -1, 0, -1],
  [-1, 1, 0, 1], [-1, 1, 0, -1], [-1, -1, 0, 1], [-1, -1, 0, -1],
  [1, 1, 1, 0], [1, 1, -1, 0], [1, -1, 1, 0], [1, -1, -1, 0],
  [-1, 1, 1, 0], [-1, 1, -1, 0], [-1, -1, 1, 0], [-1, -1, -1, 0]
]

// Exports ---------------------------------------------------------------------

if (typeof module !== 'undefined') module.exports = FastSimplexNoise

// Functions -------------------------------------------------------------------

function FastSimplexNoise (options) {
  if (!options) options = {}

  this.amplitude = options.amplitude || 1.0
  this.frequency = options.frequency || 1.0
  this.octaves = parseInt(options.octaves || 1)
  this.persistence = options.persistence || 0.5
  this.random = options.random || Math.random

  if (typeof options.min === 'number' && typeof options.max === 'number') {
    if (options.min >= options.max) {
      console.error('options.min must be less than options.max')
    } else {
      var min = parseFloat(options.min)
      var max = parseFloat(options.max)
      var range = max - min
      this.scale = function (value) {
        return min + ((value + 1) / 2) * range
      }
    }
  } else {
    this.scale = function (value) {
      return value
    }
  }

  var i
  var p = new Uint8Array(256)
  for (i = 0; i < 256; i++) {
    p[i] = i
  }

  var n, q
  for (i = 255; i > 0; i--) {
    n = Math.floor((i + 1) * this.random())
    q = p[i]
    p[i] = p[n]
    p[n] = q
  }

  // To remove the need for index wrapping, double the permutation table length
  this.perm = new Uint8Array(512)
  this.permMod12 = new Uint8Array(512)
  for (i = 0; i < 512; i++) {
    this.perm[i] = p[i & 255]
    this.permMod12[i] = this.perm[i] % 12
  }
}

FastSimplexNoise.prototype.cylindrical2D = function (c, x, y) {
  var nx = x / c
  var r = c / (2 * Math.PI)
  var rdx = nx * 2 * Math.PI
  var a = r * Math.sin(rdx)
  var b = r * Math.cos(rdx)

  return this.in3D(a, b, y)
}

FastSimplexNoise.prototype.cylindrical3D = function (c, x, y, z) {
  var nx = x / c
  var r = c / (2 * Math.PI)
  var rdx = nx * 2 * Math.PI
  var a = r * Math.sin(rdx)
  var b = r * Math.cos(rdx)

  return this.in4D(a, b, y, z)
}

FastSimplexNoise.prototype.in2D = function (x, y) {
  var amplitude = this.amplitude
  var frequency = this.frequency
  var maxAmplitude = 0
  var noise = 0
  var persistence = this.persistence

  for (var i = 0; i < this.octaves; i++) {
    noise += this.raw2D(x * frequency, y * frequency) * amplitude
    maxAmplitude += amplitude
    amplitude *= persistence
    frequency *= 2
  }

  var value = noise / maxAmplitude
  return this.scale(value)
}

FastSimplexNoise.prototype.in3D = function (x, y, z) {
  var amplitude = this.amplitude
  var frequency = this.frequency
  var maxAmplitude = 0
  var noise = 0
  var persistence = this.persistence

  for (var i = 0; i < this.octaves; i++) {
    noise += this.raw3D(x * frequency, y * frequency, z * frequency) * amplitude
    maxAmplitude += amplitude
    amplitude *= persistence
    frequency *= 2
  }

  var value = noise / maxAmplitude
  return this.scale(value)
}

FastSimplexNoise.prototype.in4D = function (x, y, z, w) {
  var amplitude = this.amplitude
  var frequency = this.frequency
  var maxAmplitude = 0
  var noise = 0
  var persistence = this.persistence

  for (var i = 0; i < this.octaves; i++) {
    noise += this.raw4D(x * frequency, y * frequency, z * frequency, w * frequency) * amplitude
    maxAmplitude += amplitude
    amplitude *= persistence
    frequency *= 2
  }

  var value = noise / maxAmplitude
  return this.scale(value)
}

FastSimplexNoise.prototype.raw2D = function (x, y) {
  var perm = this.perm
  var permMod12 = this.permMod12

  var n0, n1, n2 // Noise contributions from the three corners

  // Skew the input space to determine which simplex cell we're in
  var s = (x + y) * 0.5 * (Math.sqrt(3.0) - 1.0) // Hairy factor for 2D
  var i = Math.floor(x + s)
  var j = Math.floor(y + s)
  var t = (i + j) * G2
  var X0 = i - t // Unskew the cell origin back to (x,y) space
  var Y0 = j - t
  var x0 = x - X0 // The x,y distances from the cell origin
  var y0 = y - Y0

  // For the 2D case, the simplex shape is an equilateral triangle.
  // Determine which simplex we are in.
  var i1, j1 // Offsets for second (middle) corner of simplex in (i,j) coords
  if (x0 > y0) { // Lower triangle, XY order: (0,0)->(1,0)->(1,1)
    i1 = 1
    j1 = 0
  } else { // Upper triangle, YX order: (0,0)->(0,1)->(1,1)
    i1 = 0
    j1 = 1
  }

  // A step of (1,0) in (i,j) means a step of (1-c,-c) in (x,y), and
  // a step of (0,1) in (i,j) means a step of (-c,1-c) in (x,y), where
  // c = (3 - sqrt(3)) / 6

  var x1 = x0 - i1 + G2 // Offsets for middle corner in (x,y) unskewed coords
  var y1 = y0 - j1 + G2
  var x2 = x0 - 1.0 + 2.0 * G2 // Offsets for last corner in (x,y) unskewed coords
  var y2 = y0 - 1.0 + 2.0 * G2

  // Work out the hashed gradient indices of the three simplex corners
  var ii = i & 255
  var jj = j & 255
  var gi0 = permMod12[ii + perm[jj]]
  var gi1 = permMod12[ii + i1 + perm[jj + j1]]
  var gi2 = permMod12[ii + 1 + perm[jj + 1]]

  // Calculate the contribution from the three corners
  var t0 = 0.5 - x0 * x0 - y0 * y0
  if (t0 < 0) {
    n0 = 0.0
  } else {
    t0 *= t0
    // (x,y) of 3D gradient used for 2D gradient
    n0 = t0 * t0 * dot2D(GRAD3[gi0], x0, y0)
  }
  var t1 = 0.5 - x1 * x1 - y1 * y1
  if (t1 < 0) {
    n1 = 0.0
  } else {
    t1 *= t1
    n1 = t1 * t1 * dot2D(GRAD3[gi1], x1, y1)
  }
  var t2 = 0.5 - x2 * x2 - y2 * y2
  if (t2 < 0) {
    n2 = 0.0
  } else {
    t2 *= t2
    n2 = t2 * t2 * dot2D(GRAD3[gi2], x2, y2)
  }

  // Add contributions from each corner to get the final noise value.
  // The result is scaled to return values in the interval [-1, 1]
  return 70.14805770654148 * (n0 + n1 + n2)
}

FastSimplexNoise.prototype.raw3D = function (x, y, z) {
  var perm = this.perm
  var permMod12 = this.permMod12

  var n0, n1, n2, n3 // Noise contributions from the four corners

  // Skew the input space to determine which simplex cell we're in
  var s = (x + y + z) / 3.0 // Very nice and simple skew factor for 3D
  var i = Math.floor(x + s)
  var j = Math.floor(y + s)
  var k = Math.floor(z + s)
  var t = (i + j + k) * G3
  var X0 = i - t // Unskew the cell origin back to (x,y,z) space
  var Y0 = j - t
  var Z0 = k - t
  var x0 = x - X0 // The x,y,z distances from the cell origin
  var y0 = y - Y0
  var z0 = z - Z0

  // For the 3D case, the simplex shape is a slightly irregular tetrahedron.
  // Determine which simplex we are in.
  var i1, j1, k1 // Offsets for second corner of simplex in (i,j,k) coords
  var i2, j2, k2 // Offsets for third corner of simplex in (i,j,k) coords
  if (x0 >= y0) {
    if (y0 >= z0) { // X Y Z order
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0
    } else if (x0 >= z0) { // X Z Y order
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1
    } else { // Z X Y order
      i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1
    }
  } else { // x0 < y0
    if (y0 < z0) { // Z Y X order
      i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1
    } else if (x0 < z0) { // Y Z X order
      i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1
    } else { // Y X Z order
      i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0
    }
  }

  // A step of (1,0,0) in (i,j,k) means a step of (1-c,-c,-c) in (x,y,z),
  // a step of (0,1,0) in (i,j,k) means a step of (-c,1-c,-c) in (x,y,z), and
  // a step of (0,0,1) in (i,j,k) means a step of (-c,-c,1-c) in (x,y,z), where
  // c = 1/6.
  var x1 = x0 - i1 + G3 // Offsets for second corner in (x,y,z) coords
  var y1 = y0 - j1 + G3
  var z1 = z0 - k1 + G3
  var x2 = x0 - i2 + 2.0 * G3 // Offsets for third corner in (x,y,z) coords
  var y2 = y0 - j2 + 2.0 * G3
  var z2 = z0 - k2 + 2.0 * G3
  var x3 = x0 - 1.0 + 3.0 * G3 // Offsets for last corner in (x,y,z) coords
  var y3 = y0 - 1.0 + 3.0 * G3
  var z3 = z0 - 1.0 + 3.0 * G3

  // Work out the hashed gradient indices of the four simplex corners
  var ii = i & 255
  var jj = j & 255
  var kk = k & 255
  var gi0 = permMod12[ii + perm[jj + perm[kk]]]
  var gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]]
  var gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]]
  var gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]]

  // Calculate the contribution from the four corners
  var t0 = 0.5 - x0 * x0 - y0 * y0 - z0 * z0
  if (t0 < 0) {
    n0 = 0.0
  } else {
    t0 *= t0
    n0 = t0 * t0 * dot3D(GRAD3[gi0], x0, y0, z0)
  }
  var t1 = 0.5 - x1 * x1 - y1 * y1 - z1 * z1
  if (t1 < 0) {
    n1 = 0.0
  } else {
    t1 *= t1
    n1 = t1 * t1 * dot3D(GRAD3[gi1], x1, y1, z1)
  }
  var t2 = 0.5 - x2 * x2 - y2 * y2 - z2 * z2
  if (t2 < 0) {
    n2 = 0.0
  } else {
    t2 *= t2
    n2 = t2 * t2 * dot3D(GRAD3[gi2], x2, y2, z2)
  }
  var t3 = 0.5 - x3 * x3 - y3 * y3 - z3 * z3
  if (t3 < 0) {
    n3 = 0.0
  } else {
    t3 *= t3
    n3 = t3 * t3 * dot3D(GRAD3[gi3], x3, y3, z3)
  }

  // Add contributions from each corner to get the final noise value.
  // The result is scaled to stay just inside [-1,1]
  return 94.68493150681972 * (n0 + n1 + n2 + n3)
}

FastSimplexNoise.prototype.raw4D = function (x, y, z, w) {
  var perm = this.perm

  var n0, n1, n2, n3, n4 // Noise contributions from the five corners

  // Skew the (x,y,z,w) space to determine which cell of 24 simplices we're in
  var s = (x + y + z + w) * (Math.sqrt(5.0) - 1.0) / 4.0 // Factor for 4D skewing
  var i = Math.floor(x + s)
  var j = Math.floor(y + s)
  var k = Math.floor(z + s)
  var l = Math.floor(w + s)
  var t = (i + j + k + l) * G4 // Factor for 4D unskewing
  var X0 = i - t // Unskew the cell origin back to (x,y,z,w) space
  var Y0 = j - t
  var Z0 = k - t
  var W0 = l - t
  var x0 = x - X0  // The x,y,z,w distances from the cell origin
  var y0 = y - Y0
  var z0 = z - Z0
  var w0 = w - W0

  // For the 4D case, the simplex is a 4D shape I won't even try to describe.
  // To find out which of the 24 possible simplices we're in, we need to
  // determine the magnitude ordering of x0, y0, z0 and w0.
  // Six pair-wise comparisons are performed between each possible pair
  // of the four coordinates, and the results are used to rank the numbers.
  var rankx = 0
  var ranky = 0
  var rankz = 0
  var rankw = 0
  if (x0 > y0) {
    rankx++
  } else {
    ranky++
  }
  if (x0 > z0) {
    rankx++
  } else {
    rankz++
  }
  if (x0 > w0) {
    rankx++
  } else {
    rankw++
  }
  if (y0 > z0) {
    ranky++
  } else {
    rankz++
  }
  if (y0 > w0) {
    ranky++
  } else {
    rankw++
  }
  if (z0 > w0) {
    rankz++
  } else {
    rankw++
  }
  var i1, j1, k1, l1 // The integer offsets for the second simplex corner
  var i2, j2, k2, l2 // The integer offsets for the third simplex corner
  var i3, j3, k3, l3 // The integer offsets for the fourth simplex corner

  // simplex[c] is a 4-vector with the numbers 0, 1, 2 and 3 in some order.
  // Many values of c will never occur, since e.g. x>y>z>w makes x<z, y<w and x<w
  // impossible. Only the 24 indices which have non-zero entries make any sense.
  // We use a thresholding to set the coordinates in turn from the largest magnitude.
  // Rank 3 denotes the largest coordinate.
  i1 = rankx >= 3 ? 1 : 0
  j1 = ranky >= 3 ? 1 : 0
  k1 = rankz >= 3 ? 1 : 0
  l1 = rankw >= 3 ? 1 : 0
  // Rank 2 denotes the second largest coordinate.
  i2 = rankx >= 2 ? 1 : 0
  j2 = ranky >= 2 ? 1 : 0
  k2 = rankz >= 2 ? 1 : 0
  l2 = rankw >= 2 ? 1 : 0
  // Rank 1 denotes the second smallest coordinate.
  i3 = rankx >= 1 ? 1 : 0
  j3 = ranky >= 1 ? 1 : 0
  k3 = rankz >= 1 ? 1 : 0
  l3 = rankw >= 1 ? 1 : 0

  // The fifth corner has all coordinate offsets = 1, so no need to compute that.
  var x1 = x0 - i1 + G4 // Offsets for second corner in (x,y,z,w) coords
  var y1 = y0 - j1 + G4
  var z1 = z0 - k1 + G4
  var w1 = w0 - l1 + G4
  var x2 = x0 - i2 + 2.0 * G4 // Offsets for third corner in (x,y,z,w) coords
  var y2 = y0 - j2 + 2.0 * G4
  var z2 = z0 - k2 + 2.0 * G4
  var w2 = w0 - l2 + 2.0 * G4
  var x3 = x0 - i3 + 3.0 * G4 // Offsets for fourth corner in (x,y,z,w) coords
  var y3 = y0 - j3 + 3.0 * G4
  var z3 = z0 - k3 + 3.0 * G4
  var w3 = w0 - l3 + 3.0 * G4
  var x4 = x0 - 1.0 + 4.0 * G4 // Offsets for last corner in (x,y,z,w) coords
  var y4 = y0 - 1.0 + 4.0 * G4
  var z4 = z0 - 1.0 + 4.0 * G4
  var w4 = w0 - 1.0 + 4.0 * G4

  // Work out the hashed gradient indices of the five simplex corners
  var ii = i & 255
  var jj = j & 255
  var kk = k & 255
  var ll = l & 255
  var gi0 = perm[ii + perm[jj + perm[kk + perm[ll]]]] % 32
  var gi1 = perm[ii + i1 + perm[jj + j1 + perm[kk + k1 + perm[ll + l1]]]] % 32
  var gi2 = perm[ii + i2 + perm[jj + j2 + perm[kk + k2 + perm[ll + l2]]]] % 32
  var gi3 = perm[ii + i3 + perm[jj + j3 + perm[kk + k3 + perm[ll + l3]]]] % 32
  var gi4 = perm[ii + 1 + perm[jj + 1 + perm[kk + 1 + perm[ll + 1]]]] % 32

  // Calculate the contribution from the five corners
  var t0 = 0.5 - x0 * x0 - y0 * y0 - z0 * z0 - w0 * w0
  if (t0 < 0) {
    n0 = 0.0
  } else {
    t0 *= t0
    n0 = t0 * t0 * dot4D(GRAD4[gi0], x0, y0, z0, w0)
  }
  var t1 = 0.5 - x1 * x1 - y1 * y1 - z1 * z1 - w1 * w1
  if (t1 < 0) {
    n1 = 0.0
  } else {
    t1 *= t1
    n1 = t1 * t1 * dot4D(GRAD4[gi1], x1, y1, z1, w1)
  }
  var t2 = 0.5 - x2 * x2 - y2 * y2 - z2 * z2 - w2 * w2
  if (t2 < 0) {
    n2 = 0.0
  } else {
    t2 *= t2
    n2 = t2 * t2 * dot4D(GRAD4[gi2], x2, y2, z2, w2)
  }
  var t3 = 0.5 - x3 * x3 - y3 * y3 - z3 * z3 - w3 * w3
  if (t3 < 0) {
    n3 = 0.0
  } else {
    t3 *= t3
    n3 = t3 * t3 * dot4D(GRAD4[gi3], x3, y3, z3, w3)
  }
  var t4 = 0.5 - x4 * x4 - y4 * y4 - z4 * z4 - w4 * w4
  if (t4 < 0) {
    n4 = 0.0
  } else {
    t4 *= t4
    n4 = t4 * t4 * dot4D(GRAD4[gi4], x4, y4, z4, w4)
  }

  // Sum up and scale the result to cover the range [-1,1]
  return 72.37857097679466 * (n0 + n1 + n2 + n3 + n4)
}

FastSimplexNoise.prototype.spherical2D = function (c, x, y) {
  var nx = x / c
  var ny = y / c
  var rdx = nx * 2 * Math.PI
  var rdy = ny * Math.PI
  var sinY = Math.sin(rdy + Math.PI)
  var sinRds = 2 * Math.PI
  var a = sinRds * Math.sin(rdx) * sinY
  var b = sinRds * Math.cos(rdx) * sinY
  var d = sinRds * Math.cos(rdy)

  return this.in3D(a, b, d)
}

FastSimplexNoise.prototype.spherical3D = function (c, x, y, z) {
  var nx = x / c
  var ny = y / c
  var rdx = nx * 2 * Math.PI
  var rdy = ny * Math.PI
  var sinY = Math.sin(rdy + Math.PI)
  var sinRds = 2 * Math.PI
  var a = sinRds * Math.sin(rdx) * sinY
  var b = sinRds * Math.cos(rdx) * sinY
  var d = sinRds * Math.cos(rdy)

  return this.in4D(a, b, d, z)
}

function dot2D (g, x, y) {
  return g[0] * x + g[1] * y
}

function dot3D (g, x, y, z) {
  return g[0] * x + g[1] * y + g[2] * z
}

function dot4D (g, x, y, z, w) {
  return g[0] * x + g[1] * y + g[2] * z + g[3] * w
}

// TinyColor v1.4.1
// https://github.com/bgrins/TinyColor
// Brian Grinstead, MIT License

(function(Math) {

var trimLeft = /^\s+/,
    trimRight = /\s+$/,
    tinyCounter = 0,
    mathRound = Math.round,
    mathMin = Math.min,
    mathMax = Math.max,
    mathRandom = Math.random;

function tinycolor (color, opts) {

    color = (color) ? color : '';
    opts = opts || { };

    // If input is already a tinycolor, return itself
    if (color instanceof tinycolor) {
       return color;
    }
    // If we are called as a function, call using new instead
    if (!(this instanceof tinycolor)) {
        return new tinycolor(color, opts);
    }

    var rgb = inputToRGB(color);
    this._originalInput = color,
    this._r = rgb.r,
    this._g = rgb.g,
    this._b = rgb.b,
    this._a = rgb.a,
    this._roundA = mathRound(100*this._a) / 100,
    this._format = opts.format || rgb.format;
    this._gradientType = opts.gradientType;

    // Don't let the range of [0,255] come back in [0,1].
    // Potentially lose a little bit of precision here, but will fix issues where
    // .5 gets interpreted as half of the total, instead of half of 1
    // If it was supposed to be 128, this was already taken care of by `inputToRgb`
    if (this._r < 1) { this._r = mathRound(this._r); }
    if (this._g < 1) { this._g = mathRound(this._g); }
    if (this._b < 1) { this._b = mathRound(this._b); }

    this._ok = rgb.ok;
    this._tc_id = tinyCounter++;
}

tinycolor.prototype = {
    isDark: function() {
        return this.getBrightness() < 128;
    },
    isLight: function() {
        return !this.isDark();
    },
    isValid: function() {
        return this._ok;
    },
    getOriginalInput: function() {
      return this._originalInput;
    },
    getFormat: function() {
        return this._format;
    },
    getAlpha: function() {
        return this._a;
    },
    getBrightness: function() {
        //http://www.w3.org/TR/AERT#color-contrast
        var rgb = this.toRgb();
        return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
    },
    getLuminance: function() {
        //http://www.w3.org/TR/2008/REC-WCAG20-20081211/#relativeluminancedef
        var rgb = this.toRgb();
        var RsRGB, GsRGB, BsRGB, R, G, B;
        RsRGB = rgb.r/255;
        GsRGB = rgb.g/255;
        BsRGB = rgb.b/255;

        if (RsRGB <= 0.03928) {R = RsRGB / 12.92;} else {R = Math.pow(((RsRGB + 0.055) / 1.055), 2.4);}
        if (GsRGB <= 0.03928) {G = GsRGB / 12.92;} else {G = Math.pow(((GsRGB + 0.055) / 1.055), 2.4);}
        if (BsRGB <= 0.03928) {B = BsRGB / 12.92;} else {B = Math.pow(((BsRGB + 0.055) / 1.055), 2.4);}
        return (0.2126 * R) + (0.7152 * G) + (0.0722 * B);
    },
    setAlpha: function(value) {
        this._a = boundAlpha(value);
        this._roundA = mathRound(100*this._a) / 100;
        return this;
    },
    toHsv: function() {
        var hsv = rgbToHsv(this._r, this._g, this._b);
        return { h: hsv.h * 360, s: hsv.s, v: hsv.v, a: this._a };
    },
    toHsvString: function() {
        var hsv = rgbToHsv(this._r, this._g, this._b);
        var h = mathRound(hsv.h * 360), s = mathRound(hsv.s * 100), v = mathRound(hsv.v * 100);
        return (this._a == 1) ?
          "hsv("  + h + ", " + s + "%, " + v + "%)" :
          "hsva(" + h + ", " + s + "%, " + v + "%, "+ this._roundA + ")";
    },
    toHsl: function() {
        var hsl = rgbToHsl(this._r, this._g, this._b);
        return { h: hsl.h * 360, s: hsl.s, l: hsl.l, a: this._a };
    },
    toHslString: function() {
        var hsl = rgbToHsl(this._r, this._g, this._b);
        var h = mathRound(hsl.h * 360), s = mathRound(hsl.s * 100), l = mathRound(hsl.l * 100);
        return (this._a == 1) ?
          "hsl("  + h + ", " + s + "%, " + l + "%)" :
          "hsla(" + h + ", " + s + "%, " + l + "%, "+ this._roundA + ")";
    },
    toHex: function(allow3Char) {
        return rgbToHex(this._r, this._g, this._b, allow3Char);
    },
    toHexString: function(allow3Char) {
        return '#' + this.toHex(allow3Char);
    },
    toHex8: function(allow4Char) {
        return rgbaToHex(this._r, this._g, this._b, this._a, allow4Char);
    },
    toHex8String: function(allow4Char) {
        return '#' + this.toHex8(allow4Char);
    },
    toRgb: function() {
        return { r: mathRound(this._r), g: mathRound(this._g), b: mathRound(this._b), a: this._a };
    },
    toRgbString: function() {
        return (this._a == 1) ?
          "rgb("  + mathRound(this._r) + ", " + mathRound(this._g) + ", " + mathRound(this._b) + ")" :
          "rgba(" + mathRound(this._r) + ", " + mathRound(this._g) + ", " + mathRound(this._b) + ", " + this._roundA + ")";
    },
    toPercentageRgb: function() {
        return { r: mathRound(bound01(this._r, 255) * 100) + "%", g: mathRound(bound01(this._g, 255) * 100) + "%", b: mathRound(bound01(this._b, 255) * 100) + "%", a: this._a };
    },
    toPercentageRgbString: function() {
        return (this._a == 1) ?
          "rgb("  + mathRound(bound01(this._r, 255) * 100) + "%, " + mathRound(bound01(this._g, 255) * 100) + "%, " + mathRound(bound01(this._b, 255) * 100) + "%)" :
          "rgba(" + mathRound(bound01(this._r, 255) * 100) + "%, " + mathRound(bound01(this._g, 255) * 100) + "%, " + mathRound(bound01(this._b, 255) * 100) + "%, " + this._roundA + ")";
    },
    toName: function() {
        if (this._a === 0) {
            return "transparent";
        }

        if (this._a < 1) {
            return false;
        }

        return hexNames[rgbToHex(this._r, this._g, this._b, true)] || false;
    },
    toFilter: function(secondColor) {
        var hex8String = '#' + rgbaToArgbHex(this._r, this._g, this._b, this._a);
        var secondHex8String = hex8String;
        var gradientType = this._gradientType ? "GradientType = 1, " : "";

        if (secondColor) {
            var s = tinycolor(secondColor);
            secondHex8String = '#' + rgbaToArgbHex(s._r, s._g, s._b, s._a);
        }

        return "progid:DXImageTransform.Microsoft.gradient("+gradientType+"startColorstr="+hex8String+",endColorstr="+secondHex8String+")";
    },
    toString: function(format) {
        var formatSet = !!format;
        format = format || this._format;

        var formattedString = false;
        var hasAlpha = this._a < 1 && this._a >= 0;
        var needsAlphaFormat = !formatSet && hasAlpha && (format === "hex" || format === "hex6" || format === "hex3" || format === "hex4" || format === "hex8" || format === "name");

        if (needsAlphaFormat) {
            // Special case for "transparent", all other non-alpha formats
            // will return rgba when there is transparency.
            if (format === "name" && this._a === 0) {
                return this.toName();
            }
            return this.toRgbString();
        }
        if (format === "rgb") {
            formattedString = this.toRgbString();
        }
        if (format === "prgb") {
            formattedString = this.toPercentageRgbString();
        }
        if (format === "hex" || format === "hex6") {
            formattedString = this.toHexString();
        }
        if (format === "hex3") {
            formattedString = this.toHexString(true);
        }
        if (format === "hex4") {
            formattedString = this.toHex8String(true);
        }
        if (format === "hex8") {
            formattedString = this.toHex8String();
        }
        if (format === "name") {
            formattedString = this.toName();
        }
        if (format === "hsl") {
            formattedString = this.toHslString();
        }
        if (format === "hsv") {
            formattedString = this.toHsvString();
        }

        return formattedString || this.toHexString();
    },
    clone: function() {
        return tinycolor(this.toString());
    },

    _applyModification: function(fn, args) {
        var color = fn.apply(null, [this].concat([].slice.call(args)));
        this._r = color._r;
        this._g = color._g;
        this._b = color._b;
        this.setAlpha(color._a);
        return this;
    },
    lighten: function() {
        return this._applyModification(lighten, arguments);
    },
    brighten: function() {
        return this._applyModification(brighten, arguments);
    },
    darken: function() {
        return this._applyModification(darken, arguments);
    },
    desaturate: function() {
        return this._applyModification(desaturate, arguments);
    },
    saturate: function() {
        return this._applyModification(saturate, arguments);
    },
    greyscale: function() {
        return this._applyModification(greyscale, arguments);
    },
    spin: function() {
        return this._applyModification(spin, arguments);
    },

    _applyCombination: function(fn, args) {
        return fn.apply(null, [this].concat([].slice.call(args)));
    },
    analogous: function() {
        return this._applyCombination(analogous, arguments);
    },
    complement: function() {
        return this._applyCombination(complement, arguments);
    },
    monochromatic: function() {
        return this._applyCombination(monochromatic, arguments);
    },
    splitcomplement: function() {
        return this._applyCombination(splitcomplement, arguments);
    },
    triad: function() {
        return this._applyCombination(triad, arguments);
    },
    tetrad: function() {
        return this._applyCombination(tetrad, arguments);
    }
};

// If input is an object, force 1 into "1.0" to handle ratios properly
// String input requires "1.0" as input, so 1 will be treated as 1
tinycolor.fromRatio = function(color, opts) {
    if (typeof color == "object") {
        var newColor = {};
        for (var i in color) {
            if (color.hasOwnProperty(i)) {
                if (i === "a") {
                    newColor[i] = color[i];
                }
                else {
                    newColor[i] = convertToPercentage(color[i]);
                }
            }
        }
        color = newColor;
    }

    return tinycolor(color, opts);
};

// Given a string or object, convert that input to RGB
// Possible string inputs:
//
//     "red"
//     "#f00" or "f00"
//     "#ff0000" or "ff0000"
//     "#ff000000" or "ff000000"
//     "rgb 255 0 0" or "rgb (255, 0, 0)"
//     "rgb 1.0 0 0" or "rgb (1, 0, 0)"
//     "rgba (255, 0, 0, 1)" or "rgba 255, 0, 0, 1"
//     "rgba (1.0, 0, 0, 1)" or "rgba 1.0, 0, 0, 1"
//     "hsl(0, 100%, 50%)" or "hsl 0 100% 50%"
//     "hsla(0, 100%, 50%, 1)" or "hsla 0 100% 50%, 1"
//     "hsv(0, 100%, 100%)" or "hsv 0 100% 100%"
//
function inputToRGB(color) {

    var rgb = { r: 0, g: 0, b: 0 };
    var a = 1;
    var s = null;
    var v = null;
    var l = null;
    var ok = false;
    var format = false;

    if (typeof color == "string") {
        color = stringInputToObject(color);
    }

    if (typeof color == "object") {
        if (isValidCSSUnit(color.r) && isValidCSSUnit(color.g) && isValidCSSUnit(color.b)) {
            rgb = rgbToRgb(color.r, color.g, color.b);
            ok = true;
            format = String(color.r).substr(-1) === "%" ? "prgb" : "rgb";
        }
        else if (isValidCSSUnit(color.h) && isValidCSSUnit(color.s) && isValidCSSUnit(color.v)) {
            s = convertToPercentage(color.s);
            v = convertToPercentage(color.v);
            rgb = hsvToRgb(color.h, s, v);
            ok = true;
            format = "hsv";
        }
        else if (isValidCSSUnit(color.h) && isValidCSSUnit(color.s) && isValidCSSUnit(color.l)) {
            s = convertToPercentage(color.s);
            l = convertToPercentage(color.l);
            rgb = hslToRgb(color.h, s, l);
            ok = true;
            format = "hsl";
        }

        if (color.hasOwnProperty("a")) {
            a = color.a;
        }
    }

    a = boundAlpha(a);

    return {
        ok: ok,
        format: color.format || format,
        r: mathMin(255, mathMax(rgb.r, 0)),
        g: mathMin(255, mathMax(rgb.g, 0)),
        b: mathMin(255, mathMax(rgb.b, 0)),
        a: a
    };
}


// Conversion Functions
// --------------------

// `rgbToHsl`, `rgbToHsv`, `hslToRgb`, `hsvToRgb` modified from:
// <http://mjijackson.com/2008/02/rgb-to-hsl-and-rgb-to-hsv-color-model-conversion-algorithms-in-javascript>

// `rgbToRgb`
// Handle bounds / percentage checking to conform to CSS color spec
// <http://www.w3.org/TR/css3-color/>
// *Assumes:* r, g, b in [0, 255] or [0, 1]
// *Returns:* { r, g, b } in [0, 255]
function rgbToRgb(r, g, b){
    return {
        r: bound01(r, 255) * 255,
        g: bound01(g, 255) * 255,
        b: bound01(b, 255) * 255
    };
}

// `rgbToHsl`
// Converts an RGB color value to HSL.
// *Assumes:* r, g, and b are contained in [0, 255] or [0, 1]
// *Returns:* { h, s, l } in [0,1]
function rgbToHsl(r, g, b) {

    r = bound01(r, 255);
    g = bound01(g, 255);
    b = bound01(b, 255);

    var max = mathMax(r, g, b), min = mathMin(r, g, b);
    var h, s, l = (max + min) / 2;

    if(max == min) {
        h = s = 0; // achromatic
    }
    else {
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch(max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }

        h /= 6;
    }

    return { h: h, s: s, l: l };
}

// `hslToRgb`
// Converts an HSL color value to RGB.
// *Assumes:* h is contained in [0, 1] or [0, 360] and s and l are contained [0, 1] or [0, 100]
// *Returns:* { r, g, b } in the set [0, 255]
function hslToRgb(h, s, l) {
    var r, g, b;

    h = bound01(h, 360);
    s = bound01(s, 100);
    l = bound01(l, 100);

    function hue2rgb(p, q, t) {
        if(t < 0) t += 1;
        if(t > 1) t -= 1;
        if(t < 1/6) return p + (q - p) * 6 * t;
        if(t < 1/2) return q;
        if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
    }

    if(s === 0) {
        r = g = b = l; // achromatic
    }
    else {
        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return { r: r * 255, g: g * 255, b: b * 255 };
}

// `rgbToHsv`
// Converts an RGB color value to HSV
// *Assumes:* r, g, and b are contained in the set [0, 255] or [0, 1]
// *Returns:* { h, s, v } in [0,1]
function rgbToHsv(r, g, b) {

    r = bound01(r, 255);
    g = bound01(g, 255);
    b = bound01(b, 255);

    var max = mathMax(r, g, b), min = mathMin(r, g, b);
    var h, s, v = max;

    var d = max - min;
    s = max === 0 ? 0 : d / max;

    if(max == min) {
        h = 0; // achromatic
    }
    else {
        switch(max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h, s: s, v: v };
}

// `hsvToRgb`
// Converts an HSV color value to RGB.
// *Assumes:* h is contained in [0, 1] or [0, 360] and s and v are contained in [0, 1] or [0, 100]
// *Returns:* { r, g, b } in the set [0, 255]
 function hsvToRgb(h, s, v) {

    h = bound01(h, 360) * 6;
    s = bound01(s, 100);
    v = bound01(v, 100);

    var i = Math.floor(h),
        f = h - i,
        p = v * (1 - s),
        q = v * (1 - f * s),
        t = v * (1 - (1 - f) * s),
        mod = i % 6,
        r = [v, q, p, p, t, v][mod],
        g = [t, v, v, q, p, p][mod],
        b = [p, p, t, v, v, q][mod];

    return { r: r * 255, g: g * 255, b: b * 255 };
}

// `rgbToHex`
// Converts an RGB color to hex
// Assumes r, g, and b are contained in the set [0, 255]
// Returns a 3 or 6 character hex
function rgbToHex(r, g, b, allow3Char) {

    var hex = [
        pad2(mathRound(r).toString(16)),
        pad2(mathRound(g).toString(16)),
        pad2(mathRound(b).toString(16))
    ];

    // Return a 3 character hex if possible
    if (allow3Char && hex[0].charAt(0) == hex[0].charAt(1) && hex[1].charAt(0) == hex[1].charAt(1) && hex[2].charAt(0) == hex[2].charAt(1)) {
        return hex[0].charAt(0) + hex[1].charAt(0) + hex[2].charAt(0);
    }

    return hex.join("");
}

// `rgbaToHex`
// Converts an RGBA color plus alpha transparency to hex
// Assumes r, g, b are contained in the set [0, 255] and
// a in [0, 1]. Returns a 4 or 8 character rgba hex
function rgbaToHex(r, g, b, a, allow4Char) {

    var hex = [
        pad2(mathRound(r).toString(16)),
        pad2(mathRound(g).toString(16)),
        pad2(mathRound(b).toString(16)),
        pad2(convertDecimalToHex(a))
    ];

    // Return a 4 character hex if possible
    if (allow4Char && hex[0].charAt(0) == hex[0].charAt(1) && hex[1].charAt(0) == hex[1].charAt(1) && hex[2].charAt(0) == hex[2].charAt(1) && hex[3].charAt(0) == hex[3].charAt(1)) {
        return hex[0].charAt(0) + hex[1].charAt(0) + hex[2].charAt(0) + hex[3].charAt(0);
    }

    return hex.join("");
}

// `rgbaToArgbHex`
// Converts an RGBA color to an ARGB Hex8 string
// Rarely used, but required for "toFilter()"
function rgbaToArgbHex(r, g, b, a) {

    var hex = [
        pad2(convertDecimalToHex(a)),
        pad2(mathRound(r).toString(16)),
        pad2(mathRound(g).toString(16)),
        pad2(mathRound(b).toString(16))
    ];

    return hex.join("");
}

// `equals`
// Can be called with any tinycolor input
tinycolor.equals = function (color1, color2) {
    if (!color1 || !color2) { return false; }
    return tinycolor(color1).toRgbString() == tinycolor(color2).toRgbString();
};

tinycolor.random = function() {
    return tinycolor.fromRatio({
        r: mathRandom(),
        g: mathRandom(),
        b: mathRandom()
    });
};


// Modification Functions
// ----------------------
// Thanks to less.js for some of the basics here
// <https://github.com/cloudhead/less.js/blob/master/lib/less/functions.js>

function desaturate(color, amount) {
    amount = (amount === 0) ? 0 : (amount || 10);
    var hsl = tinycolor(color).toHsl();
    hsl.s -= amount / 100;
    hsl.s = clamp01(hsl.s);
    return tinycolor(hsl);
}

function saturate(color, amount) {
    amount = (amount === 0) ? 0 : (amount || 10);
    var hsl = tinycolor(color).toHsl();
    hsl.s += amount / 100;
    hsl.s = clamp01(hsl.s);
    return tinycolor(hsl);
}

function greyscale(color) {
    return tinycolor(color).desaturate(100);
}

function lighten (color, amount) {
    amount = (amount === 0) ? 0 : (amount || 10);
    var hsl = tinycolor(color).toHsl();
    hsl.l += amount / 100;
    hsl.l = clamp01(hsl.l);
    return tinycolor(hsl);
}

function brighten(color, amount) {
    amount = (amount === 0) ? 0 : (amount || 10);
    var rgb = tinycolor(color).toRgb();
    rgb.r = mathMax(0, mathMin(255, rgb.r - mathRound(255 * - (amount / 100))));
    rgb.g = mathMax(0, mathMin(255, rgb.g - mathRound(255 * - (amount / 100))));
    rgb.b = mathMax(0, mathMin(255, rgb.b - mathRound(255 * - (amount / 100))));
    return tinycolor(rgb);
}

function darken (color, amount) {
    amount = (amount === 0) ? 0 : (amount || 10);
    var hsl = tinycolor(color).toHsl();
    hsl.l -= amount / 100;
    hsl.l = clamp01(hsl.l);
    return tinycolor(hsl);
}

// Spin takes a positive or negative amount within [-360, 360] indicating the change of hue.
// Values outside of this range will be wrapped into this range.
function spin(color, amount) {
    var hsl = tinycolor(color).toHsl();
    var hue = (hsl.h + amount) % 360;
    hsl.h = hue < 0 ? 360 + hue : hue;
    return tinycolor(hsl);
}

// Combination Functions
// ---------------------
// Thanks to jQuery xColor for some of the ideas behind these
// <https://github.com/infusion/jQuery-xcolor/blob/master/jquery.xcolor.js>

function complement(color) {
    var hsl = tinycolor(color).toHsl();
    hsl.h = (hsl.h + 180) % 360;
    return tinycolor(hsl);
}

function triad(color) {
    var hsl = tinycolor(color).toHsl();
    var h = hsl.h;
    return [
        tinycolor(color),
        tinycolor({ h: (h + 120) % 360, s: hsl.s, l: hsl.l }),
        tinycolor({ h: (h + 240) % 360, s: hsl.s, l: hsl.l })
    ];
}

function tetrad(color) {
    var hsl = tinycolor(color).toHsl();
    var h = hsl.h;
    return [
        tinycolor(color),
        tinycolor({ h: (h + 90) % 360, s: hsl.s, l: hsl.l }),
        tinycolor({ h: (h + 180) % 360, s: hsl.s, l: hsl.l }),
        tinycolor({ h: (h + 270) % 360, s: hsl.s, l: hsl.l })
    ];
}

function splitcomplement(color) {
    var hsl = tinycolor(color).toHsl();
    var h = hsl.h;
    return [
        tinycolor(color),
        tinycolor({ h: (h + 72) % 360, s: hsl.s, l: hsl.l}),
        tinycolor({ h: (h + 216) % 360, s: hsl.s, l: hsl.l})
    ];
}

function analogous(color, results, slices) {
    results = results || 6;
    slices = slices || 30;

    var hsl = tinycolor(color).toHsl();
    var part = 360 / slices;
    var ret = [tinycolor(color)];

    for (hsl.h = ((hsl.h - (part * results >> 1)) + 720) % 360; --results; ) {
        hsl.h = (hsl.h + part) % 360;
        ret.push(tinycolor(hsl));
    }
    return ret;
}

function monochromatic(color, results) {
    results = results || 6;
    var hsv = tinycolor(color).toHsv();
    var h = hsv.h, s = hsv.s, v = hsv.v;
    var ret = [];
    var modification = 1 / results;

    while (results--) {
        ret.push(tinycolor({ h: h, s: s, v: v}));
        v = (v + modification) % 1;
    }

    return ret;
}

// Utility Functions
// ---------------------

tinycolor.mix = function(color1, color2, amount) {
    amount = (amount === 0) ? 0 : (amount || 50);

    var rgb1 = tinycolor(color1).toRgb();
    var rgb2 = tinycolor(color2).toRgb();

    var p = amount / 100;

    var rgba = {
        r: ((rgb2.r - rgb1.r) * p) + rgb1.r,
        g: ((rgb2.g - rgb1.g) * p) + rgb1.g,
        b: ((rgb2.b - rgb1.b) * p) + rgb1.b,
        a: ((rgb2.a - rgb1.a) * p) + rgb1.a
    };

    return tinycolor(rgba);
};


// Readability Functions
// ---------------------
// <http://www.w3.org/TR/2008/REC-WCAG20-20081211/#contrast-ratiodef (WCAG Version 2)

// `contrast`
// Analyze the 2 colors and returns the color contrast defined by (WCAG Version 2)
tinycolor.readability = function(color1, color2) {
    var c1 = tinycolor(color1);
    var c2 = tinycolor(color2);
    return (Math.max(c1.getLuminance(),c2.getLuminance())+0.05) / (Math.min(c1.getLuminance(),c2.getLuminance())+0.05);
};

// `isReadable`
// Ensure that foreground and background color combinations meet WCAG2 guidelines.
// The third argument is an optional Object.
//      the 'level' property states 'AA' or 'AAA' - if missing or invalid, it defaults to 'AA';
//      the 'size' property states 'large' or 'small' - if missing or invalid, it defaults to 'small'.
// If the entire object is absent, isReadable defaults to {level:"AA",size:"small"}.

// *Example*
//    tinycolor.isReadable("#000", "#111") => false
//    tinycolor.isReadable("#000", "#111",{level:"AA",size:"large"}) => false
tinycolor.isReadable = function(color1, color2, wcag2) {
    var readability = tinycolor.readability(color1, color2);
    var wcag2Parms, out;

    out = false;

    wcag2Parms = validateWCAG2Parms(wcag2);
    switch (wcag2Parms.level + wcag2Parms.size) {
        case "AAsmall":
        case "AAAlarge":
            out = readability >= 4.5;
            break;
        case "AAlarge":
            out = readability >= 3;
            break;
        case "AAAsmall":
            out = readability >= 7;
            break;
    }
    return out;

};

// `mostReadable`
// Given a base color and a list of possible foreground or background
// colors for that base, returns the most readable color.
// Optionally returns Black or White if the most readable color is unreadable.
// *Example*
//    tinycolor.mostReadable(tinycolor.mostReadable("#123", ["#124", "#125"],{includeFallbackColors:false}).toHexString(); // "#112255"
//    tinycolor.mostReadable(tinycolor.mostReadable("#123", ["#124", "#125"],{includeFallbackColors:true}).toHexString();  // "#ffffff"
//    tinycolor.mostReadable("#a8015a", ["#faf3f3"],{includeFallbackColors:true,level:"AAA",size:"large"}).toHexString(); // "#faf3f3"
//    tinycolor.mostReadable("#a8015a", ["#faf3f3"],{includeFallbackColors:true,level:"AAA",size:"small"}).toHexString(); // "#ffffff"
tinycolor.mostReadable = function(baseColor, colorList, args) {
    var bestColor = null;
    var bestScore = 0;
    var readability;
    var includeFallbackColors, level, size ;
    args = args || {};
    includeFallbackColors = args.includeFallbackColors ;
    level = args.level;
    size = args.size;

    for (var i= 0; i < colorList.length ; i++) {
        readability = tinycolor.readability(baseColor, colorList[i]);
        if (readability > bestScore) {
            bestScore = readability;
            bestColor = tinycolor(colorList[i]);
        }
    }

    if (tinycolor.isReadable(baseColor, bestColor, {"level":level,"size":size}) || !includeFallbackColors) {
        return bestColor;
    }
    else {
        args.includeFallbackColors=false;
        return tinycolor.mostReadable(baseColor,["#fff", "#000"],args);
    }
};


// Big List of Colors
// ------------------
// <http://www.w3.org/TR/css3-color/#svg-color>
var names = tinycolor.names = {
    aliceblue: "f0f8ff",
    antiquewhite: "faebd7",
    aqua: "0ff",
    aquamarine: "7fffd4",
    azure: "f0ffff",
    beige: "f5f5dc",
    bisque: "ffe4c4",
    black: "000",
    blanchedalmond: "ffebcd",
    blue: "00f",
    blueviolet: "8a2be2",
    brown: "a52a2a",
    burlywood: "deb887",
    burntsienna: "ea7e5d",
    cadetblue: "5f9ea0",
    chartreuse: "7fff00",
    chocolate: "d2691e",
    coral: "ff7f50",
    cornflowerblue: "6495ed",
    cornsilk: "fff8dc",
    crimson: "dc143c",
    cyan: "0ff",
    darkblue: "00008b",
    darkcyan: "008b8b",
    darkgoldenrod: "b8860b",
    darkgray: "a9a9a9",
    darkgreen: "006400",
    darkgrey: "a9a9a9",
    darkkhaki: "bdb76b",
    darkmagenta: "8b008b",
    darkolivegreen: "556b2f",
    darkorange: "ff8c00",
    darkorchid: "9932cc",
    darkred: "8b0000",
    darksalmon: "e9967a",
    darkseagreen: "8fbc8f",
    darkslateblue: "483d8b",
    darkslategray: "2f4f4f",
    darkslategrey: "2f4f4f",
    darkturquoise: "00ced1",
    darkviolet: "9400d3",
    deeppink: "ff1493",
    deepskyblue: "00bfff",
    dimgray: "696969",
    dimgrey: "696969",
    dodgerblue: "1e90ff",
    firebrick: "b22222",
    floralwhite: "fffaf0",
    forestgreen: "228b22",
    fuchsia: "f0f",
    gainsboro: "dcdcdc",
    ghostwhite: "f8f8ff",
    gold: "ffd700",
    goldenrod: "daa520",
    gray: "808080",
    green: "008000",
    greenyellow: "adff2f",
    grey: "808080",
    honeydew: "f0fff0",
    hotpink: "ff69b4",
    indianred: "cd5c5c",
    indigo: "4b0082",
    ivory: "fffff0",
    khaki: "f0e68c",
    lavender: "e6e6fa",
    lavenderblush: "fff0f5",
    lawngreen: "7cfc00",
    lemonchiffon: "fffacd",
    lightblue: "add8e6",
    lightcoral: "f08080",
    lightcyan: "e0ffff",
    lightgoldenrodyellow: "fafad2",
    lightgray: "d3d3d3",
    lightgreen: "90ee90",
    lightgrey: "d3d3d3",
    lightpink: "ffb6c1",
    lightsalmon: "ffa07a",
    lightseagreen: "20b2aa",
    lightskyblue: "87cefa",
    lightslategray: "789",
    lightslategrey: "789",
    lightsteelblue: "b0c4de",
    lightyellow: "ffffe0",
    lime: "0f0",
    limegreen: "32cd32",
    linen: "faf0e6",
    magenta: "f0f",
    maroon: "800000",
    mediumaquamarine: "66cdaa",
    mediumblue: "0000cd",
    mediumorchid: "ba55d3",
    mediumpurple: "9370db",
    mediumseagreen: "3cb371",
    mediumslateblue: "7b68ee",
    mediumspringgreen: "00fa9a",
    mediumturquoise: "48d1cc",
    mediumvioletred: "c71585",
    midnightblue: "191970",
    mintcream: "f5fffa",
    mistyrose: "ffe4e1",
    moccasin: "ffe4b5",
    navajowhite: "ffdead",
    navy: "000080",
    oldlace: "fdf5e6",
    olive: "808000",
    olivedrab: "6b8e23",
    orange: "ffa500",
    orangered: "ff4500",
    orchid: "da70d6",
    palegoldenrod: "eee8aa",
    palegreen: "98fb98",
    paleturquoise: "afeeee",
    palevioletred: "db7093",
    papayawhip: "ffefd5",
    peachpuff: "ffdab9",
    peru: "cd853f",
    pink: "ffc0cb",
    plum: "dda0dd",
    powderblue: "b0e0e6",
    purple: "800080",
    rebeccapurple: "663399",
    red: "f00",
    rosybrown: "bc8f8f",
    royalblue: "4169e1",
    saddlebrown: "8b4513",
    salmon: "fa8072",
    sandybrown: "f4a460",
    seagreen: "2e8b57",
    seashell: "fff5ee",
    sienna: "a0522d",
    silver: "c0c0c0",
    skyblue: "87ceeb",
    slateblue: "6a5acd",
    slategray: "708090",
    slategrey: "708090",
    snow: "fffafa",
    springgreen: "00ff7f",
    steelblue: "4682b4",
    tan: "d2b48c",
    teal: "008080",
    thistle: "d8bfd8",
    tomato: "ff6347",
    turquoise: "40e0d0",
    violet: "ee82ee",
    wheat: "f5deb3",
    white: "fff",
    whitesmoke: "f5f5f5",
    yellow: "ff0",
    yellowgreen: "9acd32"
};

// Make it easy to access colors via `hexNames[hex]`
var hexNames = tinycolor.hexNames = flip(names);


// Utilities
// ---------

// `{ 'name1': 'val1' }` becomes `{ 'val1': 'name1' }`
function flip(o) {
    var flipped = { };
    for (var i in o) {
        if (o.hasOwnProperty(i)) {
            flipped[o[i]] = i;
        }
    }
    return flipped;
}

// Return a valid alpha value [0,1] with all invalid values being set to 1
function boundAlpha(a) {
    a = parseFloat(a);

    if (isNaN(a) || a < 0 || a > 1) {
        a = 1;
    }

    return a;
}

// Take input from [0, n] and return it as [0, 1]
function bound01(n, max) {
    if (isOnePointZero(n)) { n = "100%"; }

    var processPercent = isPercentage(n);
    n = mathMin(max, mathMax(0, parseFloat(n)));

    // Automatically convert percentage into number
    if (processPercent) {
        n = parseInt(n * max, 10) / 100;
    }

    // Handle floating point rounding errors
    if ((Math.abs(n - max) < 0.000001)) {
        return 1;
    }

    // Convert into [0, 1] range if it isn't already
    return (n % max) / parseFloat(max);
}

// Force a number between 0 and 1
function clamp01(val) {
    return mathMin(1, mathMax(0, val));
}

// Parse a base-16 hex value into a base-10 integer
function parseIntFromHex(val) {
    return parseInt(val, 16);
}

// Need to handle 1.0 as 100%, since once it is a number, there is no difference between it and 1
// <http://stackoverflow.com/questions/7422072/javascript-how-to-detect-number-as-a-decimal-including-1-0>
function isOnePointZero(n) {
    return typeof n == "string" && n.indexOf('.') != -1 && parseFloat(n) === 1;
}

// Check to see if string passed in is a percentage
function isPercentage(n) {
    return typeof n === "string" && n.indexOf('%') != -1;
}

// Force a hex value to have 2 characters
function pad2(c) {
    return c.length == 1 ? '0' + c : '' + c;
}

// Replace a decimal with it's percentage value
function convertToPercentage(n) {
    if (n <= 1) {
        n = (n * 100) + "%";
    }

    return n;
}

// Converts a decimal to a hex value
function convertDecimalToHex(d) {
    return Math.round(parseFloat(d) * 255).toString(16);
}
// Converts a hex value to a decimal
function convertHexToDecimal(h) {
    return (parseIntFromHex(h) / 255);
}

var matchers = (function() {

    // <http://www.w3.org/TR/css3-values/#integers>
    var CSS_INTEGER = "[-\\+]?\\d+%?";

    // <http://www.w3.org/TR/css3-values/#number-value>
    var CSS_NUMBER = "[-\\+]?\\d*\\.\\d+%?";

    // Allow positive/negative integer/number.  Don't capture the either/or, just the entire outcome.
    var CSS_UNIT = "(?:" + CSS_NUMBER + ")|(?:" + CSS_INTEGER + ")";

    // Actual matching.
    // Parentheses and commas are optional, but not required.
    // Whitespace can take the place of commas or opening paren
    var PERMISSIVE_MATCH3 = "[\\s|\\(]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")\\s*\\)?";
    var PERMISSIVE_MATCH4 = "[\\s|\\(]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")\\s*\\)?";

    return {
        CSS_UNIT: new RegExp(CSS_UNIT),
        rgb: new RegExp("rgb" + PERMISSIVE_MATCH3),
        rgba: new RegExp("rgba" + PERMISSIVE_MATCH4),
        hsl: new RegExp("hsl" + PERMISSIVE_MATCH3),
        hsla: new RegExp("hsla" + PERMISSIVE_MATCH4),
        hsv: new RegExp("hsv" + PERMISSIVE_MATCH3),
        hsva: new RegExp("hsva" + PERMISSIVE_MATCH4),
        hex3: /^#?([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})$/,
        hex6: /^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/,
        hex4: /^#?([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})$/,
        hex8: /^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/
    };
})();

// `isValidCSSUnit`
// Take in a single string / number and check to see if it looks like a CSS unit
// (see `matchers` above for definition).
function isValidCSSUnit(color) {
    return !!matchers.CSS_UNIT.exec(color);
}

// `stringInputToObject`
// Permissive string parsing.  Take in a number of formats, and output an object
// based on detected format.  Returns `{ r, g, b }` or `{ h, s, l }` or `{ h, s, v}`
function stringInputToObject(color) {

    color = color.replace(trimLeft,'').replace(trimRight, '').toLowerCase();
    var named = false;
    if (names[color]) {
        color = names[color];
        named = true;
    }
    else if (color == 'transparent') {
        return { r: 0, g: 0, b: 0, a: 0, format: "name" };
    }

    // Try to match string input using regular expressions.
    // Keep most of the number bounding out of this function - don't worry about [0,1] or [0,100] or [0,360]
    // Just return an object and let the conversion functions handle that.
    // This way the result will be the same whether the tinycolor is initialized with string or object.
    var match;
    if ((match = matchers.rgb.exec(color))) {
        return { r: match[1], g: match[2], b: match[3] };
    }
    if ((match = matchers.rgba.exec(color))) {
        return { r: match[1], g: match[2], b: match[3], a: match[4] };
    }
    if ((match = matchers.hsl.exec(color))) {
        return { h: match[1], s: match[2], l: match[3] };
    }
    if ((match = matchers.hsla.exec(color))) {
        return { h: match[1], s: match[2], l: match[3], a: match[4] };
    }
    if ((match = matchers.hsv.exec(color))) {
        return { h: match[1], s: match[2], v: match[3] };
    }
    if ((match = matchers.hsva.exec(color))) {
        return { h: match[1], s: match[2], v: match[3], a: match[4] };
    }
    if ((match = matchers.hex8.exec(color))) {
        return {
            r: parseIntFromHex(match[1]),
            g: parseIntFromHex(match[2]),
            b: parseIntFromHex(match[3]),
            a: convertHexToDecimal(match[4]),
            format: named ? "name" : "hex8"
        };
    }
    if ((match = matchers.hex6.exec(color))) {
        return {
            r: parseIntFromHex(match[1]),
            g: parseIntFromHex(match[2]),
            b: parseIntFromHex(match[3]),
            format: named ? "name" : "hex"
        };
    }
    if ((match = matchers.hex4.exec(color))) {
        return {
            r: parseIntFromHex(match[1] + '' + match[1]),
            g: parseIntFromHex(match[2] + '' + match[2]),
            b: parseIntFromHex(match[3] + '' + match[3]),
            a: convertHexToDecimal(match[4] + '' + match[4]),
            format: named ? "name" : "hex8"
        };
    }
    if ((match = matchers.hex3.exec(color))) {
        return {
            r: parseIntFromHex(match[1] + '' + match[1]),
            g: parseIntFromHex(match[2] + '' + match[2]),
            b: parseIntFromHex(match[3] + '' + match[3]),
            format: named ? "name" : "hex"
        };
    }

    return false;
}

function validateWCAG2Parms(parms) {
    // return valid WCAG2 parms for isReadable.
    // If input parms are invalid, return {"level":"AA", "size":"small"}
    var level, size;
    parms = parms || {"level":"AA", "size":"small"};
    level = (parms.level || "AA").toUpperCase();
    size = (parms.size || "small").toLowerCase();
    if (level !== "AA" && level !== "AAA") {
        level = "AA";
    }
    if (size !== "small" && size !== "large") {
        size = "small";
    }
    return {"level":level, "size":size};
}

// Node: Export function
if (typeof module !== "undefined" && module.exports) {
    module.exports = tinycolor;
}
// AMD/requirejs: Define the module
else if (typeof define === 'function' && define.amd) {
    define(function () {return tinycolor;});
}
// Browser: Expose to window
else {
    window.tinycolor = tinycolor;
}

})(Math);

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
    var tempPct = (temp/255)*(tempRamp.length-1);
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
      var i, ix, iy, frag;

      for(i=0; i<this.terrain.data.length; i+=4){
        ix = Math.floor(i/4) % FG.can.width;
        iy = Math.floor((i/4) / FG.can.width);
        frag = Math.floor(FG.simplex.in2D(ix, iy));

        //altitude
        frag = frag > this.sealevel ? Math.floor(255*(frag-this.sealevel)/(255-this.sealevel)) : 0;
        this.terrain.data[i] = frag;

        //temperature
        if(frag <= this.sealevel){
          this.terrain.data[i+1] = 174 - 46*(1 - frag/this.sealevel);
        }
        else if(frag > this.snowline){
          this.terrain.data[i+1] = 4*(frag-this.snowline)/(255-this.snowline);
        }
        else{
          this.terrain.data[i+1] = 4 + 170 * (1-(frag - this.sealevel)/(this.snowline - this.sealevel));
        }

        this.terrain.data[i+3] = 255;
      }

      //second pass - rain in the blue channel

      //just going to blow rain left to right for now
      for(i=0; i<this.terrain.data.length; i+=4){
        ix = Math.floor(i/4) % FG.can.width;
        iy = Math.floor((i/4) / FG.can.width);
        var ar = this.terrain.data[i];

        if(ar > this.sealevel) {
          var leftRain = 0;

          //reduce by temperature
          var localTemp = this.terrain.data[i+1];
          var tempScale = 1-localTemp/255;

          if(ix > 0){
            var aw = this.terrain.data[i-4];
            var awr = this.terrain.data[i-4+2];

            if(aw > ar){
              leftRain = awr-tempScale*Math.random()*8;
            }
            else{
              leftRain = awr-tempScale*Math.random()*2;
            }
          }

          else if(iy > 0){ //spread from north neighbor if possible
            leftRain = this.terrain.data[i-4*FG.can.width+2];
          }

          else{
            leftRain = Math.random()*255;
          }

          leftRain = Math.round(Math.max(Math.min(255, leftRain), 0));

          this.terrain.data[i+2] = leftRain;
        }
        else{
          this.terrain.data[i+2] = 255;
        }
      }
    },

    getTerrain: function(vec){
      return this.terrain.data[Math.floor((vec.x+vec.y*FG.can.width))*4];
    },

    getTemp: function(vec){
      return this.terrain.data[Math.floor((vec.x+vec.y*FG.can.width))*4 + 1];
    },

    getRain: function(vec){
      return this.terrain.data[Math.floor((vec.x+vec.y*FG.can.width))*4 + 2];
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
    },
    drawRain: function(){
      FG.ctx.putImageData(this.terrain,0,0);
      var terraincolor = FG.ctx.getImageData(0,0,FG.can.width,FG.can.height);
      for(var i=0; i<terraincolor.data.length; i+=4){
        var ar = this.terrain.data[i+2];

        terraincolor.data[i] = 0;
        terraincolor.data[i+1] = 0;
        terraincolor.data[i+2] = ar;
        terraincolor.data[i+3] = 255;
      }
      FG.ctx.putImageData(terraincolor,0,0);
    }
  };

})(window.FG, window.tinycolor);
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