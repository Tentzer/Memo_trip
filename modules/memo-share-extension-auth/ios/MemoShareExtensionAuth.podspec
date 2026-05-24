require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'MemoShareExtensionAuth'
  s.version        = package['version']
  s.summary        = 'Memo Trip share extension App Group auth'
  s.description    = 'Writes Supabase JWT to App Group for share extension'
  s.license        = 'MIT'
  s.author         = 'Memo Trip'
  s.homepage       = 'https://github.com'
  s.platform       = :ios, '15.1'
  s.swift_version  = '5.0'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }
end
