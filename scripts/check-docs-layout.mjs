/**
 * Fail if a spec / plan / prototype / design folder reappears under docs/. Build plans live in the
 * Linear issue, what the game is lives in Notion, and docs/ only describes how the game works today.
 */
import { existsSync } from "node:fs";

const forbidden = ["docs/specs", "docs/plans", "docs/prototypes", "docs/design", "docs/worlds", "docs/art"];
const found = forbidden.filter((dir) => existsSync(dir));

if (found.length > 0) {
  console.error(`check-docs-layout: ${found.join(", ")} must not exist.`);
  console.error("Put build plans in the Linear issue and game design in Notion; see docs/README.md.");
  process.exit(1);
}
console.log("check-docs-layout: OK");
