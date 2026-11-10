const fs = require('fs');
const buf = fs.readFileSync('apps/frontend/public/models/A320_nologo.glb');
const length = buf.readUInt32LE(8);
let offset = 12, json = null;
while (offset < length) {
  const chunkLength = buf.readUInt32LE(offset);
  const chunkType = buf.readUInt32LE(offset + 4);
  const chunk = buf.subarray(offset + 8, offset + 8 + chunkLength);
  if (chunkType === 0x4E4F534A) json = JSON.parse(chunk.toString('utf8'));
  offset += 8 + chunkLength + ((4 - (chunkLength % 4)) % 4);
}
const mesh = json.meshes[0];
const prim = mesh.primitives[0];
const pos = json.accessors[prim.attributes.POSITION];
console.log('POSITION min', pos.min, 'max', pos.max);
console.log('attributes', Object.keys(prim.attributes));
console.log('material', JSON.stringify(json.materials[0], null, 2));
console.log('image', JSON.stringify(json.images[0], null, 2));
console.log('node', JSON.stringify(json.nodes[0], null, 2));
// texture image dimensions from PNG header in BIN chunk
const binOffset = offset;
const binChunkLen = buf.readUInt32LE(12 + 0); // not reliable; find BIN chunk
let o = 12, bin = null;
while (o < length) {
  const cl = buf.readUInt32LE(o);
  const ct = buf.readUInt32LE(o + 4);
  if (ct === 0x004E4942) bin = buf.subarray(o + 8, o + 8 + cl);
  o += 8 + cl + ((4 - (cl % 4)) % 4);
}
const img = json.images[0];
if (bin && img && img.bufferView !== undefined) {
  const bv = json.bufferViews[img.bufferView];
  const start = (bv.byteOffset || 0);
  const png = bin.subarray(start, start + bv.byteLength);
  // PNG IHDR at offset 16
  if (png[0] === 0x89 && png.toString('ascii', 1, 4) === 'PNG') {
    console.log('PNG size', png.readUInt32BE(16), 'x', png.readUInt32BE(20), 'bytes', png.length);
  } else {
    console.log('image mime', img.mimeType, 'bytes', png.length);
  }
}
