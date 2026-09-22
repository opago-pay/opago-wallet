Pod::Spec.new do |s|
  s.name = 'OpagoCameraCapabilities'
  s.version = '1.0.0'
  s.summary = 'Read-only camera capability detection for Opago'
  s.description = 'Detects a rear-camera torch; camera access and control stay with expo-camera.'
  s.license = { :type => 'MIT' }
  s.author = 'Opago'
  s.homepage = 'https://opago.com'
  s.platforms = { :ios => '15.1' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
end
