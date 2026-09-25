/**
 * Stream one member out of a zip held in memory, for archives whose content is
 * too large to inflate at once (HMDA's national file holds a CSV of several
 * GB). fflate's streaming unzipper cannot read ZIP64 members, which any member
 * over 4 GB is, so this reads the central directory itself (ZIP64 included)
 * and pipes the raw deflate stream through Node's zlib, which has no size cap.
 */

import { Readable } from "node:stream";
import { createInflateRaw } from "node:zlib";

export interface ZipMember {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const EOCD = 0x06054b50;
const EOCD64_LOCATOR = 0x07064b50;
const EOCD64 = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

function u64(buf: Buffer, at: number): number {
  const n = buf.readBigUInt64LE(at);
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("ZIP64 value exceeds safe integer range");
  return Number(n);
}

/** Every member listed in the central directory. */
export function listMembers(buf: Buffer): ZipMember[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip: end of central directory not found");
  let count = buf.readUInt16LE(eocd + 10);
  let cdOffset = buf.readUInt32LE(eocd + 16);
  const locator = eocd - 20;
  if (locator >= 0 && buf.readUInt32LE(locator) === EOCD64_LOCATOR) {
    const rec = u64(buf, locator + 8);
    if (buf.readUInt32LE(rec) !== EOCD64) throw new Error("ZIP64 end of central directory record not found");
    count = u64(buf, rec + 32);
    cdOffset = u64(buf, rec + 48);
  }

  const out: ZipMember[] = [];
  let at = cdOffset;
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(at) !== CENTRAL) throw new Error(`Bad central directory entry at ${at}`);
    const method = buf.readUInt16LE(at + 10);
    let compressedSize = buf.readUInt32LE(at + 20);
    let uncompressedSize = buf.readUInt32LE(at + 24);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    let localHeaderOffset = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLen);
    // ZIP64 extended information: present values replace the 0xFFFFFFFF markers, in order.
    let e = at + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = buf.readUInt16LE(e);
      const size = buf.readUInt16LE(e + 2);
      if (id === 0x0001) {
        let p = e + 4;
        if (uncompressedSize === 0xffffffff) {
          uncompressedSize = u64(buf, p);
          p += 8;
        }
        if (compressedSize === 0xffffffff) {
          compressedSize = u64(buf, p);
          p += 8;
        }
        if (localHeaderOffset === 0xffffffff) localHeaderOffset = u64(buf, p);
      }
      e += 4 + size;
    }
    out.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    at = extraEnd + commentLen;
  }
  return out;
}

/** Decompressed chunks of one member, streamed. */
export async function* memberChunks(buf: Buffer, member: ZipMember): AsyncGenerator<Buffer> {
  const lh = member.localHeaderOffset;
  if (buf.readUInt32LE(lh) !== LOCAL) throw new Error(`Bad local header for ${member.name}`);
  const start = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
  const data = buf.subarray(start, start + member.compressedSize);
  if (member.method === 0) {
    yield data;
    return;
  }
  if (member.method !== 8) throw new Error(`Zip member ${member.name} uses unsupported method ${member.method}`);
  const pieces = (function* () {
    for (let i = 0; i < data.length; i += 1 << 20) yield data.subarray(i, i + (1 << 20));
  })();
  yield* Readable.from(pieces).pipe(createInflateRaw({ chunkSize: 1 << 20 }));
}

/** Lines of one text member, streamed, CRLF or LF. */
export async function* memberLines(buf: Buffer, member: ZipMember): AsyncGenerator<string> {
  const decoder = new TextDecoder("utf-8");
  let carry = "";
  for await (const chunk of memberChunks(buf, member)) {
    const text = carry + decoder.decode(chunk, { stream: true });
    const lines = text.split("\n");
    carry = lines.pop() ?? "";
    for (const l of lines) {
      const line = l.endsWith("\r") ? l.slice(0, -1) : l;
      if (line) yield line;
    }
  }
  const tail = (carry + decoder.decode()).replace(/\r$/, "");
  if (tail) yield tail;
}
