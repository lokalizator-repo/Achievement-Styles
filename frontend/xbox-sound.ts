export const mythicOutroOffset = 10.2;
export const mythicOutroLead = 0.233;

export function splitMythicSound(uri: string): [string, string] | undefined {
  const bytes = Uint8Array.from(atob(uri.slice(uri.indexOf(',') + 1)), char => char.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return;
  let format: Uint8Array | undefined, rate = 0, alignment = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = view.getUint32(offset + 4, true), start = offset + 8;
    if (start + size > bytes.length) return;
    if (tag(offset) === 'fmt ' && size >= 16 && view.getUint16(start, true) === 1) {
      format = bytes.slice(start, start + size);
      rate = view.getUint32(start + 8, true);
      alignment = view.getUint16(start + 12, true);
    }
    if (tag(offset) === 'data' && format && rate && alignment) {
      const split = Math.round(mythicOutroOffset * rate / alignment) * alignment;
      if (split >= size) return;
      const encode = (data: Uint8Array) => {
        const headerSize = 28 + format!.length;
        const wav = new Uint8Array(headerSize + data.length + data.length % 2);
        const output = new DataView(wav.buffer);
        const writeTag = (at: number, value: string) => wav.set(Array.from(value, char => char.charCodeAt(0)), at);
        writeTag(0, 'RIFF'); output.setUint32(4, wav.length - 8, true); writeTag(8, 'WAVE');
        writeTag(12, 'fmt '); output.setUint32(16, format!.length, true); wav.set(format!, 20);
        writeTag(headerSize - 8, 'data'); output.setUint32(headerSize - 4, data.length, true); wav.set(data, headerSize);
        let binary = '';
        for (let i = 0; i < wav.length; i += 8192) binary += String.fromCharCode(...wav.subarray(i, i + 8192));
        return `data:audio/wav;base64,${btoa(binary)}`;
      };
      return [encode(bytes.subarray(start, start + split)), encode(bytes.subarray(start + split, start + size))];
    }
    offset = start + size + size % 2;
  }
}
