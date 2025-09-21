class Game {
  constructor(roomId, maxPlayers) {
    this.roomId = roomId;
    this.maxPlayers = maxPlayers;
    this.players = [];
    this.deck = [];
    this.table = [];
    this.turnIndex = 0;
    this.started = false;
    this.winnerInfo = null;
    this.currentLead = null;
    this.roundInitiator = null;
    this.waitingForResponse = false;             // pentru jucătorul care răspunde inițiatorului
    this.waitingForInitiatorResponse = false;   // pentru inițiator după ce a fost tăiat
  }

  addPlayer(socketId) {
    this.players.push({ id: socketId, hand: [], collected: [] });
  }

  removePlayer(socketId) {
    this.players = this.players.filter(p => p.id !== socketId);
    if (this.turnIndex >= this.players.length) this.turnIndex = 0;
  }

  start() {
    this.deck = this.generateDeck();
    this.shuffle(this.deck);
    this.players.forEach(p => {
      p.hand = this.deck.splice(0, 4);
      p.collected = [];
    });
    this.turnIndex = 0;
    this.started = true;
    this.table = [];
    this.currentLead = null;
    this.roundInitiator = null;
    this.waitingForResponse = false;
    this.waitingForInitiatorResponse = false;
    this.winnerInfo = null;
  }

  generateDeck() {
    const ranks = ["7", "8", "9", "10", "J", "Q", "K", "A"];
    const suits = ["♠", "♥", "♦", "♣"];
    let deck = suits.flatMap(suit => ranks.map(rank => ({ rank, suit })));

    if (this.maxPlayers === 3) {
      let count = 0;
      deck = deck.filter(c => {
        if (c.rank === "8" && count < 2) {
          count++;
          return false;
        }
        return true;
      });
    }

    return deck;
  }

  shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  nextTurn() {
    this.turnIndex = (this.turnIndex + 1) % this.players.length;
  }

  refillHands() {
    this.players.forEach(p => {
      while (p.hand.length < 4 && this.deck.length > 0) {
        p.hand.push(this.deck.shift());
      }
    });
  }

  isGameOver() {
    return this.deck.length === 0 && this.players.every(p => p.hand.length === 0);
  }

  hasCutCard(player) {
    return player.hand.some(c =>
      c.rank === this.currentLead ||
      c.rank === "7" ||
      (this.maxPlayers === 3 && c.rank === "8")
    );
  }

  playCard(playerId, card) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return;

    // --- Dacă inițiatorul decide după ce a fost tăiat sau după ce toți au jucat ---
    if (this.waitingForInitiatorResponse && playerId === this.roundInitiator) {
      const isCut = card.rank === this.currentLead ||
                    card.rank === "7" ||
                    (this.maxPlayers === 3 && card.rank === "8");
      if (!isCut) return;

      const idx = player.hand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
      if (idx === -1) return;

      const playedCard = player.hand.splice(idx, 1)[0];
      this.table.push({ playerId, card: playedCard });

      this.waitingForInitiatorResponse = false;
      this.nextTurn();
      return;
    }

    // --- Primul jucător din rundă ---
    if (this.table.length === 0) {
      const idx = player.hand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
      if (idx === -1) return;
      const playedCard = player.hand.splice(idx, 1)[0];

      this.currentLead = playedCard.rank;
      this.roundInitiator = playerId;
      this.table.push({ playerId, card: playedCard });

      if (this.maxPlayers < 4) {
        this.waitingForResponse = true;
      }
      this.nextTurn();
      return;
    }

    // --- Răspuns la inițiator (2 sau 3 jucători) ---
    if (this.waitingForResponse && this.maxPlayers < 4) {
      const idx = player.hand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
      if (idx === -1) return;
      const playedCard = player.hand.splice(idx, 1)[0];

      const isCut = playedCard.rank === this.currentLead ||
                    playedCard.rank === "7" ||
                    (this.maxPlayers === 3 && playedCard.rank === "8");

      this.table.push({ playerId, card: playedCard });

      if (isCut) {
        this.waitingForResponse = false;
        this.waitingForInitiatorResponse = true;
        this.turnIndex = this.players.findIndex(p => p.id === this.roundInitiator);
      } else {
        const initiator = this.players.find(p => p.id === this.roundInitiator);
        initiator.collected.push(...this.table.map(t => t.card));
        this._resetRound(initiator.id);
      }
      return;
    }

    // --- Joc normal (3 sau 4 jucători) ---
    const idx = player.hand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
    if (idx === -1) return;
    const playedCard = player.hand.splice(idx, 1)[0];

    this.table.push({ playerId, card: playedCard });

    // dacă toți jucătorii au pus câte o carte
    if (this.table.length === this.players.length) {
      let winnerId = this.table[0].playerId;
      const leadRank = this.table[0].card.rank;

      for (let entry of this.table) {
        const { playerId, card } = entry;
        const isCut = card.rank === leadRank ||
                      card.rank === "7" ||
                      (this.maxPlayers === 3 && card.rank === "8");
        if (isCut) winnerId = playerId;
      }

      // --- verificăm situația inițiatorului ---
      if (winnerId === this.roundInitiator) {
        const initiator = this.players.find(p => p.id === this.roundInitiator);

        // verificăm dacă vreun adversar a tăiat
        const adversarACutit = this.table.some(t =>
          t.playerId !== this.roundInitiator &&
          (t.card.rank === leadRank ||
           t.card.rank === "7" ||
           (this.maxPlayers === 3 && t.card.rank === "8"))
        );

        if (adversarACutit) {
          const hasAnotherCut = initiator.hand.some(c =>
            c.rank === leadRank ||
            c.rank === "7" ||
            (this.maxPlayers === 3 && c.rank === "8")
          );

          if (hasAnotherCut) {
            // 🔹 inițiatorul decide dacă joacă sau pas
            this.waitingForInitiatorResponse = true;
            this.turnIndex = this.players.findIndex(p => p.id === this.roundInitiator);
            return; // nu închidem runda încă
          } else {
            // inițiatorul nu poate răspunde → ultimul care a tăiat câștigă
            const lastCutter = this.table[this.table.length - 1].playerId;
            const winner = this.players.find(p => p.id === lastCutter);
            winner.collected.push(...this.table.map(t => t.card));
            this._resetRound(winner.id);
            return;
          }
        }
      }

      // dacă nu există tăietură adversă sau inițiatorul nu mai vrea → se închide runda
      const winner = this.players.find(p => p.id === winnerId);
      winner.collected.push(...this.table.map(t => t.card));
      this._resetRound(winnerId);
    } else {
      this.nextTurn();
    }
  }

  passTurn(playerId) {
    if (!this.waitingForInitiatorResponse || playerId !== this.roundInitiator) return;

    // ultimul adversar care a tăiat ia levata
    const lastCutter = this.table[this.table.length - 1].playerId;
    const winner = this.players.find(p => p.id === lastCutter);
    winner.collected.push(...this.table.map(t => t.card));

    this._resetRound(winner.id);
  }

  _resetRound(nextPlayerId) {
    this.table = [];
    this.currentLead = null;
    this.roundInitiator = null;
    this.waitingForResponse = false;
    this.waitingForInitiatorResponse = false;
    this.turnIndex = this.players.findIndex(p => p.id === nextPlayerId);
    this.refillHands();
    if (this.isGameOver()) this.winnerInfo = this.getWinner();
  }

  getWinner() {
    const scores = this.players.map(p => {
      const tens = p.collected.filter(c => c.rank === "10");
      const aces = p.collected.filter(c => c.rank === "A");
      let points = tens.length + aces.length;
      if (tens.length === 4 && aces.length === 4) points *= 2;
      return { id: p.id, points };
    });

    const maxPoints = Math.max(...scores.map(s => s.points));
    const winners = scores.filter(s => s.points === maxPoints);
    return winners.length === 1
      ? { winner: winners[0].id, points: maxPoints }
      : { winner: winners.map(w => w.id), points: maxPoints };
  }

  reset() {
    this.start();
  }

  getState(requesterId) {
    return {
      players: this.players.map(p => ({
        id: p.id,
        hand: p.id === requesterId ? p.hand : [],
        handCount: p.hand.length,
        collectedCount: p.collected.length
      })),
      table: this.table,
      turn: this.players[this.turnIndex]?.id,
      deckCount: this.deck.length,
      started: this.started,
      maxPlayers: this.maxPlayers,
      winner: this.winnerInfo || null,
      waitingForResponse: this.waitingForResponse,
      waitingForInitiatorResponse: this.waitingForInitiatorResponse
    };
  }
}

module.exports = { Game };
