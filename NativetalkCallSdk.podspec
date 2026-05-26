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

  # Linphone SDK.
  #
  # NOTE: there is no official Linphone CocoaPod for the modern Swift binding
  # (`linphonesw`). Apps consuming this SDK must add the Linphone framework to
  # their Xcode project — either via the official binary release at
  # https://gitlab.linphone.org/BC/public/linphone-sdk/-/releases or via a
  # private vendored framework. See `docs/ios-setup.md` for the exact steps.
end
