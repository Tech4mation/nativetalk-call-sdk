import { ConfigPlugin, withDangerousMod } from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

const LINPHONE_MAVEN_ENTRY = `        maven {
            name = "linphone.org maven repository"
            url "https://download.linphone.org/maven_repository"
            content {
                includeGroup "org.linphone"
            }
        }`;

function insertIntoAllprojectsRepos(contents: string): string {
  if (contents.includes('download.linphone.org/maven_repository')) {
    return contents; // already present
  }

  // Find allprojects { repositories { } } and insert before its closing brace.
  const allprojectsMatch = /allprojects\s*\{/.exec(contents);
  if (allprojectsMatch) {
    const afterAllprojects = allprojectsMatch.index + allprojectsMatch[0].length;
    const repoMatch = /repositories\s*\{/.exec(contents.slice(afterAllprojects));
    if (repoMatch) {
      const repoStart = afterAllprojects + repoMatch.index + repoMatch[0].length;
      let depth = 1;
      let i = repoStart;
      while (i < contents.length && depth > 0) {
        if (contents[i] === '{') depth++;
        if (contents[i] === '}') depth--;
        i++;
      }
      const closingBrace = i - 1;
      return (
        contents.slice(0, closingBrace) +
        `\n${LINPHONE_MAVEN_ENTRY}\n  ` +
        contents.slice(closingBrace)
      );
    }
  }

  return contents;
}

export const withAndroidMavenRepo: ConfigPlugin = (config) => {
  return withDangerousMod(config, [
    'android',
    (mod) => {
      const buildGradlePath = path.join(mod.modRequest.platformProjectRoot, 'build.gradle');
      if (!fs.existsSync(buildGradlePath)) return mod;
      const contents = fs.readFileSync(buildGradlePath, 'utf-8');
      fs.writeFileSync(buildGradlePath, insertIntoAllprojectsRepos(contents));
      return mod;
    },
  ]);
};
