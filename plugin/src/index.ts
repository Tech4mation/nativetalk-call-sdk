import { ConfigPlugin, createRunOncePlugin } from '@expo/config-plugins';
import { withAndroidMavenRepo } from './withAndroid';
import { withIosPlist, withIosPodfile } from './withIos';

type PluginOptions = {
  /** Custom microphone permission text shown in the iOS permission dialog. */
  microphonePermission?: string;
};

const withNativetalkCallSdk: ConfigPlugin<PluginOptions> = (config, options = {}) => {
  config = withAndroidMavenRepo(config);
  config = withIosPlist(config, { microphonePermission: options.microphonePermission });
  config = withIosPodfile(config);
  return config;
};

export default createRunOncePlugin(
  withNativetalkCallSdk,
  '@nativetalkcommunications/react-native-call-sdk',
  '0.1.0'
);
