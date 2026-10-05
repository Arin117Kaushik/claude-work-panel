# claude-work-panel

A live work panel for Claude Code. Type `/work` and see what Claude is doing right now: the goal, a checklist of phases with the current one highlighted, a colour progress bar above your prompt, a focus timer that buzzes when it ends, and recent activity.

Built by someone with ADHD who kept losing track of what the agent was actually doing. Tasks feel less like a wall when you can see the one step in progress and the bar moving.

## What you get

- **Progress bar** above the prompt, always on. It fills from real counts (35 of 105 threads done) or from phases, never from a guess
- **The numbers** in plain words: found, picked, done, left alone
- **Phase checklist** with the current step, and how long you have been on it
- **Your move line**: the one small thing for you to do next
- **Timer** in a boxed block at the top of the pane, with a draining bar and a buzz when it ends
- **Focus view** that hides everything except the current step
- **Recent activity** and background jobs

## Install

You need Claude Code with plugin support and Python 3. The buzz sound uses PowerShell, so it is Windows only. On other systems the panel works but the buzz does nothing.

```
/plugin marketplace add Arin117Kaushik/claude-work-panel
/plugin install work-log@claude-work-panel
```

Then copy the two helper scripts into `~/.claude/adhd-progress/`:

```
mkdir -p ~/.claude/adhd-progress
cp scripts/plan.py scripts/buzz.ps1 ~/.claude/adhd-progress/
```

Optional: drop a `buzz.wav` or `buzz.mp3` in that folder to use your own sound. Without one you get the Windows alert.

## How Claude drives it

The panel reads `~/.claude/adhd-progress/plan.json`. Claude writes it with `plan.py`:

```
# a counted job: the bar is done / total
python ~/.claude/adhd-progress/plan.py work "Clear junk emails" 105 threads
python ~/.claude/adhd-progress/plan.py stat "Found in inbox" 201
python ~/.claude/adhd-progress/plan.py did 35

# a small task: bar only, three steps, no checklist
python ~/.claude/adhd-progress/plan.py quick "Fix the typo"

# a bigger job with phases and a checklist
python ~/.claude/adhd-progress/plan.py new "Goal" "Phase 1|first physical step" "Phase 2" "Phase 3"
python ~/.claude/adhd-progress/plan.py next "what just got done"
python ~/.claude/adhd-progress/plan.py you "the one thing you could do"
```

To make Claude do this on its own, add a line like this to your `CLAUDE.md`:

> At the start of every task, run `plan.py work` if the job has a countable total (emails, files, rows), `plan.py quick` if it is small, or `plan.py new` with phases if it is big. Report real numbers with `plan.py did` and `plan.py stat`, and `plan.py next` as phases finish. Switching tasks means a new plan.

## Status

Early. Written for one person's setup and tidied up for sharing. Issues and PRs welcome.

MIT licensed.
