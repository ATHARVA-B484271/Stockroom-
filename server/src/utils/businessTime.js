const datePattern = /^\d{4}-\d{2}-\d{2}$/

export function parseBusinessDate(value, timeZone = process.env.BUSINESS_TIMEZONE || 'Asia/Kolkata') {
  if (typeof value !== 'string' || !datePattern.test(value)) {
    throw new RangeError('Date must use YYYY-MM-DD format.')
  }
  const [year, month, day] = value.split('-').map(Number)
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new RangeError('Date is not a valid calendar date.')
  }
  new Intl.DateTimeFormat('en-US', { timeZone }).format(check)
  return { year, month, day }
}

function zonedMidnightToUtc(year, month, day, timeZone) {
  const target = Date.UTC(year, month - 1, day)
  let candidate = target
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(({ type, value }) => [type, value]))
    const localAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    )
    const adjusted = target - (localAsUtc - candidate)
    if (adjusted === candidate) break
    candidate = adjusted
  }
  return new Date(candidate)
}

export function businessDateBounds(value, timeZone = process.env.BUSINESS_TIMEZONE || 'Asia/Kolkata') {
  const { year, month, day } = parseBusinessDate(value, timeZone)
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1))
  return {
    start: zonedMidnightToUtc(year, month, day, timeZone),
    end: zonedMidnightToUtc(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate(), timeZone),
  }
}

export function businessMonthBounds(monthValue, yearValue, timeZone = process.env.BUSINESS_TIMEZONE || 'Asia/Kolkata') {
  const month = Number(monthValue)
  const year = Number(yearValue)
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError('Month must be between 1 and 12.')
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new RangeError('Year must be between 2000 and 2100.')
  new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(Date.UTC(year, month - 1, 1)))
  return {
    start: zonedMidnightToUtc(year, month, 1, timeZone),
    end: zonedMidnightToUtc(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1, timeZone),
  }
}

export function currentBusinessDate(now = new Date(), timeZone = process.env.BUSINESS_TIMEZONE || 'Asia/Kolkata') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}
