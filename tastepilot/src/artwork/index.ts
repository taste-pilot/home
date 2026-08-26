/**
 * Artwork is durable: once created and approved it persists as a project
 * asset. Changing Canon must never delete or regenerate approved artwork.
 * Providers are interchangeable; no image-generation vendor is hardcoded.
 * Manifest schemas + providers arrive in milestone M6.
 */

export interface ArtworkRequest {
  readonly id: string;
  readonly description: string;
  readonly sectionId: string;
}

export interface GeneratedArtwork {
  readonly id: string;
  readonly file: string;
}

export interface ArtworkProvider {
  readonly name: string;
  generate(request: ArtworkRequest): Promise<GeneratedArtwork>;
}
