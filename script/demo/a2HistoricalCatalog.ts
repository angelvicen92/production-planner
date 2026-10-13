/** Observed identity-only GET catalog, 2026-10-13 Europe/Madrid.
 * No private day, participant or Stage data; original identities are unchanged. */
export const a2HistoricalCatalog = {
 resource_types:[{id:1,name:'Vocal Coach',code:'vc'},{id:2,name:'Presentadora',code:'P'},{id:3,name:'Camaras',code:'Cam'},{id:4,name:'Sonido',code:'sound'},{id:5,name:'Reality',code:'Reality'},{id:6,name:'Reality Duo',code:'realityduo'}],
 resource_items:[{id:1,name:'Jose Maria',type_id:1},{id:2,name:'Lucía',type_id:1},{id:3,name:'Eva',type_id:2},
 {id:4,name:'CAM1',type_id:3},{id:5,name:'CAM2',type_id:3},{id:6,name:'CAM5',type_id:3},{id:7,name:'CAM3',type_id:3},{id:8,name:'CAM4',type_id:3},
 {id:10,name:'SON1',type_id:4},{id:11,name:'SON2',type_id:4},{id:12,name:'SON3',type_id:4},{id:13,name:'SON4',type_id:4},{id:14,name:'CAM6',type_id:3}],
 zones: [{id:1,name:'Estudio 7'},{id:2,name:'Plató 15'},{id:3,name:'Plató 14'},
  {id:11,name:'Exterior'},{id:12,name:'Sala Totales'},{id:13,name:'Caracola'},{id:14,name:'Otros'}],
 spaces: [
  {id:3,name:'Pasillo',zone_id:3,parent_space_id:null}, {id:4,name:'Hall',zone_id:3,parent_space_id:null},
  {id:5,name:'Totales Carpintería',zone_id:3,parent_space_id:null}, {id:8,name:'Sofá',zone_id:3,parent_space_id:4},
  {id:25,name:'Alfombra',zone_id:11,parent_space_id:null}, {id:26,name:'Manzano',zone_id:11,parent_space_id:null},
  {id:27,name:'Escaleras',zone_id:11,parent_space_id:null}, {id:28,name:'Buggy',zone_id:11,parent_space_id:null},
  {id:31,name:'Corner',zone_id:3,parent_space_id:4}, {id:32,name:'Giratutto',zone_id:3,parent_space_id:4},
  {id:33,name:'Sala Totales Coreo',zone_id:12,parent_space_id:null}, {id:34,name:'Sala Totales 1',zone_id:12,parent_space_id:null},
  {id:35,name:'Sala Vocal Lucía',zone_id:13,parent_space_id:null}, {id:39,name:'Maqui/Pelu',zone_id:14,parent_space_id:null},
  {id:40,name:'Vestu',zone_id:14,parent_space_id:null}, {id:41,name:'Sala Vocal Jose María',zone_id:13,parent_space_id:null},
  {id:42,name:'Plató 15',zone_id:2,parent_space_id:null}, {id:43,name:'Croma',zone_id:2,parent_space_id:42},
  {id:44,name:'Sillón',zone_id:2,parent_space_id:42}, {id:45,name:'Estrellas',zone_id:2,parent_space_id:42},
  {id:46,name:'Control',zone_id:11,parent_space_id:null}, {id:48,name:'Plató 7',zone_id:1,parent_space_id:null},
  {id:49,name:'Transporte',zone_id:14,parent_space_id:null},
 ],
};
export type A2HistoricalCatalog = typeof a2HistoricalCatalog;
