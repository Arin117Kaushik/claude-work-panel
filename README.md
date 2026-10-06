# claude-work-panel

A live progress panel for Claude Code. Type `/work` and see what Claude is doing, how far along it is, and what you could do next, in plain words.

I have ADHD and kept losing track of what the agent was actually doing. A wall of tool output does not tell you how far along you are. A bar and a few real numbers do.

## What you see

- **A progress bar above your prompt, always on.** It fills from real counts or finished steps, never from a guess.
- **The numbers in plain words.** For a job like clearing an inbox: `35 of 105 threads done. 70 to go.` with found, picked, done and left alone listed under it.
- **What Claude is doing right now, in plain words.** Not `mcp__claude-in-chrome__navigate`, but `Opening a page in Chrome`, `Searching the web  ·  4 web searches done`, `Reading the page in Chrome`, `Cleaning up email`. The pane keeps a running tally for the task: web searches done, pages read, files changed, commands run.
- **A phase checklist for bigger jobs**, with the current step glowing and a "your move" line for the one thing you can do next.
- **A focus timer** in a boxed block at the top. It drains as time passes and buzzes when it ends.
- **A focus view** that hides everything except the current step.
- **Recent activity and helpers**, so you can see what is running right now.

## Install

```
/plugin marketplace add Arin117Kaushik/claude-work-panel
/plugin install work-log@claude-work-panel
```

Then run `/reload-plugins` and `/work`. That is all. The plugin copies its helper script into `~/.claude/adhd-progress/` on session start and adds a short rule to Claude's system prompt, so Claude starts a plan at the beginning of every task without you editing any file.

You need Python 3 on your PATH.

## How it works

Claude runs `plan.py` at the start of a task and keeps the numbers current. The panel reads the result from `~/.claude/adhd-progress/plan.json`.

```
python plan.py work "Clear junk emails" 105 threads   # counted job, bar is done / total
python plan.py stat "Found in inbox" 201              # a number shown in plain words
python plan.py did 35                                 # add to the done count
python plan.py quick "Fix the typo"                   # small task, bar only
python plan.py new "Goal" "Phase 1" "Phase 2"         # bigger job with a checklist
python plan.py next "what just got done"              # finish a phase
python plan.py you "the one thing you could do"       # your move
```

## Limits

- Tested on Windows 11 with Claude Code 2.1.289 only. The panel should work elsewhere, but the timer buzz uses PowerShell, so it is silent on macOS and Linux.
- To use your own sound, put a `buzz.wav` or `buzz.mp3` in `~/.claude/adhd-progress/`. Without one you get the Windows alert.
- Early software. The plugin API it uses is new, so expect rough edges. Issues and PRs welcome.
- This is a focus aid, not medical advice or treatment.

MIT licensed.
