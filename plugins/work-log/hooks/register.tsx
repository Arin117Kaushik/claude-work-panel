import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Activity, AgentRow, Plan, Progress } from '../types'

// data lives in ~/.claude/adhd-progress, under the user's home folder
const dir = async ($: { env: { get: (n: string) => Promise<string | undefined> } }) =>
  ((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '').replace(/\\/g, '/') + '/.claude/adhd-progress/'
// progress.json is optional (background jobs strip); plan.json is written by plan.py; buzz.ps1 plays buzz.wav or buzz.mp3 beside it, else the Windows alert
const PANE = 'work-log'
const SCRIPTS = ['plan.py', 'buzz.ps1'] // shipped in ./scripts, copied to the data folder on every session start

// added to the system prompt so Claude feeds the panel without the user editing CLAUDE.md
const planRule = (d: string) => `The user watches a live progress panel (/work) fed by ${d}plan.py. At the start of every task, before other work, run exactly one of:
python "${d}plan.py" work "goal" TOTAL unit   (a countable job: emails, files, rows)
python "${d}plan.py" quick "goal"   (a small task)
python "${d}plan.py" new "goal" "phase 1" "phase 2"   (a bigger job)
While working, report real numbers: plan.py did N, plan.py stat "Label" value (found, done, left alone). Run plan.py next "what got done" as phases finish and plan.py you "text" for the one step the user should take. A new task means a new plan. Keep the words short and plain.`

const CELLS = 40

const progress = atom({ plugin: 'work-log', key: 'progress' } as const, null)
const plan = atom({ plugin: 'work-log', key: 'plan' } as const, null)
const agents = atom({ plugin: 'work-log', key: 'agents' } as const, [])
const activity = atom({ plugin: 'work-log', key: 'activity' } as const, {})
const feed = atom({ plugin: 'work-log', key: 'feed' } as const, [])
const cleared = atom({ plugin: 'work-log', key: 'cleared' } as const, [])
const timer = atom({ plugin: 'work-log', key: 'timer' } as const, { mins: 5, endsAt: null, now: 0 })
const focus = atom({ plugin: 'work-log', key: 'focus' } as const, false)

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

type Kind = 'done' | 'running' | 'bad' | 'idle'
const kindOf = (s: string): Kind =>
  s === 'done' || s === 'completed' ? 'done'
  : s === 'running' ? 'running'
  : s === 'stalled' || s === 'failed' || s === 'killed' ? 'bad'
  : 'idle'

const WORDS: Record<string, string> = { running: 'working on it', done: 'finished', completed: 'finished', stalled: 'stuck', failed: 'hit a problem', killed: 'stopped', idle: 'waiting' }
const say = (s: string) => WORDS[s] ?? s

// two kinds of plan: a counted job (total and done, like "35 of 105 threads") or phases.
// Phases done count fully, the one in progress counts half, so the bar moves as soon as work starts.
const progressOf = (pl: Plan) => {
  if (pl.total) {
    const done = Math.min(pl.done ?? 0, pl.total)
    return { done, total: pl.total, doing: -1, now: null, unit: pl.unit ?? 'items', percent: (done / pl.total) * 100 }
  }
  const total = pl.phases.length
  if (!total) return null
  const done = pl.phases.filter(x => x.state === 'done').length
  const doing = pl.phases.findIndex(x => x.state === 'doing')
  return { done, total, doing, now: doing >= 0 ? pl.phases[doing]! : null, unit: 'steps', percent: ((done + (doing >= 0 ? 0.5 : 0)) / total) * 100 }
}

const mmss = (ms: number) => `${Math.floor(Math.max(0, ms) / 60000)}:${String(Math.floor(Math.max(0, ms) / 1000) % 60).padStart(2, '0')}`

const DETAIL_KEYS = ['file_path', 'url', 'query', 'command', 'pattern', 'description', 'prompt']
const detailOf = (e: Record<string, unknown>) => {
  for (const k of DETAIL_KEYS) {
    if (typeof e[k] === 'string' && e[k]) return (e[k] as string).replace(/\s+/g, ' ').slice(0, 70)
  }
  return ''
}

export const register: Register = on => {
  let endsAt: number | null = null // the live deadline; the timer atom mirrors it for drawing
  let sessionStart = 0 // a plan older than this belongs to an earlier chat and stays hidden

  on('session.start', async ($, e, next) => {
    sessionStart = await $.clock.now()
    const d = await dir($)
    for (const f of SCRIPTS) {
      try {
        await $.fs.write(d + f, await $.fs.read(`${$.plugin.root}/scripts/${f}`))
      } catch {
        // shipped copy missing: leave whatever the user already has
      }
    }
    await $.command.register({ name: 'work', description: 'Open the live work and agents panel' })

    const poll = async () => {
      try {
        const p: Progress = JSON.parse(await $.fs.read((await dir($)) + 'progress.json'))
        await update($, progress, () => p)
      } catch {
        // file missing or half-written: keep the last value
      }
      try {
        const pl: Plan = JSON.parse(await $.fs.read((await dir($)) + 'plan.json'))
        const fresh = (pl.updated ?? 0) * 1000 >= sessionStart
        await update($, plan, () => (fresh ? pl : null))
      } catch {
        // no plan yet: the panel falls back to the plain progress bar
      }
      const list = await $.agent.list()
      const rows: AgentRow[] = list.map(a => ({ id: a.id, type: a.type, description: a.description, status: a.status }))
      await update($, agents, () => rows)
    }
    await poll()
    $.clock.every(2000, poll)

    // timer: once a second, redraw the countdown and ring at the deadline
    $.clock.every(1000, async () => {
      if (endsAt === null) return
      const now = await $.clock.now()
      if (now < endsAt) {
        await update($, timer, x => ({ ...x, now }))
        return
      }
      endsAt = null
      await update($, timer, x => ({ ...x, endsAt: null }))
      $.ui.toast('Time is up. You can stop now, or keep going.')
      const buzz = await $.process.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (await dir($)) + 'buzz.ps1'], { timeoutMs: 20000 }).catch(() => null)
      if (!buzz || buzz.exitCode !== 0) $.ui.toast('Timer sound failed to play. Is buzz.ps1 in ~/.claude/adhd-progress?')
    })


    return next(e)
  })

  // /clear fires no session.start: the process goes on under a new session id, so the old plan is dropped here
  on('session.end', async ($, e, next) => {
    sessionStart = await $.clock.now()
    await update($, plan, () => null)
    await update($, feed, () => [])
    await update($, activity, () => ({}))
    await update($, cleared, () => [])
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

  on('tool.call', async ($, e, next) => {
    const key = e.agentId ?? 'main'
    const detail = detailOf(e as Record<string, unknown>)
    await update($, activity, all => {
      const prev: Activity | undefined = all[key]
      return { ...all, [key]: { tool: e.tool, detail, count: (prev?.count ?? 0) + 1 } }
    })
    const at = await $.clock.now()
    await update($, feed, all => [...all, { at, who: e.agentId ? e.agentId.slice(0, 4) : 'main', tool: e.tool, detail }].slice(-30))

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const p = await read($, progress)
    const pl = await read($, plan)
    const tm = await read($, timer)
    const st = pl ? progressOf(pl) : null

    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const pct = Math.max(0, Math.min(100, st ? st.percent : 0))
    const filled = Math.round((pct / 100) * CELLS)

    return (
      <Box>
        {Array.from({ length: CELLS }, (_, i) => (
          <Text key={i} color={i < filled ? shade(i) : '#2a2c33'}>■</Text>
        ))}
        <Text color={ACCENT} bold>{st ? ` ${st.done} of ${st.total} ${st.unit} done` : ' no task yet'}</Text>
        {st?.now && <Text color="#b79cff">{`  now: ${st.now.name} `}</Text>}
        {tm.endsAt !== null && <Text color={WIN} bold>{`  TIMER ${mmss(tm.endsAt - tm.now)} `}</Text>}
        <Button key="open" label="details" onPress={() => $.ui.open({ id: PANE, title: 'Work' })} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const els = $.ui.resolve(e)
    const Client = 'Client' in els ? els.Client : null // only the terminal and desktop draw surface modules
    const p = await read($, progress)
    const pl = await read($, plan)
    const gone = await read($, cleared)
    const tm = await read($, timer)
    const focusOn = await read($, focus)
    const list = (await read($, agents)).filter(a => !gone.includes(a.id))
    const act = await read($, activity)
    const events = await read($, feed)
    const now = await $.clock.now()
    const t = now / 1000
    const rows = e.viewport?.rows ?? 30
    const jobs = (p?.jobs ?? []).filter(j => kindOf(j.state) !== 'done') // finished jobs are old news
    const room = Math.max(2, Math.floor((rows - 14 - jobs.length - (pl?.phases.length ?? 0)) / 3))
    const feedRows = Math.max(3, Math.floor((rows - 14) / 4))
    const age = (t: number) => { const d = Math.round((now - t) / 1000); return d < 90 ? `${d}s` : `${Math.round(d / 60)}m` }
    const order = (s: string) => ({ running: 0, bad: 1, idle: 2, done: 3 })[kindOf(s)]
    const shown = [...list].sort((a, b) => order(a.status) - order(b.status)).slice(0, room)
    const main = act['main']
    const st = pl ? progressOf(pl) : null
    const pct = Math.max(0, Math.min(100, st ? st.percent : 0))
    const filled = Math.round((pct / 100) * 30)

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
          <Text color={k === 'running' ? '#b79cff' : color} dimColor={k === 'idle'}>{`  ${detail}`}</Text>
        </Box>
      )
    }

    const left = tm.endsAt === null ? 0 : tm.endsAt - now
    const startTimer = async () => {
      const n = await $.clock.now()
      endsAt = n + tm.mins * 60000
      await update($, timer, x => ({ ...x, endsAt, now: n }))
    }
    const stopTimer = async () => {
      endsAt = null
      await update($, timer, x => ({ ...x, endsAt: null }))
    }
    const bump = (d: number) => update($, timer, x => ({ ...x, mins: Math.max(1, Math.min(90, x.mins + d)) }))
    const buttons = (
      <Box>
        <Button key="focus" label={focusOn ? 'full view' : 'focus'} onPress={() => update($, focus, f => !f)} />
        <Text>{'  '}</Text>
        <Button key="clear" label="clear" onPress={async () => {
          await update($, feed, () => [])
          await update($, activity, () => ({}))
          await update($, cleared, () => [...gone, ...list.map(a => a.id)])
        }} />
        <Text>{'  '}</Text>
        <Button key="close" label="close" onPress={() => $.ui.close({ id: PANE })} />
      </Box>
    )
    const TW = 30
    const timerRow = tm.endsAt !== null ? (
      <Box flexDirection="column" borderStyle="round" borderColor={WIN} paddingX={1}>
        <Text color={WIN} bold>{`TIMER   ${mmss(left)} left`}</Text>
        <Box>
          {Array.from({ length: TW }, (_, i) => (
            <Text key={i} color={i < Math.ceil((left / (tm.mins * 60000)) * TW) ? WIN : '#2a2c33'}>■</Text>
          ))}
        </Box>
        <Button key="stop" label="stop" onPress={stopTimer} />
      </Box>
    ) : (
      <Box flexDirection="column" borderStyle="round" borderColor={ACCENT} paddingX={1}>
        <Text color={ACCENT} bold>{`TIMER   ${tm.mins} min`}</Text>
        <Box>
          <Button key="less" label="-" onPress={() => bump(tm.mins <= 10 ? -1 : -5)} />
          <Text>{'  '}</Text>
          <Button key="more" label="+" onPress={() => bump(tm.mins < 10 ? 1 : 5)} />
          <Text>{'  '}</Text>
          <Button key="start" label="start" onPress={startTimer} />
        </Box>
      </Box>
    )
    const cur = pl?.phases.find(x => x.state === 'doing')
    const curNo = pl ? pl.phases.findIndex(x => x.state === 'doing') + 1 : 0
    const onStep = cur?.since ? `on this step for ${Math.max(1, Math.round((now / 1000 - cur.since) / 60))} min` : ''

    if (focusOn && cur) {
      return (
        <Box flexDirection="column">
          {buttons}
          {timerRow}
          <Text> </Text>
          {glow(`${curNo}. ${cur.name}`)}
          {cur.note && <Text color="#b79cff">{`first step: ${cur.note}`}</Text>}
          {onStep && <Text color={GREY}>{onStep}</Text>}
          {pl?.you && <Text> </Text>}
          {pl?.you && <Text color="#ffd166" bold>{pl.you}</Text>}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box>
          {Array.from({ length: 30 }, (_, i) => (
            <Text key={i} color={i < filled ? shade(i, 30) : '#2a2c33'}>■</Text>
          ))}
          <Text color={ACCENT} bold>{` ${pct.toFixed(0)}%`}</Text>
        </Box>
        {buttons}
        {timerRow}
        {st && <Text color={st.done === st.total ? DONE : '#b79cff'} bold>{st.done === st.total ? `All ${st.total} ${st.unit} done.` : `${st.done} of ${st.total} ${st.unit} done. ${st.total - st.done} to go.`}</Text>}
        <Text dimColor>{pl?.goal ?? ''}</Text>
        {!!pl?.stats?.length && (
          <Box flexDirection="column">
            {pl.stats.map((x, i) => (
              <Text key={i} color={ACCENT}>{`${x.label}: ${x.value}`}</Text>
            ))}
          </Box>
        )}
        <Text> </Text>
        {pl && !pl.small && pl.phases.length > 0 && (
          <Box flexDirection="column">
            <Text bold>The plan</Text>
            {pl.phases.map((ph, i) => {
              const k = ph.state === 'done' ? 'done' : ph.state === 'doing' ? 'running' : 'idle'
              return (
                <Box key={i}>
                  {k === 'running' ? glow(`${i + 1}. ${ph.name}`) : <Text color={k === 'done' ? DONE : GREY} dimColor={k === 'idle'}>{`${k === 'done' ? '✓' : '□'} ${i + 1}. ${ph.name}`}</Text>}
                  <Text color={k === 'running' ? '#b79cff' : GREY} dimColor={k === 'idle'}>{k === 'running' ? `  <- you are here${ph.note ? '. ' + ph.note : ''}` : ph.note ? `  ${ph.note}` : ''}</Text>
                </Box>
              )
            })}
            {onStep && <Text color={GREY}>{onStep}</Text>}
            <Text> </Text>
          </Box>
        )}
        {!!pl?.tasksDone && <Text color={WIN} bold>{`Tasks finished today: ${pl.tasksDone}`}</Text>}
        {pl?.win && <Text color={WIN}>{`Latest win: ${pl.win}`}</Text>}
        {pl?.you && <Text color="#ffd166" bold>{`Your move: ${pl.you}`}</Text>}
        {(pl?.win || pl?.you || !!pl?.tasksDone) && <Text> </Text>}
        {jobs.length > 0 && <Text bold>Working in the background</Text>}
        {jobs.map(j => line(j.name, j.state, j.name, `${say(j.state)}. ${j.detail}`))}
        {jobs.length > 0 && <Text> </Text>}
        {main && <Text bold>Right now</Text>}
        {main && <Text color={GREY}>{`${main.tool} ${main.detail}  (step ${main.count})`}</Text>}
        {main && <Text> </Text>}
        {list.length > 0 && <Text bold>{`Helpers (${list.filter(a => a.status === 'running').length} busy, ${list.length} total)`}</Text>}
        {shown.map(a => {
          const x = act[a.id]
          return (
            <Box key={a.id} flexDirection="column">
              {line(a.id, a.status, `${a.type}: ${a.description}`, say(a.status))}
              <Text color={GREY}>{x ? `   ${x.tool} ${x.detail}  (${x.count})` : `   ${a.status}`}</Text>
            </Box>
          )
        })}
        {list.length > 0 && <Text> </Text>}
        {events.length > 0 && <Text bold>Just happened</Text>}
        {[...events].reverse().slice(0, feedRows).map((ev, i) => (
          <Text key={i} color={GREY}>{`${age(ev.at)} ${ev.who} ${ev.tool} ${ev.detail}`}</Text>
        ))}
      </Box>
    )
  })
}
