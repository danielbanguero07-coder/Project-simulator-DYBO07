const fs = require('fs');
const buf = fs.readFileSync('apps/frontend/public/models/A320_nologo.glb');
const length = buf.readUInt32LE(8);
let offset = 12, json = null, bin = null;
while (offset < length) {
  const chunkLength = buf.readUInt32LE(offset);
  const chunkType = buf.readUInt32LE(offset + 4);
  const chunk = buf.subarray(offset + 8, offset + 8 + chunkLength);
  if (chunkType === 0x4E4F534A) json = JSON.parse(chunk.toString('utf8'));
  if (chunkType === 0x004E4942) bin = chunk;
  offset += 8 + chunkLength + ((4 - (chunkLength % 4)) % 4);
}
const img = json.images[0];
const bv = json.bufferViews[img.bufferView];
const start = bv.byteOffset || 0;
fs.writeFileSync('a320-texture.jpg', bin.subarray(start, start + bv.byteLength));
console.log('wrote a320-texture.jpg', bv.byteLength);
