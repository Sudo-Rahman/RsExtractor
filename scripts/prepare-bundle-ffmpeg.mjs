#!/usr/bin/env node

import { copyFile, chmod, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const STAGING_DIR = path.join(ROOT_DIR, 'src-tauri', '.bundle-bin');
const BINARY_NAMES = ['ffmpeg', 'ffprobe'];
const EVERMEET_RELEASE_URLS = {
  ffmpeg: 'https://evermeet.cx/ffmpeg/getrelease/zip',
  ffprobe: 'https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip',
};
const execFileAsync = promisify(execFile);

function readTargetTriple() {
  return (
    process.env.TAURI_ENV_TARGET_TRIPLE ||
    process.env.TAURI_TARGET_TRIPLE ||
    detectRustHostTriple()
  );
}

function detectRustHostTriple() {
  try {
    const rustInfo = execFileSync('rustc', ['-vV'], { encoding: 'utf8' });
    const match = rustInfo.match(/^host: (\S+)$/m);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function getBinaryExtension() {
  return process.platform === 'win32' ? '.exe' : '';
}

function getStagedBinaryPath(binaryName, targetTriple) {
  return path.join(STAGING_DIR, `${binaryName}-${targetTriple}${getBinaryExtension()}`);
}

async function downloadFile(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(outputPath));
}

async function findFileByName(rootDir, fileName) {
  const entries = await readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);

    if (entry.isFile() && entry.name === fileName) {
      return entryPath;
    }

    if (entry.isDirectory()) {
      const nestedPath = await findFileByName(entryPath, fileName);
      if (nestedPath) {
        return nestedPath;
      }
    }
  }

  return null;
}

async function extractZip(archivePath, outputDir) {
  await execFileAsync('unzip', ['-o', archivePath, '-d', outputDir]);
}

async function downloadEvermeetBinary(binaryName) {
  const url = EVERMEET_RELEASE_URLS[binaryName];
  if (!url) {
    throw new Error(`Unsupported Evermeet binary: ${binaryName}`);
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), 'mediaflow-ffmpeg-'));
  const archivePath = path.join(tempDir, `${binaryName}.zip`);
  const extractDir = path.join(tempDir, 'extract');

  await mkdir(extractDir);

  try {
    await downloadFile(url, archivePath);
    await extractZip(archivePath, extractDir);

    const binaryPath = await findFileByName(extractDir, binaryName);
    if (!binaryPath) {
      throw new Error(`Downloaded ${binaryName} archive did not contain a ${binaryName} binary`);
    }

    return { binaryPath, tempDir };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

function findExecutableOnPath(command) {
  const locator = process.platform === 'win32' ? 'where' : 'which';

  try {
    const output = execFileSync(locator, [command], { encoding: 'utf8' }).trim();
    const firstLine = output.split(/\r?\n/).find(Boolean);
    return firstLine ?? null;
  } catch {
    return null;
  }
}

async function stageBinary(sourcePath, destinationPath) {
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await rm(destinationPath, { force: true });
  await copyFile(sourcePath, destinationPath);

  if (process.platform !== 'win32') {
    await chmod(destinationPath, 0o755);
  }
}

async function prepareMacOSBinary(binaryName, targetTriple) {
  const { binaryPath, tempDir } = await downloadEvermeetBinary(binaryName);
  const destinationPath = getStagedBinaryPath(binaryName, targetTriple);

  try {
    await stageBinary(binaryPath, destinationPath);
    console.log(`Staged ${binaryName} -> ${path.relative(ROOT_DIR, destinationPath)}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function prepareSystemBinary(binaryName, targetTriple) {
  const sourcePath = findExecutableOnPath(binaryName);
  if (!sourcePath) {
    throw new Error(`Unable to find ${binaryName} on PATH`);
  }

  const destinationPath = getStagedBinaryPath(binaryName, targetTriple);
  await stageBinary(sourcePath, destinationPath);
  console.log(`Staged ${binaryName} -> ${path.relative(ROOT_DIR, destinationPath)}`);
}

async function main() {
  const targetTriple = readTargetTriple();
  if (!targetTriple) {
    throw new Error('Unable to determine the Tauri target triple');
  }

  await mkdir(STAGING_DIR, { recursive: true });

  for (const binaryName of BINARY_NAMES) {
    if (process.platform === 'darwin') {
      await prepareMacOSBinary(binaryName, targetTriple);
    } else {
      await prepareSystemBinary(binaryName, targetTriple);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
