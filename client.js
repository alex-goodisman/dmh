let state = {};
let myId = '';
let myName = '';

const symbols = {
	c: 9827,
	d: 9826,
	h: 9825,
	s: 9824,
	deck: 9646,
}

function printCard({n, s}) {
	return `${n === 't' ? 10 : `${n}`.toUpperCase()}&#${symbols[s]};`;
}

function nameChanged() {
	const name = document.getElementById('name').value;
	const join = document.getElementById('join');
	if (name === '') {
		join.disabled = true;
		join.title = 'Name cannot be empty';
	} else if (state.hands && name in state.hands) {
		join.disabled = true;
		join.title = 'Name cannot be a duplicate';
	} else if (state.deck && state.deck.length < 4) {
		join.disabled = true;
		join.title = 'Game is full';
	} else if (state.turnPhase !== '') {
		join.disabled = true;
		join.title = 'Game has started';
	} else {
		join.title = '';
		join.disabled = false;
	}
}

async function joinGame() {
	const name = document.getElementById('name');
	const res = await fetch(window.location.origin + '/join', {
		method: 'POST',
		body: name.value,
	});
	if (res.status !== 200) {
		alert(await res.text());
		return;
	}
	myId = await res.text();
	myName = name.value;
	name.style.display = 'none';
	document.getElementById('join').style.display = 'none';
	document.getElementById('leave').style.display = 'inline';
	document.getElementById('start').style.display = 'inline';
	window.addEventListener('beforeunload', beforeUnloadHandler);
	await getState();
}

async function leaveGame() {
	const res = await fetch(window.location.origin + '/leave', {
		method: 'POST',
		body: myId,
	});
	if (res.status !== 200) {
		alert(await res.text());
		return;
	}
	myId = '';
	myName = '';
	document.getElementById('name').style.display = 'inline';
	document.getElementById('join').style.display = 'inline';
	document.getElementById('leave').style.display = 'none';
	document.getElementById('start').style.display = 'none';
	window.removeEventListener('beforeunload', beforeUnloadHandler);
	await getState();
}

async function startGame() {
	const res = await fetch(window.location.origin + '/start', {
		method: 'POST',
		body: myId,
	});
	if (res.status !== 200) {
		alert(await res.text());
		return;
	}
	document.getElementById('start').style.display = 'none';
	await getState();

}

function beforeUnloadHandler(event) {
	leaveGame();
	event.preventDefault();

	event.returnValue = true;
}

async function getState() {
	const res = await fetch(window.location.origin + '/state', {
		method: 'POST',
		body: myId,
	});
	if (res.status !== 200) {
		alert(await res.text());
		return;
	}

	state = await res.json();
	const {deckSize, discard, playerOrder, activePlayer, turnPhase, turnPlayers, playersToReplace, replaceHearts, lossBlockable, hands} = state;

	if (!(myName in hands)) {
		document.getElementById('name').style.display = 'inline';
		document.getElementById('join').style.display = 'inline';
		document.getElementById('leave').style.display = 'none';
		document.getElementById('start').style.display = 'none';
		window.removeEventListener('beforeunload', beforeUnloadHandler);
	} 
	if (turnPhase !== '') {
		document.getElementById('start').style.display = 'none';
	}

	document.getElementById('players').innerHTML = `Turn Order: [${playerOrder.map((player, idx) => idx === activePlayer ? `<b>${player}</b>` : player in hands ? player : `<i>${player}</i>`).join(', ')}]`;
	document.getElementById('hands').innerHTML = Object.keys(hands).map(player => `${player}: [${hands[player].map(({card, visible}) => 'n' in card ? visible ? `<b>${printCard(card)}</b>` : `<i>(${printCard(card)})</i>` : `&#${symbols.deck};`).join(', ')}]`).join('<br/>');

	let phaseMessage = '';
	let subMessage = '';
	switch(turnPhase) {
	case 'action':
		phaseMessage = `${playerOrder[activePlayer]} is choosing an action...`;
		break;
	case 'hands':
		phaseMessage = `${turnPlayers[0]} is choosing a card to reveal`;
		if (turnPlayers.length > 1) {
			subMessage = `${turnPlayers.slice(1).join(', ')} will reveal next`; 
		}
		break;
	case 'toss':
		phaseMessage = `${turnPlayers[0]} is choosing a card to toss`;
		if (turnPlayers.length > 1) {
			subMessage = `${turnPlayers.slice(1).join(', ')} will toss next`; 
		}
		break;
	case 'lose':
		phaseMessage = `${turnPlayers[0]} is losing a life ${lossBlockable ? '' : '(Unavoidable)'}`;
		if (turnPlayers.length > 1) {
			subMessage = `${turnPlayers.slice(1).join(', ')} ${lossBlockable ? 'may' : 'will'} lose next`; 
		}
		break;
	case 'replace':
		phaseMessage = `${turnPlayers[0]} is replacing their cards`;
		if (turnPlayers.length > 1) {
			subMessage = `${turnPlayers.slice(1).join(', ')} will replace next`; 
		}
		break;
	case 'over':
		phaseMessage = turnPlayers.length === 0 ? 'Everybody Loses!' : `${turnPlayers[0]} wins!`;
		break;
	default:
		phaseMessage = 'Game Starting Soon...';
		break;	
	}

	document.getElementById('deck').innerHTML = `Deck: &#${symbols.deck};x${deckSize}`;
	document.getElementById('discard').innerHTML = `Discard: [${discard.map(printCard).join(', ')}]`;
	document.getElementById('phase').innerHTML = phaseMessage;
	document.getElementById('subMessage').innerHTML = subMessage;
	document.getElementById('subSubMessage').innerHTML = playersToReplace.length === 0 ? '' : `Then ${playersToReplace.join(', ')} will replace their cards`;
	document.getElementById('hearts').innerHTML = replaceHearts.length === 0 ? '' : `${replaceHearts.join(', ')} floated hearts, and will need to replace a heart`;
	nameChanged();
}

let stateTimer = null;

function startTimer() {
	getState();
	stateTimer = setInterval(getState, 1000);
}

function stopTimer() {
	clearInterval(stateTimer);
	stateTimer = null;
}

startTimer();
