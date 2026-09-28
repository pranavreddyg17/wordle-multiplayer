const { test } = require('node:test');
const assert = require('node:assert/strict');
const rm = require('../server/roomManager');

test('enforces capacity and only lets the host start', () => {
  const host = rm.createRoom({display_name:'Host', max_players:2});
  assert.equal(rm.startGame(host.room_id, host.player_id).error, 'NOT_ENOUGH_PLAYERS');
  const guest = rm.joinRoom(host.room_id, {display_name:'Guest'});
  assert.equal(rm.joinRoom(host.room_id, {display_name:'Extra'}).error, 'ROOM_FULL');
  assert.equal(rm.startGame(host.room_id, guest.player_id).error, 'NOT_HOST');
  assert.equal(rm.startGame(host.room_id, host.player_id).error, undefined);
  rm.rooms.delete(host.room_id);
});

test('expiration reveals the answer and closes remaining attempts', () => {
  const host = rm.createRoom({display_name:'Host'});
  rm.joinRoom(host.room_id, {display_name:'Guest'});
  rm.startGame(host.room_id, host.player_id);
  rm.startRound(host.room_id);
  const result = rm.endRound(host.room_id, true);
  assert.equal(result.time_expired, true);
  assert.equal(result.word.length, 5);
  assert.equal(rm.getRoom(host.room_id).status, 'reveal');
  assert.ok([...rm.getRoomInternal(host.room_id).rounds[0].attempts.values()].every(a => a.finished));
  rm.rooms.delete(host.room_id);
});

test('a lobby player can reconnect with the current prototype identity', () => {
  const host = rm.createRoom({display_name:'Host'});
  const guest = rm.joinRoom(host.room_id, {display_name:'Guest'});
  rm.getRoomInternal(host.room_id).players.find(p => p.player_id === guest.player_id).is_connected = false;
  const result = rm.joinRoom(host.room_id, {display_name:'Guest', player_id:guest.player_id});
  assert.equal(result.player_id, guest.player_id);
  assert.equal(result.room.players.length, 2);
  assert.equal(result.room.players.find(p => p.player_id === guest.player_id).is_connected, true);
  rm.rooms.delete(host.room_id);
});
