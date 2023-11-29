// storage for serverside gamestate
let state = {};
// secret identifier for my player (to authenticate)
let myId = '';
// my public name, as it appears in the game state
let myName = '';
// client-internal state such as what buttons are showing
let clientState = '';
// client-internal state specifically for if the join button is disabled right now. only exists for the enter keypress handler
let joinDisabled = true;
// client-internal state for the selection of card replacements
let selection = [];

// hardcode the server so we can serve the client page from anywhere i.e. github pages
// to use the server that served you the page, set this to `window.location.origin` in the browser console
let server = 'http://157.230.52.255:8000';

// unicode escapes for suits and the card symbol
const symbols = {
	c: 9827,
	d: 9826,
	h: 9825,
	s: 9824,
	deck: 9646,
}

// convenience method to render card data as unicode
function printCard({n, s}) {
	return `${n === 't' ? 10 : `${n}`.toUpperCase()}&#${symbols[s]};`;
}

// convenience method to render card & visibliity data
function printCardInHand({card, visible}) {
	return 'n' in card ? visible ? `<b>${printCard(card)}</b>` : `<i>(${printCard(card)})</i>` : `&#${symbols.deck};`;
}

// event handler for typing into the name field. should disable the join button if the name's invalid
function nameChanged() {
	const name = document.getElementById('name').value;
	const join = document.getElementById('join');
	let cantJoinReason = '';
	if (name === '') {
		cantJoinReason = 'Name cannot be empty';
	} else if (state.hands && name in state.hands && state.turnPhase !== 'over') {
		cantJoinReason = 'Name cannot be a duplicate';
	} else if (state.deck && state.deck.length < 4) {
		cantJoinReason = 'Game is full';
	} else if (state.playerOrder.length !== 0 && state.turnPhase !== 'over') {
		cantJoinReason = 'Game has started';
	}

	joinDisabled = cantJoinReason !== ''; 
	join.disabled = joinDisabled;
	join.title = cantJoinReason;
}

// keypress handler for input field so you can hit enter
async function inputKeyPressed(evt) {
	if (evt.key === 'Enter') {
		evt.preventDefault();
		// check the cached state for whether the button is on, and only accept 'Enter' if would also have accepted 'click'
		if(!joinDisabled) {
			await joinGame();
		}
	}
}

// onclick handler for join button
async function joinGame() {
	const name = document.getElementById('name');
	const res = await fetch(server + '/join', {
		method: 'POST',
		body: name.value,
	});
	if (res.status !== 200) {
		alert(await res.text());
		return;
	}
	// set name state
	myId = await res.text();
	myName = name.value;
	await getState();
}

// onclick handler for leave button
async function leaveGame() {
	const res = await fetch(server + '/leave', {
		method: 'POST',
		body: myId,
	});
	if (res.status !== 200) {
		alert(await res.text());
		return;
	}
	// clear name state
	myId = '';
	myName = '';
	await getState();
}

// onclick handler for start game button
async function startGame() {
	const res = await fetch(server + '/start', {
		method: 'POST',
		body: myId,
	});
	if (res.status !== 200) {
		alert(await res.text());
		return;
	}
	// no clientside state to set here. will be set by the timer
	await getState();

}

//onclick handler for the ahod button. need to confirm cards so its UI state only
async function handsStart() {
	clientState = 'hands';
	await getState();
}

//onclick handler for the toss button. need to confirm cards so its UI state only
async function tossStart() {
	clientState = 'toss';
	await getState();
}

//onclick handler for the card buttons. depends on client state.
//for ahod, toss, and lose lifes, we can send to server immediately.
// for replace, we have to make pseudo radio buttons
// idx is which card was clicked
async function cardConfirm(index) {
	switch(state.turnPhase) {
	case 'action':
		if (clientState === 'toss' || clientState === 'hands') {
			const res = await fetch(server + '/game', {
				method: 'POST',
				body: JSON.stringify({
					player: myId,
					params: {
						action: `call_${clientState}`, // this is why the client states match the server states.
						index,
					},
				}),
			});
			if (res.status !== 200) {
				alert(await res.text());
				return;
			}
		}
		break;
	case 'hands':
	case 'toss':
	case 'lose':
		if (state.turnPlayers[0] === myName) {
			const res = await fetch(server + '/game', {
				method: 'POST',
				body: JSON.stringify({
					player: myId,
					params: {
						action: state.turnPhase === 'lose' ? 'lose_life' : `continue_${state.turnPhase}`,
						index,
					},
				}),
			});
			if (res.status !== 200) {
				alert(await res.text());
				return;
			}
			break;
		}
		// if it isn't your turn but buttons are up, it must be pre-picking. so we can "fall through" the switch case to the replace case.
		// (this should only happen in lose life state).
	case 'replace':
		selection[index] = !selection[index];
		break;
	}
	// no matter what we were doing, we should probably reup the state.
	await getState();
}


async function replaceConfirm() {
	const res = await fetch(server + '/game', {
		method: 'POST',
		body: JSON.stringify({
			player: myId,
			params: {
				action: 'continue_replace',
				indices: selection.map((selected, idx) => selected ? idx : -1).filter(idx => idx !== -1),
			},
		}),
	});
	if (res.status !== 200) {
		alert(await res.text());
		return;
	}
	// no state handling here either, timer will get it
	await getState();
}

// onclick handler for the shoot button. need to confirm target so its UI state only
async function shootStart() {
	clientState = 'target';
	await getState();
}

// onclick handler for the target buttons.
// now we have the target we can send to the server
async function shootConfirm(target) {
	const res = await fetch(server + '/game', {
		method: 'POST',
		body: JSON.stringify({
			player: myId,
			params: {
				action: 'call_shoot',
				target,
			},
		}),
	});
	if (res.status !== 200) {
		alert(await res.text());
		return;
	}
	// no state handling here either, timer will get it
	await getState();
}

// onclick handler for the swordfight button
// swordfight has no parameters so it calls instantly to the server
async function callFight() {
	const res = await fetch(server + '/game', {
		method: 'POST',
		body: JSON.stringify({
			player: myId,
			params: {
				action: 'call_fight',
			},
		}),
	});
	if (res.status !== 200) {
		alert(await res.text());
		return;
	}
	// no state handling here either, timer will get it
	await getState();
}

// onclick handler for the cancel button. just reset the UI
async function cancel() {
	clientState = '';
	await getState();
}

// called by the timer and whenever we do anything. refetch the whole game state from the server. it's small
async function getState() {
	const res = await fetch(server + '/state', {
		method: 'POST',
		body: myId,
	});
	if (res.status !== 200) {
		alert(await res.text());
		return;
	}

	// store state and destructure
	state = await res.json();
	const {deckSize, discard, playerOrder, activePlayer, turnPhase, turnPlayers, playersToReplace, replaceHearts, lossBlockable, hands, log} = state;

	// first thing after getting the server reply is fixup the client state if it doesnt match the server somehow.
	// clientstates are states where the UI needs to change in response to a user action without changing the game state.
	// this is hands, toss, and shoot, and then only their initial action calls.
	// for all the continue_x actions, those can derive the UI state from the server gamestate. Same for lose_life.
	// for hands/toss, when you click the button, we need to show card buttons.
	// for shoot, when you click the button, we need to show target buttons.
	// in both cases, we need to show the back button that clears the client state.
	// all of these are only allowed during your turn's action picking phase.

	if (clientState !== '' && (turnPhase !== 'action' || playerOrder[activePlayer] !== myName)) {
		clientState = '';
	}


	// handle control buttons only appearing at the right time
	document.getElementById('name').style.display = ((myName in hands) && turnPhase !== 'over') ? 'none' : 'inline';
	document.getElementById('join').style.display = ((myName in hands) && turnPhase !== 'over') ? 'none' : 'inline';
	document.getElementById('leave').style.display = (myName in hands) ? 'inline' : 'none';
	document.getElementById('start').style.display = ((myName in hands) && playerOrder.length === 0) ? 'inline' : 'none';

	// show action buttons if the game is underway, even if it's not your turn. clientstate also has to be base (not picking parameters).
	document.getElementById('reveal').style.display = ((myName in hands) && playerOrder.length !== 0 && clientState === '' && turnPhase !== 'over') ? 'inline' : 'none';
	document.getElementById('toss').style.display = ((myName in hands) && playerOrder.length !== 0 && clientState === '' && turnPhase !== 'over') ? 'inline' : 'none';
	document.getElementById('shoot').style.display = ((myName in hands) && playerOrder.length !== 0 && clientState === '' && turnPhase !== 'over') ? 'inline' : 'none';
	document.getElementById('fight').style.display = ((myName in hands) && playerOrder.length !== 0 && clientState === '' && turnPhase !== 'over') ? 'inline' : 'none'; 
	// show cancel button if and only if we ARE picking parameters
	document.getElementById('cancel').style.display = clientState === '' ? 'none' : 'inline';

	// disabling the buttons
	// set each one to a disabled reason, then disable the ones that have a reason. (reason shown in tooltip)
	// the last applicable reason will be shown. no particular order
	let cantReasons = {
		reveal: '',
		toss: '',
		shoot: '',
		fight: '',
	};
	Object.keys(cantReasons).forEach(action => {
		// check turn phase
		if (turnPhase !== 'action') {
			cantReasons[action] = 'No actions right now';
		}
		// check turn
		if (playerOrder[activePlayer] !== myName) {
			cantReasons[action] = 'Not your turn';
		}
		// backup check to prevent spectators from influencing the game
		if (!(myName in hands)) {
			cantReasons[action] = 'Not in game';
		}
		// special rules for ahod, you cant call it if every card is already revealed (except the anchor)
		if (action === 'reveal' && myName in hands && hands[myName].every(({visible}, idx) => visible || (idx === 0))) {
			cantReasons.reveal = 'All cards already revealed';
		}
		// life restriction for ahod
		if (action === 'reveal' && myName in hands && hands[myName].length <= 2) {
			cantReasons.reveal = 'Not allowed with less than 3 lives';
		}
		// life restriction for toss
		if (action === 'toss' && myName in hands && hands[myName].length <= 1) {
			cantReasons.toss = 'Not allowed with less than 2 lives';
		}
		// player count restriction for swordfight
		if (action === 'fight' && Object.keys(hands).length <= 2) {
			cantReasons.fight = 'Not allowed with less than 3 players';
		}

		document.getElementById(action).title = cantReasons[action];
		document.getElementById(action).disabled = cantReasons[action] !== '';
	})

	// information section

	// list players in turn order. dead players italic. active player bold.
	document.getElementById('players').innerHTML = `Turn Order: [${playerOrder.map((player, idx) => player in hands ? idx === activePlayer ? `<b>${player}</b>` : player : `<i>${player}</i>`).join(', ')}]`;
	// list players' hands.
	// your hand you can see all of, cards face down will be italic parenthesized.
	// other players card face down are unknown so its just a rectangle. (server doesn't even send them so if you're reading my code, you can't cheat)
	// anyone's faceup cards will be bolded.
	// player names in the hands section are buttons so you can click on them to shoot them, but css turns off the button style.
	// your own cards are also buttons.
	document.getElementById('hands').innerHTML = Object.keys(hands).map(player => `<button id=shoot_${player} class=target_button disabled onclick=\"shootConfirm('${player}');\">${player}</button>: [${hands[player].map((info, idx) => player === myName ? `<button id=hand_${idx} class=card_button disabled onclick=\"cardConfirm(${idx});\">${printCardInHand(info)}</button>` : printCardInHand(info)).join(', ')}]${player === myName ? '<button id=submit style="display:none;" disabled onclick=\"replaceConfirm();\">Submit</button>' : ''}`).join('<br/>');

	// there are potentially 4 messages we need to include to describe the game state. these are:
	// 1 turn phase and applicable player (may or may not be active player, which is why they gets its own display in the player order section)
	// 2 subsequent players for the same phase
	// 3 if current phase is lifeloss, show who will be replacing cards after the lifeloss is over
	// 4 if anyone floated hearts this turn and hasnt yet replaced their cards, list them separately so they/others know they will have to replace a heart

	// messages are different based on which phase it is, and whether the player in question is you.
	let phaseMessage = '&nbsp;';
	let subMessage = '&nbsp;';
	switch(turnPhase) {
	case 'action':
		phaseMessage = playerOrder[activePlayer] === myName ? 'Choose an action...' : `${playerOrder[activePlayer]} is choosing an action...`;
		break;
	case 'hands':
		phaseMessage = turnPlayers[0] === myName ? 'Choose a card to reveal' : `${turnPlayers[0]} is choosing a card to reveal`;
		if (turnPlayers.length > 1) {
			subMessage = `${turnPlayers.slice(1).join(', ')} will reveal next`; 
		}
		break;
	case 'toss':
		phaseMessage = turnPlayers[0] === myName ? 'Choose a card to toss' : `${turnPlayers[0]} is choosing a card to toss`;
		if (turnPlayers.length > 1) {
			subMessage = `${turnPlayers.slice(1).join(', ')} will toss next`; 
		}
		break;
	case 'lose':
		phaseMessage = turnPlayers[0] === myName ? `Lose a life${lossBlockable ? '' : ' (Unavoidable)'}!` : `${turnPlayers[0]} is losing a life${lossBlockable ? '' : ' (Unavoidable)'}`;
		if (turnPlayers.length > 1) {
			subMessage = `${turnPlayers.slice(1).join(', ')} ${lossBlockable ? 'may' : 'will'} lose next`; 
		}
		break;
	case 'replace':
		phaseMessage = turnPlayers[0] === myName ? 'Replace your cards' : `${turnPlayers[0]} is replacing their cards`;
		if (turnPlayers.length > 1) {
			subMessage = `${turnPlayers.slice(1).join(', ')} will replace next`; 
		}
		break;
	case 'over':
		// possible for everyone to lose at once, so special case for that
		phaseMessage = turnPlayers.length === 0 ? 'Everybody Loses!' : `${turnPlayers[0]} wins!`;
		break;
	default:
		// assume if phase is blank the game doesnt exist. i think i covered every other case.
		phaseMessage = 'Game Starting Soon...';
		break;	
	}

	// show deck (server only tells you the count, no peeking :D)
	document.getElementById('deck').innerHTML = `Deck: &#${symbols.deck};x${deckSize}`;
	// whole discard pile is publically visible.
	document.getElementById('discard').innerHTML = `Discard: [${discard.map(printCard).join(', ')}]`;
	// show messages
	document.getElementById('phase').innerHTML = phaseMessage;
	document.getElementById('subMessage').innerHTML = subMessage;
	document.getElementById('subSubMessage').innerHTML = playersToReplace.length === 0 ? '&nbsp;' : `Then ${playersToReplace.join(', ')} will replace their cards`;
	document.getElementById('hearts').innerHTML = replaceHearts.length === 0 ? '&nbsp' : `${replaceHearts.join(', ')} floated hearts, and will need to replace a heart`;
	
	// buttons stuff

	// set the target buttons' enabled state based on if we're targeting a shoot or not
	Array.from(document.getElementsByClassName('target_button')).forEach(button => {
		button.disabled = clientState !== 'target' || button.id === `shoot_${myName}`;
	});

	// multi select if you're replacing, even if someone else has to go first (disable submit button to keep you in turn).
	// also multi select if life is being lost, as long as you will replace later and you aren't on the chopping block. you can pre-pick in this case.
	const shouldMultiSelect = (turnPhase === 'replace' && turnPlayers.includes(myName)) || (turnPhase === 'lose' && !turnPlayers.includes(myName) && playersToReplace.includes(myName));
	
	const forceAnchor = myName in hands && hands[myName].length > 0 && hands[myName][0].visible;
	// we don't force if you have multiple hearts. we enforce that with the submit button.
	const forceHeart = myName in hands && hands[myName].filter(({card}) => card.s === 'h').length === 1 && replaceHearts.includes(myName);	
	// absurd edge case: we would force both heart and anchor and can't force both with 1 card (bc anchor isnt a heart)
	// BUT the deck doesnt have enough cards. In this case only, you're allowed to satisfy either criteria.
	// but we can't force that so skip forcing at all.
	const dontForceBoth = forceHeart && forceAnchor && hands[myName][0].card.s !== 'h' && deckSize < 2;

	if (shouldMultiSelect) {
		while (selection.length < hands[myName].length) {
			selection.push(false);
		}
		if (forceAnchor && !dontForceBoth) {
			selection[0] = true;
		}
		if (forceHeart && !dontForceBoth) {
			selection[hands[myName].findIndex(({card}) => card.s === 'h')] = true;
		}
	} else {
		selection = [];
	}



	const faceUpIDs = myName in hands ? hands[myName].map(({visible}, idx) => visible ? `hand_${idx}` : '').filter(id => id !== ''): [];
	const selectedIdx = selection.map((selected, idx) => selected ? idx : -1).filter(id => id !== -1);
	const selectedIDs = selectedIdx.map(idx => `hand_${idx}`);
	// set the card buttons' enabled state if we're doing something that uses them
	Array.from(document.getElementsByClassName('card_button')).forEach(button => {
		if (!(myName in hands)) {
			// backup so players not in the game can't press buttons.
			button.disabled = true;
			return;
		}

		if (clientState === 'toss' || (turnPhase === 'toss' && turnPlayers[0] === myName)) {
			button.disabled = faceUpIDs.length !== 0 && !faceUpIDs.includes(button.id); // if there is something faceup and it isn't this one
		} else if (clientState === 'hands' || (turnPhase === 'hands' && turnPlayers[0] === myName)) {
			button.disabled = button.id === 'hand_0' || faceUpIDs.includes(button.id); // can't flip anchor for ahod, cant flip if already flipped
		} else if (turnPhase === 'lose' && turnPlayers[0] === myName) {
			button.disabled = button.id === 'hand_0'; // can't lose anchor. no other restrictions
		} else if (shouldMultiSelect) {
			button.disabled = false;
		} else {
			button.disabled = true;
		}


		if (selectedIDs.includes(button.id)) {
			button.className = 'card_button selected';
		} else {
			button.className = 'card_button';
		}
	});

	// show the submit button anytime multi select is on, for UI clarity.
	const submit = document.getElementById('submit');
	if (submit) {
		submit.style.display = shouldMultiSelect ? 'inline': 'none';
		// but only enable it when it's actually your turn to replace
		const hasAnchor = selectedIdx.includes(0);
		const hasHeart = myName in hands && selectedIdx.some(idx => hands[myName][idx].card.s === 'h');
		let cantSubmitReason = '';
		if (turnPhase !== 'replace') {
			cantSubmitReason = 'No replacing cards at this time';
		} else if (turnPlayers[0] !== myName) {
			cantSubmitReason = 'Someone else has to replace first';
		} else if (dontForceBoth & !hasAnchor && !hasHeart) {
			cantSubmitReason = 'Cannot satisfy both heart and anchor requirement, but must satisfy at least one';
		} else if (forceAnchor && !dontForceBoth && !hasAnchor) {
			cantSubmitReason = 'Must include visible anchor';
		} else if (replaceHearts.includes(myName) && !dontForceBoth && !hasHeart) {
			cantSubmitReason = 'Must include a heart';
		} else if(selectedIdx.length > deckSize) {
			cantSubmitReason = 'More cards than are in the deck';
		}

		submit.title = cantSubmitReason
		submit.disabled = cantSubmitReason !== '';
	}

	document.getElementById('log').innerHTML = log.join('<br/>');

	// just in case
	nameChanged();
}

function toggleLog() {
	const log = document.getElementById('log');
	if (log.style.display !== 'none') {
		log.style.display = 'none';
	} else {
		log.style.display = 'inline-block';
	}
}

// timer management. currently fetches state every 1s
let stateTimer = null;

function startTimer() {
	getState();
	stateTimer = setInterval(getState, 1000);
}

function stopTimer() {
	clearInterval(stateTimer);
	stateTimer = null;
}

// auto start the timer when we load the script.
startTimer();