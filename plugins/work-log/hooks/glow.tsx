import type { ClientModule } from 'claude-code'

const PURPLE_DIM = [0x3d, 0x22, 0x78]
const PURPLE = [0x8a, 0x5c, 0xf0]
const PURPLE_HOT = [0xf2, 0xe4, 0xff]

const mix = (a: number[], b: number[], t: number) =>
  '#' + a.map((x, i) => Math.round(x + (b[i]! - x) * t).toString(16).padStart(2, '0')).join('')

// Runs on the drawing thread with its own frame clock, so the glow moves at the display's rate
// instead of waiting on a round trip through the plugin host for every frame.
const Glow: ClientModule<{ text: string }, number> = (props, s) => {
  const { Box, Text } = s.elements
  if (s.state === undefined) {
    s.every(16, () => s.setState(Date.now()))
    s.setState(Date.now())
  }
  const t = (s.state ?? Date.now()) / 1000
  const name = props.text
  const pulse = (Math.sin(t * 3.3) + 1) / 2
  const spot = (t * 6) % (name.length + 8) // fractional, so the bright spot glides between letters
  return (
    <Box>
      <Text color={mix(PURPLE_DIM, PURPLE_HOT, pulse)} bold>■ </Text>
      {[...name].map((ch, i) => (
        <Text key={i} color={mix(PURPLE, PURPLE_HOT, Math.max(0, 1 - Math.abs(spot - i) / 3.5))} bold>{ch}</Text>
      ))}
    </Box>
  )
}

export default Glow
