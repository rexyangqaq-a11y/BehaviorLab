/** Some HDC builds print `width: N`, while SDK 1.16.0 expects `width N`.
 * Use decoded image dimensions only when the render dimensions match or rotate.
 * Device input mapping itself must still be verified by a real navigation.
 */
export function reconcileScreenshotSize(device, decoded, native) {
  const same = native.width === decoded.width && native.height === decoded.height;
  const rotated = native.width === decoded.height && native.height === decoded.width;
  if (!same && !rotated) throw new Error('Screen dimensions changed beyond a rotation; stop and inspect');
  device.cachedScreenSize = { width: decoded.width, height: decoded.height };
  return { native, decoded: { width: decoded.width, height: decoded.height }, corrected: !same,
    basis: 'decoded_real_screenshot', device_input_mapping: 'requires_observed_navigation' };
}
