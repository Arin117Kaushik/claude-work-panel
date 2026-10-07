"""Claude's helper for the /work panel. Usage:
  plan.py new "goal" "phase 1|first step" "phase 2" ...   start a task, bar resets to 0 (first phase is 'doing')
  plan.py next ["win text"]                    finish the current phase, start the next
  plan.py you ["text"]                         set (or clear) the 'your move' line
  plan.py work "goal" TOTAL unit               a counted job, e.g. work "Clear junk emails" 105 threads
  plan.py did N                                add N to the done count
  plan.py stat "Label" value                   show a number in plain words, e.g. stat Found 201
  plan.py quick "goal"                         small task: bar only (Look, Do, Check), no checklist
"""
import json, sys, datetime, pathlib, time, os
F = pathlib.Path.home() / ".claude/adhd-progress/plan.json"
today = datetime.date.today().isoformat()
try: p = json.loads(F.read_text(encoding="utf-8"))
except Exception: p = {}
if p.get("date") != today: p["tasksDone"], p["date"] = 0, today
cmd, a = sys.argv[1], sys.argv[2:]
if cmd == "new":
    def ph(i, t):  # "name|first physical step"
        n, _, note = t.partition("|")
        d = {"name": n.strip(), "state": "doing" if i == 0 else "todo"}
        if note.strip(): d["note"] = note.strip()
        if i == 0: d["since"] = int(time.time())
        return d
    p.update(goal=a[0], phases=[ph(i, t) for i, t in enumerate(a[1:])])
    for k in ("win", "you", "total", "done", "unit", "stats", "small"): p.pop(k, None)
elif cmd == "work":
    p.update(goal=a[0], phases=[], total=int(a[1]), done=0, unit=a[2] if len(a) > 2 else "items", stats=[])
    for k in ("win", "you", "small"): p.pop(k, None)
elif cmd == "quick":
    p.update(goal=a[0], phases=[{"name": n, "state": "doing" if i == 0 else "todo", **({"since": int(time.time())} if i == 0 else {})} for i, n in enumerate(("Look around", "Do it", "Check it"))], small=True)
    for k in ("win", "you", "total", "done", "unit", "stats"): p.pop(k, None)
elif cmd == "did":
    p["done"] = p.get("done", 0) + int(a[0])
elif cmd == "stat":
    v = int(a[1]) if a[1].lstrip("-").isdigit() else a[1]
    st = [x for x in p.get("stats", []) if x["label"] != a[0]]
    p["stats"] = st + [{"label": a[0], "value": v}]
elif cmd == "next":
    ph = p["phases"]; i = next((k for k, x in enumerate(ph) if x["state"] == "doing"), -1)
    if i >= 0: ph[i]["state"] = "done"
    if i + 1 < len(ph): ph[i + 1]["state"], ph[i + 1]["since"] = "doing", int(time.time())
    elif p.get("phases"): p["tasksDone"] = p.get("tasksDone", 0) + 1
    if a: p["win"] = a[0]
elif cmd == "you":
    if a and a[0]: p["you"] = a[0]
    else: p.pop("you", None)
p["updated"] = int(time.time())
p["session"] = os.environ.get("CLAUDE_CODE_SESSION_ID", "")  # the panel only shows a plan written by its own chat
F.write_text(json.dumps(p, indent=2), encoding="utf-8")
