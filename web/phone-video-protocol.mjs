export const MAX_VIDEO_PACKET=8*1024*1024;
export function videoPacket(payload){
  if(payload.byteLength>MAX_VIDEO_PACKET)throw Error('视频数据包超过上限');
  const packet=new Uint8Array(4+payload.byteLength);new DataView(packet.buffer).setUint32(0,payload.byteLength);packet.set(payload,4);return packet;
}
export class VideoPacketReader{
  constructor(onPacket){this.onPacket=onPacket;this.pending=new Uint8Array(0);}
  feed(bytes){
    const data=new Uint8Array(this.pending.length+bytes.length);data.set(this.pending);data.set(bytes,this.pending.length);
    let offset=0;
    while(offset+4<=data.length){
      const size=new DataView(data.buffer,data.byteOffset+offset,4).getUint32(0);
      if(size>MAX_VIDEO_PACKET)throw Error('视频数据包长度无效');
      if(offset+4+size>data.length)break;
      this.onPacket(data.slice(offset+4,offset+4+size));offset+=4+size;
    }
    this.pending=data.slice(offset);
  }
  end(){if(this.pending.length)throw Error('视频流在数据包中间断开');}
}
export function annexBUnits(bytes){
  const starts=[];
  for(let i=0;i+3<bytes.length;i++){
    if(bytes[i]!==0||bytes[i+1]!==0)continue;
    const prefix=bytes[i+2]===1?3:bytes[i+2]===0&&bytes[i+3]===1?4:0;
    if(prefix){starts.push({start:i,type:bytes[i+prefix]&31});i+=prefix-1;}
  }
  return starts.map((s,i)=>({type:s.type,bytes:bytes.slice(s.start,starts[i+1]?.start??bytes.length)}));
}
