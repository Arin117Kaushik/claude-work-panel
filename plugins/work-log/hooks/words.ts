// Plain-language names for tool calls, so the panel never shows `mcp__claude-in-chrome__navigate`.
export type Kind = 'search' | 'page' | 'browser' | 'read' | 'find' | 'write' | 'run' | 'helper' | 'email' | 'app' | 'other'
export type Words = { kind: Kind; now: string; past: string }

const w = (kind: Kind, now: string, past: string): Words => ({ kind, now, past })

const BUILTIN: Record<string, Words> = {
  WebSearch: w('search', 'Searching the web', 'Searched the web'),
  WebFetch: w('page', 'Reading a web page', 'Read a web page'),
  Read: w('read', 'Reading a file', 'Read a file'),
  Grep: w('find', 'Searching your files', 'Searched your files'),
  Glob: w('find', 'Searching your files', 'Searched your files'),
  Write: w('write', 'Writing a file', 'Wrote a file'),
  Edit: w('write', 'Editing a file', 'Edited a file'),
  NotebookEdit: w('write', 'Editing a notebook', 'Edited a notebook'),
  Bash: w('run', 'Running a command', 'Ran a command'),
  PowerShell: w('run', 'Running a command', 'Ran a command'),
  Agent: w('helper', 'Asking a helper', 'Asked a helper'),
  Skill: w('other', 'Loading a skill', 'Loaded a skill'),
  ToolSearch: w('other', 'Finding a tool', 'Found a tool'),
  AskUserQuestion: w('other', 'Asking you a question', 'Asked you a question'),
  Artifact: w('other', 'Publishing a page', 'Published a page'),
}

const CHROME: Record<string, Words> = {
  navigate: w('browser', 'Opening a page in Chrome', 'Opened a page in Chrome'),
  computer: w('browser', 'Clicking around in Chrome', 'Clicked around in Chrome'),
  form_input: w('browser', 'Filling in a form', 'Filled in a form'),
  javascript_tool: w('browser', 'Checking the page', 'Checked the page'),
  read_console_messages: w('browser', 'Checking the page', 'Checked the page'),
  read_network_requests: w('browser', 'Checking the page', 'Checked the page'),
  gif_creator: w('browser', 'Recording the screen', 'Recorded the screen'),
  read_page: w('page', 'Reading the page in Chrome', 'Read the page in Chrome'),
  get_page_text: w('page', 'Reading the page in Chrome', 'Read the page in Chrome'),
  find: w('page', 'Looking for something on the page', 'Looked for something on the page'),
}

const pretty = (s: string) => s.replace(/^(claude_ai_|plugin_)/, '').replace(/[_-]+/g, ' ')

export const words = (tool: string): Words => {
  if (BUILTIN[tool]) return BUILTIN[tool]!
  if (!tool.startsWith('mcp__')) return w('other', 'Working', 'Worked')
  const [, server = '', name = ''] = tool.split('__')
  if (server === 'claude-in-chrome') return CHROME[name] ?? (name.startsWith('tabs_') ? w('browser', 'Managing Chrome tabs', 'Managed Chrome tabs') : w('browser', 'Using Chrome', 'Used Chrome'))
  if (/gmail/i.test(server)) {
    if (/trash|delete|spam/.test(name)) return w('email', 'Cleaning up email', 'Cleaned up email')
    if (/send|reply|forward|draft/.test(name)) return w('email', 'Writing an email', 'Wrote an email')
    if (/label/.test(name)) return w('email', 'Sorting email', 'Sorted email')
    return w('email', 'Checking email', 'Checked email')
  }
  return w('app', `Working in ${pretty(server)}`, `Worked in ${pretty(server)}`)
}

const COUNT: [Kind, string, string][] = [
  ['search', 'web search done', 'web searches done'],
  ['page', 'page read', 'pages read'],
  ['browser', 'Chrome step', 'Chrome steps'],
  ['read', 'file read', 'files read'],
  ['find', 'file search', 'file searches'],
  ['write', 'file changed', 'files changed'],
  ['run', 'command run', 'commands run'],
  ['email', 'email action', 'email actions'],
  ['app', 'app action', 'app actions'],
  ['helper', 'helper used', 'helpers used'],
]

export const countLine = (kind: string, n: number) => {
  const c = COUNT.find(x => x[0] === kind)
  return c ? `${n} ${n === 1 ? c[1] : c[2]}` : ''
}

// every kind that has a count, in the fixed order above
export const tallyLines = (counts: Record<string, number>) => COUNT.filter(c => (counts[c[0]] ?? 0) > 0).map(c => countLine(c[0], counts[c[0]]!))
