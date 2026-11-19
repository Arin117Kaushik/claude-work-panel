# work-log script version: 5
"""Claude's helper for the /work panel. Usage:
  plan.py new "goal" "phase 1|first step" "phase 2" ...   start a task, bar resets to 0 (first phase is 'doing')
  plan.py add "phase" ["phase" ...]            more steps for the SAME task: the bar keeps going, it never restarts
  plan.py next ["win text"]                    finish the current phase, start the next (the last one finishes the task)
  plan.py done ["win text"]                    finish the whole task now
  plan.py you ["text"]                         set (or clear) the 'your move' line; a text means waiting on the user
  plan.py wait "why"                           waiting on the user (an answer, an approval)
  plan.py earns "the concrete result"          this task qualifies for a gym badge (see the badge rules); without it, finishing earns none
  plan.py go                                   working again
  plan.py work "goal" TOTAL unit               a counted job, e.g. work "Clear junk emails" 105 threads
  plan.py did N                                add N to the done count
  plan.py stat "Label" value                   show a number in plain words, e.g. stat Found 201
  plan.py --session ID <command>               write another chat's plan (the panel does this)
Each chat has its own plan file in ~/.claude/adhd-progress/plans/, so two chats never overwrite each other.
"""
import json, sys, datetime, pathlib, time, os
HOME = pathlib.Path.home() / ".claude/adhd-progress"
args = sys.argv[1:]
sid = os.environ.get("CLAUDE_CODE_SESSION_ID", "")
if args[:1] == ["--session"]: sid, args = args[1], args[2:]
OVERRIDE = os.environ.get("WORK_PLAN_FILE")
F = pathlib.Path(OVERRIDE) if OVERRIDE else (HOME / "plans" / f"{sid}.json" if sid else HOME / "plan.json")
F.parent.mkdir(parents=True, exist_ok=True)
today = datetime.date.today().isoformat()
try: p = json.loads(F.read_text(encoding="utf-8"))
except Exception: p = {}
if p.get("date") != today: p["tasksDone"], p["date"] = 0, today
cmd, a = args[0], args[1:]
now = int(time.time())

def badge(goal, result):  # one gym badge per qualifying task; the case holds 8 and resets every Monday
    S = (F.parent if OVERRIDE else HOME) / "badges.json"
    monday = (datetime.date.today() - datetime.timedelta(days=datetime.date.today().weekday())).isoformat()
    try: b = json.loads(S.read_text(encoding="utf-8"))
    except Exception: b = {}
    if b.get("week") != monday: b = {"week": monday, "count": 0, "log": []}
    b["count"] += 1
    b.setdefault("log", []).append({"goal": goal, "result": result, "date": today})
    S.write_text(json.dumps(b), encoding="utf-8")

def finish_phase(x):
    x["state"] = "done"
    if x.get("since"): x["took"] = max(1, now - x["since"])

def finish(win=None):  # the whole task is finished: every phase ticks, once
    if p.get("status") != "done":
        p["tasksDone"] = p.get("tasksDone", 0) + 1
        if p.get("earns"): badge(p.get("goal", ""), p["earns"])
    for x in p.get("phases", []):
        if x["state"] != "done": finish_phase(x)
    if p.get("total"): p["done"] = p["total"]
    p["status"], p["finishedAt"] = "done", now
    for k in ("you", "reason"): p.pop(k, None)
    if win: p["win"] = win

def start(goal, **extra):
    for k in ("win", "you", "reason", "finishedAt", "stats", "total", "done", "unit", "earns"): p.pop(k, None)
    p.update(goal=goal, status="working", startedAt=now, **extra)

if cmd == "new":
    def ph(i, t):  # "name|first physical step"
        n, _, note = t.partition("|")
        d = {"name": n.strip(), "state": "doing" if i == 0 else "todo"}
        if note.strip(): d["note"] = note.strip()
        if i == 0: d["since"] = now
        return d
    start(a[0], phases=[ph(i, t) for i, t in enumerate(a[1:])])
elif cmd == "work":
    start(a[0], phases=[], total=int(a[1]), done=0, unit=a[2] if len(a) > 2 else "items", stats=[])
elif cmd == "add":
    ph = p.setdefault("phases", [])
    for t in a:
        n, _, note = t.partition("|")
        d = {"name": n.strip(), "state": "todo"}
        if note.strip(): d["note"] = note.strip()
        ph.append(d)
    if p.get("status") == "done":  # more work on a finished trip reopens it
        p["status"] = "working"; p.pop("finishedAt", None)
    if not any(x["state"] == "doing" for x in ph):
        nxt = next((x for x in ph if x["state"] == "todo"), None)
        if nxt: nxt["state"], nxt["since"] = "doing", now
elif cmd == "did":
    p["done"] = p.get("done", 0) + int(a[0])
    if p.get("total") and p["done"] >= p["total"]: finish()
elif cmd == "stat":
    v = int(a[1]) if a[1].lstrip("-").isdigit() else a[1]
    st = [x for x in p.get("stats", []) if x["label"] != a[0]]
    p["stats"] = st + [{"label": a[0], "value": v}]
elif cmd == "next":
    ph = p["phases"]; i = next((k for k, x in enumerate(ph) if x["state"] == "doing"), -1)
    if i >= 0: finish_phase(ph[i])
    nxt = next((k for k, x in enumerate(ph) if x["state"] == "todo"), -1)  # only a todo phase starts, so a stray next never reopens a finished plan
    if nxt >= 0: ph[nxt]["state"], ph[nxt]["since"] = "doing", now
    elif i >= 0: finish()
    if a: p["win"] = a[0]
elif cmd == "done":
    finish(a[0] if a else None)
elif cmd == "you":
    if a and a[0]: p["you"], p["status"], p["reason"] = a[0], "waiting", a[0]
    else:
        p.pop("you", None); p.pop("reason", None)
        if p.get("status") == "waiting": p["status"] = "working"
elif cmd == "wait":
    p["status"], p["reason"] = "waiting", a[0] if a else "needs you"
elif cmd == "earns":
    p["earns"] = a[0] if a else "done"
elif cmd == "go":
    if p.get("status") != "done": p["status"] = "working"
    p.pop("reason", None)
p["updated"] = now
p["session"] = sid
F.write_text(json.dumps(p, indent=2), encoding="utf-8")
