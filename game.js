let zoom = 0;
let food = [];
let players = new Map();
let playerUsernames = new Map();

let ws;
let socketId;
let roomId;

let player;
let username;

let maxMatchDuration;
let timeLeft;
let timeDiv, resultsDiv;

let reconnect = false;

function connect() {
	ws = new WebSocket("ws://localhost:16000");

	ws.onerror = (e) => {
		console.log("Error occured. Reload page to reconnect");
	};

	ws.onmessage = (e) => {
		const data = JSON.parse(e.data);

		if (data.type === "roomFound") {
			socketId = data.playerID;
			roomId = data.roomId;

			player = new Blob(
				data.position.x,
				data.position.y,
				data.size,
				data.color
			);

			for (let chunk of data.chunks) {
				for (let f of chunk.food) {
					food.push(new Blob(f.x, f.y, f.r, f.color));
				}
			}
		}

		if (data.type === "roomReset") {
			timeDiv.show();
			if (resultsDiv) resultsDiv.remove();
			player = new Blob(
				data.position.x,
				data.position.y,
				data.size,
				data.color
			);

			food = [];
			players.clear();
			playerUsernames.clear();
			for (let chunk of data.chunks) {
				for (let p of chunk.players) {
					if (p.id !== socketId) {
						players.set(
							p.id,
							new Blob(p.position.x, p.position.y, p.size, p.color)
						);
						playerUsernames.set(p.id, p.username);
					}
				}

				for (let f of chunk.food) {
					let blob = new Blob(f.x, f.y, f.r, f.color);
					food.push(blob);
				}
			}
		}

		if (data.type === "tick") {
			food = [];
			players.clear();
			playerUsernames.clear();
			for (let chunk of data.chunks) {
				for (let p of chunk.players) {
					if (p.id !== socketId) {
						if (!p.position) continue;
						players.set(
							p.id,
							new Blob(p.position.x, p.position.y, p.size, p.color)
						);
						playerUsernames.set(p.id, p.username);
					}
				}

				for (let f of chunk.food) {
					let blob = new Blob(f.x, f.y, f.r, f.color);
					food.push(blob);
				}
			}
		}

		if (data.type === "timeUpdate") {
			const time = Math.round(data.timeLeft / 1000) * 1000;

			let seconds = time / 1000;
			seconds = seconds % 3600;
			const minutes = parseInt(seconds / 60);
			seconds = seconds % 60;

			timeLeft = `${minutes >= 10 ? minutes : `0${minutes}`}:${
				seconds >= 10 ? seconds : `0${seconds}`
			}`;

			timeDiv.html(timeLeft);
		}

		if (data.type === "eaten") {
			player = undefined;
			ws.close();

			let eatenDiv = createDiv();
			eatenDiv.size(300, 100);
			eatenDiv.center();
			eatenDiv.style("background-color", "#fff");
			eatenDiv.style("display", "flex");
			eatenDiv.style("flex-direction", "column");
			eatenDiv.style("align-items", "center");
			eatenDiv.style("justify-content", "center");
			eatenDiv.style("border", "3px solid black");
			eatenDiv.style("border-radius", "10%");
			eatenDiv.style("background-color", "#ab9d9d");

			let span = createSpan(`You have been eaten by ${data.eater}`);
			eatenDiv.child(span);

			let button = createButton("Click here to restart");
			button.style("margin-top", "15px");
			button.mouseClicked(() => {
				connect();
				reconnect = true;
				eatenDiv.remove();
			});
			eatenDiv.child(button);
		}

		if (data.type === "gameOver") {
			timeDiv.hide();

			resultsDiv = createDiv();
			resultsDiv.size(400, 300);
			resultsDiv.center();
			resultsDiv.style("background-color", "#fff");
			resultsDiv.style("display", "flex");
			resultsDiv.style("flex-direction", "column");
			resultsDiv.style("padding-left", "20px");
			resultsDiv.style("padding-top", "20px");
			resultsDiv.style("border", "3px solid black");
			resultsDiv.style("border-radius", "10%");
			resultsDiv.style("background-color", "#ab9d9d");

			const results = data.results.sort((a, b) => a.size - b.size);

			for (let i = 0; i < results.length; i++) {
				let span = createSpan(
					`${i + 1}. ${results[i].username} ${results[i].size}`
				);

				span.style("padding-top", "5px");
				resultsDiv.child(span);
			}
		}
	};

	ws.onopen = () => {
		if (reconnect) {
			ws.send(
				JSON.stringify({
					type: "connect",
					username,
				})
			);
			reconnect = false;
		}
	};
}

function setup() {
	createCanvas(window.innerWidth, window.innerHeight);
	connect();

	timeDiv = createDiv();
	timeDiv.style("position", "absolute");
	timeDiv.style("top", "10px");
	timeDiv.style("left", "30px");
	timeDiv.style("display", "flex");
	timeDiv.style("align-items", "center");
	timeDiv.style("justify-content", "center");
	timeDiv.style("color", "#fff");
	timeDiv.style("font-size", "40px");
	timeDiv.size(100, 50);

	let userDiv = createDiv();
	userDiv.size(300, 100);
	userDiv.center();
	userDiv.style("background-color", "#fff");
	userDiv.style("display", "flex");
	userDiv.style("flex-direction", "column");
	userDiv.style("align-items", "center");
	userDiv.style("justify-content", "center");
	userDiv.style("border", "3px solid black");
	userDiv.style("border-radius", "5%");
	userDiv.style("background-color", "#ab9d9d");

	let input = createInput();
	userDiv.child(createSpan("Enter your username: "));
	userDiv.child(input);

	let button = createButton("Start!");
	button.style("margin-top", "15px");
	button.mouseClicked(() => {
		username = input.value();
		if (username === "") return;
		ws.send(
			JSON.stringify({
				type: "connect",
				username,
			})
		);
		userDiv.remove();
	});
	userDiv.child(button);
}

function draw() {
	background(127);
	if (!player || ws.readyState !== 1) return;

	translate(width / 2, height / 2);
	zoom = lerp(zoom, 64 / player.r, 0.07);
	scale(zoom);
	translate(-player.pos.x, -player.pos.y);

	for (let i = food.length - 1; i >= 0; i--) {
		let f = food[i];
		f.draw();
		if (player.eats(f)) {
			food.splice(i, 1);
			ws.send(
				JSON.stringify({
					type: "sizeChanged",
					roomId,
					id: socketId,
					newSize: player.r,
					food: { x: f.pos.x, y: f.pos.y },
				})
			);
		}
	}

	for (const [id, p] of players.entries()) {
		p.draw();
		fill(0);
		text(playerUsernames.get(id), p.pos.x, p.pos.y);
		textAlign(CENTER);
		textSize(p.r / 4, 10);

		if (player.eats(p)) {
			ws.send(
				JSON.stringify({
					type: "playerEaten",
					roomId,
					eater: socketId,
					eaten: id,
				})
			);
			players.delete(id);
		}
	}

	player.update();
	player.draw();
	fill(0);
	text(username, player.pos.x, player.pos.y);
	textAlign(CENTER);
	textSize(player.r / 4, 10);
}

setInterval(() => {
	if (ws.readyState === 1 && player) {
		ws.send(
			JSON.stringify({
				type: "positionChanged",
				id: socketId,
				roomId,
				newPos: {
					x: player.pos.x,
					y: player.pos.y,
				},
			})
		);
	}
}, 100);

setInterval(() => {}, 1000);

window.onbeforeunload = () =>
	ws.send(JSON.stringify({ type: "close", id: socketId, roomId }));
