const fs = require('fs');
const buf = fs.readFileSync('apps/frontend/public/models/A320_nologo.glb');
const magic = buf.readUInt32LE(0);
const version = buf.readUInt32LE(4);
const length = buf.readUInt32LE(8);
let offset = 12;
let json = null;
while (offset < length) {
  const chunkLength = buf.readUInt32LE(offset);
  const chunkType = buf.readUInt32LE(offset + 4);
  const chunk = buf.subarray(offset + 8, offset + 8 + chunkLength);
  if (chunkType === 0x4E4F534A) json = JSON.parse(chunk.toString('utf8'));
  offset += 8 + chunkLength + ((4 - (chunkLength % 4)) % 4);
}
console.log('magic', magic.toString(16), 'version', version, 'bytes', length);
console.log('meshes', (json.meshes||[]).length, 'nodes', (json.nodes||[]).length, 'materials', (json.materials||[]).length, 'textures', (json.textures||[]).length, 'images', (json.images||[]).length);
let triangles = 0;
for (const mesh of json.meshes || []) {
  for (const prim of mesh.primitives || []) {
    if (prim.indices !== undefined) triangles += json.accessors[prim.indices].count / 3;
    else if (prim.attributes.POSITION !== undefined) triangles += json.accessors[prim.attributes.POSITION].count / 3;
  }
}
console.log('triangles', Math.round(triangles));
console.log('materials:', (json.materials||[]).map(m => m.name || '(unnamed)'));
console.log('nodes:', (json.nodes||[]).map(n => n.name).filter(Boolean).slice(0, 40));
console.log('extensions', json.extensionsUsed || []);
