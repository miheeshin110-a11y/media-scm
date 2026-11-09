// Reads never own the write lock. Discard responses begun before a write.
export class BackgroundRefresh {
 pending=false;
 loadedAt:number|null=null;
 start(quiet:boolean,writing:boolean,now:number){
  if(writing||this.pending||(quiet&&this.loadedAt!==null&&now-this.loadedAt<15000))return false;
  this.pending=true;return true;
 }
 accept(startEpoch:number,currentEpoch:number,writing:boolean){return startEpoch===currentEpoch&&!writing;}
 loaded(now:number){this.loadedAt=now;}
 finish(){this.pending=false;}
}
