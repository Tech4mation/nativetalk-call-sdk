import { ConfigPlugin, withSettingsGradle } from '@expo/config-plugins';

const LINPHONE_MAVEN_ENTRY = `        maven {
            name = "linphone.org maven repository"
            url = uri("https://download.linphone.org/maven_repository")
            content {
                includeGroup("org.linphone")
            }
        }`;

const FULL_BLOCK = `
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)
    repositories {
        google()
        mavenCentral()
        maven { url "https://www.jitpack.io" }
${LINPHONE_MAVEN_ENTRY}
    }
}`;

function insertLinphoneMavenRepo(contents: string): string {
  if (contents.includes('download.linphone.org/maven_repository')) {
    return contents; // already present
  }

  if (contents.includes('dependencyResolutionManagement')) {
    // Find the repositories { } block and insert before its closing brace.
    // Use brace-counting to find the correct closing brace rather than
    // a regex, since nested blocks would confuse a simple pattern match.
    const repoMatch = /repositories\s*\{/.exec(contents);
    if (repoMatch) {
      const start = repoMatch.index + repoMatch[0].length;
      let depth = 1;
      let i = start;
      while (i < contents.length && depth > 0) {
        if (contents[i] === '{') depth++;
        if (contents[i] === '}') depth--;
        i++;
      }
      const closingBrace = i - 1;
      return (
        contents.slice(0, closingBrace) +
        `\n${LINPHONE_MAVEN_ENTRY}\n    ` +
        contents.slice(closingBrace)
      );
    }
  }

  // No dependencyResolutionManagement block — append the full block.
  return contents + FULL_BLOCK;
}

export const withAndroidMavenRepo: ConfigPlugin = (config) => {
  return withSettingsGradle(config, (mod) => {
    mod.modResults.contents = insertLinphoneMavenRepo(mod.modResults.contents);
    return mod;
  });
};
