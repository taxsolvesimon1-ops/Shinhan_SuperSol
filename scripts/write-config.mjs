// 빌드 전에 환경변수 → public/config.js. 키는 저장소에 넣지 않는다(.gitignore).
import { writeFileSync, mkdirSync } from "node:fs";
const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_KEY || "";
mkdirSync("public", { recursive: true });
writeFileSync("public/config.js", `window.CT_CONFIG=${JSON.stringify({ supabaseUrl: url, supabaseKey: key })};\n`);
console.log(url && key ? "config.js: tracking on" : "config.js: tracking off (env missing)");
