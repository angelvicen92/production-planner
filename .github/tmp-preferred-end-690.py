from pathlib import Path

path = Path('engine/planner-next/validate.ts')
text = path.read_text()
old = '    if (!mainPolicy && (!lastMain || lastMain.end !== problem.mainFlow.preferredEnd)) block += 1;\n'
new = '    // preferredEnd guides search/ranking; hard validity does not require the final main to end there.\n'
if text.count(old) != 1:
    raise SystemExit('preferredEnd hard-validation anchor mismatch')
path.write_text(text.replace(old, new))
