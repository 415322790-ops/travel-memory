const ROOT = '/assets/time-journey/sketches/city-attractions';

// Every source-photo candidate has its own sketch. The base image keeps the
// original city sketch available as part of the same in-memory pool.
export const CITY_ATTRACTION_SKETCHES = {
  北京: ['beijing-base', 'beijing-001', 'beijing-010', 'beijing-011'],
  上海: ['shanghai-base', 'shanghai-012', 'shanghai-013', 'shanghai-014'],
  广州: ['guangzhou-base', 'guangzhou-015', 'guangzhou-016', 'guangzhou-020', 'guangzhou-031'],
  成都: ['chengdu-base', 'chengdu-002', 'chengdu-026', 'chengdu-027', 'chengdu-037', 'chengdu-038'],
  重庆: ['chongqing-base', 'chongqing-003', 'chongqing-017', 'chongqing-028', 'chongqing-039'],
  西安: ['xian-base', 'xian-004', 'xian-005', 'xian-022', 'xian-032'],
  南京: ['nanjing-base', 'nanjing-023', 'nanjing-024', 'nanjing-025', 'nanjing-033', 'nanjing-034', 'nanjing-035'],
  苏州: ['suzhou-base', 'suzhou-006', 'suzhou-007', 'suzhou-029', 'suzhou-040'],
  厦门: ['xiamen-base', 'xiamen-008', 'xiamen-018', 'xiamen-021', 'xiamen-036'],
  青岛: ['qingdao-base', 'qingdao-009', 'qingdao-019', 'qingdao-030', 'qingdao-041'],
};

export function getCityAttractionSketches(cityName) {
  return (CITY_ATTRACTION_SKETCHES[cityName] || []).map((id) => ({
    id,
    src: `${ROOT}/${id}.png`,
  }));
}

export default CITY_ATTRACTION_SKETCHES;
