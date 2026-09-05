import { homedir } from 'node:os';
import { mkdtemp, mkdir, rename, rmdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { packageSkill } from './package-skill.mjs';

const AGENTS = {
  codex: { env: 'CODEX_SKILLS_DIR', directory: '.codex' },
  claude: { env: 'CLAUDE_SKILLS_DIR', directory: '.claude' },
  workbuddy: { env: 'WORKBUDDY_SKILLS_DIR', directory: '.workbuddy' },
};

export function resolveAgentSkillRoot({ agent, homedirPath = homedir(), environment = process.env }) {
  const definition = AGENTS[agent];
  if (!definition) throw new Error(`supported agents: ${Object.keys(AGENTS).join(', ')}`);
  const pathApi = /^[A-Za-z]:[\\/]/.test(homedirPath) ? path.win32 : path.posix;
  return environment[definition.env] || pathApi.join(homedirPath, definition.directory, 'skills');
}

export async function installSkill({ agent, skillsRoot, skillRoot = path.resolve(import.meta.dirname, '..') }) {
  const root = path.resolve(skillsRoot || resolveAgentSkillRoot({ agent }));
  const destination = path.join(root, 'industry-map');
  try {
    await stat(destination);
    throw new Error(`installation target already exists: ${destination}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await mkdir(root, { recursive: true });
  const stagingRoot = await mkdtemp(path.join(root, '.industry-map-install-'));
  const staged = path.join(stagingRoot, 'industry-map');
  await packageSkill({ output: staged, skillRoot });
  await rename(staged, destination);
  await rmdir(stagingRoot);
  return { agent, destination };
}

function argument(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await installSkill({
    agent: argument(process.argv.slice(2), '--agent'),
    skillsRoot: argument(process.argv.slice(2), '--skills-root'),
  }))}\n`);
}
