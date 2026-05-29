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

  # React Native peer.
  s.dependency "React-Core"

  # Linphone Swift wrapper.
  # There is no official CocoaPod; consumers must supply linphonesw themselves.
  # For local/dev installs, reference a local linphonesw.podspec via the app's
  # Podfile (see docs/ios-setup.md). For npm distribution, the SDK will ship a
  # precompiled xcframework (roadmap item) so this dependency disappears.
  s.dependency "linphonesw"

  s.pod_target_xcconfig = {
    'BUILD_LIBRARY_FOR_DISTRIBUTION' => 'NO',
  }
end
