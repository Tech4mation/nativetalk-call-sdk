require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "NativetalkCallSdk"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["repository"]["url"]
  s.license      = package["license"]
  s.authors      = { "Tech4mation" => "engineering@tech4mation.com" }

  s.platforms    = { :ios => "13.0" }
  s.source       = { :git => package["repository"]["url"], :tag => "v#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.requires_arc = true
  s.swift_version = "5.0"

  s.dependency "React-Core"

  # linphonesw is bundled inside the npm package at linphonesw-pod/.
  # The Podfile must reference it via:
  #   pod 'linphonesw', :path => '../node_modules/@nativetalkcommunications/react-native-call-sdk/linphonesw-pod'
  # The config plugin adds this line automatically for Expo users.
  s.dependency "linphonesw"

  s.pod_target_xcconfig = {
    'BUILD_LIBRARY_FOR_DISTRIBUTION' => 'NO',
  }
end
