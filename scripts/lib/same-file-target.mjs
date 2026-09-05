import { realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Return true when a candidate output aliases any existing input file. */
export async function sameFileTarget(candidatePath, inputPaths) {
  const candidate = normalizeAbsolutePath(candidatePath);
  const inputs = inputPaths.map(normalizeAbsolutePath);
  if (inputs.some(input => input === candidate)) return true;

  const candidateIdentity = await existingIdentity(candidate);
  if (!candidateIdentity) return false;
  for (const input of inputs) {
    const inputIdentity = await existingIdentity(input);
    if (!inputIdentity) continue;
    if (candidateIdentity.realPath === inputIdentity.realPath) return true;
    if (candidateIdentity.stat.dev === inputIdentity.stat.dev && candidateIdentity.stat.ino === inputIdentity.stat.ino) return true;
  }
  return false;
}

function normalizeAbsolutePath(path) {
  const absolute = resolve(path);
  return process.platform === 'win32' ? absolute.toLocaleLowerCase('en-US') : absolute;
}

async function existingIdentity(path) {
  try {
    const [resolvedPath, fileStat] = await Promise.all([realpath(path), stat(path)]);
    return { realPath: normalizeAbsolutePath(resolvedPath), stat: fileStat };
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}
