"""Run: python test_plan.py. Uses a temp plan file, never your real one."""
import json, os, subprocess, sys, tempfile, pathlib
f = pathlib.Path(tempfile.mkdtemp()) / "plan.json"
env = {**os.environ, "WORK_PLAN_FILE": str(f)}
def run(*a): subprocess.run([sys.executable, str(pathlib.Path(__file__).parent / "plan.py"), *a], check=True, env=env)
def states(): return [x["state"] for x in json.loads(f.read_text(encoding="utf-8"))["phases"]]
run("new", "goal", "a", "b", "c")
run("next"); run("next"); run("next")
assert states() == ["done", "done", "done"], states()
run("next", "stray")  # a stray next after the plan finished must not reopen it
assert states() == ["done", "done", "done"], states()
assert json.loads(f.read_text(encoding="utf-8"))["tasksDone"] == 1
print("ok")
