import type { ClientModule } from 'claude-code'

// The progress strip. It runs on the drawing thread's frame clock, so the count glides on its own between plugin updates.
// The strip is the original one: square pixels, a long rainbow pinned to each cell's position so every new pixel that
// fills reveals the next colour, and one pixel at a time. While a step runs the target creeps toward the next step,
// so the strip keeps moving instead of sitting still.
type P = { target: number; cells: number; mode: string; next: number; since: number; tau: number }
type S = { shown: number; last: number; tick: number }

const mix = (a: number[], b: number[], t: number) =>
  '#' + a.map((x, i) => Math.round(x + (b[i]! - x) * t).toString(16).padStart(2, '0')).join('')
const RAINBOW = [
  [0xff, 0x5c, 0x8a], [0xff, 0x6f, 0x61], [0xff, 0x8c, 0x42], [0xff, 0xb3, 0x47], [0xf7, 0xd9, 0x4c],
  [0xc5, 0xe3, 0x4f], [0x7c, 0xdc, 0x6a], [0x3d, 0xd6, 0x9b], [0x2a, 0xc9, 0xc9], [0x38, 0xb6, 0xff],
  [0x5a, 0x8d, 0xff], [0x7a, 0x6b, 0xff], [0x9d, 0x5c, 0xf5], [0xc2, 0x5c, 0xe0], [0xe8, 0x5c, 0xc0],
]
// working and finished keep the rainbow; the other states tint the whole strip so the state reads at a glance
const RAMPS: Record<string, number[][]> = {
  working: RAINBOW,
  done: RAINBOW,
  waiting: [[0x7a, 0x4a, 0x10], [0xff, 0xb3, 0x47]],
  problem: [[0x8a, 0x20, 0x30], [0xff, 0x5f, 0x5f]],
  stopped: [[0x50, 0x54, 0x58], [0x9a, 0xa0, 0xa6]],
}
const EMPTY = [0x2a, 0x2c, 0x33]
const colorAt = (ramp: number[][], f: number) => {
  const x = Math.max(0, Math.min(1, f)) * (ramp.length - 1)
  const k = Math.min(ramp.length - 2, Math.floor(x))
  return mix(ramp[k]!, ramp[k + 1]!, x - k)
}
const hex = (c: number[]) => mix(c, c, 0)

const Bar: ClientModule<P, S> = (p, s) => {
  const { Box, Text } = s.elements
  if (s.state === undefined) {
    s.every(33, () => {
      const cur = s.state
      s.setState({ shown: cur?.shown ?? 0, last: cur?.last ?? Date.now(), tick: Date.now() })
    })
    s.setState({ shown: 0, last: Date.now(), tick: Date.now() })
  }
  const st: S = s.state ?? { shown: 0, last: Date.now(), tick: Date.now() }
  const nowS = st.tick / 1000

  // where the strip is heading: the real value, plus a slow creep toward the next step while one is running
  let target = p.target
  if (p.mode === 'working' && p.next > p.target && p.since > 0) {
    target += (p.next - p.target) * 0.9 * (1 - Math.exp(-Math.max(0, nowS - p.since) / Math.max(5, p.tau)))
  }
  if (p.mode === 'done') target = 100

  const dt = Math.max(0, Math.min(0.5, (st.tick - st.last) / 1000))
  const rate = target < st.shown - 2 ? 0.12 : 0.45 // a reset eases down fast, a fill flows
  st.shown = Math.abs(target - st.shown) < 0.05 ? target : st.shown + (target - st.shown) * (1 - Math.exp(-dt / rate))
  st.last = st.tick

  const ramp = RAMPS[p.mode] ?? RAINBOW
  const exact = (st.shown / 100) * p.cells
  const full = Math.min(p.cells, Math.floor(exact))
  const frac = exact - full // the next pixel lights up gradually, so it fills one pixel at a time and never jumps
  const cells = []
  for (let i = 0; i < p.cells; i++) {
    const own = colorAt(ramp, i / Math.max(1, p.cells - 1))
    const color = i < full ? own : i === full && frac > 0.04 ? mix(EMPTY, [parseInt(own.slice(1, 3), 16), parseInt(own.slice(3, 5), 16), parseInt(own.slice(5, 7), 16)], frac) : hex(EMPTY)
    cells.push(<Text key={`c${i}`} color={color}>{'■'}</Text>)
  }
  const pulse = 0.5 + 0.5 * Math.sin(nowS * 6)
  return (
    <Box>
      {cells}
      <Text color={p.mode === 'waiting' ? mix([0xff, 0xb3, 0x47], [0xff, 0xe0, 0xa0], pulse) : '#8fd8f0'} bold>{` ${Math.round(st.shown)}%`}</Text>
    </Box>
  )
}

export default Bar
