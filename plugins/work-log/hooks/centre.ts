import { ITEMS } from './items'

// Pokemon Center pieces for the /work panel, all vector pixel art at emoji size: item icons, the timer's ball, the healing
// tray (one ball per step) and the wooden counter. Motion is drawn by frame, one frame per second from the panel's clock,
// so it moves the same on every surface and needs no CSS animation support.
const VB = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`

const ART = (name: string) => ITEMS[name] ?? ITEMS['poke-ball']!

export const icon = (name: string) => VB(24, 24, ART(name))

// which item stands for which state, the way a bag holds them
export const STATE_ITEM: Record<string, string> = {
  idle: 'potion', working: 'x-attack', waiting: 'great-ball', paused: 'repel', done: 'rare-candy', stopped: 'revive', problem: 'antidote',
}

// the balls of the games, in the order steps use them
const STEP_BALLS = ['poke-ball', 'great-ball', 'ultra-ball', 'premier-ball', 'luxury-ball', 'dusk-ball']

// a longer timer gets a rarer ball
export const ballFor = (mins: number) => (mins <= 5 ? 'poke-ball' : mins <= 10 ? 'great-ball' : mins <= 15 ? 'ultra-ball' : mins <= 25 ? 'quick-ball' : mins <= 45 ? 'dusk-ball' : 'master-ball')

const GLOW = '<defs><radialGradient id="r"><stop offset="0" stop-color="#ff4a3a" stop-opacity="1"/><stop offset=".5" stop-color="#ff3a2a" stop-opacity=".55"/><stop offset="1" stop-color="#ff3a2a" stop-opacity="0"/></radialGradient></defs>'
// the catch: roll left, roll right, a smaller rock, then a still beat. SMIL, so it plays smoothly and the source never changes between redraws.
const KT = '0;.08;.2;.32;.44;.56;.7;1'
const ROCK = '0 12 21;-24 12 21;0 12 21;24 12 21;0 12 21;-12 12 21;0 12 21;0 12 21'
const SLIDE = '0 0;-2 0;0 0;2 0;0 0;-1 0;0 0;0 0'

// running: it rocks like a ball being caught and its button blinks red (needs isInteractive). Not running: still (ended: dim, no glow).
export const timerBall = (mode: 'run' | 'idle' | 'ended', ball: string) => {
  if (mode === 'run') {
    return VB(28, 24, `${GLOW}<g transform="translate(2 0)"><g><animateTransform attributeName="transform" type="translate" values="${SLIDE}" keyTimes="${KT}" dur="2.4s" repeatCount="indefinite"/><g><animateTransform attributeName="transform" type="rotate" values="${ROCK}" keyTimes="${KT}" dur="2.4s" repeatCount="indefinite"/>${ART(ball)}<circle cx="9.5" cy="15" r="6" fill="url(#r)"><animate attributeName="opacity" values="1;.25;1" dur="1.2s" repeatCount="indefinite"/></circle></g></g></g>`)
  }
  return VB(28, 24, `<g transform="translate(2 0)"${mode === 'ended' ? ' opacity=".5"' : ''}>${ART(ball)}</g>`)
}

// one ball per step (up to 12), each a different kind. Finished steps are lit, the rest are dim. It never moves or glows: it only counts.
export const trayWidth = (total: number) => Math.min(12, Math.max(1, total)) * 20 + 4
export const healTray = (done: number, total: number) => {
  const n = Math.min(12, Math.max(1, total))
  const lit = Math.min(n, Math.floor((done / Math.max(1, total)) * n))
  let body = ''
  for (let i = 0; i < n; i++) {
    body += `<g transform="translate(${i * 20} 0)" opacity="${i < lit ? 1 : 0.28}">${ART(STEP_BALLS[i % STEP_BALLS.length]!)}</g>`
  }
  return VB(n * 20 + 4, 24, body)
}
