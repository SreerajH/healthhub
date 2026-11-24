// 3D illustrations exported from the Figma file (plugin: "App · Export tile art (WebP)", 256px WebP).
// require() of an image is a number; a null entry makes the QuickAction tile fall back to its icon.
export const TILE_ART: Record<'consult' | 'lab-tests' | 'vaccines' | 'medicines' | 'reminders' | 'pet-care', number | null> = {
  consult: require('@/assets/images/tiles/consult.webp'),
  'lab-tests': require('@/assets/images/tiles/lab-tests.webp'),
  vaccines: require('@/assets/images/tiles/vaccines.webp'),
  medicines: require('@/assets/images/tiles/medicines.webp'),
  reminders: require('@/assets/images/tiles/reminders.webp'),
  'pet-care': require('@/assets/images/tiles/pet-care.webp'),
};
