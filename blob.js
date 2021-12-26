class Blob {
	constructor(x, y, r, color) {
		this.pos = createVector(x, y);
		this.r = r;
		this.vel = createVector(0, 0);
		this.color = color;
	}

	update() {
		let vel = createVector(mouseX - width / 2, mouseY - height / 2);
		vel.setMag(3);
		this.vel.lerp(vel, 0.1);
		this.pos.add(this.vel);
	}

	draw() {
		fill(this.color.r, this.color.g, this.color.b);
		noStroke();
		ellipse(this.pos.x, this.pos.y, this.r * 2, this.r * 2);
	}

	eats(other) {
		let d = p5.Vector.dist(this.pos, other.pos);
		if (d + other.r < this.r + 20 && this.r > other.r + 10) {
			let r = other.r;
			let sum = PI * this.r * this.r + PI * r * r * 0.6;
			this.r = sqrt(sum / PI);
			return true;
		}

		return false;
	}
}
