/**
 * Starter CUE template for a new user pack.
 *
 * The compile service requires the namespace to be `user.{owner_id}` —
 * the backend rewrites the package_name to `user_{id}_{slug}` on save,
 * but for editing we keep the slug-only form readable.
 *
 * Mirrors tools/cue/prompt_packs/schema_v1.cue (#PromptBlockPackV1) and
 * the simplest pattern in tools/cue/prompt_packs/core_*.cue.
 */
export function buildStarterCueSource(packSlug: string): string {
  const safeSlug = packSlug.trim() || 'my_pack';
  return `package promptpacks

pack: #PromptBlockPackV1 & {
\tversion:      "1.0.0"
\tpackage_name: "${safeSlug}"
\tblocks: [{
\t\tid: "example"
\t\tblock_schema: {
\t\t\tid_prefix: "${safeSlug}.example"
\t\t\trole:      "subject"
\t\t\tcategory:  "example"
\t\t\tvariants: [
\t\t\t\t{key: "first",  text: "First example variant."},
\t\t\t\t{key: "second", text: "Second example variant."},
\t\t\t]
\t\t}
\t}]
}

manifest: #PromptPackManifestV1 & {
\tid:             "${safeSlug}"
\ttitle:          "${safeSlug}"
\tdescription:    "User-authored pack."
\tmatrix_presets: []
}
`;
}
