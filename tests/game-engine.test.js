const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeTiles, validateGuess, rankPlayers } = require('../server/gameEngine');

test('repeated guesses cannot consume the same target letter twice', () => {
  assert.deepEqual(computeTiles('ALLEY', 'APPLE'), ['CORRECT', 'PRESENT', 'ABSENT', 'PRESENT', 'ABSENT']);
  assert.deepEqual(computeTiles('AAAAA', 'BANAL'), ['ABSENT', 'CORRECT', 'ABSENT', 'CORRECT', 'ABSENT']);
});
test('rejects incorrect length, punctuation, and unknown words', () => {
  const words = new Set(['APPLE']);
  assert.equal(validateGuess('APP', 5, words).code, 'WRONG_LENGTH');
  assert.equal(validateGuess('APPL!', 5, words).valid, false);
  assert.equal(validateGuess('OTHER', 5, words).valid, false);
  assert.equal(validateGuess('apple', 5, words).valid, true);
});
test('ranks solved words before guesses and uses time as the tiebreak', () => {
  const player = (id, guesses, time) => ({ player_id: id, display_name: id, attempts: [{ solved: true, solve_guess_num: guesses, solve_time_ms: time, guess_count: guesses }] });
  const result = rankPlayers([player('slower', 2, 9000), player('faster', 2, 3000), player('fewer', 1, 12000), {player_id:'unsolved', attempts:[{solved:false, guess_count:1}]}]);
  assert.deepEqual(result.map(p => p.player_id), ['fewer', 'faster', 'slower', 'unsolved']);
  assert.equal(result[3].avg_solve_time_ms, null);
});
