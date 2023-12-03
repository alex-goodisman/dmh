const https = require('https');
const path = require('path');
const fs = require('fs');
const qs = require('querystring');

const cardImages = Object.fromEntries(['back', ...['c', 'd', 'h', 's'].flatMap(s => [...Array(10).keys(), 't', 'j', 'q', 'k', 'a'].slice(2).map(n => n + s))].map(k => [`${k}.png`, fs.readFileSync(path.join(__dirname, `cards/${k}.png`))]));

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
let playerTimers = {};

const server = https.createServer({
	key: fs.readFileSync(path.join(__dirname, 'private.key')),
	cert: fs.readFileSync(path.join(__dirname, 'certificate.crt')),
}, (r, s) => {
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
		if (path.startsWith('cards/')) {
			const img = cardImages[path.substring(6)];
			if (img != null) {
				s.writeHead(200, {'Content-Type': 'image/png'});
				s.write(img);
				s.end();
				return;
			}
		}
		s.setHeader('Access-Control-Allow-Origin', '*');
		if (path.startsWith('return?')) {
			const query = qs.parse(path.slice(path.indexOf('?') + 1));
			if (query.source) {
				s.writeHead(302, {
					'Location': decodeURIComponent(query.source),
				});
				s.end();
				return;
			}
		}
		switch (path) {
		case 'join':
			if (state.turnPhase === 'over') {
				state = newState();
				playerMap = {};
				Object.keys(playerTimers).forEach(id => {
					clearTimeout(playerTimers[id]);
				});
				playerTimers = {};
			}
			try {
				state.addPlayer(body);
				let id;
				// just to be safe, keep rerolling the id in case of duplicates :P
				do {
					id = Math.random().toString().slice(2);
				} while (id in playerMap);
				playerMap[id] = body;
				playerTimers[id] = setTimeout(() => {
					if (id in playerMap) {
						state.removePlayer(playerMap[id]);
						delete playerMap[id];
						delete playerTimers[id];
					}
				}, 10000);
				s.write(id);
				s.end();
			} catch (err) {
				if (err instanceof Error) {
					console.log(err);
				}
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
				delete playerMap[body];
				clearTimeout(playerTimers[body]);
				delete playerTimers[body];
				s.end();
			} catch (err) {
				if (err instanceof Error) {
					console.log(err);
				}
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
				if (err instanceof Error) {
					console.log(err);
				}
				s.writeHead(400);
				s.write(err);
				s.end();
			}
			break;
		case 'state':
			try {
				clearTimeout(playerTimers[body]);
				playerTimers[body] = setTimeout(() => {
					if (body in playerMap) {
						state.removePlayer(playerMap[body]);
						delete playerMap[body];
						delete playerTimers[body];
					}
				}, 10000);
				const st = state.getState(playerMap[body]);
				s.write(JSON.stringify(st));
				s.end();
			} catch (err) {
				if (err instanceof Error) {
					console.log(err);
				}
				console.log(err);
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
				if (err instanceof Error) {
					console.log(err);
				}
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
