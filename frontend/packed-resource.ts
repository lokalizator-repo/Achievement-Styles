export const packedResourcePrefix = 'data:application/gzip;base64,';

export async function unpackResource(uri: string) {
  if (!uri.startsWith(packedResourcePrefix)) throw new Error('Invalid packed resource.');
  const bytes = Uint8Array.from(atob(uri.slice(packedResourcePrefix.length)), char => char.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unpackSoundUri(uri: string) {
  if (!uri.startsWith(packedResourcePrefix)) return uri;
  const bytes = await unpackResource(uri);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}
