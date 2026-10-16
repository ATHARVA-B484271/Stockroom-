import test from 'node:test'
import assert from 'node:assert/strict'
import { businessDateBounds, businessMonthBounds, currentBusinessDate, parseBusinessDate } from '../src/utils/businessTime.js'

test('business day boundaries honor the configured timezone', () => {
  const { start, end } = businessDateBounds('2025-01-02', 'Asia/Kolkata')
  assert.equal(start.toISOString(), '2025-01-01T18:30:00.000Z')
  assert.equal(end.toISOString(), '2025-01-02T18:30:00.000Z')
})

test('business day boundaries account for daylight-saving transitions', () => {
  const springForward = businessDateBounds('2025-03-09', 'America/New_York')
  assert.equal(springForward.start.toISOString(), '2025-03-09T05:00:00.000Z')
  assert.equal(springForward.end.toISOString(), '2025-03-10T04:00:00.000Z')
})

test('month boundaries include leap days and stop at the next local month', () => {
  const { start, end } = businessMonthBounds(2, 2024, 'Asia/Kolkata')
  assert.equal(start.toISOString(), '2024-01-31T18:30:00.000Z')
  assert.equal(end.toISOString(), '2024-02-29T18:30:00.000Z')
})

test('business dates are strict calendar dates', () => {
  assert.deepEqual(parseBusinessDate('2024-02-29', 'UTC'), { year: 2024, month: 2, day: 29 })
  assert.throws(() => parseBusinessDate('2025-02-29', 'UTC'), /valid calendar date/)
  assert.throws(() => parseBusinessDate('02-01-2025', 'UTC'), /YYYY-MM-DD/)
})

test('current business date uses timezone-local calendar values', () => {
  assert.equal(currentBusinessDate(new Date('2025-01-01T19:00:00.000Z'), 'Asia/Kolkata'), '2025-01-02')
})
