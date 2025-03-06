import { spawnSync } from "node:child_process";

export function execute(command: string, args: string[]) {
  const spawnResult = spawnSync(command, args, {
    encoding: "utf8",
  });
  if (spawnResult.error) throw spawnResult.error;
  return {
    stdout: spawnResult.stdout.trim(),
    stderr: spawnResult.stderr.trim(),
  };
}

export function pluralize(count: number, item: string) {
  return `${count} ${item}${count === 1 ? "" : "s"}`;
}

export function unique(items: string[]) {
  return Array.from(new Set(items));
}
