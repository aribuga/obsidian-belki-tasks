import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const stylesDir = "src/styles";
const outputPath = "styles.css";

const partials = readdirSync(stylesDir)
  .filter((fileName) => /^\d+-.*\.css$/.test(fileName))
  .sort((a, b) => a.localeCompare(b));

if (partials.length === 0) {
  throw new Error(`No style partials found in ${stylesDir}`);
}

const output = Buffer.concat(
  partials.map((fileName) => readFileSync(join(stylesDir, fileName)))
);

writeFileSync(outputPath, output);
