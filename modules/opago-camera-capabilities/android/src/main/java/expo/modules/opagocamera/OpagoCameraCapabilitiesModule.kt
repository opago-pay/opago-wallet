package expo.modules.opagocamera

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OpagoCameraCapabilitiesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OpagoCameraCapabilities")
    AsyncFunction("hasBackCameraTorch") {
      try {
        val manager = appContext.reactContext?.getSystemService(Context.CAMERA_SERVICE) as? CameraManager
        manager?.cameraIdList?.any { id ->
          val camera = manager.getCameraCharacteristics(id)
          camera.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK &&
            camera.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
        } ?: false
      } catch (_: Exception) { false }
    }
  }
}
