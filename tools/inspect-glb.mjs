// Inspecciona un .glb: nodos, mallas, materiales, animaciones, texturas.
// Uso: node tools/inspect-glb.mjs ruta/al/modelo.glb
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.argv[2]);
const buf = readFileSync(file);

if (buf.toString('utf8', 0, 4) !== 'glTF') throw new Error('No es un GLB valido');
const version = buf.readUInt32LE(4);
const total = buf.readUInt32LE(8);

let off = 12, json = null, binLen = 0;
while (off < total) {
  const len = buf.readUInt32LE(off);
  const type = buf.toString('utf8', off + 4, off + 8);
  const start = off + 8;
  if (type === 'JSON') json = JSON.parse(buf.toString('utf8', start, start + len));
  if (type.startsWith('BIN')) binLen = len;
  off = start + len;
}

const g = json;
const n = (a) => (a ? a.length : 0);

console.log(`\nARCHIVO: ${file}`);
console.log(`glTF v${version} | ${(buf.length / 1024 / 1024).toFixed(2)} MB (BIN: ${(binLen / 1024 / 1024).toFixed(2)} MB)`);
console.log(`generator: ${g.asset?.generator ?? '-'}`);

// --- conteo de geometria ---
let tris = 0, verts = 0;
for (const m of g.meshes ?? []) {
  for (const p of m.primitives ?? []) {
    const posAcc = g.accessors[p.attributes.POSITION];
    verts += posAcc?.count ?? 0;
    if (p.indices != null) tris += (g.accessors[p.indices]?.count ?? 0) / 3;
    else tris += (posAcc?.count ?? 0) / 3;
  }
}
console.log(`\nGEOMETRIA: ${Math.round(tris).toLocaleString()} triangulos | ${verts.toLocaleString()} vertices`);
console.log(`  mallas: ${n(g.meshes)} | nodos: ${n(g.nodes)} | materiales: ${n(g.materials)} | texturas: ${n(g.textures)}`);

// --- ANIMACIONES (lo que mas importa) ---
console.log(`\nANIMACIONES: ${n(g.animations)}`);
for (const [i, a] of (g.animations ?? []).entries()) {
  const targets = new Set(a.channels.map((c) => g.nodes[c.target.node]?.name ?? `nodo${c.target.node}`));
  const paths = new Set(a.channels.map((c) => c.target.path));
  // duracion = max del input del sampler
  let dur = 0;
  for (const s of a.samplers) {
    const acc = g.accessors[s.input];
    if (acc?.max?.[0] != null) dur = Math.max(dur, acc.max[0]);
  }
  console.log(`  [${i}] "${a.name ?? 'sin nombre'}" | ${dur.toFixed(2)}s | ${a.channels.length} canales`);
  console.log(`      mueve: ${[...targets].join(', ')}`);
  console.log(`      propiedades: ${[...paths].join(', ')}`);
}
if (!n(g.animations)) console.log('  (ninguna: hay que animar desde codigo)');

// --- JERARQUIA DE NODOS ---
console.log(`\nJERARQUIA DE NODOS:`);
const printed = new Set();
const walk = (idx, depth) => {
  const node = g.nodes[idx];
  if (!node) return;
  printed.add(idx);
  const mesh = node.mesh != null ? g.meshes[node.mesh] : null;
  let info = '';
  if (mesh) {
    let t = 0;
    for (const p of mesh.primitives) {
      t += p.indices != null ? g.accessors[p.indices].count / 3 : g.accessors[p.attributes.POSITION].count / 3;
    }
    info = `  [malla: ${Math.round(t).toLocaleString()} tris]`;
  }
  if (node.skin != null) info += ' [skinned]';
  console.log(`${'  '.repeat(depth + 1)}- ${node.name ?? `nodo${idx}`}${info}`);
  for (const c of node.children ?? []) walk(c, depth + 1);
};
for (const s of g.scenes ?? []) for (const r of s.nodes ?? []) walk(r, 0);
const orphans = (g.nodes ?? []).map((_, i) => i).filter((i) => !printed.has(i));
if (orphans.length) console.log(`  (+${orphans.length} nodos fuera de la escena)`);

// --- MATERIALES ---
console.log(`\nMATERIALES:`);
for (const [i, m] of (g.materials ?? []).entries()) {
  const p = m.pbrMetallicRoughness ?? {};
  const bits = [];
  if (p.baseColorTexture) bits.push('baseColorTex');
  if (p.metallicRoughnessTexture) bits.push('mrTex');
  if (m.normalTexture) bits.push('normalTex');
  if (m.occlusionTexture) bits.push('aoTex');
  if (m.emissiveTexture) bits.push('emissiveTex');
  console.log(`  [${i}] ${m.name ?? 'sin nombre'} | metal:${p.metallicFactor ?? 1} rough:${p.roughnessFactor ?? 1} | ${bits.join(' ') || 'sin texturas'}`);
}

// --- TEXTURAS ---
if (n(g.images)) {
  console.log(`\nIMAGENES: ${n(g.images)}`);
  for (const [i, im] of g.images.entries()) {
    const bv = im.bufferView != null ? g.bufferViews[im.bufferView] : null;
    const kb = bv ? (bv.byteLength / 1024).toFixed(0) + ' KB' : (im.uri ?? 'externa');
    console.log(`  [${i}] ${im.name ?? ''} ${im.mimeType ?? ''} ${kb}`);
  }
}
console.log('');
