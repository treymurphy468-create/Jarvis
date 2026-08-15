import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  PROJECT_FOLDER_NAMES,
  desktopCandidateDirs,
  describeJarvisLaunchPaths,
  expandWindowsEnv,
  findJarvisDesktopShortcut,
  findJarvisRoot,
  looksLikeJarvisRoot,
  resolveUserPath,
} from './jarvisPaths.js';

function makeTree() {
  const root = join(tmpdir(), `jarvis-paths-${process.pid}-${Date.now()}`);
  const user = join(root, 'Users', 'Trey');
  const desktop = join(user, 'Desktop');
  const oneDriveDesktop = join(user, 'OneDrive', 'Desktop');
  const project = join(desktop, 'Jarvis(Mark1)');
  mkdirSync(join(project, 'scripts'), { recursive: true });
  mkdirSync(join(project, 'electron'), { recursive: true });
  mkdirSync(oneDriveDesktop, { recursive: true });
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'jarvis-mark1' }));
  writeFileSync(join(project, 'scripts', 'Jarvis.bat'), '@echo off\n');
  writeFileSync(join(project, 'electron', 'main.cjs'), 'module.exports = {};\n');
  writeFileSync(join(project, '.env'), 'OPENAI_API_KEY=sk-test\n');
  writeFileSync(join(desktop, 'Jarvis.lnk'), 'shortcut');
  return { root, user, desktop, oneDriveDesktop, project };
}

describe('jarvis desktop path discovery', () => {
  it('lists Desktop and OneDrive Desktop under the user profile', () => {
    const { user, desktop, oneDriveDesktop } = makeTree();
    try {
      const dirs = desktopCandidateDirs({
        home: user,
        env: { USERPROFILE: user, OneDrive: join(user, 'OneDrive') },
      });
      assert.ok(dirs.includes(desktop));
      assert.ok(dirs.includes(oneDriveDesktop));
    } finally {
      rmSync(join(user, '..', '..'), { recursive: true, force: true });
    }
  });

  it('finds Jarvis(Mark1) on the Desktop by folder name', () => {
    const { user, project } = makeTree();
    try {
      assert.equal(looksLikeJarvisRoot(project), true);
      const found = findJarvisRoot({
        cwd: join(user, 'Documents'),
        home: user,
        env: { USERPROFILE: user },
      });
      assert.equal(found, project);
    } finally {
      rmSync(join(user, '..', '..'), { recursive: true, force: true });
    }
  });

  it('prefers an in-repo scripts hint before scanning Desktop', () => {
    const { user, project } = makeTree();
    try {
      const found = findJarvisRoot({
        hint: join(project, 'scripts'),
        cwd: join(user, 'Downloads'),
        home: user,
        env: { USERPROFILE: user },
      });
      assert.equal(found, project);
    } finally {
      rmSync(join(user, '..', '..'), { recursive: true, force: true });
    }
  });

  it('resolves Desktop\\Jarvis(Mark1) and %USERPROFILE% paths', () => {
    const { user, project } = makeTree();
    try {
      const env = { USERPROFILE: user };
      assert.equal(
        resolveUserPath('Desktop\\Jarvis(Mark1)', { home: user, env, cwd: user }),
        project,
      );
      assert.equal(
        resolveUserPath('%USERPROFILE%\\Desktop\\Jarvis(Mark1)', { home: user, env, cwd: user }),
        project,
      );
      assert.equal(
        expandWindowsEnv('%USERPROFILE%', env),
        user,
      );
      assert.equal(
        resolveUserPath('%USERPROFILE%\\Desktop', { home: user, env, cwd: user }),
        join(user, 'Desktop'),
      );
    } finally {
      rmSync(join(user, '..', '..'), { recursive: true, force: true });
    }
  });

  it('finds the Jarvis.lnk desktop app and reports OpenAI launch paths', () => {
    const { user, desktop, project } = makeTree();
    try {
      const shortcut = findJarvisDesktopShortcut({
        home: user,
        env: { USERPROFILE: user },
      });
      assert.equal(shortcut, join(desktop, 'Jarvis.lnk'));

      const info = describeJarvisLaunchPaths({
        home: user,
        env: { USERPROFILE: user },
        cwd: user,
      });
      assert.equal(info.projectRoot, project);
      assert.equal(info.desktopShortcut, join(desktop, 'Jarvis.lnk'));
      assert.equal(info.windowsLauncher, join(project, 'scripts', 'Jarvis.vbs'));
      assert.equal(info.openaiRequired, true);
      assert.equal(info.envReady, true);
      assert.ok(PROJECT_FOLDER_NAMES.includes('Jarvis(Mark1)'));
    } finally {
      rmSync(join(user, '..', '..'), { recursive: true, force: true });
    }
  });
});
