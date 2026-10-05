"""Claude's helper for the /work panel. Usage:
  plan.py new "goal" "phase 1|first step" "phase 2" ...   start a task, bar resets to 0 (first phase is 'doing')
  plan.py next ["win text"]                    finish the current phase, start the next
  plan.py you ["text"]                         set (or clear) the 'your move' line
"""
import json, sys, datetime, pathlib, time
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
    p.pop("win", None); p.pop("you", None)
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
F.write_text(json.dumps(p, indent=2), encoding="utf-8")
