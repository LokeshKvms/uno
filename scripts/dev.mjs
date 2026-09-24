import { spawn } from "node:child_process";

const procs = [
  { name: "server", color: 36, workspace: "@uno/server" },
  { name: "web", color: 35, workspace: "@uno/web" },
];

let stopping = false;
const children = procs.map(({ name, color, workspace }) => {
  const child = spawn("npm", ["run", "dev", "--workspace", workspace], { shell: true, env: { ...process.env, FORCE_COLOR: "1" } });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = "";
    stream.on("data", (chunk) => {
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const line of lines) out.write(tag + line + "\n");
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    if (!stopping) {
      console.log(`${tag}exited with code ${code}, stopping the other one.`);
      stop(code ?? 1);
    }
  });
  return child;
});

function stop(code = 0) {
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 500);
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
