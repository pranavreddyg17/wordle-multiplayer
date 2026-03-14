// Room Manager — in-memory room lifecycle management
const { v4: uuidv4 } = require('uuid');
const { selectWord } = require('./wordService');
const { computeTiles, validateGuess, rankPlayers } = require('./gameEngine');
const { validSet } = require('./wordService');

// In-memory room store
const rooms = new Map();
const playerSessions = new Map(); // token -> { player_id, display_name, room_id }

const CONSONANTS = 'BCDFGHJKMNPQRSTVWXYZ';
const DIGITS = '23456789';

function generateRoomId() {
    const letters = Array.from({ length: 4 },
        () => CONSONANTS[Math.floor(Math.random() * CONSONANTS.length)]).join('');
    const numbers = Array.from({ length: 4 },
        () => DIGITS[Math.floor(Math.random() * DIGITS.length)]).join('');
    const id = `${letters}-${numbers}`;
    if (rooms.has(id)) return generateRoomId();
    return id;
}

function generateToken() {
    // Simple token for local dev — in production use JWT
    return uuidv4() + '-' + Date.now().toString(36);
}

function createRoom({ display_name, round_count = 5, word_length = 5, time_limit_sec = 180, max_players = 10 }) {
    const room_id = generateRoomId();
    const player_id = uuidv4();
    const token = generateToken();

    const room = {
        room_id,
        status: 'lobby',
        host_player_id: player_id,
        round_count: Math.max(1, Math.min(10, round_count)),
        current_round: 0,
        word_length: Math.max(4, Math.min(7, word_length)),
        time_limit_sec: Math.max(30, Math.min(600, time_limit_sec)),
        max_players: Math.max(2, Math.min(20, max_players)),
        created_at: Date.now(),
        started_at: null,
        finished_at: null,
        players: [{
            player_id,
            display_name,
            avatar_seed: Math.random().toString(36).substring(2, 8),
            is_host: true,
            is_connected: true,
            role: 'player'
        }],
        rounds: [],
        used_words: [],
        timers: {}
    };

    rooms.set(room_id, room);
    playerSessions.set(token, { player_id, display_name, room_id });

    return { room_id, player_id, token, room: sanitizeRoom(room) };
}

function joinRoom(room_id, { display_name, player_id: existing_pid }) {
    const room = rooms.get(room_id);
    if (!room) return { error: 'ROOM_NOT_FOUND', status: 404 };
    if (room.status !== 'lobby') return { error: 'ALREADY_STARTED', status: 409 };
    if (room.players.length >= room.max_players) return { error: 'ROOM_FULL', status: 409 };

    // Check if reconnecting
    if (existing_pid) {
        const existing = room.players.find(p => p.player_id === existing_pid);
        if (existing) {
            existing.is_connected = true;
            const token = generateToken();
            playerSessions.set(token, { player_id: existing_pid, display_name: existing.display_name, room_id });
            return { room: sanitizeRoom(room), player_id: existing_pid, token };
        }
    }

    // Check for duplicate display name
    let finalName = display_name;
    const existingNames = new Set(room.players.map(p => p.display_name));
    let suffix = 2;
    while (existingNames.has(finalName)) {
        finalName = `${display_name} ${suffix++}`;
    }

    const player_id = uuidv4();
    const token = generateToken();

    room.players.push({
        player_id,
        display_name: finalName,
        avatar_seed: Math.random().toString(36).substring(2, 8),
        is_host: false,
        is_connected: true,
        role: 'player'
    });

    playerSessions.set(token, { player_id, display_name: finalName, room_id });

    return { room: sanitizeRoom(room), player_id, token };
}

function startGame(room_id, player_id, settings = {}) {
    const room = rooms.get(room_id);
    if (!room) return { error: 'ROOM_NOT_FOUND' };
    if (room.host_player_id !== player_id) return { error: 'NOT_HOST' };
    if (room.status !== 'lobby') return { error: 'ALREADY_STARTED' };

    const activePlayers = room.players.filter(p => p.is_connected && p.role === 'player');
    if (activePlayers.length < 2) return { error: 'NOT_ENOUGH_PLAYERS' };

    // Apply host's lobby settings before starting
    if (settings.round_count != null) {
        room.round_count = Math.max(1, Math.min(10, parseInt(settings.round_count) || 5));
    }
    if (settings.time_limit_sec != null) {
        room.time_limit_sec = Math.max(30, Math.min(600, parseInt(settings.time_limit_sec) || 180));
    }

    room.status = 'starting';
    room.started_at = Date.now();

    return { success: true };
}

function startRound(room_id) {
    const room = rooms.get(room_id);
    if (!room) return null;

    room.current_round++;
    const word = selectWord(room.used_words);
    room.used_words.push(word);

    const round = {
        round_number: room.current_round,
        word,
        started_at: Date.now(),
        ended_at: null,
        attempts: new Map() // player_id -> attempt data
    };

    // Initialize attempts for all connected players
    room.players.forEach(p => {
        if (p.is_connected && p.role === 'player') {
            round.attempts.set(p.player_id, {
                player_id: p.player_id,
                display_name: p.display_name,
                solved: false,
                guess_count: 0,
                solve_guess_num: null,
                solve_time_ms: null,
                guesses: [],
                finished: false
            });
        }
    });

    room.rounds.push(round);
    room.status = 'in_round';

    return {
        round_number: room.current_round,
        word_length: room.word_length,
        time_limit_sec: room.time_limit_sec,
        starts_at_ms: Date.now() + 3000 // 3-second countdown
    };
}

function submitGuess(room_id, player_id, word) {
    const room = rooms.get(room_id);
    if (!room) return { error: { code: 'ROOM_NOT_FOUND', message: 'Room not found' } };
    if (room.status !== 'in_round') return { error: { code: 'ROUND_OVER', message: 'Round is not active' } };

    const round = room.rounds[room.current_round - 1];
    if (!round) return { error: { code: 'ROUND_OVER', message: 'No active round' } };

    const attempt = round.attempts.get(player_id);
    if (!attempt) return { error: { code: 'NOT_YOUR_TURN', message: 'You are not in this round' } };
    if (attempt.finished) return { error: { code: 'ATTEMPT_EXHAUSTED', message: 'You have already finished this round' } };
    if (attempt.guess_count >= 6) return { error: { code: 'ATTEMPT_EXHAUSTED', message: 'All guesses used' } };

    const normalized = word.toUpperCase();

    // Validate
    const validation = validateGuess(normalized, room.word_length, validSet);
    if (!validation.valid) return { error: { code: validation.code, message: validation.message } };

    // Compute tiles
    const result = computeTiles(normalized, round.word);
    const solved = result.every(t => t === 'CORRECT');
    attempt.guess_count++;

    const guessEntry = {
        guess_num: attempt.guess_count,
        word: normalized,
        result,
        submitted_at: Date.now()
    };
    attempt.guesses.push(guessEntry);

    if (solved) {
        attempt.solved = true;
        attempt.solve_guess_num = attempt.guess_count;
        attempt.solve_time_ms = Date.now() - round.started_at;
        attempt.finished = true;
    } else if (attempt.guess_count >= 6) {
        attempt.finished = true;
    }

    // Check if all players are finished
    const allFinished = [...round.attempts.values()].every(a => a.finished);

    return {
        guess_num: attempt.guess_count,
        word: normalized,
        result,
        solved,
        guesses_remaining: 6 - attempt.guess_count,
        all_finished: allFinished,
        player_finished: attempt.finished
    };
}

function endRound(room_id, time_expired = false) {
    const room = rooms.get(room_id);
    if (!room) return null;

    const round = room.rounds[room.current_round - 1];
    if (!round) return null;

    round.ended_at = Date.now();

    // Mark all unfinished players as finished
    round.attempts.forEach(attempt => {
        if (!attempt.finished) {
            attempt.finished = true;
        }
    });

    room.status = 'reveal';

    const attempts = [...round.attempts.values()].map(a => ({
        player_id: a.player_id,
        display_name: a.display_name,
        solved: a.solved,
        solve_guess_num: a.solve_guess_num,
        solve_time_ms: a.solve_time_ms,
        guesses: a.guesses.map(g => ({
            word: g.word,
            result: g.result
        }))
    }));

    return {
        round_number: room.current_round,
        word: round.word,
        time_expired,
        attempts
    };
}

function getScores(room_id) {
    const room = rooms.get(room_id);
    if (!room) return null;

    const playerAttempts = room.players
        .filter(p => p.role === 'player')
        .map(p => ({
            player_id: p.player_id,
            display_name: p.display_name,
            avatar_seed: p.avatar_seed,
            attempts: room.rounds.map(round => {
                const attempt = round.attempts.get(p.player_id);
                return attempt || {
                    solved: false,
                    guess_count: 0,
                    solve_guess_num: null,
                    solve_time_ms: null
                };
            })
        }));

    return rankPlayers(playerAttempts);
}

function finishGame(room_id) {
    const room = rooms.get(room_id);
    if (!room) return null;
    room.status = 'finished';
    room.finished_at = Date.now();
    return getScores(room_id);
}

function hasMoreRounds(room_id) {
    const room = rooms.get(room_id);
    if (!room) return false;
    return room.current_round < room.round_count;
}

function transferHost(room_id, from_player_id, to_player_id) {
    const room = rooms.get(room_id);
    if (!room) return { error: 'ROOM_NOT_FOUND' };
    if (room.host_player_id !== from_player_id) return { error: 'NOT_HOST' };
    const target = room.players.find(p => p.player_id === to_player_id);
    if (!target) return { error: 'PLAYER_NOT_FOUND' };

    room.host_player_id = to_player_id;
    room.players.forEach(p => { p.is_host = p.player_id === to_player_id; });

    return { success: true, new_host_player_id: to_player_id };
}

function kickPlayer(room_id, host_id, target_pid) {
    const room = rooms.get(room_id);
    if (!room) return { error: 'ROOM_NOT_FOUND' };
    if (room.host_player_id !== host_id) return { error: 'NOT_HOST' };
    if (room.status !== 'lobby') return { error: 'GAME_IN_PROGRESS' };
    if (host_id === target_pid) return { error: 'CANNOT_KICK_SELF' };

    room.players = room.players.filter(p => p.player_id !== target_pid);
    return { success: true };
}

function removePlayer(room_id, player_id) {
    const room = rooms.get(room_id);
    if (!room) return null;

    const player = room.players.find(p => p.player_id === player_id);
    if (!player) return null;

    player.is_connected = false;

    // If host disconnected, transfer to next connected player
    if (room.host_player_id === player_id) {
        const next = room.players.find(p => p.is_connected && p.player_id !== player_id);
        if (next) {
            room.host_player_id = next.player_id;
            room.players.forEach(p => { p.is_host = p.player_id === next.player_id; });
            return { host_changed: true, new_host_player_id: next.player_id };
        }
    }

    // Check if all players disconnected
    const connected = room.players.filter(p => p.is_connected);
    if (connected.length === 0) {
        // Schedule room cleanup
        room.status = 'abandoned';
    }

    // If in round, check if remaining connected players are all finished
    if (room.status === 'in_round') {
        const round = room.rounds[room.current_round - 1];
        if (round) {
            const attempt = round.attempts.get(player_id);
            if (attempt) attempt.finished = true;
        }
    }

    return { host_changed: false };
}

function getRoom(room_id) {
    const room = rooms.get(room_id);
    if (!room) return null;
    return sanitizeRoom(room);
}

function getRoomInternal(room_id) {
    return rooms.get(room_id);
}

function checkAllFinished(room_id) {
    const room = rooms.get(room_id);
    if (!room || room.status !== 'in_round') return false;
    const round = room.rounds[room.current_round - 1];
    if (!round) return false;

    // Only check connected players
    const connectedPlayerIds = new Set(
        room.players.filter(p => p.is_connected && p.role === 'player').map(p => p.player_id)
    );

    return [...round.attempts.entries()]
        .filter(([pid]) => connectedPlayerIds.has(pid))
        .every(([, a]) => a.finished);
}

function getSessionByToken(token) {
    return playerSessions.get(token);
}

function sanitizeRoom(room) {
    return {
        room_id: room.room_id,
        status: room.status,
        host_player_id: room.host_player_id,
        round_count: room.round_count,
        current_round: room.current_round,
        word_length: room.word_length,
        time_limit_sec: room.time_limit_sec,
        max_players: room.max_players,
        players: room.players.map(p => ({
            player_id: p.player_id,
            display_name: p.display_name,
            avatar_seed: p.avatar_seed,
            is_host: p.is_host,
            is_connected: p.is_connected,
            role: p.role
        }))
    };
}

// Cleanup expired rooms every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [id, room] of rooms) {
        const age = now - room.created_at;
        if (room.status === 'abandoned' || age > 2 * 60 * 60 * 1000) {
            rooms.delete(id);
        }
    }
}, 5 * 60 * 1000);

module.exports = {
    createRoom, joinRoom, startGame, startRound, submitGuess,
    endRound, getScores, finishGame, hasMoreRounds,
    transferHost, kickPlayer, removePlayer,
    getRoom, getRoomInternal, getSessionByToken,
    checkAllFinished, rooms
};
