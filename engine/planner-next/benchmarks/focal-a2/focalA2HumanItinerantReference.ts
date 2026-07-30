export interface FocalA2HumanItinerantReference {
  operationId: string;
  start: number;
  end: number;
  sourceDocument: string;
  sourceLabel: string;
  informationalLocation: string;
}

const row = (operationId:string,start:number,end:number,informationalLocation:string):FocalA2HumanItinerantReference => ({
  operationId,start,end,informationalLocation,sourceDocument:"ENSAYO_A2_LV.pdf",sourceLabel:"Human schedule (informational only)",
});
export const focalA2HumanItinerantReference:FocalA2HumanItinerantReference[] = [
  row("reality-operation-01",660,705,"PLATÓ"),row("reality-operation-02",720,750,"CORNER INFLUENCER"),
  row("reality-operation-03",765,810,"PLATÓ"),row("reality-operation-04",810,840,"CORNER MUSIC"),
  row("reality-operation-05",675,705,"MANZANO"),row("reality-operation-06",720,765,"PLATÓ"),
  row("reality-operation-07",780,810,"HALL P.14"),row("reality-operation-08",960,990,"HALL P.14"),
  row("reality-operation-09",990,1020,"CONTROL"),row("reality-operation-10",1020,1050,"BUGGY"),
  row("reality-operation-11",1050,1065,"ALFOMBRA ROJA"),row("reality-operation-12",1065,1080,"ALFOMBRA ROJA"),
];
