Pod::Spec.new do |s|
  linphone_version    = "5.4.117"
  linphone_base_url   = "https://download.linphone.org/releases/ios//spm//linphone-sdk-swift-ios-#{linphone_version}/XCFrameworks"
  linphone_frameworks = %w[
    bctoolbox-ios bctoolbox belle-sip belr belcard lime
    linphone mbedcrypto mbedtls mbedx509 mediastreamer2
    msamr mscodec2 msopenh264 mssilk ortp
  ]

  s.name         = 'linphonesw'
  s.version      = linphone_version
  s.summary      = 'Linphone SDK Swift wrapper — bundled with @nativetalk/react-native-call-sdk'
  s.description  = 'Self-contained CocoaPod that downloads and wraps the Linphone xcframeworks.'
  s.homepage     = 'https://gitlab.linphone.org/BC/public/linphone-sdk-swift-ios'
  s.license      = { :type => 'GPL', :text => 'See https://gitlab.linphone.org/BC/public/linphone-sdk-swift-ios' }
  s.authors      = { 'Belledonne Communications' => 'contact@belledonne-communications.com' }

  s.platform     = :ios, '13.0'
  s.source       = { :path => '.' }

  s.source_files  = 'Sources/*.swift'
  s.requires_arc  = true
  s.swift_version = '5.0'

  # Download Linphone xcframeworks on first pod install.
  # CocoaPods caches the prepared pod so this only runs once per machine per version.
  s.prepare_command = <<-CMD
    set -e
    mkdir -p Frameworks
    for fw in #{linphone_frameworks.join(" ")}; do
      if [ ! -d "Frameworks/${fw}.xcframework" ]; then
        echo "  ▸ Downloading ${fw}.xcframework (Linphone #{linphone_version})..."
        curl -fsSL "#{linphone_base_url}/${fw}.xcframework.zip" -o "/tmp/${fw}.xcframework.zip"
        unzip -q -o "/tmp/${fw}.xcframework.zip" -d "Frameworks/"
        rm -f "/tmp/${fw}.xcframework.zip"
      fi
    done
  CMD

  s.vendored_frameworks = linphone_frameworks.map { |fw| "Frameworks/#{fw}.xcframework" }

  s.pod_target_xcconfig = {
    'EXCLUDED_ARCHS[sdk=iphonesimulator*]' => '',
    'BUILD_LIBRARY_FOR_DISTRIBUTION' => 'NO',
  }
end
