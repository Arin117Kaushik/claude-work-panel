# claude-work-panel

A live work panel for Claude Code. Type `/work` and see what Claude is doing right now: the goal, a checklist of phases with the current one highlighted, a colour progress bar above your prompt, a focus timer that buzzes when it ends, and recent activity.

Built by someone with ADHD who kept losing track of what the agent was actually doing. Tasks feel less like a wall when you can see the one step in progress and the bar moving.

## What you get

- **Progress bar** above the prompt. With a plan it fills as phases finish. Without one (small tasks) it sweeps, with elapsed time and the step Claude is on, instead of faking a percentage
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
python ~/.claude/adhd-progress/plan.py new "Goal" "Phase 1|first physical step" "Phase 2" "Phase 3"
python ~/.claude/adhd-progress/plan.py next "what just got done"
python ~/.claude/adhd-progress/plan.py you "the one thing you could do"
```

To make Claude do this on its own, add a line like this to your `CLAUDE.md`:

> On any multi-step job, run `plan.py new` with the phases, `plan.py next` as each one finishes, and `plan.py you` for the one thing I could do. Switching tasks means a new plan.

## Status

Early. Written for one person's setup and tidied up for sharing. Issues and PRs welcome.

MIT licensed.
