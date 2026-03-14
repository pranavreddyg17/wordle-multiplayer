// Server Entry Point
const express = require('express');
const http = require('http');
const path = require('path');
const routes = require('./routes');
const { setupWebSocket } = require('./wsHandler');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api', routes);

// Fallback to index.html for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Setup WebSocket
setupWebSocket(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n🟩 Multiplayer Wordle server running`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`   WebSocket: ws://localhost:${PORT}/ws\n`);
});
