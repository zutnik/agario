const WebSocket = require("ws");
const uuid = require("uuid");

const players = new Map();
const sockets = new Map();

const maxRooms = 1;
const maxPlayers = 100;
const rooms = [];
const matchDuration = 30000;

const maxFoodCount = 40000;

const worldWidth = 10000;
const worldHeight = 10000;

const chunkCount = 8;
const chunkWidth = worldWidth / chunkCount;
const chunkHeight = worldHeight / chunkCount;

const initialSize = 60;

const server = new WebSocket.Server({ port: 16000 }, () => {
	console.log(`Server is listening on port 16000`);

	for (let i = 0; i < maxRooms; i++) {
		const date = new Date();
		const room = {
			id: i + 1,
			playerCount: 0,
			foodCount: 0,
			chunks: [],
			startTime: date.getTime(),
			gameOver: false,
		};

		const food = [];

		for (let j = 0; j < maxFoodCount; j++) {
			const x = Math.random() * worldWidth * 2 - worldWidth;
			const y = Math.random() * worldHeight * 2 - worldHeight;
			room.foodCount++;
			food.push({
				x,
				y,
				r: 10,
				color: {
					r: Math.floor(Math.random() * 255),
					g: Math.floor(Math.random() * 255),
					b: Math.floor(Math.random() * 255),
				},
			});
		}

		let id = 0;
		for (let x = 0; x < chunkCount * 2; x++) {
			for (let y = 0; y < chunkCount * 2; y++) {
				let chunk = {
					id: id++,
					position: {
						x: 0,
						y: 0,
					},
					players: [],
					food: [],
					neighbours: [],
				};

				chunk.position.x = -worldWidth + x * chunkWidth;
				chunk.position.y = -worldHeight + y * chunkHeight;

				food
					.filter((f) => {
						return chunkContainsPoint(f, chunk);
					})
					.forEach((f) => chunk.food.push(f));
				room.chunks.push(chunk);
			}
		}

		for (let x = 0; x < chunkCount * 2; x++) {
			for (let y = 0; y < chunkCount * 2; y++) {
				let i = y + x * chunkCount * 2;

				if (x > 0) {
					room.chunks[i].neighbours.push(i - chunkCount * 2);
				}
				if (x < chunkCount * 2 - 1) {
					room.chunks[i].neighbours.push(i + chunkCount * 2);
				}
				if (y > 0) {
					room.chunks[i].neighbours.push(i - 1);
					if (x > 0) room.chunks[i].neighbours.push(i - chunkCount * 2 - 1);
					if (x < chunkCount * 2 - 1)
						room.chunks[i].neighbours.push(i + chunkCount * 2 - 1);
				}
				if (y < chunkCount * 2 - 1) {
					room.chunks[i].neighbours.push(i + 1);
					if (x > 0) room.chunks[i].neighbours.push(i - chunkCount * 2 + 1);
					if (x < chunkCount * 2 - 1)
						room.chunks[i].neighbours.push(i + chunkCount * 2 + 1);
				}
			}
		}
		rooms.push(room);
	}
});

server.on("connection", (socket, req) => {
	console.log(`New connection`);

	socket.on("message", (data) => {
		const json = JSON.parse(data);

		if (json.type === "connect") {
			const id = uuid.v4();
			sockets.set(id, socket);

			const playerData = {
				username: json.username,
				chunkId: 0,
				position: {
					x: Math.random() * worldWidth * 2 - worldWidth,
					y: Math.random() * worldHeight * 2 - worldHeight,
				},
				size: initialSize,
				color: {
					r: Math.floor(Math.random() * 255),
					g: Math.floor(Math.random() * 255),
					b: Math.floor(Math.random() * 255),
				},
			};
			players.set(id, playerData);

			const room = rooms.find((r) => r.playerCount < maxPlayers);
			if (!room) return;
			const chunks = [];

			let found = room.chunks.find((chunk) =>
				chunkContainsPoint(playerData.position, chunk)
			);

			if (found) {
				playerData.chunkId = found.id;
				found.players.push(id);
				room.playerCount++;
				found.neighbours.forEach((n) => chunks.push(room.chunks[n]));
				chunks.push(found);
			}

			socket.send(
				JSON.stringify({
					type: "roomFound",
					roomId: room.id,
					chunks,
					playerID: id,
					matchDuration,
					...playerData,
				})
			);
		}

		if (json.type === "positionChanged") {
			if (!players.has(json.id) || rooms[json.roomId - 1].gameOver) return;
			const playerData = players.get(json.id);
			const chunk = rooms[json.roomId - 1].chunks[playerData.chunkId];
			if (!chunkContainsPoint(playerData.position, chunk)) {
				let found = rooms[json.roomId - 1].chunks.find((c) =>
					chunkContainsPoint(playerData.position, c)
				);

				if (found) {
					playerData.chunkId = found.id;
					chunk.players.splice(chunk.players.indexOf(json.id), 1);
					found.players.push(json.id);

					const chunks = [];
					found.neighbours.forEach((n) =>
						chunks.push(rooms[json.roomId - 1].chunks[n])
					);
					chunks.push(found);
				}
			}
			players.set(json.id, { ...playerData, position: json.newPos });
		}

		if (json.type === "sizeChanged") {
			const playerData = players.get(json.id);
			const chunk = rooms[json.roomId - 1].chunks[playerData.chunkId];
			playerData.size = json.newSize;
			players.set(json.id, playerData);

			let chunks = [
				chunk,
				...chunk.neighbours.map((n) => rooms[json.roomId - 1].chunks[n]),
			];

			for (let c of chunks) {
				for (let i = c.food.length - 1; i >= 0; i--) {
					if (json.food.x === c.food[i].x && json.food.y === c.food[i].y) {
						c.food.splice(i, 1);
						rooms[json.roomId - 1].foodCount--;
						return;
					}
				}
			}
		}

		if (json.type === "playerEaten") {
			if (!players.has(json.eaten) || rooms[json.roomId - 1].gameOver) return;
			players.delete(json.eaten);
			sockets.get(json.eaten).send(
				JSON.stringify({
					type: "eaten",
					eater: players.get(json.eater).username,
				})
			);
			sockets.delete(json.eaten);
			const room = rooms[json.roomId - 1];
			let found = room.chunks.find((chunk) =>
				chunk.players.includes(json.eaten)
			);
			if (found) {
				found.players.splice(found.players.indexOf(json.id), 1);
				room.playerCount--;
				return;
			}
		}

		if (json.type === "close") {
			if (!sockets.has(json.id)) return;
			players.delete(json.id);
			sockets.get(json.id).close();
			sockets.delete(json.id);
			const room = rooms[json.roomId - 1];
			let found = room.chunks.find((chunk) => chunk.players.includes(json.id));
			if (found) {
				found.players.splice(found.players.indexOf(json.id), 1);
				room.playerCount--;
				return;
			}
		}
	});
});

const resetRoom = (roomId) => {
	const date = new Date();
	let room = rooms[roomId - 1];
	room = {
		...room,
		foodCount: 0,
		startTime: date.getTime(),
		timeLeft: date.getTime(),
		gameOver: false,
	};

	const food = [];

	for (let j = 0; j < maxFoodCount; j++) {
		const x = Math.random() * worldWidth * 2 - worldWidth;
		const y = Math.random() * worldHeight * 2 - worldHeight;
		room.foodCount++;
		food.push({
			x,
			y,
			r: 10,
			color: {
				r: Math.floor(Math.random() * 255),
				g: Math.floor(Math.random() * 255),
				b: Math.floor(Math.random() * 255),
			},
		});
	}

	let chunks = [];

	for (let chunk of room.chunks) {
		chunk = {
			id: chunk.id,
			position: chunk.position,
			players: [],
			food: [],
			neighbours: chunk.neighbours,
		};

		food
			.filter((f) => chunkContainsPoint(f, chunk))
			.forEach((f) => chunk.food.push(f));
		chunks.push(chunk);
	}

	room.chunks = chunks;

	for (const [id, playerData] of players.entries()) {
		let data = playerData;
		data = {
			...playerData,
			chunkId: 0,
			position: {
				x: Math.random() * worldWidth * 2 - worldWidth,
				y: Math.random() * worldHeight * 2 - worldHeight,
			},
			size: initialSize,
		};

		players.set(id, data);

		chunks = [];

		let found = room.chunks.find((chunk) =>
			chunkContainsPoint(data.position, chunk)
		);

		if (found) {
			data.chunkId = found.id;
			found.players.push(id);
			room.playerCount++;
			found.neighbours.forEach((n) => chunks.push(room.chunks[n]));
			chunks.push(found);
		}

		chunks = chunks.map((c) => {
			return {
				...c,
				players: c.players.map((p) => {
					return { ...players.get(p), id: p };
				}),
			};
		});

		sockets.get(id).send(
			JSON.stringify({
				type: "roomReset",
				chunks,
				...data,
			})
		);
	}

	rooms[roomId - 1] = room;
};

setInterval(() => {
	if (sockets.keys().next) {
		rooms.forEach((room) => {
			if (room.gameOver) return;
			const food = [];
			for (let i = room.foodCount; i < maxFoodCount; i++) {
				const x = Math.random() * worldWidth * 2 - worldWidth;
				const y = Math.random() * worldHeight * 2 - worldHeight;
				room.foodCount++;
				food.push({
					x,
					y,
					r: 10,
					color: {
						r: Math.floor(Math.random() * 255),
						g: Math.floor(Math.random() * 255),
						b: Math.floor(Math.random() * 255),
					},
				});
			}

			room.chunks.forEach((chunk) => {
				food
					.filter((f) => chunkContainsPoint(f, chunk))
					.forEach((f) => chunk.food.push(f));
				chunk.players.forEach((playerId) => {
					let chunks = [chunk, ...chunk.neighbours.map((n) => room.chunks[n])];
					chunks = chunks.map((c) => {
						return {
							...c,
							players: c.players.map((p) => {
								return { ...players.get(p), id: p };
							}),
						};
					});
					const socket = sockets.get(playerId);
					if (socket)
						socket.send(
							JSON.stringify({
								type: "tick",
								chunks,
							})
						);
				});
			});
		});
	}
}, 100);

setInterval(() => {
	const date = new Date();
	for (let room of rooms) {
		if (!room.gameOver) {
			if (date.getTime() - room.startTime >= matchDuration) {
				room.startTime = date.getTime() - 30000;
				room.gameOver = true;
				setTimeout(() => {
					resetRoom(room.id);
				}, 10000);

				let results = [];
				for (let chunk of room.chunks) {
					for (let playerId of chunk.players) {
						let player = players.get(playerId);
						results.push({ username: player.username, size: player.size });
					}
				}

				for (let chunk of room.chunks) {
					for (let playerId of chunk.players) {
						let socket = sockets.get(playerId);
						socket.send(
							JSON.stringify({
								type: "gameOver",
								results,
							})
						);
					}
				}
			}
		}

		for (let chunk of room.chunks) {
			for (let playerId of chunk.players) {
				let timeLeft = matchDuration - (date.getTime() - room.startTime);
				const socket = sockets.get(playerId);
				if (socket)
					socket.send(
						JSON.stringify({
							type: "timeUpdate",
							timeLeft,
						})
					);
			}
		}
	}
}, 1000);

const chunkContainsPoint = (point, chunk) => {
	return (
		point.x >= chunk.position.x &&
		point.y >= chunk.position.y &&
		point.x <= chunk.position.x + chunkWidth &&
		point.y <= chunk.position.y + chunkHeight
	);
};
