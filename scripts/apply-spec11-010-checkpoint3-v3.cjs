const fs = require("node:fs");

const applicatorPath = "scripts/apply-spec11-010-checkpoint3.cjs";
let applicator = fs.readFileSync(applicatorPath, "utf8");

const startMarker = "  const taskZoneNameBlock =";
const endMarker = "  const returnStart =";
const start = applicator.indexOf(startMarker);
const end = applicator.indexOf(endMarker, start + startMarker.length);
if (start < 0 || end < 0) {
  throw new Error("Missing checkpoint-3 nominal transport patch section");
}
if (applicator.indexOf(startMarker, start + startMarker.length) >= 0) {
  throw new Error("Ambiguous checkpoint-3 nominal transport patch section");
}

const robustPatch = [
  "  const nominalTransportPattern = /            const templateName = String\\([\\s\\S]*?            const isArrivalOrDeparture = Boolean\\(\\n              templateName && \\(templateName === arrivalTemplateName \\|\\| templateName === departureTemplateName\\),\\n            \\);/g;",
  "  const structuredTransportCheck = \\\"            const isArrivalOrDeparture =\\\\n              templateId === arrivalTransportTemplateId || templateId === departureTransportTemplateId;\\\";",
  "  const nominalTransportMatches = source.match(nominalTransportPattern) ?? [];",
  "  if (nominalTransportMatches.length !== 2) {",
  "    throw new Error(\\\"Expected exactly 2 nominal task transport blocks, found \\\" + nominalTransportMatches.length);",
  "  }",
  "  source = source.replace(nominalTransportPattern, structuredTransportCheck);",
  "",
].join("\n");

applicator = applicator.slice(0, start) + robustPatch + applicator.slice(end);
fs.writeFileSync(applicatorPath, applicator, "utf8");

require("./apply-spec11-010-checkpoint3-v2.cjs");
