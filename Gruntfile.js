module.exports = function(grunt) {
  require('load-grunt-tasks')(grunt);

  grunt.initConfig({
    pkg: grunt.file.readJSON("package.json"),

    clean: {
      default: [
        '.tmp/*',
        'dist/*'
      ]
    },

    concurrent: {
      build: [
        'connect:server',
        'watch'
      ]
    },

    copy: {
      default: {
        files: [{
          expand: true,
          dot: true,
          cwd: 'src',
          dest: 'dist',
          src: [
            '**/*.{ico,txt,json}',
            'styles.css',
            'index.html',
            'img/**/*.{gif,svg,png,jpg}'
          ]
        }]
      }
    },


    connect: {
      server: {
        options: {
          port: 3333,
          hostname: '*',
          base: 'dist',
          keepalive: true,
          livereload: true,
          middleware: function(connect, options, middlewares) {
            require('connect-livereload')();
            middlewares.unshift(function(req, res, next) {
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Access-Control-Allow-Methods', '*');
              next();
            });
            return middlewares;
          }
        }
      }
    },

    concat: {
      default: {
      src: [
        'node_modules/seedrandom/seedrandom.js',
        'node_modules/fast-simplex-noise/main.js',
        'src/js/vendor/tinycolor.js',
        'src/js/random.js',
        'src/js/world-map.js',
        'src/js/player.js',
        'src/js/app.js',
      ],
      dest: 'dist/built.js'
      }
    },

    watch: {
      options: {
        livereload: true
      },
      css: {
        files: ['src/*.css'],
        tasks: ['copy']
      },
      js: {
        files: ['src/js/**/*.js', 'src/js/**/*.html'],
        tasks: ['concat']
      },
      src: {
        files: [
          'src/index.html',
          'src/img/**/*.{gif,svg,png,jpg}'
        ],
        tasks: ['copy']
      }
    }
  });

  grunt.registerTask('default', ['build', 'concurrent:build']);

  grunt.registerTask('build', ['clean', 'copy', 'concat']);
};