// Calcula el bounding box REAL del modelo (aplicando las transformaciones de nodo).
// Uso: node tools/bbox-glb.mjs assets/models/ps1.glb
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const buf = readFileSync(resolve(process.argv[2]));
let off = 12, g = null, bin = null;
const total = buf.readUInt32LE(8);
while (off < total) {
  const len = buf.readUInt32LE(off);
  const type = buf.toString('utf8', off + 4, off + 8);
  if (type === 'JSON') g = JSON.parse(buf.toString('utf8', off + 8, off + 8 + len));
  if (type.startsWith('BIN')) bin = buf.subarray(off + 8, off + 8 + len);
  off = off + 8 + len;
}

// --- matemática de matrices 4x4 (column-major, como glTF) ---
const ident = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
function trs(t = [0,0,0], q = [0,0,0,1], s = [1,1,1]) {
  const [x,y,z,w] = q;
  const x2=x+x, y2=y+y, z2=z+z;
  const xx=x*x2, xy=x*y2, xz=x*z2, yy=y*y2, yz=y*z2, zz=z*z2;
  const wx=w*x2, wy=w*y2, wz=w*z2;
  return [
    (1-(yy+zz))*s[0], (xy+wz)*s[0], (xz-wy)*s[0], 0,
    (xy-wz)*s[1], (1-(xx+zz))*s[1], (yz+wx)*s[1], 0,
    (xz+wy)*s[2], (yz-wx)*s[2], (1-(xx+yy))*s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
const apply = (m, p) => [
  m[0]*p[0] + m[4]*p[1] + m[8]*p[2] + m[12],
  m[1]*p[0] + m[5]*p[1] + m[9]*p[2] + m[13],
  m[2]*p[0] + m[6]*p[1] + m[10]*p[2] + m[14],
];

const nodeMatrix = (n) => (n.matrix ? n.matrix.slice() : trs(n.translation, n.rotation, n.scale));

const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
const per = [];

function walk(idx, parent) {
  const n = g.nodes[idx];
  const m = mul(parent, nodeMatrix(n));
  if (n.mesh != null) {
    const lo = [Infinity,Infinity,Infinity], hi = [-Infinity,-Infinity,-Infinity];
    for (const p of g.meshes[n.mesh].primitives) {
      const acc = g.accessors[p.attributes.POSITION];
      if (!acc.min || !acc.max) continue;
      // 8 esquinas del AABB local -> mundo
      for (let i = 0; i < 8; i++) {
        const c = [
          i & 1 ? acc.max[0] : acc.min[0],
          i & 2 ? acc.max[1] : acc.min[1],
          i & 4 ? acc.max[2] : acc.min[2],
        ];
        const w = apply(m, c);
        for (let k = 0; k < 3; k++) {
          if (w[k] < min[k]) min[k] = w[k];
          if (w[k] > max[k]) max[k] = w[k];
          if (w[k] < lo[k]) lo[k] = w[k];
          if (w[k] > hi[k]) hi[k] = w[k];
        }
      }
    }
    if (lo[0] !== Infinity) per.push({ name: n.name ?? `nodo${idx}`, lo, hi });
  }
  for (const c of n.children ?? []) walk(c, m);
}
for (const s of g.scenes) for (const r of s.nodes) walk(r, ident());

const f = (v) => v.map((x) => x.toFixed(4).padStart(10)).join(' ');
const size = max.map((v, i) => v - min[i]);
const center = max.map((v, i) => (v + min[i]) / 2);

console.log('\nBOUNDING BOX EN MUNDO (unidades del modelo)');
console.log('               X          Y          Z');
console.log('  min:  ', f(min));
console.log('  max:  ', f(max));
console.log('  tamaño:', f(size));
console.log('  centro:', f(center));
console.log(`\n  diagonal: ${Math.hypot(...size).toFixed(4)}`);
console.log(`  apoyado en y=0? min.y = ${min[1].toFixed(4)} ${Math.abs(min[1]) < 1e-3 ? '-> SI' : '-> NO, esta desplazado'}`);
console.log(`  centrado en XZ? centro = (${center[0].toFixed(4)}, ${center[2].toFixed(4)}) ${Math.hypot(center[0], center[2]) < 1e-3 ? '-> SI' : '-> NO'}`);

console.log('\nPIEZAS CLAVE (posicion del centro):');
for (const p of per) {
  if (!/lid_low|power_low|eject_low|reset_low|body_low|power_indicator/.test(p.name)) continue;
  const c = p.hi.map((v, i) => (v + p.lo[i]) / 2);
  console.log(`  ${p.name.padEnd(26)} centro: ${f(c)}`);
}
console.log('');
