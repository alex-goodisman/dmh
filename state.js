
const SUITS = ['c', 'd', 'h', 's'];
// tens count as face cards because of the float rules: a ten loses to a jack even though they're both worth 10
const FACES = ['a', 'k', 'q', 'j', 't'];


class State {
    constructor() {
        // cards in the deck
        this.deck = [];
        // cards in the discard pile
        this.discard = [];
        // iinitialize
        for (let s of SUITS) {
            for (let n = 2; n <= 9; n++) {
                this.discard.push({s, n});
            }
            for (let n of FACES) {
                this.discard.push({s, n});
            }
        }
        this.shuffle();

        // players' names->hands map
        this.hands = {};

        // list of players names in order
        this.playerOrder = [];
        // index into playerOrder array
        this.activePlayer = -1;

        // turn state:

        // what phase of the turn we're in: 'action' for player to choose an action, or a description of
        // something currently in progress
        this.turnPhase = '';

        // the current turn phase may apply to some players but not others (e.g. a toss is in progress, so some players haven't yet tossed, and some have).
        // this is the list of players who haven't yet done whatever it is they need to do.
        this.turnPlayers = [];

        // players who will get the option to replace cards in their hand after lives are done being lost to a challenge.
        // we can't use the turnPlayers list for this since that stores players who still have to lose lives.
        // after the 'lose' phase ends, this will become the new turnPlayers list.
        this.playersToReplace = [];

        // for special case handling: if a player has enough hearts to not lose,
        // then they have to replace the heart the next time they draw cards.
        // that might not be during the same turn phase, so we need to remember
        // players with "pending" heart replacements, so we do that here.
        this.replaceHearts = [];

        // more special case handling: we have to remember whether an ongoing life loss is
        // blockable with hearts or not. We know when it starts, but it has to persist when we
        // move from the challenge phase to the 'lose' phase, so we store that here also.
        this.lossBlockable = false;
    }
    shuffle() {
        // put the whole deck into the discard pile
        this.deck.forEach(card => this.discard.push(card));
        // randomize the discard pile
        for (let i = this.discard.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.discard[i], this.discard[j]] = [this.discard[j], this.discard[i]];
        }
        // put the whole discard pile into the deck
        this.deck = this.discard;
        this.discard = [];
    }
    winCheck() {
        const allPlayers = Object.keys(this.hands);
        if (allPlayers.length === 1) {
            this.turnPhase = 'over';
            this.turnPlayers = [allPlayers[0]];
            this.hands[allPlayers[0]] = this.hands[allPlayers[0]].map(({card}) => ({card, visible: true}));
            return true;
        } else if (allPlayers.length === 0) {
            this.turnPhase = 'over';
            this.turnPlayers = [];
            return true;
        }
        return false;
    }
    addPlayer(name) {
        if (this.playerOrder.length !== 0) {
            throw 'cannot add player, game has started';
        }
        if (this.deck.length < 4) {
            throw 'cannot add player, not enough cards left in deck';
        }
        if (name in this.hands) {
            throw 'cannot add player, already exists';
        }
        if (name === '') {
            throw 'cannot add player, name is blank';
        }
        this.shuffle();
        this.hands[name] = this.deck.splice(0,4).map(card => ({card, visible: false}));
    }
    removePlayer(name) {
        if (!(name in this.hands)) {
            throw 'cannot remove player, not in game';
        }
        // discard player's anchor and lives
        this.hands[name].forEach(({card}) => this.discard.push(card));
        delete this.hands[name];
        if (this.playerOrder.length === 0) {
            this.shuffle();
            return;
        }
        if (this.turnPlayers.includes(name)) {
            this.turnPlayers.splice(this.turnPlayers.indexOf(name), 1);
        }
        if (this.playersToReplace.includes(name)) {
            this.playersToReplace.splice(this.playersToReplace.indexOf(name), 1);
        }
        if (this.replaceHearts.includes(name)) {
            this.replaceHearts.splice(this.replaceHearts.indexOf(name), 1);
        }
        if (this.winCheck()) {
            return
        }
        if (this.playerOrder[this.activePlayer] === name) {
            this.doEndTurn();
            return;
        }
        switch(this.turnPhase) {
        case 'lose':
            this.goToNextLoseLife();
            break;
        case 'replace':
            this.goToNextReplace();
            break;
        case 'toss':
            this.goToNextToss();
            break;
        case 'hands':
            this.goToNextHands();
            break;
        }
    }
    startGame() {
        if (this.playerOrder.length !== 0) {
            throw 'game already started';
        }
        this.shuffle();
        this.discard = this.deck.splice(0,4);
        this.playerOrder = Object.keys(this.hands);
        // starting player is random since there's no dealer.
        this.activePlayer = Math.floor(Math.random() * this.playerOrder.length);
        this.turnPhase = 'action';
        this.winCheck();
    }
    getAllPlayersList(includeActive) {
        // produce a list of all players, starting with activeplayer and continuing around until it reaches them again
        // skip over players who have died. since they don't go into the list.
        // if includeActive is false, activeplayer themselves is not included
        return this.playerOrder.slice(this.activePlayer + (includeActive ? 0 : 1)).concat(this.playerOrder.slice(0, this.activePlayer)).filter(player => player in this.hands);
    }
    getFloatTarget(suit) {
        // compute the target to float for a suit based on the discard pile

        // get all numbers/faces in that suit
        const suitValues = this.discard.filter(({s}) => s === suit).map(({n}) => n);
        // check for each face card, starting at highest
        for (let f of FACES) {
            if (suitValues.includes(f)) {
                return f;
            }
        }
        // everything left is numbers so we can number-compare, default to 1.
        return suitValues.reduce((a,b) => a > b ? a : b, 1);
    }
    playerFloats(player, suit, target) {
        // does a player float a given target in a given suit?

        const suitValues = this.hands[player].filter(({card}) => card.s === suit).map(({card}) => card.n);
        // special case, if the target is a face card, and the player has exactly one card in that suit, that's also a face card (or a 10)
        // then the face cards have an order that matters, so check that.
        if (suitValues.length === 1 && typeof suitValues[0] === 'string' && typeof target === 'string') {
            for (let f of FACES) {
                if (suitValues[0] === f) {
                    // if (counting down), you see the player's number before the discarded one, they float.
                    return true;
                }
                if (target === f) {
                    // if the discarded one is higher, they sink
                    return false;
                }
            }
        }
        // otherwise, aces are 11, other faces (and tens) are 10, add them up and see if its greater.
        const targetValue = target === 'a' ? 11 : typeof target === 'string' ? 10 : target;
        const total = suitValues.map(n => n === 'a' ? 11 : typeof n === 'string' ? 10 : n).reduce((a,b) => a+b, 0);
        return total >= targetValue;
    }
    maxOrMinPlayers(suit, isMin) {
        // get the list of players with the max or min value in a suit.

        const comparison = isMin ? ((a,b) => a > b ? b : a) : ((a,b) => a > b ? a : b);
        //lowest possible value is 0, so for counting maximum, start at -1 and count up.
        // highest possible value is 41 (11+10+10+10) so for counting minimum, start at 42 and count down.
        const seed = isMin ? 42 : -1; 
        const faceOrder = isMin ? FACES.slice().reverse() : FACES;

        const suitValues = [];
        const playerSuits = {};
        // for special case handling, if players have exactly one card in the suit, we might need to know what it is.
        const playerSingletons = {};

        const participatingPlayers = this.getAllPlayersList(true); //all alive players participate, including active player
        participatingPlayers.forEach(player => {
            const cardsInSuit = this.hands[player].filter(({card}) => card.s === suit);
            // if singleton, record it in case we need in later
            if (cardsInSuit.length === 1) {
                playerSingletons[player] = cardsInSuit[0].card.n;
            }
            // compute that player's total
            const suitSum = cardsInSuit.map(({card}) => card.n === 'a' ? 11 : typeof card.n === 'string' ? 10 : card.n).reduce((a,b) => a+b, 0);
            // and store it.
            suitValues.push(suitSum);
            playerSuits[player] = suitSum;
        });

        // get the max or min value.
        const maxOrMin = suitValues.reduce(comparison, seed);
        // get the players who have said max or min value.
        const matchedPlayers = participatingPlayers.filter(player => playerSuits[player] === maxOrMin);

        // special case handling: if the max or min value was 10, it could be the case where face card ordering comes into play.
        // if _anyone_'s 10-value was a sum such as 2+8, then all the 10s are equal. but if _everyone_'s 10-value was a singleton facecard (or a ten)
        // then the maxOrMin is whoever has the highest/lowest facecard.
        if (maxOrMin === 10 && matchedPlayers.every(player => typeof playerSingletons[player] === 'string')) {
            // if max, count down from highest face and find the first player who has it
            // if min, count up from the lowest face and find the first player who has it.
            for (let f of faceOrder) {
                const matchedPlayer = matchedPlayers.find(player => playerSingletons[player] === f)
                if (typeof matchedPlayer === 'string') {
                    // there's always one player winning the tiebreaker since it's whoever has the ace/king/whatever
                    return [matchedPlayer];
                }
            }
        }
        
        // if someone has a sum, then all 10s are equal so return everyone with 10.
        // also there's no tiebreaker for any number other than 10. so all face cards are equal in every other context.
        return matchedPlayers;
    }
    goToNextLoseLife() {
        // players begin losing life. for each player in the turnPlayers list,
        // if their life loss is forced, do it automatically. if not, wait in this state
        // until they provide a lose_life action, then continue going through players.
        // if all players finish losing their lives, go to replace phase for the replacers list.
        // also do win detection here, since life loss is when winning happens
        // also rarely the replacers phase can be skipped if the only person who would have replaced
        // also died, so in that case go direct to end of turn.

        // compute the required amount of hearts to survive this round.
        const heartFloat = this.getFloatTarget('h');

        while(this.turnPlayers.length > 0) {
            // check if player blocks the life loss
            if (this.lossBlockable && this.turnPlayers[0] !== this.playerOrder[this.activePlayer]) {
                if (this.playerFloats(this.turnPlayers[0], 'h', heartFloat)) {
                    // skip losing life but go on the blocked list to replace a heart later
                    this.replaceHearts.push(this.turnPlayers[0]);
                    this.turnPlayers.shift();
                    continue;
                }
            }
            // now lose a life
            if(this.hands[this.turnPlayers[0]].length <= 2) {
                // if you have 2 or fewer lives, your move is forced. you lose the rightmost life.
                this.discard.push(this.hands[this.turnPlayers[0]].pop().card);
                // after losing life, if you have none left, you're out
                if (this.hands[this.turnPlayers[0]].length === 0) {
                    delete this.hands[this.turnPlayers[0]];
                    // also remove you from the replacers list when you die.
                    this.playersToReplace.splice(this.playersToReplace.indexOf(this.turnPlayers[0]), 1);
                    // don't have to remove from the blocked list, because definitionally, if you blocked, then you didn't die.
                }
                this.turnPlayers.shift();
            } else {
                // if you didn't block it, and your move isn't forced, we have to wait for your decision on which life to lose.
                // leave turnphase as it is, in 'lose' phase with you at teh front
                return;
            }
        }
        // if we got here, then every life that needs to be lost has been lost.
        if (this.winCheck()) {
            return;
        }
        if (this.playersToReplace.length > 0) {
            // there should usually be at least one replacer after the losing is done.
            // in that case, we start replacement process.
            this.turnPhase = 'replace';
            this.turnPlayers = this.playersToReplace;
            // we can clear the replacers buffer since now they're just the normal players list for the 'replace' phase
            this.playersToReplace = [];

            // ok so, _if this is a treasure challenge_ that triggered the life loss, then we need to reshuffle now.
            // since the deck always starts the turn nonempty, and we can only get to here if a challenge is underway (life being lost),
            // that means for shoot/swordfight, the deck is always nonempty.
            // _that_ means, if the deck _is_ empty, it must be treasure, and therefore we can reshuffle now.
            if (this.deck.length === 0) {
                this.shuffle();
                this.discard = this.deck.splice(0,4);
                // then we replace as normal, and since we reshuffled, it wont trigger an infinite loop.
                // NB: we have like 12 players or something and the replace triggers _another_ treasure challenge, it will loop around again.
                // however, that's not a problem because treasure challenges always take at least one life, so eventually people will die
                // and there will be fewer players.
            }
            this.goToNextReplace();
        } else {
            // rarely, (i.e. when you shoot someone for their last life), they are the only replacer and
            // they died as part of life loss. Therefore there's no replacement left to do, so skip to end turn.
            // this can't happen with swordfight/treasure challenge because those put every player into playersToReplace.
            // which means if it somehow became empty, that must be that everybody died simultaneously, which already
            // got handled in a previous if-branch.
            // therefore, we can only get here from shooting, which means it can only happen once per turn and there's no risk of an infinite loop.
            this.doEndTurn();
        }

    }
    goToNextReplace() {
        // players begin replacing their cards.
        // if their replace choice is forced, do it for them automatically.
        // if not, wait in this state until they provide a replace action then continue going through players.
        // if all players replace their cards, then go to end turn.
        // if the deck runs out, still go to end turn, but some players may still have requirements on what they must
        // replace. This persists until the next replacement.
        // if the deck is not empty but insufficiently full to do all the replacements, then they have a choice which to fulfill,
        // which means we wait until they provide one. Whatever they don't do will persist until the next replacement.
        while(this.turnPlayers.length > 0) {
            if (this.deck.length === 0) {
                this.doEndTurn();
                return;
            }
            // replacement is forced iff
            // you have exactly one card (your anchor) and it is visible, so you must replace it. OR
            // you have exactly two cards, and your anchor is visible, and your anchor is not a heart, and your other card is a heart, and you blocked a loss.
            // then you must replace both.
            // in any other scenario, you have some kind of choice (if the anchor is a heart, you can satisfy both conditions by replacing only it, so you have a choice
            // as to whether to discard the 2nd card).
            // Also, this second scenario only procs if the deck has >=2 cards.
            // if it has exactly 1, then you have a choice of which condition to use, which means we can't autofill it for you.

            // detect the simple case, where anchor is your only card left, so you must replace it
            if (this.hands[this.turnPlayers[0]].length === 1 && this.hands[this.turnPlayers[0]][0].visible) {
                this.discard.push(this.hands[this.turnPlayers[0]][0].card);
                this.hands[this.turnPlayers[0]][0] = {
                    card: this.deck.shift(),
                    visible: false,
                }
                // the anchor could have had double-duty as a heart that saved them, so they could be on the heart-replacers list.
                // since they will by definition have replaced it here, we can drop them from the list.
                if (this.replaceHearts.includes(this.turnPlayers[0])) {
                    this.replaceHearts.splice(this.replaceHearts.indexOf(this.turnPlayers[0]), 1);
                }
                this.turnPlayers.shift();
            } else if ( // detect the anchor+heart case
                this.hands[this.turnPlayers[0]].length === 2 && // have exactly 2 cards
                this.hands[this.turnPlayers[0]][0].visible && // anchor is visible
                this.replaceHearts.includes(this.turnPlayers[0]) && // blocked a spawn
                this.hands[this.turnPlayers[0]][0].card.s !== 'h' && // anchor is not a heart
                this.hands[this.turnPlayers[0]][1].card.s === 'h' && // non-anchor card _is_ a heart.
                this.deck.length >= 2 // deck has enough cards to do both replacements.
            ) {
                // move is forced to replace both
                this.discard.push(this.hands[this.turnPlayers[0]][0].card);
                this.hands[this.turnPlayers[0]][0] = {
                    card: this.deck.shift(),
                    visible: false,
                };
                this.discard.push(this.hands[this.turnPlayers[0]][1].card);
                this.hands[this.turnPlayers[0]][1] = {
                    card: this.deck.shift(),
                    visible: false,
                };

                // they have satisfied their replacehearts requirement
                this.replaceHearts.splice(this.replaceHearts.indexOf(this.turnPlayers[0]), 1);
                this.turnPlayers.shift();
            
            } else {
                // can't force the replace because they have
                // 2 cards and forced heart but the heart is anchor, so 2nd card discard is optional
                // 2 cards and unforced heart, so heart discard is optional
                // 2 cards and no heart, so 2nd is optional
                // 3+ cards, so 3rd is always optional
                // 2 cards and forced heart and heart is not anchor but deck only had 1 card, so either is allowed.
                // leave turnphase as is, with 'replace' and the current player at the top of the list.
                return;
            }
        }
        // everyone has replaced, so now we end turn
        // do NOT clear replaceHearts because someone could have been on the replaceHearts list but never got to clear it
        // due to deck running out (or almost running out)
        // so it will clear out during replace after treasure challenge.
        this.doEndTurn();
    }
    goToNextHands() {
        // when starting or continuing all hands on deck,
        // we skip players with only their anchor facedown
        // and we auto-turn for players with exactly one facedown non-anchor card.
        // we set turn phase to the first player with >=2 cards face down, or
        // if we get back to the end of player we run end of turn sequence

        // we are in 'hands' phase
        while(this.turnPlayers.length > 0) {
            const hand = this.hands[this.turnPlayers[0]];
            //if next player has 2+ facedown non-anchor cards, they have to pick one for continue_hands, so stop and set the turnphase.
            if (hand.filter(({visible}, index) => index !== 0 && !visible).length >= 2) {
                return;
            }
            // they have 0 or 1 facedown non anchor cards, so just set every non-anchor card faceup, which is the same result of finding the right one and flipping it.
            this.hands[this.turnPlayers[0]] = hand.map(({card, visible}, index) => ({card, visible: index === 0 ? visible : true}));
            this.turnPlayers.shift();
        }
        // if we ran out of players without hitting anyone who had to decide, then we're done with hands.
        this.doEndTurn();
    }
    goToNextToss() {
        // when starting or continuing a toss,
        // if players have one card total, or exactly one card faceup, we auto toss for them.
        // we eset turn phase to the first player with a choice, or if we get to the end we run EOT.

        // we are in 'toss', phase
        while(this.turnPlayers.length > 0) {
            if (this.deck.length === 0) {
                // stop early if deck empties
                this.doEndTurn();
                return;
            }
            const hand = this.hands[this.turnPlayers[0]];
            let idx = -1;
            if (hand.filter(({visible}) => visible).length === 1) {
                idx = hand.findIndex(({visible}) => visible);
            } else if (hand.length === 1) {
                idx = 0;
            }
            if (idx === -1) {
                // player has >1 card and either 0 or 2+ visible, so we can't force their toss.
                // leave the state as is and wait for human input.
                return;
            }
            this.discard.push(hand[idx].card);
            this.hands[this.turnPlayers[0]][idx] = {
                card: this.deck.shift(),
                visible: false,
            };
            this.turnPlayers.shift();
        }
        // if we ran out of players without hitting anyone whose move wasnt forced, then we're done
        this.doEndTurn();
    }
    doEndTurn() {
        // we either got here because the turn ended normally and nothing to do, or the deck emptied.
        if (this.deck.length > 0) {
            // got here normally. turn is over, so go to next turn.
            // edge case: players don't leave the playerOrder array when they die.
            // the reason for this is that if they left the playerOrder array, then the
            // activePlayer pointer might be pointing to a different player. 
            // since the activePlayer pointer is used to check if you can block challenges or not 
            // (since you can't block your own challenges, and your own challenges always occur on your own turn)
            // this would break the heart float blocking.
            // so instead, we remove players from the hands map to show that they've died, but keep them in playerOrder.
            // therefore, when going next turn, we have to keep checking until we find a player who is alive
            // do-while construction means it will go up at least once, then check, then keep going.
            // win checking should have already happened during life lose phase, so we don't have to worry about an infinite loop.
            // this should also work if you died on your own turn, since the pointer will just move off you.
            do {
                this.activePlayer = (this.activePlayer + 1) % this.playerOrder.length
            } while (!(this.playerOrder[this.activePlayer] in this.hands));
            this.turnPhase = 'action';
            this.turnPlayers = [];
        } else {
            // deck emptied, so treasure challenge!
            Object.keys(this.hands).forEach(player => {
                this.hands[player] = this.hands[player].map(({card, visible}) => ({card, visible: true}));
            });
            const minDiamondPlayers = this.maxOrMinPlayers('d', true);
            // lifeloss is guaranteed here: someone must have minimum.
            // so we can go directly to life loss phase here
            this.turnPhase = 'lose';
            // everyone who matches min diamond loses a life, starting with active player
            this.turnPlayers = minDiamondPlayers;
            // everyone will get to replace after this.
            this.playersToReplace = this.getAllPlayersList(true); //everyone replaces, including active players
            this.lossBlockable = false; //hearts cannot save you from being poor!
            this.goToNextLoseLife();
        }
    }
    doAction(player, params) {
        const {action, index, target, indices} = params; // some of these may be undefined for some actions
        switch(action) {
            case 'call_hands': // call for all hands on deck, as an action
                if (this.turnPhase !== 'action') {
                    throw 'cannot call hands except during action phase'
                }
                if (this.playerOrder[this.activePlayer] !== player) {
                    throw 'cannot call hands on someone elses turn'
                }
                if (this.hands[player].every(({visible}, index) => index === 0 || visible)) {
                    throw 'cannot do hands with all non-anchor already faceup';
                }
                if (this.hands[player].length <= 2) {
                    throw 'cannot do hands with <=2 lives';
                }
                // javascript stupidness: !(x > y) is not the same as (x <= y) because
                // comparisons are always false for non-numbers.
                // as written, this will fail for any non-number, which means we don't have to do a separate
                // validation check. it will only pass this check if it's a number AND in bounds.
                // so it doesn't get de-morgan simplified. I repeated this for every bounds check.
                if (!(index >= 1 && index < this.hands[player].length)) {
                    throw 'cannot turn that faceup, out of bounds'
                }
                if (this.hands[player][index].visible) {
                    throw 'cannot turn that faceup, already faceup';
                }
                // turn it faceup
                this.hands[player][index].visible = true;
                this.turnPhase = 'hands';
                this.turnPlayers = this.getAllPlayersList(false);
                this.goToNextHands();
                break;
            case 'continue_hands': // someone already called hands and you're providing your card
                if (this.turnPhase !== 'hands') {
                    throw 'cannot continue hands except during hands phase';
                }
                if (this.turnPlayers[0] !== player) {
                    throw 'cannot continue hands, someone has to flip before you';
                }
                // turnPhase should only come to 'hands' for a player that has >=2 cards to turn up
                // so we don't have to check the count
                if (!(index >= 1 && index < this.hands[player].length)) {
                    throw 'cannot turn that faceup, out of bounds'
                }
                if (this.hands[player][index].visible) {
                    throw 'cannot turn that faceup, already faceup';
                }
                this.hands[player][index].visible = true;
                this.turnPlayers.shift(); // remove self from players left to do hands.
                this.goToNextHands();
                break;
            case 'call_toss': // call for toss, as an action
                if (this.turnPhase !== 'action') {
                    throw 'cannot call toss except during action phase';
                }
                if (this.playerOrder[this.activePlayer] !== player) {
                    throw 'cannot call toss on someone elses turn';
                }
                if (this.hands[player].length <= 1) {
                    throw 'cannot do toss with <=1 lives';
                }
                if (!(index >= 0 && index < this.hands[player].length)) {
                    throw 'cannot toss that, out of bounds'
                }
                if (!this.hands[player][index].visible && this.hands[player].some(({visible}) => visible)) {
                    throw 'cannot toss that, facedown while something else is faceup';
                }
                // we don't have to worry about face-up anchors during a toss.
                // face-up anchors only occur on a turn with a challenge, and will always be resolved by the end of that turn
                // (since everyone who revealed must replace it, and if the deck runs out, they will replace after treasure).
                // anchors are still tossable though, but only if everything is face-down.
                this.discard.push(this.hands[player][index].card);
                this.hands[player][index] = {
                    card: this.deck.shift(),
                    visible: false
                };
                this.turnPhase = 'toss';
                this.turnPlayers = this.getAllPlayersList(false);
                this.goToNextToss();
                break;
            case 'continue_toss': // someone already called toss and you're providing your card
                if (this.turnPhase !== 'toss') {
                    throw 'cannot continue toss except during the toss phase';
                }
                if (this.turnPlayers[0] !== player) {
                    throw 'cannot continue toss, someone else has to toss first';
                }
                if (!(index >= 0 && index < this.hands[player].length)) {
                    throw 'cannot toss that, out of bounds'
                }
                if (!this.hands[player][index].visible && this.hands[player].some(({visible}) => visible)) {
                    throw 'cannot toss that, facedown while something else is faceup';
                }
                this.discard.push(this.hands[player][index].card);
                this.hands[player][index] = {
                    card: this.deck.shift(),
                    visible: false
                };
                this.turnPlayers.shift();
                this.goToNextToss();
                break;
            case 'call_shoot':
                if (this.turnPhase !== 'action') {
                    throw 'cannot call shoot except during action phase';
                }
                if (this.playerOrder[this.activePlayer] !== player) {
                    throw 'cannot call shoot on someone elses turn';
                }
                if (!(target in this.hands)) {
                    throw 'cannot shoot them, they dont exist';
                }
                if (target === player) {
                    throw 'cannot shoot yourself';
                }
                // turn target everything faceup.
                this.hands[target] = this.hands[target].map(({card}) => ({card, visible: true}));
                // see if they float
                const clubFloat = this.getFloatTarget('c');
                if (this.playerFloats(target, 'c', clubFloat)) {
                    // if they do, turn the shooter everything faceup also.
                    this.hands[player] = this.hands[player].map(({card}) => ({card, visible: true}));
                    if (this.playerFloats(player, 'c', clubFloat)) {
                        // both floated, so no lives lost
                        // BOTH can now replace stuff, but victim first.
                        this.turnPhase = 'replace';
                        this.turnPlayers = [target, player];
                        this.goToNextReplace();
                    } else {
                        // target floated but shooter sank. shooter loses life, 
                        // then BOTH will replace will replace, but victim first.
                        this.turnPhase = 'lose';
                        this.turnPlayers = [player];
                        this.playersToReplace = [target, player];
                        this.lossBlockable = true; // a technicality, since you can't block a challenge you unitiated, it doesn't matter what I put here.
                        this.goToNextLoseLife();
                    }
                } else {
                    // target sank. they lose life, then they can replace
                    this.turnPhase = 'lose';
                    this.turnPlayers = [target];
                    this.playersToReplace = [target];
                    this.lossBlockable = true;
                    this.goToNextLoseLife();
                }
                break;
            case 'lose_life':
                if (this.turnPhase !== 'lose') {
                    throw 'cannot lose a life except during lose phase';
                }
                if (this.turnPlayers[0] !== player) {
                    throw 'cannot lose a life, someone else has to lose one before you';
                }
                if (!(index >= 1 && index < this.hands[player].length)) {
                    throw 'cannot lose that life, out of bounds'
                }
                this.discard.push(this.hands[player].splice(index, 1)[0].card);
                this.turnPlayers.shift();
                this.goToNextLoseLife();
                break;
            case 'continue_replace':
                if (this.turnPhase !== 'replace') {
                    throw 'cannot replace except in the replace phase';
                }
                if (this.turnPlayers[0] !== player) {
                    throw 'cannot replace, someone else has to replace first';
                }
                if (!Array.isArray(indices)) {
                    throw 'cannot replace, indices not array';
                }
                const dupChecker = [];
                for (let idx of indices) {    
                    if (!(idx >= 0 && idx < this.hands[player].length)) {
                        throw 'cannot replace that, out of bounds'
                    } 
                    if (dupChecker.includes(idx)) {
                        throw 'cannot replace that, duplicate index';
                    }
                    dupChecker.push(idx);
                }
                // now is the logic for when players' replacement isn't totally forced (so we didn't do it for them),
                // but there's still restrictions on what they can choose. so we have to make sure that they abide by those restrictions.
                // we can also assert the deck has at least one card, since if it was empty, then we wouldn't still be in replace state, we would have
                // hit end of turn and would be in or after a treasure challenge.
                // the restrictions are:
                // 1. if the anchor is visible your replacement must include it.
                // 2. if a loss was blocked, the replacement must include a heart.
                // 3. the replacement cannot include more cards than are in the deck.
                // 4. if 1.,2., and 3. are not simultaneously satisfiable, then your replacement must satisfy 3. and either 1. or 2. (your choice)
                // 4. can only occur if the deck has exactly 1 card, and even then only if the heart-to-discard and anchor aren't the same.

                // do conditions apply?
                const visibleAnchor = this.hands[player][0].visible;
                const heartRequired = this.replaceHearts.includes(player);
                // are conditions satisfied?
                const includedAnchor = indices.includes(0);
                const includedHeart = indices.some(idx => this.hands[player][idx].card.s === 'h');

                // absurdly specific corner case handling
                if(this.deck.length < 2 && this.hands[player].length === 2 && visibleAnchor && heartRequired && this.hands[player][0].card.s !== 'h') {
                    // in this case both conditions apply, and can't be satisfied by a single card,
                    // but the deck can't support satisfying both of them.
                    // in this case ONLY, you are allowed to satisfy _either_ rather than _both_.
                    if (!includedAnchor && !includedHeart) {
                        throw 'replace invalid, you hit the absurd corner case, must replace heart AND must replace anchor BUT cant do both so must do either, but did not';
                    }
                }

                if (visibleAnchor && !includedAnchor) {
                    throw 'replace invalid, must replace anchor';
                }
                if (heartRequired && !includedHeart) {
                    throw 'replace invalid, must replace heart';
                }
                if (this.deck.length < indices.length) {
                    throw 'replace invalid, cannot replace more cards than deck has';
                }
                for (let idx of indices) {
                    this.discard.push(this.hands[player][idx].card);
                    this.hands[player][idx] = {
                        card: this.deck.shift(),
                        visible: false,
                    };
                }
                if (heartRequired && includedHeart) {
                    // if you had a heart requirement and satisfied it, you're clear.
                    this.replaceHearts.splice(this.replaceHearts.indexOf(player), 1);
                }
                this.turnPlayers.shift();
                this.goToNextReplace();
                break;
            case 'call_fight':
                if (this.turnPhase !== 'action') {
                    throw 'cannot call fight except during action phase';
                }
                if (this.playerOrder[this.activePlayer] !== player) {
                    throw 'cannot call fight on someone elses turn';
                }
                if (Object.keys(this.hands).length <= 2) {
                    throw 'cannot call fight with 2 players remaining';
                }
                Object.keys(this.hands).forEach(player => {
                    this.hands[player] = this.hands[player].map(({card, visible}) => ({card, visible: true}));
                });

                const maxSpadePlayers = this.maxOrMinPlayers('s', false);
                const minSpadePlayers = this.maxOrMinPlayers('s', true);
                // lifeloss is guaranteed here: someone must have max and someone must have minimum.
                // so we can go directly to life loss phase here
                const allPlayers = this.getAllPlayersList(true); // start at active player and go around, including active.
                this.turnPhase = 'lose';
                // everyone who matches min OR max spade loses a life, starting with active player
                this.turnPlayers = allPlayers.filter(player => maxSpadePlayers.includes(player) || minSpadePlayers.includes(player));
                // everyone will get to replace after this.
                this.playersToReplace = allPlayers;
                this.lossBlockable = true;
                this.goToNextLoseLife();
                break;
            default:
                throw 'invalid action, unknown';
        }
    }
    getState(player) {
        const state = {
            playerOrder: this.playerOrder,
            activePlayer: this.activePlayer,
            turnPhase: this.turnPhase,
            turnPlayers: this.turnPlayers,
            playersToReplace: this.playersToReplace, // frontend probably doesnt show this info but maybe itll show in a sidebar somewhere.
            replaceHearts: this.replaceHearts, // frontend needs to know replacehearts so it can prevent you from submitting replacements that don't have hearts.
            lossBlockable: this.lossBlockable, // for convenience, frontend should show you that you cant block the life its making you lose. in practice its no new information but good to have.
            hands: {},
            discard: this.discard,
            deckSize: this.deck.length,
        };
        Object.keys(this.hands).forEach(alivePlayer => {
            // if it's your card, or its visible, then show it, otherwise replace it with empty {} since you can't see that.
            state.hands[alivePlayer] = this.hands[alivePlayer].map(({card, visible}) => ({card: (visible || alivePlayer === player) ? card : {}, visible}))
        });

        return state;
    }
}


module.exports = () => new State();

// outstanding questions
