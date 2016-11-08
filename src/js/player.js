(function(FG, tinycolor){
	'use strict';

	FG.player = {
		position: {
			x: 256,
			y:256,
			z:0
		},
		rotation: Math.random()*Math.PI*2,
		stepSize: 32,
		path:[
		],
		step: function(nx,ny){
			if(nx>=0 && ny>=0){
				this.position.x = nx;
				this.position.y = ny;
			}
			else {
				
				var valid = false;
				while(!valid){
					var dir = this.rotation+Math.sin(Math.random()*Math.PI*2);
					this.rotation = dir;
					var dx = Math.round(this.stepSize*Math.sin(dir) + this.position.x);
					var dy = Math.round(this.stepSize*Math.cos(dir) + this.position.y);
					var ar = FG.worldMap.getTerrain({x: dx, y: dy}) > FG.worldMap.sealevel;
					if(dx >= 0 && dx < FG.can.width && dy >=0 && dy < FG.can.height && ar){
						valid = true;
						this.position.x = dx;
						this.position.y = dy;
					}
				}
			}
			var newpos = {
				temp: FG.worldMap.getTemp(this.position),
				z: FG.worldMap.getTerrain(this.position),
				rain: FG.worldMap.getRain(this.position),
				x: this.position.x,
				y: this.position.y
			};
			this.path.push(newpos);
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
				var entry = '';

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
					entry += 'The air was misty. ';
				}
				else if(pt.rain < opt.rain && pt.rain < 64){
					entry += 'It was dry as a bone. ';
				}

				if(pt.temp > opt.temp){
					entry += 'It felt warmer here. ';
				}
				else {
					entry += 'It felt cooler here. ';
				}
				if(pt.temp === 0){
					entry += 'I tightened my coat around me. The winds were harsh and frigid. ';
				}
				else if(temp > 160){
					entry += 'The heat was unbearable. I wiped my brow. ';
				}

				FG.log(entry);
			}
		}
	};

	function circ(x,y,r){
		FG.ctx.arc(x,y,r,0,Math.PI*2,false);
	}

})(window.FG, window.tinycolor);