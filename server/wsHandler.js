// WebSocket Handler — real-time event routing and broadcasting
const WebSocket = require('ws');
const rm = require('./roomManager');

// Track connections: player_id -> Set of WebSocket connections
const playerConnections = new Map();
// Track room subscriptions: room_id -> Set of player_ids
const roomSubscriptions = new Map();

function setupWebSocket(server) {
    const wss = new WebSocket.Server({ server, path: '/ws' });

    wss.on('connection', (ws, req) => {
        const url = new URL(req.url, 'http://localhost');
        const token = url.searchParams.get('token');
        const session = rm.getSessionByToken(token);

        if (!session) {
            ws.send(JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', message: 'Invalid token' }));
            ws.close();
            return;
        }

        ws.player_id = session.player_id;
        ws.room_id = session.room_id;
        ws.display_name = session.display_name;
        ws.isAlive = true;

        // Track connection
        if (!playerConnections.has(session.player_id)) {
            playerConnections.set(session.player_id, new Set());
        }
        playerConnections.get(session.player_id).add(ws);

        // Subscribe to room
        if (!roomSubscriptions.has(session.room_id)) {
            roomSubscriptions.set(session.room_id, new Set());
        }
        roomSubscriptions.get(session.room_id).add(session.player_id);

        // Send current room state to the new player
        const room = rm.getRoom(session.room_id);
        if (room) {
            ws.send(JSON.stringify({ type: 'room_state', room }));

            // Broadcast player_joined and updated room_state to ALL players in the room
            // (including the new one, but that's fine — they'll just get an updated state)
            broadcastToRoom(session.room_id, {
                type: 'player_joined',
                player_id: session.player_id,
                display_name: session.display_name,
                avatar_seed: room.players.find(p => p.player_id === session.player_id)?.avatar_seed || ''
            });
            broadcastToRoom(session.room_id, { type: 'room_state', room });
        }

        // Pong handler for keepalive
        ws.on('pong', () => { ws.isAlive = true; });

        // Message handler
        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                handleMessage(ws, msg);
            } catch (err) {
                ws.send(JSON.stringify({ type: 'error', code: 'INVALID_MESSAGE', message: 'Invalid JSON' }));
            }
        });

        // Close handler
        ws.on('close', () => {
            handleDisconnect(ws);
        });

        ws.on('error', () => {
            ws.close();
        });
    });

    // Heartbeat interval
    const heartbeat = setInterval(() => {
        wss.clients.forEach(ws => {
            if (!ws.isAlive) return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

    wss.on('close', () => clearInterval(heartbeat));

    return wss;
}

function handleMessage(ws, msg) {
    switch (msg.type) {
        case 'submit_guess':
            handleSubmitGuess(ws, msg);
            break;

        case 'start_game':
            handleStartGame(ws, msg);
            break;

        case 'transfer_host':
            handleTransferHost(ws, msg);
            break;

        case 'kick_player':
            handleKickPlayer(ws, msg);
            break;

        case 'leave_room':
            handleLeave(ws);
            break;

        case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;

        default:
            ws.send(JSON.stringify({ type: 'error', code: 'UNKNOWN_EVENT', message: `Unknown event type: ${msg.type}` }));
    }
}

function handleStartGame(ws, msg) {
    const settings = {
        round_count: msg.round_count,
        time_limit_sec: msg.time_limit_sec
    };
    const result = rm.startGame(ws.room_id, ws.player_id, settings);
    if (result.error) {
        ws.send(JSON.stringify({ type: 'error', code: result.error, message: result.error }));
        return;
    }

    // Broadcast countdown
    broadcastToRoom(ws.room_id, {
        type: 'round_starting',
        round_number: 1,
        word_length: rm.getRoomInternal(ws.room_id).word_length,
        time_limit_sec: rm.getRoomInternal(ws.room_id).time_limit_sec,
        starts_at_ms: Date.now() + 3000
    });

    // Start first round after countdown
    setTimeout(() => {
        const roundInfo = rm.startRound(ws.room_id);
        if (roundInfo) {
            broadcastToRoom(ws.room_id, {
                type: 'round_started',
                round_number: roundInfo.round_number,
                word_length: roundInfo.word_length
            });

            // Set round timer
            startRoundTimer(ws.room_id, roundInfo.round_number, rm.getRoomInternal(ws.room_id).time_limit_sec);
        }
    }, 3000);
}

function handleSubmitGuess(ws, msg) {
    if (!msg.word) {
        ws.send(JSON.stringify({ type: 'guess_error', code: 'INVALID_WORD', message: 'No word provided' }));
        return;
    }

    const result = rm.submitGuess(ws.room_id, ws.player_id, msg.word);

    if (result.error) {
        ws.send(JSON.stringify({ type: 'guess_error', ...result.error }));
        return;
    }

    // Send private result to guesser
    sendToPlayer(ws.player_id, {
        type: 'guess_result',
        guess_num: result.guess_num,
        word: result.word,
        result: result.result,
        solved: result.solved,
        guesses_remaining: result.guesses_remaining
    });

    // Broadcast anonymous signal if player finished
    if (result.player_finished) {
        broadcastToRoom(ws.room_id, {
            type: 'player_finished',
            player_id: ws.player_id,
            solved: result.solved
        });
    }

    // Check if all finished
    if (result.all_finished) {
        clearRoundTimer(ws.room_id);
        triggerRoundEnd(ws.room_id, false);
    }
}

function handleTransferHost(ws, msg) {
    const result = rm.transferHost(ws.room_id, ws.player_id, msg.target_player_id);
    if (result.error) {
        ws.send(JSON.stringify({ type: 'error', code: result.error, message: result.error }));
        return;
    }

    broadcastToRoom(ws.room_id, {
        type: 'host_changed',
        new_host_player_id: result.new_host_player_id
    });

    // Send updated room state
    const room = rm.getRoom(ws.room_id);
    broadcastToRoom(ws.room_id, { type: 'room_state', room });
}

function handleKickPlayer(ws, msg) {
    const result = rm.kickPlayer(ws.room_id, ws.player_id, msg.target_player_id);
    if (result.error) {
        ws.send(JSON.stringify({ type: 'error', code: result.error, message: result.error }));
        return;
    }

    // Notify kicked player
    sendToPlayer(msg.target_player_id, {
        type: 'player_left',
        player_id: msg.target_player_id,
        reason: 'kicked'
    });

    // Close kicked player's connections
    const conns = playerConnections.get(msg.target_player_id);
    if (conns) {
        conns.forEach(conn => conn.close());
        playerConnections.delete(msg.target_player_id);
    }

    // Broadcast updated state
    broadcastToRoom(ws.room_id, {
        type: 'player_left',
        player_id: msg.target_player_id,
        reason: 'kicked'
    });
    const room = rm.getRoom(ws.room_id);
    broadcastToRoom(ws.room_id, { type: 'room_state', room });
}

function handleLeave(ws) {
    const result = rm.removePlayer(ws.room_id, ws.player_id);

    broadcastToRoom(ws.room_id, {
        type: 'player_left',
        player_id: ws.player_id,
        reason: 'left'
    });

    if (result && result.host_changed) {
        broadcastToRoom(ws.room_id, {
            type: 'host_changed',
            new_host_player_id: result.new_host_player_id
        });
    }

    // Send updated room state
    const room = rm.getRoom(ws.room_id);
    if (room) {
        broadcastToRoom(ws.room_id, { type: 'room_state', room });
    }

    // Check if round should end
    if (rm.checkAllFinished(ws.room_id)) {
        clearRoundTimer(ws.room_id);
        triggerRoundEnd(ws.room_id, false);
    }

    ws.close();
}

function handleDisconnect(ws) {
    const { player_id, room_id } = ws;
    if (!player_id || !room_id) return;

    // Remove from connection tracking
    const conns = playerConnections.get(player_id);
    if (conns) {
        conns.delete(ws);
        if (conns.size === 0) {
            playerConnections.delete(player_id);

            // Player fully disconnected
            const result = rm.removePlayer(room_id, player_id);

            broadcastToRoom(room_id, {
                type: 'player_left',
                player_id,
                reason: 'disconnect'
            });

            if (result && result.host_changed) {
                broadcastToRoom(room_id, {
                    type: 'host_changed',
                    new_host_player_id: result.new_host_player_id
                });
            }

            const room = rm.getRoom(room_id);
            if (room) {
                broadcastToRoom(room_id, { type: 'room_state', room });
            }

            // Check if round should end
            if (rm.checkAllFinished(room_id)) {
                clearRoundTimer(room_id);
                triggerRoundEnd(room_id, false);
            }
        }
    }
}

// ---- Round Timer Management ----
const roundTimers = new Map();

function startRoundTimer(room_id, round_number, time_limit_sec) {
    const key = `${room_id}:${round_number}`;
    const timer = setTimeout(() => {
        roundTimers.delete(key);
        triggerRoundEnd(room_id, true);
    }, time_limit_sec * 1000);
    roundTimers.set(key, timer);
}

function clearRoundTimer(room_id) {
    const room = rm.getRoomInternal(room_id);
    if (!room) return;
    const key = `${room_id}:${room.current_round}`;
    const timer = roundTimers.get(key);
    if (timer) {
        clearTimeout(timer);
        roundTimers.delete(key);
    }
}

function triggerRoundEnd(room_id, time_expired) {
    const reveal = rm.endRound(room_id, time_expired);
    if (!reveal) return;

    broadcastToRoom(room_id, {
        type: 'round_reveal',
        ...reveal
    });

    // Send scores
    const scores = rm.getScores(room_id);
    broadcastToRoom(room_id, {
        type: 'round_scores',
        rankings: scores
    });

    // Check for more rounds
    if (rm.hasMoreRounds(room_id)) {
        // Start next round after reveal period (8 seconds)
        setTimeout(() => {
            const room = rm.getRoomInternal(room_id);
            if (!room || room.status === 'finished' || room.status === 'abandoned') return;

            broadcastToRoom(room_id, {
                type: 'round_starting',
                round_number: room.current_round + 1,
                word_length: room.word_length,
                time_limit_sec: room.time_limit_sec,
                starts_at_ms: Date.now() + 3000
            });

            setTimeout(() => {
                const roundInfo = rm.startRound(room_id);
                if (roundInfo) {
                    broadcastToRoom(room_id, {
                        type: 'round_started',
                        round_number: roundInfo.round_number,
                        word_length: roundInfo.word_length
                    });
                    startRoundTimer(room_id, roundInfo.round_number, room.time_limit_sec);
                }
            }, 3000);
        }, 8000);
    } else {
        // Game over
        setTimeout(() => {
            const rankings = rm.finishGame(room_id);
            if (rankings) {
                broadcastToRoom(room_id, {
                    type: 'game_over',
                    rankings
                });
            }
        }, 5000);
    }
}

// ---- Broadcasting ----

function broadcastToRoom(room_id, message) {
    const subs = roomSubscriptions.get(room_id);
    if (!subs) return;

    const data = JSON.stringify(message);
    subs.forEach(player_id => {
        const conns = playerConnections.get(player_id);
        if (conns) {
            conns.forEach(ws => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(data);
                }
            });
        }
    });
}

function sendToPlayer(player_id, message) {
    const conns = playerConnections.get(player_id);
    if (!conns) return;
    const data = JSON.stringify(message);
    conns.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
        }
    });
}

module.exports = { setupWebSocket };
