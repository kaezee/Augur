// Writes the shadcn registry (demo/dist/r/registry.json, the index directories read)
// and its item (demo/dist/r/augur.json, each file's source inlined): the same output
// as `shadcn build`, without the CLI.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";

const out = process.argv[2] ?? "demo/dist/r";
const registry = JSON.parse(readFileSync("registry.json", "utf8"));
mkdirSync(out, { recursive: true });
copyFileSync("registry.json", `${out}/registry.json`);
for (const item of registry.items) {
  const built = {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    ...item,
    files: item.files.map((f) => ({ ...f, content: readFileSync(f.path, "utf8") })),
  };
  writeFileSync(`${out}/${item.name}.json`, JSON.stringify(built, null, 2) + "\n");
}
