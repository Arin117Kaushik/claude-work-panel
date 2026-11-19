"""Run: python test_plan.py. Uses a temp plan file, never your real one."""
import json, os, subprocess, sys, tempfile, pathlib
f = pathlib.Path(tempfile.mkdtemp()) / "plan.json"
env = {**os.environ, "WORK_PLAN_FILE": str(f)}
def run(*a): subprocess.run([sys.executable, str(pathlib.Path(__file__).parent / "plan.py"), *a], check=True, env=env)
def plan(): return json.loads(f.read_text(encoding="utf-8"))
def states(): return [x["state"] for x in plan()["phases"]]
run("new", "goal", "a", "b", "c")
assert plan()["status"] == "working"
run("next"); run("next")
assert plan()["status"] == "working"
run("next")
assert states() == ["done", "done", "done"], states()
assert plan()["status"] == "done" and plan()["tasksDone"] == 1
run("next", "stray")  # a stray next after the plan finished must not reopen it
assert states() == ["done", "done", "done"], states()
assert plan()["tasksDone"] == 1
run("new", "second", "x", "y")
run("you", "pick one")
assert plan()["status"] == "waiting" and plan()["reason"] == "pick one"
run("you"); assert plan()["status"] == "working"
run("done", "all good")  # finishing early ticks every step, once
assert states() == ["done", "done"] and plan()["tasksDone"] == 2
run("done")
assert plan()["tasksDone"] == 2
run("work", "count", "3", "files")
run("did", "3")
assert plan()["status"] == "done" and plan()["done"] == 3
assert not (f.parent / "badges.json").exists()  # nothing finished so far was marked as earning a badge
run("new", "real work", "a", "b"); run("earns", "sent the application"); run("done")
bd = json.loads((f.parent / "badges.json").read_text(encoding="utf-8"))
assert bd["count"] == 1 and bd["log"][0]["result"] == "sent the application"
run("done")  # finishing again earns nothing more
assert json.loads((f.parent / "badges.json").read_text(encoding="utf-8"))["count"] == 1
print("ok")
