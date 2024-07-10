#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import * as cp from "node:child_process";
import { promisify } from "node:util";
export const exec = promisify(cp.exec);
const githubUrlRx = /^(?:https:\/\/github\.com\/|git@github\.com:)([^\/]+)\/(.*?)(?:\.git)?$/;

const selfUrl = new URL(import.meta.url);
const cwd = new URL('.', selfUrl).pathname;
const self = relative(cwd, selfUrl.pathname);

const origin = (await exec('git remote get-url origin', { cwd })).stdout.trim();
let description = '';
try {
  description = JSON.parse((await exec('gh repo view --json description', { cwd })).stdout).description;
} catch (e) {
  console.warn(e);
}

const [org, project] = [...origin.match(githubUrlRx)].slice(1);

const rxes = [
  '.git',
  '.gitignore',
  '.npm-org',
  '*-lock.json',
  '*-lock.yaml',
  '*.lock',
  self,
  ...(await readFile('.gitignore', 'utf8')).split('\n').map(a => a.replace(/#.*$/, '').trim()).filter(a => a),
].map((glob) => {
  const pattern = join(cwd, glob)
    .replace(/\*\*/g, '::dotstar::')
    .replace(/\*/g, '[^/]*')
    .replace(/::dotstar::/g, '.*')
  return new RegExp(`^${pattern}`);
});

const files = (await readdir(cwd, { recursive: true, withFileTypes: true }))
  .filter((entry) => (
    !entry.isDirectory()
    && !entry.path.startsWith(join(cwd, 'node_modules'))
    && !rxes.some(rx => rx.test(join(entry.path, entry.name)))
  ))
  .map((entry) => join(entry.path, entry.name));

const subs = { org, project, description };
const subRx = new RegExp(`%(${Object.keys(subs).join('|')})%`, 'g');

await Promise.all(files.map(async (file) => {
  const text = await readFile(file, 'utf8');
  const modded = text.replace(subRx, (_, key) => subs[key]);
  await writeFile(file, modded, 'utf8');
}));
