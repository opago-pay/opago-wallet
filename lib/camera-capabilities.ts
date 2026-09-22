import { requireOptionalNativeModule } from 'expo-modules-core';

export async function hasBackCameraTorch(): Promise<boolean> {
  try {
    const module = requireOptionalNativeModule<{ hasBackCameraTorch(): Promise<boolean> }>('OpagoCameraCapabilities');
    return (await module?.hasBackCameraTorch()) === true;
  } catch { return false; }
}
