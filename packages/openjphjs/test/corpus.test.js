import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "fixtures")

const modulePath = "../dist/openjphjs.js"
const isBuilt = existsSync(resolve(distDir, "openjphjs.js"))

async function loadModule(path) {
  const mod = await import(path)
  const factory = mod.default ?? mod
  return await factory()
}

// Every .j2c fixture in the repo, decoded and pinned by the SHA-256 of the
// decoded pixel buffer. CT1/CT2 are additionally byte-verified against RAW
// references in decode.test.js; the CT1/CT2 pixels are cross-validated
// bit-for-bit against the charls and openjpeg codecs (all three decode the
// same slices to identical bytes). The rest pin current decoder output as
// regression goldens across a range of modalities, sizes and aspect ratios.
// Hashes keep the repo small — a mismatch means the decoded pixels changed;
// regenerate deliberately if a decoder upgrade legitimately changes output.
const corpus = [
  { file: "CT1.j2c", width: 512, height: 512, sha256: "1add6ede29758c6f0c68f01749ddc6c907e68a312be4eb9da8489e376e0bbd34" },
  { file: "CT2.j2c", width: 512, height: 512, sha256: "ddaf7fb6a05bf7ac8b2b29e29cca3204e426179cce2888eeff3a270c1927d73d" },
  { file: "MG1.j2c", width: 3064, height: 4774, sha256: "d4b670f1deccc165f72316858b746556acad6636ec0a381cd82b2bd23810a31c" },
  { file: "MR1.j2c", width: 512, height: 512, sha256: "2541a628cb676972b37008a4fe6b5cce3df9866df62a77086bdffbe422064632" },
  { file: "MR2.j2c", width: 1024, height: 1024, sha256: "7d1a676f3c012d0ca9d4fb9069c5dcca2b0bac014173dba48f0e32b9b49198b3" },
  { file: "MR3.j2c", width: 512, height: 512, sha256: "9d32a2a63e3980d08130da4606abab010d6de943e9d504deb80ccb910fe5aa45" },
  { file: "MR4.j2c", width: 512, height: 512, sha256: "9c7574cb23eef7f99481e94764d3efe4025db704be97cc18a944c0db2dfdb3d1" },
  { file: "NM1.j2c", width: 256, height: 1024, sha256: "a6e9d32143339d3f5748b5520aa4e6c6ffb3550b6f71fdf17bdb2ebb44bc2611" },
  { file: "RG1.j2c", width: 1841, height: 1955, sha256: "26721b2112d94887b0feae345f1b7c1c8148e1710eaf27283d8c3e650682d252" },
  { file: "RG2.j2c", width: 1760, height: 2140, sha256: "9ed5d9818c250bb81ff9093a6c4d5c6032df281fce82b9a288de65c74348301e" },
  { file: "RG3.j2c", width: 1760, height: 1760, sha256: "85480a0287e37795bc96799747a69af475f3bf0c35203fac1010fc6e100821a7" },
  { file: "SC1.j2c", width: 2048, height: 2487, sha256: "1c8e43cef2a3b25b5304c3dd1732e64c2f44d05d342387ea8e15ce01ec793c32" },
  { file: "XA1.j2c", width: 1024, height: 1024, sha256: "797b3375a2d1f94ccac04c657b5b5d90d9b4051f76508c867f2dea465d1a7f3b" },
]

describe("openjphjs HTJ2K decode corpus", () => {
  let codec

  beforeAll(async () => {
    if (isBuilt) codec = await loadModule(modulePath)
  })

  it.skipIf(!isBuilt).each(corpus)(
    "decodes $file to pixels matching its pinned SHA-256",
    ({ file, width, height, sha256 }) => {
      const encoded = readFileSync(resolve(fixturesDir, "j2c", file))
      const decoder = new codec.HTJ2KDecoder()
      decoder.getEncodedBuffer(encoded.length).set(encoded)
      decoder.decode()

      const frameInfo = decoder.getFrameInfo()
      expect(frameInfo.width).toBe(width)
      expect(frameInfo.height).toBe(height)

      const decoded = decoder.getDecodedBuffer()
      const actual = createHash("sha256").update(decoded).digest("hex")
      expect(actual).toBe(sha256)

      decoder.delete()
    }
  )
})
