// One matching set of 3D clay icons (320px WebP on white, so they sit flush on the white tiles).
// require() of an image is a number; a null entry makes the QuickAction tile fall back to its icon.
export type TileArtKey = 'consult' | 'lab-tests' | 'vaccines' | 'medicines' | 'upload' | 'reminders' | 'pet-care' | 'more';
export const TILE_ART: Record<TileArtKey, number | null> = {
  consult: require('@/assets/images/tiles/consult.webp'),
  'lab-tests': require('@/assets/images/tiles/lab-tests.webp'),
  vaccines: require('@/assets/images/tiles/vaccines.webp'),
  medicines: require('@/assets/images/tiles/medicines.webp'),
  upload: require('@/assets/images/tiles/upload.webp'),
  reminders: require('@/assets/images/tiles/reminders.webp'),
  'pet-care': require('@/assets/images/tiles/pet-care.webp'),
  more: require('@/assets/images/tiles/more.webp'),
};
