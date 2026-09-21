interface CameraPermission { granted: boolean; canAskAgain: boolean }
interface CameraPermissions<T extends CameraPermission> {
  getCameraPermissionsAsync(): Promise<T>;
  requestCameraPermissionsAsync(): Promise<T>;
}

// Android's request API can pause the Activity even when access is already granted.
// Opening an authorized scanner must only read permission, never request it again.
export async function scannerPermission<T extends CameraPermission>(camera: CameraPermissions<T>, request = false): Promise<T> {
  const current = await camera.getCameraPermissionsAsync();
  if (current.granted || !request || !current.canAskAgain) return current;
  return camera.requestCameraPermissionsAsync();
}
