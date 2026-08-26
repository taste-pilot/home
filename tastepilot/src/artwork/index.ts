export * from "./schema.js";
export {
  ExistingAssetProvider,
  PlaceholderProvider,
  type ArtworkProvider,
  type GeneratedArtwork,
} from "./providers.js";
export {
  EMPTY_MANIFEST,
  loadManifest,
  saveManifest,
  syncManifestWithPlan,
  ensureArtworkFiles,
  artworkFilesFromManifest,
} from "./manifest.js";
