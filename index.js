const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Game } = require("./game");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const games = {};

function broadcast(roomId) {
  const game = games[roomId];
  if (!game) return;

  game.players.forEach(p => {
    io.to(p.id).emit("updateGame", game.getState(p.id));
  });
}

io.on("connection", socket => {
  console.log("🔌 Conectat:", socket.id);

  socket.on("joinGame", ({ roomId, maxPlayers }) => {
    if (!games[roomId]) {
      games[roomId] = new Game(roomId, maxPlayers);
    }

    const game = games[roomId];
    if (game.players.length >= game.maxPlayers) return;

    game.addPlayer(socket.id);
    socket.join(roomId);

    if (game.players.length === game.maxPlayers && !game.started) {
      game.start();
    }

    broadcast(roomId);
  });

  socket.on("playCard", ({ roomId, card }) => {
    const game = games[roomId];
    if (!game) return;

    const currentPlayerId = game.players[game.turnIndex]?.id;
    if (socket.id !== currentPlayerId) return;

    game.playCard(socket.id, card);
    broadcast(roomId);
  });

  socket.on("passTurn", ({ roomId }) => {
    const game = games[roomId];
    if (!game) return;

    game.passTurn(socket.id);
    broadcast(roomId);
  });

  socket.on("restartGame", ({ roomId }) => {
    const game = games[roomId];
    if (!game) return;

    game.reset();
    broadcast(roomId);
  });

  socket.on("disconnect", () => {
    console.log("❌ Deconectat:", socket.id);
    for (const roomId in games) {
      const game = games[roomId];
      game.removePlayer(socket.id);
      broadcast(roomId);
    }
  });
});

const port = process.env.PORT || 4000 

server.listen(port, () => {
  console.log("🚀 Serverul Șeptică rulează pe http://localhost:3001");
});
