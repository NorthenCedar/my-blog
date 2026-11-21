import { resolve } from 'node:path';
import { writeCommentTargets } from '../src/lib/comment-targets-build.mjs';

const [dist, output] = process.argv.slice(2);
await writeCommentTargets({
  distDir: dist === undefined ? undefined : resolve(dist),
  output: output === undefined ? undefined : resolve(output),
});
