/**
 * Writes /.well-known/agent-skills/index.json from the SKILL.md files beside it.
 *
 * The discovery 0.2.0 index requires a `digest` per entry: the SHA-256 of the
 * artifact's raw bytes. A hand-written digest is wrong the moment the skill is
 * edited, and a wrong digest is worse than no index — a client that verifies it
 * will reject the skill. So the index is generated from the files, and a test
 * re-derives the digests to fail the build if the two ever drift.
 *
 * Spec: https://github.com/cloudflare/agent-skills-discovery-rfc
 */
const SKILLS_DIR = new URL("../public/.well-known/agent-skills/", import.meta.url)
const INDEX = new URL("index.json", SKILLS_DIR)

/** The frontmatter `description`, which is what a client shows before fetching. */
const descriptionOf = (markdown: string, name: string) => {
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---/)
  const described = frontmatter?.[1].match(/^description:\s*(.+)$/m)?.[1]?.trim()
  if (!described) throw new Error(`${name}/SKILL.md has no frontmatter description`)
  if (described.length > 1024) throw new Error(`${name} description exceeds 1024 characters`)
  return described
}

export const sha256Digest = async (bytes: ArrayBuffer) => {
  const hash = await crypto.subtle.digest("SHA-256", bytes)
  const hex = Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
  return `sha256:${hex}`
}

export const buildAgentSkillsIndex = async (skillNames: ReadonlyArray<string>) => ({
  $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  skills: await Promise.all(skillNames.map(async (name) => {
    const file = Bun.file(new URL(`${name}/SKILL.md`, SKILLS_DIR))
    const bytes = await file.arrayBuffer()

    return {
      name,
      type: "skill-md" as const,
      description: descriptionOf(new TextDecoder().decode(bytes), name),
      url: `/.well-known/agent-skills/${name}/SKILL.md`,
      digest: await sha256Digest(bytes),
    }
  })),
})

/** Every directory beside the index that holds a SKILL.md, in a stable order. */
export const discoverSkillNames = async () => {
  const { readdir } = await import("node:fs/promises")
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true })

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => Bun.file(new URL(`${name}/SKILL.md`, SKILLS_DIR)).size > 0)
    .sort()
}

if (import.meta.main) {
  const names = await discoverSkillNames()
  await Bun.write(INDEX, `${JSON.stringify(await buildAgentSkillsIndex(names), null, 2)}\n`)
  console.log(`Wrote ${names.length} skills to ${Bun.fileURLToPath(INDEX)}`)
}
