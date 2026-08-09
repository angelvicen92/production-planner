from pathlib import Path

path = Path('engine/planner-next/transportGrouping.spec.ts')
text = path.read_text()
old = '      arrival: { ...policy(2, 2, 0), taskIds: people.map((id) => `in-${id}`) },\n'
new = '      arrival: { ...policy(2, Math.max(2, departureCount), 0), taskIds: people.map((id) => `in-${id}`) },\n'
if text.count(old) != 1:
    raise SystemExit('arrival fixture anchor mismatch')
path.write_text(text.replace(old, new))
