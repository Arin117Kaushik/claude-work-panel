import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { CASE_H, CASE_W, badgeCase } from './badgecase'
import { STATE_ITEM, ballFor, healTray, icon, timerBall, trayWidth } from './centre'
import { PANEL_BG } from './panelbg'
import { BADGE_NAMES } from './sprites'
import { countLine, tallyLines, words } from './words'
import type { Activity, AgentRow, Badges, Live, Plan, Progress } from '../types'

// data lives in ~/.claude/adhd-progress, under the user's home folder
const dir = async ($: { env: { get: (n: string) => Promise<string | undefined> } }) =>
  ((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '').replace(/\\/g, '/') + '/.claude/adhd-progress/'
// progress.json is optional (background jobs strip); plan.json is written by plan.py; buzz.ps1 plays buzz.wav or buzz.mp3 beside it, else the Windows alert
const PANE = 'work-log'
const SCRIPTS = ['plan.py', 'buzz.ps1'] // shipped in ./scripts; copied only when missing or older, so local edits survive
const VERSION = /work-log script version: (\d+)/

// added to the system prompt so Claude feeds the panel without the user editing CLAUDE.md
const planRule = (d: string) => `The user watches a live progress panel (/work) fed by ${d}plan.py. Plan only work that has real structure. Skip the plan for one-shot work: a single reply, writing or editing a short piece, answering a question, one lookup, a small fix. For those, run nothing. When a task has a countable total or three or more distinct steps, run exactly one of these before other work:
python "${d}plan.py" work "goal" TOTAL unit   (a countable job: emails, files, rows)
python "${d}plan.py" new "goal" "phase 1" "phase 2"   (a bigger job with steps)
The bar is ONE trip for the whole task, however many steps or replies it takes. If a plan is already running and the work continues or grows, run plan.py add "phase" to extend it. Never run new for the next step of the same task; new is only for an unrelated task.
While working, report real numbers: plan.py did N, plan.py stat "Label" value (found, done, left alone). Run plan.py next "what got done" as each phase finishes, never batch them at the end. When the whole task is finished, run plan.py done "what got done" so nothing is left showing as unfinished. When you need the user to answer or approve something, run plan.py you "what you need" before asking, and plan.py go once they have replied. A gym badge is earned only for real work. Run plan.py earns "the concrete result" before finishing a task ONLY when all three are true: it moves a real goal (job hunt, client or paid work, a skill shown in a shipped project, a health habit done), it produced a concrete result you can point to (something sent, shipped, finished or completed), and it took real effort (3 or more steps, or about 20 or more minutes of work). Never for chores or utility jobs (cleaning a drive, sorting files), meetings attended, reading, or a task made up just to tick it. You decide, not the user. A new task means a new plan. Name phases and describe work in plain action words a stranger would understand, like Searching the web, Reading the page, Drafting the post, Checking the draft. The panel counts searches, pages read and files changed by itself, so do not report those with stat. Keep the words short and plain.`

const CELLS = 40

const progress = atom({ plugin: 'work-log', key: 'progress' } as const, null)
const plan = atom({ plugin: 'work-log', key: 'plan' } as const, null)
const agents = atom({ plugin: 'work-log', key: 'agents' } as const, [])
const activity = atom({ plugin: 'work-log', key: 'activity' } as const, {})
const feed = atom({ plugin: 'work-log', key: 'feed' } as const, [])
const cleared = atom({ plugin: 'work-log', key: 'cleared' } as const, [])
const timer = atom({ plugin: 'work-log', key: 'timer' } as const, { mins: 5, endsAt: null, now: 0 })
const tally = atom({ plugin: 'work-log', key: 'tally' } as const, { counts: {}, now: null })
const focus = atom({ plugin: 'work-log', key: 'focus' } as const, false)
const live = atom({ plugin: 'work-log', key: 'live' } as const, { state: 'idle', reason: '', guess: false, at: 0 })
const badges = atom({ plugin: 'work-log', key: 'badges' } as const, { week: '', count: 0 })

const mix = (a: number[], b: number[], t: number) =>
  '#' + a.map((x, i) => Math.round(x + (b[i]! - x) * t).toString(16).padStart(2, '0')).join('')

// a long soft spectrum (rose, coral, orange, gold, lime, mint, teal, sky, blue, indigo, violet, orchid),
// pinned to cell position so each new cell that fills reveals the next colour
const STOPS = [
  [0xff, 0x5c, 0x8a], [0xff, 0x6f, 0x61], [0xff, 0x8c, 0x42], [0xff, 0xb3, 0x47], [0xf7, 0xd9, 0x4c],
  [0xc5, 0xe3, 0x4f], [0x7c, 0xdc, 0x6a], [0x3d, 0xd6, 0x9b], [0x2a, 0xc9, 0xc9], [0x38, 0xb6, 0xff],
  [0x5a, 0x8d, 0xff], [0x7a, 0x6b, 0xff], [0x9d, 0x5c, 0xf5], [0xc2, 0x5c, 0xe0], [0xe8, 0x5c, 0xc0],
]
const shade = (i: number, of = CELLS) => {
  const x = (i / Math.max(1, of - 1)) * (STOPS.length - 1)
  const k = Math.min(STOPS.length - 2, Math.floor(x))
  return mix(STOPS[k]!, STOPS[k + 1]!, x - k)
}

const DONE = '#7fb7d9'
const WIN = '#e8b86d'
const ACCENT = '#8fd8f0'
const GREY = '#6b6f6c'
const RED = '#ff5f5f'
const AMBER = '#ffb347'
const GREEN = '#5fd38d'
const PINK = '#f4a6b8' // Pokemon Center counter pink
const ROSE = '#8c4a62'
const CARD_LINE = '#f4a6b8' // one trim colour for every card, the Pokemon Center pink
const ORANGE = '#ff8c42'
const VIOLET = '#b79cff'

type Kind = 'done' | 'running' | 'bad' | 'idle'
const kindOf = (s: string): Kind =>
  s === 'done' || s === 'completed' ? 'done'
  : s === 'running' ? 'running'
  : s === 'stalled' || s === 'failed' || s === 'killed' ? 'bad'
  : 'idle'

const WORDS: Record<string, string> = { running: 'working on it', done: 'finished', completed: 'finished', stalled: 'stuck', failed: 'hit a problem', killed: 'stopped', idle: 'waiting' }
const say = (s: string) => WORDS[s] ?? s

// two kinds of plan: a counted job (total and done, like "35 of 105 threads") or phases.
// base is the honest fraction; the bar creeps from base toward next while a step runs (see bar.tsx).
// percent is the static fallback where no surface module can draw: a running step counts half.
const progressOf = (pl: Plan) => {
  if (pl.total) {
    const done = Math.min(pl.done ?? 0, pl.total)
    const base = (done / pl.total) * 100
    return { done, total: pl.total, doing: -1, now: null, unit: pl.unit ?? 'items', base, next: base, since: 0, tau: 120, percent: base, upNext: null }
  }
  const total = pl.phases.length
  if (!total) return null
  const done = pl.phases.filter(x => x.state === 'done').length
  const doing = pl.phases.findIndex(x => x.state === 'doing')
  const took = pl.phases.filter(x => x.took).map(x => x.took!)
  const tau = took.length ? Math.max(20, Math.min(600, took.reduce((a, b) => a + b, 0) / took.length)) : 120
  const base = (done / total) * 100
  const upNext = pl.phases.find((x, i) => x.state === 'todo' && i > doing) ?? null
  return { done, total, doing, now: doing >= 0 ? pl.phases[doing]! : null, unit: 'steps', base, next: ((done + 1) / total) * 100, since: doing >= 0 ? pl.phases[doing]!.since ?? 0 : 0, tau, percent: ((done + (doing >= 0 ? 0.5 : 0)) / total) * 100, upNext }
}

// the one label that says what the work is doing: the plan file is the truth when there is a plan
const BADGE: Record<string, { dot: string; label: string; color: string; bar: string }> = {
  idle: { dot: '○', label: 'Idle', color: GREY, bar: 'stopped' },
  working: { dot: '●', label: 'Working on it', color: VIOLET, bar: 'working' },
  waiting: { dot: '●', label: 'Waiting for your answer', color: AMBER, bar: 'waiting' },
  paused: { dot: '●', label: 'Between steps', color: '#9aa0a6', bar: 'stopped' },
  done: { dot: '●', label: 'Finished', color: GREEN, bar: 'done' },
  stopped: { dot: '●', label: 'Stopped', color: '#9aa0a6', bar: 'stopped' },
  problem: { dot: '●', label: 'Hit a problem', color: RED, bar: 'problem' },
}
const statusOf = (pl: Plan | null, lv: Live) => {
  const newer = lv.at > (pl?.updated ?? 0) * 1000
  const key = (lv.state === 'stopped' || lv.state === 'problem') && newer ? lv.state : (pl?.status ?? lv.state)
  return { key, reason: newer ? lv.reason : pl?.reason ?? lv.reason, ...BADGE[key]! }
}
const hhmm = (sec: number) => new Date(sec * 1000).toTimeString().slice(0, 5)
const minsText = (sec: number) => (sec < 90 ? `${Math.max(1, Math.round(sec))} sec` : `${Math.round(sec / 60)} min`)
const mondayOf = () => { const d = new Date(Date.now() - ((new Date().getDay() + 6) % 7) * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const mmss = (ms: number) => `${Math.floor(Math.max(0, ms) / 60000)}:${String(Math.floor(Math.max(0, ms) / 1000) % 60).padStart(2, '0')}`

const DETAIL_KEYS = ['file_path', 'url', 'query', 'command', 'pattern', 'description', 'prompt', 'action']
const detailOf = (e: Record<string, unknown>) => {
  for (const k of DETAIL_KEYS) {
    if (typeof e[k] === 'string' && e[k]) return (e[k] as string).replace(/\s+/g, ' ').slice(0, 70)
  }
  return ''
}

const planFile = async ($: EngineInterface) => `${await dir($)}plans/${await $.session.id()}.json`
const readPlan = async ($: EngineInterface): Promise<Plan | null> => {
  try {
    return JSON.parse(await $.fs.read(await planFile($)))
  } catch {
    return null // no plan yet, or half-written: the caller keeps what it had
  }
}

// what the work is doing right now. Kept in the live atom, and written into the plan file when there is one,
// so the file never keeps saying "working" about a task that has ended.
const setLive = async ($: EngineInterface, state: Live['state'], reason = '', guess = false) => {
  const cur = await read($, live)
  if (cur.state === state && cur.reason === reason && cur.guess === guess) return
  await update($, live, () => ({ state, reason, guess, at: Date.now() }))
  if (guess) return // a guess never reaches the file
  const pl = await readPlan($)
  if (!pl || (pl.status === 'done' && state !== 'working')) return
  if (state === 'done') {
    const d = await dir($)
    await $.process.run(['python', `${d}plan.py`, '--session', await $.session.id(), 'done'], { timeoutMs: 8000 }).catch(() => null)
    return
  }
  if (pl.status === 'done') return
  if (state === 'working' || state === 'waiting' || state === 'paused') {
    pl.status = state
    if (reason) pl.reason = reason
    else delete pl.reason
    await $.fs.write(await planFile($), JSON.stringify(pl, null, 2))
  }
}

export const register: Register = on => {
  let endsAt: number | null = null // the live deadline; the timer atom mirrors it for drawing
  let hideBefore = 0 // a plan finished before this is not shown against the next, unplanned task
  let lastTool = ''
  let asked = '' // the question Claude put in its wrap-up, if any: the turn then ends waiting on the user

  on('session.start', async ($, e, next) => {
    const d = await dir($)
    for (const f of SCRIPTS) {
      try {
        const shipped = await $.fs.read(`${$.plugin.root}/scripts/${f}`)
        let have = -1 // -1: not there yet
        try {
          have = Number(VERSION.exec(await $.fs.read(d + f))?.[1] ?? 0)
        } catch {
          // missing
        }
        if (have < Number(VERSION.exec(shipped)?.[1] ?? 0) || have === -1) await $.fs.write(d + f, shipped)
      } catch {
        // shipped copy missing: leave whatever the user already has
      }
    }
    await $.command.register({ name: 'work', description: 'Open the live work and agents panel' })

    const poll = async () => {
      try {
        const p: Progress = JSON.parse(await $.fs.read(d + 'progress.json'))
        await update($, progress, () => p)
      } catch {
        // file missing or half-written: keep the last value
      }
      const pl = await readPlan($)
      if (pl) {
        const fresh = ((pl.updated ?? 0) + 1) * 1000 > hideBefore // +1s: plan.py stores whole seconds
        await update($, plan, () => (fresh ? pl : null))
      }
      try {
        const bg: Badges = JSON.parse(await $.fs.read(d + 'badges.json'))
        await update($, badges, () => bg)
      } catch {
        // no badges yet
      }
      try {
        const list = await $.agent.list()
        const rows: AgentRow[] = list.map(a => ({ id: a.id, type: a.type, description: a.description, status: a.status }))
        await update($, agents, () => rows)
      } catch {
        // the agent list is not ready: keep the last rows, try again in 2 seconds
      }
    }
    await poll()
    $.clock.every(2000, poll)

    // once a second: the timer's countdown
    $.clock.every(1000, async () => {
      if (endsAt === null) return
      const now = await $.clock.now()
      if (now < endsAt) {
        await update($, timer, x => ({ ...x, now }))
        return
      }
      endsAt = null
      await update($, timer, x => ({ ...x, endsAt: null, over: true }))
      $.ui.toast('Time is up. You can stop now, or keep going.')
      const buzz = await $.process.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', d + 'buzz.ps1'], { timeoutMs: 20000 }).catch(() => null)
      if (!buzz || buzz.exitCode !== 0) $.ui.toast('Timer sound failed to play. Is buzz.ps1 in ~/.claude/adhd-progress?')
    })

    return next(e)
  })

  // /clear fires no session.start: the process goes on under a new session id, so the old plan, tally and timer are dropped here
  on('session.end', async ($, e, next) => {
    endsAt = null
    lastTool = ''
    await update($, timer, x => ({ ...x, endsAt: null }))
    await update($, plan, () => null)
    await update($, feed, () => [])
    await update($, activity, () => ({}))
    await update($, tally, () => ({ counts: {}, now: null }))
    await update($, cleared, () => [])
    await update($, live, () => ({ state: 'idle', reason: '', guess: false, at: Date.now() }))
    return next(e)
  })

  on('command.run', { command: 'work' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Work' })

    return { text: 'Work panel opened.' }
  })

  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    return { ...r, sections: [...r.sections, { id: 'work-log:planning', text: planRule(await dir($)), scope: 'session' as const }] }
  })

  // counts are per task: they start over when you send a new prompt, and "now" clears when the main reply ends
  on('prompt.submit', async ($, e, next) => {
    const old = await read($, plan)
    const was = old ? progressOf(old) : null
    if (was && was.done >= was.total) {
      hideBefore = await $.clock.now()
      await update($, plan, () => null)
    }
    await update($, tally, () => ({ counts: {}, now: null }))
    lastTool = ''
    asked = ''
    await setLive($, 'working')
    return next(e)
  })

  // the end of the main reply is where "done", "waiting on you" and "stopped" get decided, so nothing stays on "working"
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      await update($, tally, t => ({ ...t, now: null }))
      const pl = await readPlan($)
      if (e.reason === 'aborted') await setLive($, 'stopped', 'you interrupted it')
      else if (e.reason === 'error') await setLive($, 'problem', 'an error ended the turn')
      else if (e.reason === 'refusal') await setLive($, 'problem', 'the model declined to continue')
      else if (pl?.you || asked || lastTool === 'AskUserQuestion') await setLive($, 'waiting', pl?.you ?? (asked || 'it asked you a question'))
      // the trip belongs to the whole task: a reply ending does not finish it. Only plan.py done (or the last step) does.
      else if (pl && pl.status !== 'done' && pl.phases.some(x => x.state !== 'done')) await setLive($, 'paused')
      else await setLive($, pl ? 'done' : 'idle')
      lastTool = ''
      asked = ''
    }
    return next(e)
  })

  // streams: every model step means it is working again
  on('turn.step', async function* ($, e, next) {
    await setLive($, 'working')
    return yield* next(e)
  })

  on('tool.call', async ($, e, next) => {
    const key = e.agentId ?? 'main'
    if (!e.agentId) {
      lastTool = e.tool
      if (e.tool.endsWith('wrap_up')) asked = String((e as Record<string, unknown>).ask ?? '')
      await setLive($, e.tool === 'AskUserQuestion' ? 'waiting' : 'working', e.tool === 'AskUserQuestion' ? 'it asked you a question' : '')
    }
    const detail = detailOf(e as Record<string, unknown>)
    await update($, activity, all => {
      const prev: Activity | undefined = all[key]
      return { ...all, [key]: { tool: e.tool, detail, count: (prev?.count ?? 0) + 1 } }
    })
    const wd = words(e.tool)
    await update($, tally, t => ({ counts: { ...t.counts, [wd.kind]: (t.counts[wd.kind] ?? 0) + 1 }, now: { text: wd.now, kind: wd.kind, detail } }))
    const at = await $.clock.now()
    await update($, feed, all => [...all, { at, who: e.agentId ? e.agentId.slice(0, 4) : 'main', tool: e.tool, detail }].slice(-30))

    return next(e)
  })

  // the bar and the status chip. Where no surface module can draw (the phone), the bar falls back to plain cells.
  const barProps = (st: NonNullable<ReturnType<typeof progressOf>>, mode: string, cells: number) => ({
    target: st.base, cells, mode, next: st.next, since: st.since, tau: st.tau,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const staticBar = (Text: any, pct: number, cells: number, spread = cells) =>
    Array.from({ length: cells }, (_, i) => <Text key={i} color={i < Math.round((pct / 100) * cells) ? shade(i, spread) : '#2a2c33'}>■</Text>)

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const pl = await read($, plan)
    const tm = await read($, timer)
    const ty = await read($, tally)
    const lv = await read($, live)
    const st = pl ? progressOf(pl) : null

    if (e.props.hasSurvey) {
      return next(e)
    }

    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    const Client = 'Client' in els ? els.Client : null
    const c = ty.now ? countLine(ty.now.kind, ty.counts[ty.now.kind] ?? 0) : ''
    const badge = statusOf(pl, lv)
    const chip = <Text color={badge.color} bold>{`${badge.dot} ${badge.label}`}</Text>
    const why = badge.reason && (badge.key === 'waiting' || badge.key === 'stopped' || badge.key === 'problem')
      ? <Text color={badge.color}>{`  ${badge.reason}`}</Text> : null

    // no plan means a one-shot task: no bar to fake, just the status and what is happening right now (and the timer if it runs)
    if (!st) {
      if (!why && !(badge.key === 'working' && ty.now) && tm.endsAt === null) return next(e)
      return (
        <Box>
          {chip}
          {why}
          {badge.key === 'working' && ty.now && <Text color={GREY}>{`  ${ty.now.text}${c ? '  ·  ' + c : ''}`}</Text>}
          {tm.endsAt !== null && <Text color={WIN} bold>{`  TIMER ${mmss(tm.endsAt - tm.now)} `}</Text>}
          <Button key="open" label="details" onPress={() => $.ui.open({ id: PANE, title: 'Work' })} />
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box>
          {Client
            ? <Box width={CELLS + 6} height={1}><Client key="bar" module="./bar.tsx" props={barProps(st, badge.bar, CELLS)} /></Box>
            : <Box>{staticBar(Text, badge.key === 'done' ? 100 : st.percent, CELLS)}<Text color={ACCENT} bold>{` ${Math.round(badge.key === 'done' ? 100 : st.percent)}%`}</Text></Box>}
          <Text>{'  '}</Text>
          <Box flexShrink={0}>{chip}</Box>
          <Box flexShrink={0}><Text color={ACCENT} bold>{`  ${st.done} of ${st.total} ${st.unit}  `}</Text></Box>
          {tm.endsAt !== null && <Box flexShrink={0}><Text color={WIN} bold>{`TIMER ${mmss(tm.endsAt - tm.now)}  `}</Text></Box>}
          <Button key="open" label="details" onPress={() => $.ui.open({ id: PANE, title: 'Work' })} />
        </Box>
        {(badge.key === 'working' && st.now) || why
          ? <Text wrap="truncate-end" color={badge.key === 'working' ? VIOLET : badge.color}>{badge.key === 'working' && st.now ? `now: ${st.now.name}` : badge.reason}</Text>
          : null}
        {badge.key === 'working' && ty.now && <Text wrap="truncate-end" color={GREY}>{`${ty.now.text}${c ? '  ·  ' + c : ''}`}</Text>}
        {badge.key === 'done' && pl?.win && <Text color={GREEN}>{`Done: ${pl.win}`}</Text>}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    const Client = 'Client' in els ? els.Client : null // only the terminal and desktop draw surface modules
    const Svg = 'Svg' in els ? els.Svg : null // the desktop draws vector art
    const p = await read($, progress)
    const pl = await read($, plan)
    const gone = await read($, cleared)
    const tm = await read($, timer)
    const focusOn = await read($, focus)
    const list = (await read($, agents)).filter(a => !gone.includes(a.id))
    const act = await read($, activity)
    const events = await read($, feed)
    const ty = await read($, tally)
    const lv = await read($, live)
    const bg = await read($, badges)
    const now = await $.clock.now()
    const t = now / 1000
    const rows = e.viewport?.rows ?? 30
    const jobs = (p?.jobs ?? []).filter(j => kindOf(j.state) !== 'done') // finished jobs are old news
    const room = Math.max(2, Math.floor((rows - 14 - jobs.length - (pl?.phases.length ?? 0)) / 3))
    const feedRows = Math.max(3, Math.floor((rows - 14) / 4))
    const age = (t: number) => { const d = Math.round((now - t) / 1000); return d < 90 ? `${d}s` : `${Math.round(d / 60)}m` }
    const order = (s: string) => ({ running: 0, bad: 1, idle: 2, done: 3 })[kindOf(s)]
    const shown = [...list].sort((a, b) => order(a.status) - order(b.status)).slice(0, room)
    const st = pl ? progressOf(pl) : null
    const badge = statusOf(pl, lv)
    const finished = badge.key === 'done'

    // the glow animates in glow.tsx on the display's frame clock, not through this hook
    const glow = (name: string) => Client
      ? <Client key={`glow-${name}`} module="./glow.tsx" props={{ text: name }} />
      : <Text color="#8a5cf0" bold>{`■ ${name}`}</Text>

    const line = (key: string, state: string, name: string, detail: string) => {
      const k = kindOf(state)
      const color = k === 'done' ? DONE : k === 'bad' ? RED : GREY
      return (
        <Box key={key}>
          {k === 'running' ? glow(name) : <Text color={color}>{`${k === 'done' ? '✓' : k === 'bad' ? '✗' : '□'} ${name}`}</Text>}
          <Text color={k === 'running' ? VIOLET : color} dimColor={k === 'idle'}>{`  ${detail}`}</Text>
        </Box>
      )
    }

    const left = tm.endsAt === null ? 0 : tm.endsAt - now
    const startTimer = async () => {
      const n = await $.clock.now()
      endsAt = n + tm.mins * 60000
      await update($, timer, x => ({ ...x, endsAt, now: n, over: false }))
    }
    const stopTimer = async () => {
      endsAt = null
      await update($, timer, x => ({ ...x, endsAt: null, over: false }))
    }
    const bump = (d: number) => update($, timer, x => ({ ...x, mins: Math.max(1, Math.min(90, x.mins + d)) }))
    // pixel buttons: a thin frame on a themed fill, brighter under the pointer. Ice, lightning and fire for the three legendary birds.
    const pix = (key: string, label: string, fill: string, ink: string, lift: string, onPress: () => void) => (
      <Box key={`px-${key}`} borderStyle="single" borderColor={ink} backgroundColor={fill} paddingX={2} marginRight={1} hover={{ borderColor: '#ffffff', backgroundColor: lift }}>
        <Button key={key} plain label={label.toUpperCase()} hover={{ color: ink }} onPress={onPress} />
      </Box>
    )
    const buttons = (
      <Box>
        {pix('focus', focusOn ? 'full view' : 'focus', '#bfe6ff', '#12385a', '#e6f6ff', () => update($, focus, f => !f))}
        {pix('clear', 'clear', '#ffe14a', '#4a3200', '#fff29a', async () => {
          await update($, feed, () => [])
          await update($, activity, () => ({}))
          await update($, cleared, () => [...gone, ...list.map(a => a.id)])
        })}
        {pix('close', 'close', '#e8472b', '#fff1d8', '#ff7a3c', () => $.ui.close({ id: PANE }))}
      </Box>
    )
    const TW = 30
    const LINE = CARD_LINE // one border colour for every card, so only status and the running timer ever stand out
    const MUTED = '#8b8f98'
    // one card style for everything on the panel: round border, a bold title, content below, one blank line between
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const card = (title: string, titleColor: string, border: string, children: any, item?: string) => (
      <Box key={title} flexDirection="column" borderStyle="round" borderColor={CARD_LINE} paddingX={1} marginTop={1}>
        <Box>
          {Svg && item && <Svg source={icon(item)} alt={`${title} icon`} width={20} height={20} />}
          <Text color={titleColor} bold>{`${Svg && item ? ' ' : ''}${title}`}</Text>
        </Box>
        {children}
      </Box>
    )
    const running = tm.endsAt !== null
    const over = !running && !!tm.over
    const ball = (mode: 'run' | 'idle' | 'ended') => (Svg ? <Svg source={timerBall(mode, ballFor(tm.mins))} alt={mode === 'run' ? 'Poke Ball rocking while the timer runs' : 'Poke Ball timer'} width={34} height={30} isInteractive={mode === 'run'} /> : null)
    const controls = (
      <Box>
        {pix('less', '-', '#c9ccd6', '#20222c', '#eceef5', () => bump(tm.mins <= 10 ? -1 : -5))}
        {pix('more', '+', '#c9ccd6', '#20222c', '#eceef5', () => bump(tm.mins < 10 ? 1 : 5))}
        {pix('start', 'start', '#58d878', '#0c3a1a', '#8af0a4', startTimer)}
      </Box>
    )
    const timerRow = card('TIMER', PINK, LINE, running ? (
      <Box flexDirection="column">
        <Box>{ball('run')}<Text color="#ff8a7a" bold>{` ${mmss(left)} left`}</Text></Box>
        <Box>
          {Array.from({ length: TW }, (_, i) => (
            <Text key={i} color={i < Math.ceil((left / (tm.mins * 60000)) * TW) ? '#ff6a5a' : '#2a2c33'}>■</Text>
          ))}
        </Box>
        <Box>{pix('stop', 'stop', '#e8472b', '#fff1d8', '#ff7a3c', stopTimer)}</Box>
      </Box>
    ) : over ? (
      <Box flexDirection="column">
        <Box>{ball('ended')}<Text color={MUTED} bold>{' Time is up'}</Text></Box>
        {controls}
      </Box>
    ) : (
      <Box flexDirection="column">
        <Box>{ball('idle')}<Text bold>{` ${tm.mins} min`}</Text></Box>
        {controls}
      </Box>
    ))
    const cur = pl?.phases.find(x => x.state === 'doing')
    const curNo = pl ? pl.phases.findIndex(x => x.state === 'doing') + 1 : 0
    const onStep = cur?.since ? `on this step for ${Math.max(1, Math.round((now / 1000 - cur.since) / 60))} min` : ''
    const chip = <Text color={badge.color} bold>{`${badge.dot} ${badge.label}`}</Text>
    // a clock you can see, because time slips by unnoticed: when it started and how long it has been
    const clock = pl?.startedAt
      ? finished && pl.finishedAt ? `started ${hhmm(pl.startedAt)}, took ${minsText(pl.finishedAt - pl.startedAt)}` : `started ${hhmm(pl.startedAt)}, ${minsText(t - pl.startedAt)} in`
      : ''
    const have = bg.week === mondayOf() ? bg.count : 0 // a case from an earlier week is already reset
    const earned = Math.min(8, have)

    if (focusOn && cur) {
      return (
        <Box flexDirection="column">
          {buttons}
          {timerRow}
          {card('NOW', badge.color, badge.color, (
            <Box flexDirection="column">
              {chip}
              {glow(`${curNo}. ${cur.name}`)}
              {cur.note && <Text color={VIOLET}>{`first step: ${cur.note}`}</Text>}
              {onStep && <Text color={MUTED}>{onStep}</Text>}
              {pl?.you && <Text color="#ffd166" bold>{pl.you}</Text>}
            </Box>
          ), STATE_ITEM[badge.key])}
        </Box>
      )
    }

    const counts = tallyLines(ty.counts)
    const hasActivity = !!ty.now || counts.length > 0 || jobs.length > 0 || list.length > 0
    const hasPlan = !!pl && (pl.phases.length > 0 || !!pl.stats?.length)

    return (
      <Box flexDirection="column" backgroundColor="#1a0c14" paddingX={1} paddingBottom={1}>
        <Box position="absolute" top={0} left={0} right={0} bottom={0} overflow="hidden">
          {Svg ? <Svg source={PANEL_BG} alt="The Pokemon Center from FireRed and LeafGreen" width={1280} height={1664} /> : null}
        </Box>
        {buttons}
        <Text color={PINK} bold>{'POKÉMON CENTER'}</Text>
        {card('STATUS', badge.color, badge.color, (
          <Box flexDirection="column">
            <Box>
              {chip}
              {clock && <Text color={MUTED}>{`  ·  ${clock}`}</Text>}
            </Box>
            {badge.reason && badge.key !== 'working' && badge.key !== 'done' && badge.key !== 'idle' && <Text color={badge.color}>{badge.reason}</Text>}
            {st && (
              <Box width={TW + 6} height={1}>
                {Client
                  ? <Client key="bar" module="./bar.tsx" props={barProps(st, badge.bar, TW)} />
                  : <Box>{staticBar(Text, finished ? 100 : st.percent, TW)}<Text color={ACCENT} bold>{` ${Math.round(finished ? 100 : st.percent)}%`}</Text></Box>}
              </Box>
            )}
            {st && Svg && <Svg source={healTray(st.done, st.total)} alt={`${st.done} of ${st.total} done`} width={Math.round(trayWidth(st.total) * 22 / 24)} height={22} />}
            {st && <Text color={finished ? GREEN : VIOLET} bold>{finished ? `All ${st.total} ${st.unit} done.` : `${st.done} of ${st.total} ${st.unit} done. ${st.total - st.done} to go.`}</Text>}
            {!finished && st?.upNext && <Text color={ACCENT}>{`Up next: ${st.upNext.name}`}</Text>}
            {pl?.you && <Text color="#ffd166" bold>{`Your move: ${pl.you}`}</Text>}
            {pl?.win && <Text color={WIN}>{`Latest win: ${pl.win}`}</Text>}
            {!st && badge.key === 'idle' && <Text color={MUTED}>{'Nothing running. Say "task" to log one.'}</Text>}
          </Box>
        ), STATE_ITEM[badge.key])}
        {timerRow}
        {card('BADGES', WIN, LINE, (
          <Box flexDirection="column">
            {Svg
              ? <Svg source={badgeCase(earned)} alt={`${earned} of 8 Kanto gym badges`} width={Math.round(CASE_W * 1.25)} height={Math.round(CASE_H * 1.25)} />
              : <Text color={WIN}>{BADGE_NAMES.map((_, i) => (i < earned ? '●' : '○')).join(' ')}</Text>}
            <Text color={MUTED}>{earned >= 8 ? 'All 8. Resets Monday.' : `Next: ${BADGE_NAMES[earned]} Badge`}</Text>
          </Box>
        ), 'premier-ball')}
        {!!pl?.tasksDone && <Text color={MUTED}>{`${pl.tasksDone} task${pl.tasksDone === 1 ? '' : 's'} finished today`}</Text>}
        {hasPlan && card('PLAN', PINK, LINE, (
          <Box flexDirection="column">
            {pl?.goal && <Text color={MUTED}>{pl.goal}</Text>}
            {pl?.phases.map((ph, i) => {
              const k = ph.state === 'done' ? 'done' : ph.state === 'doing' ? 'running' : 'idle'
              return (
                <Box key={i}>
                  {k === 'running' ? glow(`${i + 1}. ${ph.name}`) : <Text color={k === 'done' ? DONE : MUTED} dimColor={k === 'idle'}>{`${k === 'done' ? '✓' : '□'} ${i + 1}. ${ph.name}`}</Text>}
                  <Text color={k === 'running' ? VIOLET : MUTED} dimColor={k === 'idle'}>{k === 'running' ? `  <- you are here${ph.note ? '. ' + ph.note : ''}` : k === 'done' && ph.took ? `  took ${minsText(ph.took)}` : ph.note ? `  ${ph.note}` : ''}</Text>
                </Box>
              )
            })}
            {onStep && !finished && <Text color={MUTED}>{onStep}</Text>}
            {pl?.stats?.map((x, i) => (
              <Text key={`s${i}`} color={ACCENT}>{`${x.label}: ${x.value}`}</Text>
            ))}
          </Box>
        ), 'escape-rope')}
        {hasActivity && card('ACTIVITY', PINK, LINE, (
          <Box flexDirection="column">
            {ty.now && <Text color={ACCENT}>{ty.now.text}</Text>}
            {ty.now?.detail && <Text color={MUTED}>{ty.now.detail}</Text>}
            {counts.length > 0 && <Text color={MUTED}>{counts.join('  ·  ')}</Text>}
            {jobs.map(j => line(j.name, j.state, j.name, `${say(j.state)}. ${j.detail}`))}
            {list.length > 0 && <Text bold>{`Helpers (${list.filter(a => a.status === 'running').length} busy, ${list.length} total)`}</Text>}
            {shown.map(a => {
              const x = act[a.id]
              return (
                <Box key={a.id} flexDirection="column">
                  {line(a.id, a.status, `${a.type}: ${a.description}`, say(a.status))}
                  <Text color={MUTED}>{x ? `   ${words(x.tool).now}${x.detail ? ': ' + x.detail : ''}  (${x.count})` : `   ${a.status}`}</Text>
                </Box>
              )
            })}
          </Box>
        ), 'super-potion')}
        {events.length > 0 && card('JUST HAPPENED', PINK, LINE, (
          <Box flexDirection="column">
            {[...events].reverse().slice(0, feedRows).map((ev, i) => (
              <Text key={i} color={MUTED}>{`${age(ev.at)} ${ev.who === 'main' ? '' : ev.who + ' '}${words(ev.tool).past}${ev.detail ? ': ' + ev.detail : ''}`}</Text>
            ))}
          </Box>
        ), 'rare-candy')}
      </Box>
    )
  })
}
