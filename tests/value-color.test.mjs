import test from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('../lib/design/value-color.ts');
const distance = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

test('a shared numeric scale remains continuous at zero and every color anchor', async () => {
  const { valueColorRgb, VALUE_COLOR_STOPS } = await load();
  for (const { value } of VALUE_COLOR_STOPS) {
    assert.ok(distance(valueColorRgb(value - 1e-8), valueColorRgb(value + 1e-8)) < 1e-4);
  }
  assert.deepEqual(valueColorRgb(-0), valueColorRgb(0));
});

test('color saturates on a fixed scale without changing the displayed numeric value', async () => {
  const { valueColorRgb, valueColor, VALUE_COLOR_STOPS } = await load();
  assert.deepEqual(valueColorRgb(-200), valueColorRgb(-2));
  assert.deepEqual(valueColorRgb(200), valueColorRgb(2));
  for (const { value, color } of VALUE_COLOR_STOPS) assert.equal(valueColor(value), color);
  for (let i = -200; i <= 200; i++) {
    const rgb = valueColorRgb(i / 100);
    assert.ok(rgb.every(c => Number.isFinite(c) && c >= 0 && c <= 255));
    assert.match(valueColor(i / 100), /^#[0-9a-f]{6}$/i);
  }
  assert.throws(() => valueColor(NaN), /finite/);
  assert.throws(() => valueColor(Infinity), /finite/);
});

test('negative and positive values approach the same dim neutral instead of jumping to blue or green', async () => {
  const { valueColorRgb } = await load();
  assert.ok(distance(valueColorRgb(-1e-6), valueColorRgb(1e-6)) < .01);
  const negative = valueColorRgb(-2), positive = valueColorRgb(2), zero = valueColorRgb(0);
  assert.ok(negative[2] > negative[1]);
  assert.ok(positive[0] > positive[2]);
  assert.ok(Math.max(...zero) - Math.min(...zero) < 20);
});
