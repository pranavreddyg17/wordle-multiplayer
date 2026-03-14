// Main App — State Machine and Event Orchestration
(function () {
    'use strict';

    // ===== STATE =====
    let state = {
        screen: 'home',        // home | lobby | game | reveal | results
        room: null,
        playerId: null,
        playerToken: null,
        wsUrl: null,
        isHost: false,
        socket: null,
        grid: null,
        keyboard: null,
        timerInterval: null,
        timerEnd: null,
        roundStartedAt: null,
        playerFinished: false,
        opponents: new Map()  // player_id -> { display_name, finished, solved }
    };

    // ===== AVATAR COLORS =====
    const AVATAR_COLORS = [
        '#6c5ce7', '#00cec9', '#e17055', '#fdcb6e', '#55a3f7',
        '#e84393', '#00b894', '#f39c12', '#9b59b6', '#1abc9c'
    ];

    function avatarColor(seed) {
        let hash = 0;
        for (let i = 0; i < (seed || '').length; i++) {
            hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        }
        return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
    }

    // ===== SCREEN MANAGEMENT =====
    function showScreen(name) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const screen = document.getElementById(`screen-${name}`);
        if (screen) screen.classList.add('active');
        state.screen = name;
    }

    // ===== TOAST =====
    function toast(message, type = '') {
        const container = document.getElementById('toast-container');
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = message;
        container.appendChild(el);
        setTimeout(() => {
            el.classList.add('leaving');
            setTimeout(() => el.remove(), 300);
        }, 2500);
    }

    // ===== API HELPERS =====
    async function api(method, path, body) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (state.playerToken) {
            opts.headers['Authorization'] = `Bearer ${state.playerToken}`;
        }
        if (body) opts.body = JSON.stringify(body);

        const res = await fetch(`/api${path}`, opts);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    }

    // ===== HOME SCREEN =====
    function initHome() {
        const nameInput = document.getElementById('input-name');
        const codeInput = document.getElementById('input-code');
        const btnCreate = document.getElementById('btn-create');
        const btnJoin = document.getElementById('btn-join');

        // Load saved name
        const savedName = localStorage.getItem('wordle_name') || '';
        nameInput.value = savedName;
        nameInput.addEventListener('focus', () => nameInput.select());

        // Format room code input
        codeInput.addEventListener('input', (e) => {
            let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (val.length > 4) val = val.slice(0, 4) + '-' + val.slice(4, 8);
            e.target.value = val;
        });

        btnCreate.addEventListener('click', async () => {
            const name = nameInput.value.trim();
            if (!name) {
                toast('Please enter your name', 'error');
                nameInput.focus();
                return;
            }
            localStorage.setItem('wordle_name', name);

            try {
                btnCreate.disabled = true;
                const data = await api('POST', '/rooms', {
                    display_name: name,
                    round_count: 5,
                    time_limit_sec: 180
                });

                state.room = data.room;
                state.playerId = data.player_id;
                state.playerToken = data.player_token;
                state.wsUrl = data.ws_url;
                state.isHost = true;

                connectWebSocket();
                showLobby();
            } catch (err) {
                toast(err.message, 'error');
            } finally {
                btnCreate.disabled = false;
            }
        });

        btnJoin.addEventListener('click', async () => {
            const name = nameInput.value.trim();
            const code = codeInput.value.trim().toUpperCase();
            if (!name) {
                toast('Please enter your name', 'error');
                nameInput.focus();
                return;
            }
            if (!code || code.length < 8) {
                toast('Please enter a valid room code', 'error');
                codeInput.focus();
                return;
            }
            localStorage.setItem('wordle_name', name);

            try {
                btnJoin.disabled = true;
                const data = await api('POST', `/rooms/${code}/join`, {
                    display_name: name
                });

                state.room = data.room;
                state.playerId = data.player_id;
                state.playerToken = data.player_token;
                state.wsUrl = data.ws_url;
                state.isHost = data.room.host_player_id === data.player_id;

                connectWebSocket();
                showLobby();
            } catch (err) {
                toast(err.message, 'error');
            } finally {
                btnJoin.disabled = false;
            }
        });

        // Enter key submits
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (codeInput.value.trim().length >= 8) {
                    btnJoin.click();
                } else {
                    codeInput.focus();
                }
            }
        });

        codeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                btnJoin.click();
            }
        });
    }

    // ===== LOBBY SCREEN =====
    function showLobby() {
        showScreen('lobby');
        updateLobby();

        // Room code
        document.getElementById('lobby-room-code').textContent = state.room.room_id;

        // Copy button
        document.getElementById('btn-copy-code').onclick = () => {
            navigator.clipboard.writeText(state.room.room_id).then(() => {
                toast('Room code copied!', 'success');
            });
        };

        // Host controls
        const isHost = state.room.host_player_id === state.playerId;
        document.getElementById('lobby-settings').style.display = isHost ? 'block' : 'none';
        document.getElementById('btn-start').style.display = isHost ? 'flex' : 'none';
        document.getElementById('lobby-waiting').style.display = isHost ? 'none' : 'block';

        // Settings controls
        initSettings();

        // Start button
        document.getElementById('btn-start').onclick = () => {
            if (state.room.players.filter(p => p.is_connected).length < 2) {
                toast('Need at least 2 players to start', 'error');
                return;
            }
            // Read settings from the lobby UI
            const roundCount = parseInt(document.getElementById('setting-rounds').dataset.value) || 5;
            const timerSec = parseInt(document.getElementById('setting-timer').dataset.value) || 180;
            state.socket.send('start_game', {
                room_id: state.room.room_id,
                round_count: roundCount,
                time_limit_sec: timerSec
            });
        };

        // Leave button
        document.getElementById('btn-leave-lobby').onclick = () => {
            if (state.socket) {
                state.socket.send('leave_room', { room_id: state.room.room_id });
                state.socket.close();
            }
            resetState();
            showScreen('home');
        };
    }

    function updateLobby() {
        if (!state.room) return;
        const list = document.getElementById('lobby-player-list');
        const count = document.getElementById('lobby-player-count');

        const players = state.room.players.filter(p => p.is_connected);
        count.textContent = `${players.length}/${state.room.max_players}`;

        list.innerHTML = '';
        players.forEach(p => {
            const item = document.createElement('div');
            item.className = 'player-item';

            const color = avatarColor(p.avatar_seed);
            const initial = (p.display_name || '?')[0].toUpperCase();

            let badges = '';
            if (p.is_host) badges += '<span class="player-badge host">👑 Host</span>';
            if (p.player_id === state.playerId) badges += '<span class="player-badge you">You</span>';

            item.innerHTML = `
        <div class="player-avatar" style="background:${color}">${initial}</div>
        <div class="player-info">
          <div class="player-name">${escapeHtml(p.display_name)}</div>
        </div>
        ${badges}
      `;
            list.appendChild(item);
        });

        // Update host controls visibility
        const isHost = state.room.host_player_id === state.playerId;
        state.isHost = isHost;
        document.getElementById('lobby-settings').style.display = isHost ? 'block' : 'none';
        document.getElementById('btn-start').style.display = isHost ? 'flex' : 'none';
        document.getElementById('lobby-waiting').style.display = isHost ? 'none' : 'block';
    }

    function initSettings() {
        document.querySelectorAll('.btn-dec, .btn-inc').forEach(btn => {
            btn.onclick = () => {
                const target = document.getElementById(btn.dataset.target);
                const min = parseInt(target.dataset.min);
                const max = parseInt(target.dataset.max);
                const step = parseInt(target.dataset.step || '1');
                let val = parseInt(target.dataset.value);

                if (btn.classList.contains('btn-dec')) val = Math.max(min, val - step);
                else val = Math.min(max, val + step);

                target.dataset.value = val;
                target.textContent = val;
            };
        });
    }

    // ===== WEBSOCKET =====
    function connectWebSocket() {
        const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${location.host}/ws`;

        state.socket = new WordleSocket(wsUrl, state.playerToken, handleWsEvent);
    }

    function handleWsEvent(msg) {
        switch (msg.type) {
            case '_connected':
                break;

            case '_disconnected':
                toast('Connection lost. Reconnecting…', 'error');
                break;

            case 'room_state':
                state.room = msg.room;
                if (state.screen === 'lobby') updateLobby();
                break;

            case 'player_joined':
                toast(`${msg.display_name} joined`, 'success');
                break;

            case 'player_left':
                const reason = msg.reason === 'kicked' ? 'was kicked' : 'left';
                if (msg.player_id === state.playerId && msg.reason === 'kicked') {
                    toast('You were kicked from the room', 'error');
                    resetState();
                    showScreen('home');
                    return;
                }
                break;

            case 'host_changed':
                state.isHost = msg.new_host_player_id === state.playerId;
                if (state.screen === 'lobby') updateLobby();
                break;

            case 'round_starting':
                showCountdown(msg);
                break;

            case 'round_started':
                startPlaying(msg);
                break;

            case 'guess_result':
                handleGuessResult(msg);
                break;

            case 'guess_error':
                handleGuessError(msg);
                break;

            case 'player_finished':
                handlePlayerFinished(msg);
                break;

            case 'round_reveal':
                showReveal(msg);
                break;

            case 'round_scores':
                updateRevealScores(msg.rankings);
                break;

            case 'game_over':
                showResults(msg.rankings);
                break;

            case 'pong':
                break;

            case 'error':
                toast(msg.message || 'An error occurred', 'error');
                break;
        }
    }

    // ===== COUNTDOWN =====
    function showCountdown(msg) {
        showScreen('game');

        const overlay = document.getElementById('overlay-countdown');
        const label = document.getElementById('countdown-label');
        const number = document.getElementById('countdown-number');

        label.textContent = `Round ${msg.round_number}`;
        overlay.style.display = 'flex';

        let count = 3;
        number.textContent = count;

        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                number.textContent = count;
            } else {
                clearInterval(interval);
                number.textContent = 'GO!';
                setTimeout(() => {
                    overlay.style.display = 'none';
                }, 500);
            }
        }, 1000);
    }

    // ===== PLAYING =====
    function startPlaying(msg) {
        showScreen('game');
        state.playerFinished = false;
        state.opponents.clear();

        // Update round label
        document.getElementById('game-round-label').textContent =
            `Round ${msg.round_number} / ${state.room.round_count}`;

        // Setup grid
        const gridArea = document.getElementById('game-grid-area');
        gridArea.classList.remove('waiting');
        state.grid = new TileGrid(gridArea, msg.word_length || 5);

        // Setup keyboard
        const kbArea = document.getElementById('game-keyboard');
        if (state.keyboard) state.keyboard.unbindPhysicalKeyboard();
        state.keyboard = new GameKeyboard(kbArea, handleKeyInput);

        // Setup opponents bar
        updateOpponentsBar();

        // Start timer
        startTimer(state.room.time_limit_sec);

        // Clear message
        document.getElementById('game-message').textContent = '';
        document.getElementById('game-message').className = 'game-message';
    }

    function handleKeyInput(key) {
        if (state.playerFinished || !state.grid || state.grid.locked) return;

        if (key === 'Enter') {
            submitGuess();
        } else if (key === 'Backspace') {
            state.grid.removeLetter();
        } else if (/^[A-Z]$/.test(key)) {
            state.grid.addLetter(key);
        }
    }

    function submitGuess() {
        if (!state.grid.isRowFull()) {
            state.grid.shake();
            showMessage('Not enough letters', true);
            return;
        }

        const word = state.grid.getCurrentWord();
        state.socket.send('submit_guess', {
            room_id: state.room.room_id,
            word: word
        });
    }

    function handleGuessResult(msg) {
        if (!state.grid) return;

        state.grid.revealRow(msg.result, () => {
            // Update keyboard
            if (state.keyboard) {
                state.keyboard.updateKeys(msg.word, msg.result);
            }

            if (msg.solved) {
                state.playerFinished = true;
                showMessage('🎉 Brilliant!');
                lockGrid();
            } else if (msg.guesses_remaining === 0) {
                state.playerFinished = true;
                showMessage('No guesses left');
                lockGrid();
            }
        });
    }

    function handleGuessError(msg) {
        if (state.grid) state.grid.shake();
        showMessage(msg.message, true);
    }

    function handlePlayerFinished(msg) {
        if (msg.player_id === state.playerId) return;

        state.opponents.set(msg.player_id, {
            ...state.opponents.get(msg.player_id),
            finished: true,
            solved: msg.solved
        });
        updateOpponentsBar();
    }

    function lockGrid() {
        const gridArea = document.getElementById('game-grid-area');
        gridArea.classList.add('waiting');
    }

    function showMessage(text, isError = false) {
        const el = document.getElementById('game-message');
        el.textContent = text;
        el.className = 'game-message' + (isError ? ' error' : '');
        if (isError) {
            setTimeout(() => {
                el.textContent = '';
                el.className = 'game-message';
            }, 2000);
        }
    }

    function updateOpponentsBar() {
        const bar = document.getElementById('game-opponents');
        bar.innerHTML = '';

        if (!state.room) return;

        state.room.players
            .filter(p => p.player_id !== state.playerId && p.is_connected && p.role === 'player')
            .forEach(p => {
                const data = state.opponents.get(p.player_id) || {};
                const chip = document.createElement('div');
                chip.className = `opponent-chip ${data.finished ? (data.solved ? 'finished' : 'failed') : ''}`;
                chip.innerHTML = `
          <span class="opponent-dot"></span>
          <span>${escapeHtml(p.display_name)}</span>
          ${data.finished ? (data.solved ? '✓' : '✗') : ''}
        `;
                bar.appendChild(chip);
            });
    }

    // ===== TIMER =====
    function startTimer(seconds) {
        clearTimer();
        const now = Date.now();
        state.timerEnd = now + seconds * 1000;
        state.roundStartedAt = now;

        updateTimerDisplay();
        state.timerInterval = setInterval(updateTimerDisplay, 1000);
    }

    function updateTimerDisplay() {
        const bar = document.getElementById('game-timer-bar');
        const text = document.getElementById('game-timer-text');
        const now = Date.now();
        const total = state.timerEnd - state.roundStartedAt;
        const remaining = Math.max(0, state.timerEnd - now);
        const progress = (remaining / total) * 100;

        const secs = Math.ceil(remaining / 1000);
        const mins = Math.floor(secs / 60);
        const s = secs % 60;
        text.textContent = `${mins}:${s.toString().padStart(2, '0')}`;

        bar.style.setProperty('--progress', `${progress}%`);

        if (secs <= 30) {
            bar.classList.add('urgent');
            text.classList.add('urgent');
        } else {
            bar.classList.remove('urgent');
            text.classList.remove('urgent');
        }

        if (remaining <= 0) {
            clearTimer();
        }
    }

    function clearTimer() {
        if (state.timerInterval) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
        }
    }

    // ===== REVEAL =====
    function showReveal(msg) {
        clearTimer();
        showScreen('reveal');

        document.getElementById('reveal-answer').textContent = msg.word;

        // Build grids
        const gridsContainer = document.getElementById('reveal-grids');
        gridsContainer.innerHTML = '';

        msg.attempts.forEach(attempt => {
            const player = document.createElement('div');
            player.className = 'reveal-player';

            const isYou = attempt.player_id === state.playerId;
            const badgeClass = attempt.solved ? 'solved' : 'failed';
            const badgeText = attempt.solved ? `Solved in ${attempt.solve_guess_num}` : 'Not solved';

            player.innerHTML = `
        <div class="reveal-player-name">
          ${escapeHtml(attempt.display_name)}
          ${isYou ? '<span class="player-badge you">You</span>' : ''}
          <span class="reveal-player-badge ${badgeClass}">${badgeText}</span>
        </div>
      `;

            const miniGrid = createMiniGrid(attempt.guesses, msg.word.length);
            player.appendChild(miniGrid);
            gridsContainer.appendChild(player);
        });

        // Show next round message
        const nextLabel = document.getElementById('reveal-next');
        if (state.room && state.room.current_round < state.room.round_count) {
            nextLabel.textContent = 'Next round starting soon…';
            nextLabel.style.display = 'block';
        } else {
            nextLabel.textContent = 'Final results coming up…';
            nextLabel.style.display = 'block';
        }
    }

    function updateRevealScores(rankings) {
        const scoresContainer = document.getElementById('reveal-scores');
        scoresContainer.innerHTML = buildScoresTable(rankings);
    }

    function buildScoresTable(rankings) {
        let html = `
      <table class="scores-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Solved</th>
            <th>Guesses</th>
          </tr>
        </thead>
        <tbody>
    `;

        rankings.forEach(r => {
            const rankClass = r.rank <= 3 ? `rank-${r.rank}` : '';
            const isYou = r.player_id === state.playerId;
            html += `
        <tr>
          <td class="rank-cell ${rankClass}">${r.rank}</td>
          <td class="name-cell">${escapeHtml(r.display_name)} ${isYou ? '<span class="player-badge you">You</span>' : ''}</td>
          <td class="stat-cell">${r.words_solved}</td>
          <td class="stat-cell">${r.total_guesses}</td>
        </tr>
      `;
        });

        html += '</tbody></table>';
        return html;
    }

    // ===== RESULTS =====
    function showResults(rankings) {
        clearTimer();
        showScreen('results');

        // Podium (top 3)
        const podium = document.getElementById('results-podium');
        podium.innerHTML = '';

        // Reorder for podium: [2nd, 1st, 3rd]
        const podiumOrder = [1, 0, 2];
        podiumOrder.forEach(idx => {
            if (idx >= rankings.length) return;
            const r = rankings[idx];
            const color = avatarColor(r.avatar_seed);
            const initial = (r.display_name || '?')[0].toUpperCase();

            const place = document.createElement('div');
            place.className = 'podium-place';
            place.innerHTML = `
        <div class="podium-avatar" style="background:${color}">${initial}</div>
        <div class="podium-name">${escapeHtml(r.display_name)}</div>
        <div class="podium-stat">${r.words_solved} solved · ${r.total_guesses} guesses</div>
        <div class="podium-bar"></div>
      `;
            podium.appendChild(place);
        });

        // Full table
        const table = document.getElementById('results-table');
        table.innerHTML = buildScoresTable(rankings);

        // Actions
        document.getElementById('btn-play-again').onclick = () => {
            resetState();
            showScreen('home');
        };

        document.getElementById('btn-go-home').onclick = () => {
            resetState();
            showScreen('home');
        };
    }

    // ===== UTILITIES =====
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function resetState() {
        if (state.socket) {
            state.socket.close();
        }
        clearTimer();
        if (state.keyboard) {
            state.keyboard.unbindPhysicalKeyboard();
        }
        state = {
            screen: 'home',
            room: null,
            playerId: null,
            playerToken: null,
            wsUrl: null,
            isHost: false,
            socket: null,
            grid: null,
            keyboard: null,
            timerInterval: null,
            timerEnd: null,
            roundStartedAt: null,
            playerFinished: false,
            opponents: new Map()
        };
    }

    // ===== INIT =====
    document.addEventListener('DOMContentLoaded', () => {
        initHome();
        showScreen('home');
    });

})();
