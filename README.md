# claude-work-panel

**See what your Claude is actually doing, instead of asking it for a status update.**

Type `/work` in Claude Code and a live panel shows what Claude is doing right now, how far along it is, and what is left. You look at the panel. You stop typing "where are you at?" and "how long will this take?".

I have ADHD and kept losing track of what the agent was doing. A wall of tool output does not tell you how far along you are. A bar and a few real numbers do.

## Demo

<video src="https://github.com/Arin117Kaushik/claude-work-panel/raw/master/assets/demo.mp4" controls muted width="100%"></video>

If the video does not play above, [watch the 80 second demo here](assets/demo.mp4).

## The problem

When Claude works on a long task, you are in the dark. To find out how it is going you have to interrupt it and ask. It answers with a guess, and the ETA is usually wrong. You ask again ten minutes later.

## The fix

The progress lives on screen, not in a reply. You get control back: you can see the work, decide when to step in, and leave it alone the rest of the time.

## How it works, in plain words

1. **You give Claude a task.** Nothing else changes. You talk to it like always.
2. **Claude makes a plan first.** Before it starts, it writes down the goal. If the job can be counted (105 emails, 40 files), it records the total. If it is bigger, it lists the phases.
3. **Claude reports real numbers as it goes.** After each chunk of work it updates the count: `35 of 105 done`. These are counts of work finished, not a guess at time left.
4. **The panel shows it live.** The bar fills from those counts. Underneath you see what Claude is doing this second, in plain words, like `Searching the web` or `Reading the page`.
5. **You get one clear next step.** When Claude needs you, the panel shows a single "your move" line. Otherwise you can ignore it.

That is the whole loop: plan, count, show. Because the bar only moves when real work is finished, you can trust it.

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
