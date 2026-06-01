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

export const withIosPodfile: ConfigPlugin = (config) => {
  return withDangerousMod(config, [
    'ios',
    (mod) => {
      const podfilePath = path.join(mod.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) return mod;

      let contents = fs.readFileSync(podfilePath, 'utf-8');

      if (!contents.includes('linphonesw')) {
        // Point to the linphonesw-pod bundled inside the SDK npm package.
        // The xcframeworks are downloaded automatically by its prepare_command
        // on first pod install — no SPM step required.
        const podPath = '../node_modules/@nativetalkcommunications/react-native-call-sdk/linphonesw-pod';
        contents = contents.replace(
          /(use_native_modules![^\n]*)/,
          `$1\n  pod 'linphonesw', :path => '${podPath}'`
        );
        fs.writeFileSync(podfilePath, contents);
      }

      return mod;
    },
  ]);
};
