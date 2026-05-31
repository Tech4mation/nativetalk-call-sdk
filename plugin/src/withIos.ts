import { ConfigPlugin, withInfoPlist, withDangerousMod } from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

export const withIosPlist: ConfigPlugin<{ microphonePermission?: string }> = (
  config,
  { microphonePermission = 'Microphone access is required for calls.' } = {}
) => {
  return withInfoPlist(config, (mod) => {
    if (!mod.modResults['NSMicrophoneUsageDescription']) {
      mod.modResults['NSMicrophoneUsageDescription'] = microphonePermission;
    }

    const bgModes: string[] = (mod.modResults['UIBackgroundModes'] as string[]) ?? [];
    if (!bgModes.includes('audio')) bgModes.push('audio');
    if (!bgModes.includes('voip')) bgModes.push('voip');
    mod.modResults['UIBackgroundModes'] = bgModes;

    return mod;
  });
};

export const withIosPodfile: ConfigPlugin<{ linphoneswPodPath?: string }> = (
  config,
  { linphoneswPodPath = '../../linphonesw-pod' } = {}
) => {
  return withDangerousMod(config, [
    'ios',
    (mod) => {
      const podfilePath = path.join(mod.modRequest.platformProjectRoot, 'Podfile');

      if (!fs.existsSync(podfilePath)) {
        return mod;
      }

      let contents = fs.readFileSync(podfilePath, 'utf-8');

      if (!contents.includes('linphonesw')) {
        // Insert after the first `use_native_modules!` call.
        contents = contents.replace(
          /(use_native_modules!)/,
          `$1\n  pod 'linphonesw', :path => '${linphoneswPodPath}'`
        );
        fs.writeFileSync(podfilePath, contents);
      }

      return mod;
    },
  ]);
};
