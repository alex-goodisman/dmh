const http = require('http');
const path = require('path');
const fs = require('fs');

const static = {
	'index.html': null,
	'client.js': null,
	'favicon.ico': null,
	'main.css': null,
};
Object.keys(static).forEach(file => {
	static[file] = fs.readFileSync(path.join(__dirname, file));
});
static[''] = static['index.html'];

const newState = require('./state');

let state = newState();
let playerMap = {};

const server = http.createServer((r, s) => {
    let body = '';
   	r.on('data', (chunk) => {
		body += chunk;
	});
	r.on('end', () => {
		const path = r.url.slice(1);
		if (path in static) {
			if (path.endsWith('.js')) {
				s.writeHead(200, {'Content-Type': 'text/javascript'});
			}
			s.write(static[path]);
			s.end();
			return;
		}
		switch (path) {
		case 'reset':
			console.log('hard reset invoked. remove this from the final version');
			state = newState();
			playerMap = {};
			break;
		case 'join':
			if (state.turnPhase === 'over') {
				state = newState();
				playerMap = {};
			}
			try {
				state.addPlayer(body);
				let id;
				// just to be safe, keep rerolling the id in case of duplicates :P
				do {
					id = Math.random().toString().slice(2);
				} while (id in playerMap);
				playerMap[id] = body;
				s.write(id);
				s.end();
			} catch (err) {
				s.writeHead(400);
				s.write(err);
				s.end();
			}
			break;
		case 'leave':
			try {
				if (!(body in playerMap)) {
					throw 'player not in game';
				}
				state.removePlayer(playerMap[body]);
				s.end();
			} catch (err) {
				s.writeHead(400);
				s.write(err);
				s.end();
			}
			break;
		case 'start':
			try {
				if (!(body in playerMap)) {
					throw 'player not in game';
				}
				state.startGame();
				s.end();
			} catch(err) {
				s.writeHead(400);
				s.write(err);
				s.end();
			}
			break;
		case 'state':
			try {
				const st = state.getState(playerMap[body]);
				s.write(JSON.stringify(st));
				s.end();
			} catch (err) {
				s.writeHead(400);
				s.write(err);
				s.end();
			}
			break;
		case 'game':
			try {
				let obj;
				try {
					obj = JSON.parse(body);
				} catch (err) {
					throw 'JSON parse failure';
				}
				if (!obj) {
					throw 'request destructure failure';
				}
				const {player, params} = obj;
				if (!params) {
					throw 'request parameter destructure failure';
				}
				if (!(player in playerMap)) {
					throw 'player not in game';
				}
				state.doAction(playerMap[player], params);
				s.end();
			} catch (err) {
				s.writeHead(400);
				s.write(err);
				s.end();
			}
			break;
		default:
			s.writeHead(404);
			s.write('Not Found');
			s.end();
		}
	});
});

server.listen(8000);
