import ExpoModulesCore
import AVFoundation

public class OpagoCameraCapabilitiesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OpagoCameraCapabilities")
    AsyncFunction("hasBackCameraTorch") { () -> Bool in
      AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)?.hasTorch ?? false
    }
  }
}
