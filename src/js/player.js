(function(FG, tinycolor){
	'use strict';

	FG.player = {
		position: {
			x: 256,
			y:256,
			z:0
		},
		stepSize: 32,
		path:[
		],
		place: function(){
			var randPtIndex = Math.round(Math.random()*FG.worldMap.points.length);
			var randPt = FG.worldMap.points[randPtIndex];
			FG.player.position.x = randPt.x;
			FG.player.position.y = randPt.y;
			randPt.visited = true;
			FG.player.path.push(randPt);
		},
		step: function(){
			var unPts = FG.worldMap.getUnvisitedPoints();
			var nextPt = FG.worldMap.findClosest(this.position, unPts);
			this.position.x = nextPt.x;
			this.position.y = nextPt.y;
			nextPt.visited = true;
			this.path.push(nextPt);
		},
		draw: function(){
			FG.ctx.beginPath();
			for(var i=0; i<this.path.length; i++){
				var pt = this.path[i];
				FG.ctx.lineTo(pt.x,pt.y);
				circ(pt.x,pt.y,4);
				FG.ctx.moveTo(pt.x,pt.y);
			}
			FG.ctx.strokeStyle = 'red';
			FG.ctx.stroke();
		},
		log: function(){
			for(var i=1; i<this.path.length; i++){
				var pt = this.path[i];
				var opt = this.path[i-1];
				var entry = 'Day ' + i + ': ';

				if(pt.z > opt.z){
					entry += 'I walked uphill. ';
				}
				else {
					entry += 'I walked downhill. ';
				}
				if(pt.z > FG.worldMap.snowline){
					entry += 'The air was thin, but I could see for miles. ';
				}
				else if(pt.z < FG.worldMap.sealevel + 2){
					entry += 'I could see the water. ';
				}

				if(pt.rain > opt.rain && pt.rain > 224){
					entry += 'The air was thick with mist. ';
				}
				else if(pt.rain < opt.rain && pt.rain < 80){
					entry += 'It was dry as a bone. ';
				}

				if(pt.temp > opt.temp){
					entry += 'It felt warmer here. ';
					if(pt.temp > 160){
						entry += 'Hot, actually. I wiped my brow. ';
					}
				}
				else {
					entry += 'It felt cooler here. ';
					if(pt.temp === 0){
						entry += 'I tightened my coat around me. The winds were harsh and frigid. ';
					}
				}

				var biomass = 255*(pt.temp+pt.rain)/512;
				if(biomass > 160){
					entry += 'The land was lush with wildlife. ';
				}
				else if(biomass > 100){
					entry += 'Various species enjoyed the temperate climate. ';
				}
				else {
					entry += 'Despite the harsh conditions, life managed to survive. ';
				}
				FG.log(entry);
			}
		}
	};

	function circ(x,y,r){
		FG.ctx.arc(x,y,r,0,Math.PI*2,false);
	}

})(window.FG, window.tinycolor);