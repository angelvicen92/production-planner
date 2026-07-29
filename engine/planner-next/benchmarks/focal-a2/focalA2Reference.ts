export const minute=(value:string)=>{const [h,m]=value.split(":").map(Number);return h*60+m};
export const sourceDocuments=[
  {name:"ENSAYO_A2_LV.pdf",sha256:"0207f3bb59621c263219676153aae50c0cf1a98c1089b8bd732ac63e54f8df18"},
  {name:"ENSAYO_A2_LV 15 JUNIO 2025 - DESGLOSE A2.pdf",sha256:"8f96af987db37a0c8b5c1fd8870aad36d46b721ed81a0535bc22b8fb10f312b3"},
] as const;
const rows=[
["cristina-zuloaga","Cristina Zuloaga","coach-lucia","vocal-room-lucia","09:00","15:25","10:30","11:15"],
["moises-salazar-ramirez","Moisés Salazar Ramírez","coach-lucia","vocal-room-lucia","09:00","15:25","10:15","11:30"],
["angel-gonzalez","Ángel Gonzalez","coach-lucia","vocal-room-lucia","09:00","14:25","10:00","11:45"],
["carmen-maria-saborido","Carmen María Saborido","coach-lucia","vocal-room-lucia","09:30","17:15","09:45","12:00"],
["julio-gomez","Julio Gómez","coach-jose-maria","vocal-room-jose-maria","09:30","15:25","09:55","12:15"],
["lina-isabel-garcia-salcedo","Lina Isabel García-Salcedo","coach-jose-maria","vocal-room-jose-maria","09:30","17:15","11:25","12:30"],
["naomi-ines-carretero","Naomi Inés Carretero","coach-jose-maria","vocal-room-jose-maria","10:00","15:00","11:10","12:45"],
["jose-javier-cuenca","José Javier Cuenca","coach-jose-maria","vocal-room-jose-maria","10:00","14:25","10:40","13:00"],
["luis-belda","Luis Belda","coach-jose-maria","vocal-room-jose-maria","10:00","17:15","10:55","13:15"],
["gisela-montserrat","Gisela Montserrat","coach-jose-maria","vocal-room-jose-maria","10:00","17:15","10:25","13:30"],
["linet-varela","Linet Varela","coach-jose-maria","vocal-room-jose-maria","10:00","17:15","10:10","13:45"],
["marta-fonrali","Marta Fonrali","coach-lucia","vocal-room-lucia","11:10","17:15","13:45","15:15"],
["eva-martin-fernandez","Eva Martín Fernández","coach-lucia","vocal-room-lucia","10:30","17:15","14:00","15:30"],
["noa-marcos-diez","Noa Marcos Díez","coach-lucia","vocal-room-lucia","10:30","17:15","14:15","15:45"],
["claudia-torrent","Claudia Torrent","coach-lucia","vocal-room-lucia","11:10","17:15","14:30","16:00"],
["adrian-darrel","Adrián Darrel","coach-jose-maria","vocal-room-jose-maria","11:10","17:15","15:30","16:15"],
["nela-garcia","Nela García","coach-jose-maria","vocal-room-jose-maria","11:40","17:15","15:15","16:30"],
["daniel-hernan-barres","Daniel Hernán Barres","coach-jose-maria","vocal-room-jose-maria","11:40","17:15","15:00","16:45"],
["pere-portero","Pere Portero","coach-jose-maria","vocal-room-jose-maria","12:30","17:15","14:45","17:00"],
] as const;
export const focalA2Participants=rows.map(([participantId,displayName,coachId,vocalRoomId,presenceStart,presenceEnd,vocalStart,mainStart])=>({participantId,displayName,coachId,vocalRoomId,presenceStart:minute(presenceStart),presenceEnd:minute(presenceEnd),vocalStart:minute(vocalStart),mainStart:minute(mainStart),sourceConfidence:"derived-from-reference-presence-band" as const}));
export const focalA2Tasks=focalA2Participants.flatMap(p=>[
 {id:`vocal-${p.participantId}`,kind:"vocal" as const,participantId:p.participantId,coachId:p.coachId,spaceId:p.vocalRoomId,start:p.vocalStart,end:p.vocalStart+15,duration:15,dependencies:[]},
 {id:`main-${p.participantId}`,kind:"main" as const,participantId:p.participantId,coachId:p.coachId,blockKey:p.coachId,spaceId:"main-stage",start:p.mainStart,end:p.mainStart+15,duration:15,dependencies:[`vocal-${p.participantId}`]},
]);
export const focalA2Reference={day:{start:540,end:1035},meal:{spaceId:"main-stage",start:840,end:915,duration:75},participants:focalA2Participants,tasks:focalA2Tasks};
