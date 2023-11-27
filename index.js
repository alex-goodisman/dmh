const http = require('http');
const newState = require('./state');
const state = newState();
state.addPlayer('me');
state.addPlayer('you');
state.startGame();
console.dir(state.getState('me'), {depth: null});

const server = http.createServer((r, s) => {
	// TODO filter on a path prefix for commands,
	// so the root can fetch an html.
	// TODO build frontend.
    let body = '';
   	r.on('data', (chunk) => {
		body += chunk;
	});
	r.on('end', () => {
		try {
			state.doAction(body);
			console.log('did');
			console.dir(state.getState('me'), {depth: null});
		} catch (err) {
			console.log('err', err);
		}
		s.write('OK'); 
		s.end(); 
	});
});

server.listen(8000);
