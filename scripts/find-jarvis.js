import { describeJarvisLaunchPaths } from '../src/utils/jarvisPaths.js';

const info = describeJarvisLaunchPaths();
console.log(JSON.stringify(info, null, 2));

if (!info.projectRoot) {
  console.error('Jarvis(Mark1) was not found. Copy the project to C:\\Jarvis(Mark1), then run npm run desktop-shortcut.');
  process.exit(1);
}
