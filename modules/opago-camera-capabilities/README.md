# Opago camera capabilities

Read-only Expo module exposing `hasBackCameraTorch(): Promise<boolean>` for Android and iOS. Returns false on unavailable hardware, denied platform access or inspection failure. It does not request permissions, open a camera, read images, control the torch or access wallet data. The scanner uses expo-camera for camera permission and torch control, and hides the torch action unless this module reports support.

Android checks rear-camera flash characteristics through CameraManager. iOS checks the default rear wide-angle capture device. Android and iOS builds are available; device testing of implemented features is covered by the [current user test status](../../docs/DEVICE_TESTING_STATUS.md).
