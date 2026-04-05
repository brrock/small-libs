import * as fs from "fs";
export function copy(content: string, name: string, storagePath: string, fileName = "index.ts") {
  if (storagePath.endsWith("/")) {
    storagePath = storagePath.slice(0, -1);
  }
  const dir = `${storagePath}/${name}`;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return fs.writeFileSync(`${dir}/${fileName}`, content);
}
