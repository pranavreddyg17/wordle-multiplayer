// Game Engine — pure logic, no I/O
// Handles tile computation, guess validation, and scoring

/**
 * Compute tile results for a guess against a target word.
 * Two-pass algorithm: mark CORRECT first, then PRESENT.
 */
function computeTiles(guess, target) {
  const g = guess.toUpperCase();
  const t = target.toUpperCase();
  const result = Array(t.length).fill('ABSENT');
  const targetCounts = {};

  // Pass 1: mark CORRECT, build remaining letter counts
  for (let i = 0; i < t.length; i++) {
    if (g[i] === t[i]) {
      result[i] = 'CORRECT';
    } else {
      targetCounts[t[i]] = (targetCounts[t[i]] || 0) + 1;
    }
  }

  // Pass 2: mark PRESENT for non-CORRECT positions
  for (let i = 0; i < g.length; i++) {
    if (result[i] === 'CORRECT') continue;
    if (targetCounts[g[i]] > 0) {
      result[i] = 'PRESENT';
      targetCounts[g[i]]--;
    }
  }

  return result;
}

/**
 * Validate a guess word.
 * Returns { valid: true } or { valid: false, code, message }.
 */
function validateGuess(word, wordLength, validWordsSet) {
  const w = word.toUpperCase();
  if (w.length !== wordLength) {
    return { valid: false, code: 'WRONG_LENGTH', message: `Word must be ${wordLength} letters` };
  }
  if (!/^[A-Z]+$/.test(w)) {
    return { valid: false, code: 'INVALID_WORD', message: 'Word contains invalid characters' };
  }
  if (!validWordsSet.has(w)) {
    return { valid: false, code: 'INVALID_WORD', message: 'Not in word list' };
  }
  return { valid: true };
}

/**
 * Rank players by: words_solved DESC, total_guesses ASC, avg_solve_time ASC.
 */
function rankPlayers(playerAttempts) {
  const scores = playerAttempts.map(p => {
    const solved = p.attempts.filter(a => a.solved);
    return {
      player_id: p.player_id,
      display_name: p.display_name,
      avatar_seed: p.avatar_seed,
      words_solved: solved.length,
      total_guesses: solved.reduce((sum, a) => sum + a.solve_guess_num, 0),
      avg_solve_time_ms: solved.length === 0 ? Infinity
        : Math.round(solved.reduce((s, a) => s + a.solve_time_ms, 0) / solved.length),
      rounds: p.attempts.map((a, i) => ({
        round: i + 1,
        solved: a.solved,
        guesses: a.solved ? a.solve_guess_num : a.guess_count,
        time_ms: a.solve_time_ms || null
      }))
    };
  });

  scores.sort((a, b) => {
    if (b.words_solved !== a.words_solved) return b.words_solved - a.words_solved;
    if (a.total_guesses !== b.total_guesses) return a.total_guesses - b.total_guesses;
    return (a.avg_solve_time_ms || Infinity) - (b.avg_solve_time_ms || Infinity);
  });

  return scores.map((s, i) => ({
    ...s,
    rank: i + 1,
    avg_solve_time_ms: s.avg_solve_time_ms === Infinity ? null : s.avg_solve_time_ms
  }));
}

module.exports = { computeTiles, validateGuess, rankPlayers };
