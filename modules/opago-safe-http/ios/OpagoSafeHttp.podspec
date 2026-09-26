Pod::Spec.new do |s|
  s.name = 'OpagoSafeHttp'
  s.version = '1.0.0'
  s.summary = 'Peer-bound, bounded HTTPS transport for OPAGO'
  s.description = 'Connects only to screened IP addresses while verifying the original TLS hostname.'
  s.license = { :type => 'MIT' }
  s.author = 'Opago'
  s.homepage = 'https://opago.com'
  s.platforms = { :ios => '15.1' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Network', 'Security'
  s.source_files = '*.swift'
  s.test_spec 'Tests' do |test_spec|
    test_spec.source_files = 'Tests/*.swift'
    test_spec.resources = 'Tests/Fixtures.json'
    test_spec.requires_app_host = true
    test_spec.frameworks = 'XCTest'
  end
end
