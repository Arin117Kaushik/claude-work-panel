import type { ClientModule } from 'claude-code'

const BASE = [0x2a, 0x2c, 0x33]
const HOT = [0x8f, 0xd8, 0xf0]

const mix = (a: number[], b: number[], t: number) =>
  '#' + a.map((x, i) => Math.round(x + (b[i]! - x) * t).toString(16).padStart(2, '0')).join('')

const mmss = (ms: number) => `${Math.floor(Math.max(0, ms) / 60000)}:${String(Math.floor(Math.max(0, ms) / 1000) % 60).padStart(2, '0')}`

// Indeterminate bar for work with no plan: the real length is unknown, so it sweeps instead of faking a percentage.
// Runs on the drawing thread's frame clock, like glow.tsx.
const Sweep: ClientModule<{ since: number; cells: number; label: string }, number> = (props, s) => {
  const { Box, Text } = s.elements
  if (s.state === undefined) {
    s.every(16, () => s.setState(Date.now()))
    s.setState(Date.now())
  }
  const now = s.state ?? Date.now()
  const span = Math.max(1, props.cells - 1)
  const x = ((now / 1000) * 16) % (2 * span)
  const head = x <= span ? x : 2 * span - x // bounces end to end
  return (
    <Box>
      {Array.from({ length: props.cells }, (_, i) => (
        <Text key={i} color={mix(BASE, HOT, Math.max(0, 1 - Math.abs(head - i) / 5))}>■</Text>
      ))}
      <Text color="#8fd8f0" bold>{` working ${mmss(now - props.since)}`}</Text>
      <Text color="#6b6f6c">{`  ${props.label}`}</Text>
    </Box>
  )
}

export default Sweep
