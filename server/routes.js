// REST API Routes
const express = require('express');
const rm = require('./roomManager');
const router = express.Router();

// Create room
router.post('/rooms', (req, res) => {
    const { display_name, round_count, word_length, time_limit_sec, max_players } = req.body;

    if (!display_name || display_name.trim().length === 0) {
        return res.status(400).json({ error: 'display_name is required' });
    }
    if (display_name.trim().length > 20) {
        return res.status(400).json({ error: 'display_name must be 20 characters or less' });
    }

    const result = rm.createRoom({
        display_name: display_name.trim(),
        round_count,
        word_length,
        time_limit_sec,
        max_players
    });

    res.status(201).json({
        room_id: result.room_id,
        player_id: result.player_id,
        player_token: result.token,
        ws_url: `ws://${req.headers.host}/ws`,
        room: result.room
    });
});

// Join room
router.post('/rooms/:room_id/join', (req, res) => {
    const { room_id } = req.params;
    const { display_name, player_id } = req.body;

    if (!display_name || display_name.trim().length === 0) {
        return res.status(400).json({ error: 'display_name is required' });
    }
    if (display_name.trim().length > 20) {
        return res.status(400).json({ error: 'display_name must be 20 characters or less' });
    }

    const result = rm.joinRoom(room_id.toUpperCase(), {
        display_name: display_name.trim(),
        player_id
    });

    if (result.error) {
        return res.status(result.status || 400).json({ error: result.error });
    }

    res.json({
        room: result.room,
        player_id: result.player_id,
        player_token: result.token,
        ws_url: `ws://${req.headers.host}/ws`
    });
});

// Get room state
router.get('/rooms/:room_id', (req, res) => {
    const room = rm.getRoom(req.params.room_id.toUpperCase());
    if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });
    res.json(room);
});

// Start game
router.post('/rooms/:room_id/start', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const session = rm.getSessionByToken(token);
    if (!session) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const result = rm.startGame(req.params.room_id.toUpperCase(), session.player_id);
    if (result.error) {
        const statusMap = { NOT_HOST: 403, ALREADY_STARTED: 409, NOT_ENOUGH_PLAYERS: 422 };
        return res.status(statusMap[result.error] || 400).json({ error: result.error });
    }

    res.json({ status: 'starting', countdown_sec: 3 });
});

// Get results
router.get('/rooms/:room_id/results', (req, res) => {
    const room = rm.getRoomInternal(req.params.room_id.toUpperCase());
    if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });
    if (room.status !== 'finished') return res.status(400).json({ error: 'GAME_NOT_FINISHED' });

    const rankings = rm.getScores(req.params.room_id.toUpperCase());
    res.json({ room_id: room.room_id, rankings });
});

module.exports = router;
