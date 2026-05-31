import { ConfigPlugin, createRunOncePlugin } from '@expo/config-plugins';
import { withAndroidMavenRepo } from './withAndroid';
import { withIosPlist, withIosPodfile } from './withIos';

type PluginOptions = {
  /** Custom microphone permission text shown in the iOS permission dialog. */
  microphonePermission?: string;
  /**
   * Path to the linphonesw-pod directory, relative to the ios/ folder.
   * Only needed for local/dev installs. Defaults to '../../linphonesw-pod'.
   */
  linphoneswPodPath?: string;
};

const withNativetalkCallSdk: ConfigPlugin<PluginOptions> = (config, options = {}) => {
  config = withAndroidMavenRepo(config);
  config = withIosPlist(config, { microphonePermission: options.microphonePermission });
  config = withIosPodfile(config, { linphoneswPodPath: options.linphoneswPodPath });
  return config;
};

export default createRunOncePlugin(
  withNativetalkCallSdk,
  '@nativetalk/react-native-call-sdk',
  '0.1.0'
);
