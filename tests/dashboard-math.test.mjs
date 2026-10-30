import test from 'node:test';
import assert from 'node:assert/strict';
import { heatLevel, currentStreak, pearsonR, parseSprintProgress } from '../lib/dashboard-math.ts';
test('heat thresholds and trailing streak preserve existing behavior',()=>{
  assert.deepEqual([0,.74,.75,1.5,2.25].map(heatLevel),[0,1,2,3,4]);
  assert.equal(currentStreak([{hours:0},{hours:1},{hours:2}]),2);
  assert.equal(currentStreak([]),0);
});
test('correlation handles empty and constant input without NaN',()=>{
  assert.equal(pearsonR([]),0);
  assert.equal(pearsonR([{meditationHours:1,clarity:2},{meditationHours:1,clarity:3}]),0);
  assert.equal(pearsonR([{meditationHours:1,clarity:2},{meditationHours:2,clarity:4}]),1);
});
test('persisted progress accepts only finite percentages',()=>{
  for(const raw of [null,'null','[]','{','42']) assert.deepEqual(parseSprintProgress(raw),{});
  assert.deepEqual(parseSprintProgress('{"ok":50,"bad":101,"negative":-1,"text":"80"}'),{ok:50});
});
