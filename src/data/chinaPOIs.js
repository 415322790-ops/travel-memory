// Tier 4 landmarks / POIs — appear only when very zoomed in

const chinaPOIs = [
  // 北京
  { name: '故宫', lat: 39.9163, lng: 116.3972, city: '北京' },
  { name: '长城(八达岭)', lat: 40.3597, lng: 116.0202, city: '北京' },
  { name: '天安门广场', lat: 39.9054, lng: 116.3976, city: '北京' },
  { name: '颐和园', lat: 39.9999, lng: 116.2755, city: '北京' },
  { name: '天坛', lat: 39.8822, lng: 116.4066, city: '北京' },
  // 上海
  { name: '东方明珠', lat: 31.2397, lng: 121.4998, city: '上海' },
  { name: '外滩', lat: 31.2400, lng: 121.4905, city: '上海' },
  { name: '迪士尼', lat: 31.1433, lng: 121.6600, city: '上海' },
  { name: '豫园', lat: 31.2272, lng: 121.4924, city: '上海' },
  // 广州
  { name: '广州塔', lat: 23.1064, lng: 113.3244, city: '广州' },
  { name: '白云山', lat: 23.1867, lng: 113.2943, city: '广州' },
  { name: '沙面', lat: 23.1103, lng: 113.2430, city: '广州' },
  // 深圳
  { name: '世界之窗', lat: 22.5370, lng: 113.9772, city: '深圳' },
  { name: '欢乐谷', lat: 22.5450, lng: 113.9860, city: '深圳' },
  // 丽江
  { name: '玉龙雪山', lat: 27.0983, lng: 100.1760, city: '丽江' },
  { name: '丽江古城', lat: 26.8721, lng: 100.2299, city: '丽江' },
  { name: '泸沽湖', lat: 27.7032, lng: 100.7987, city: '丽江' },
  // 成都
  { name: '宽窄巷子', lat: 30.6686, lng: 104.0568, city: '成都' },
  { name: '锦里', lat: 30.6484, lng: 104.0480, city: '成都' },
  { name: '大熊猫基地', lat: 30.7345, lng: 104.1452, city: '成都' },
  { name: '都江堰', lat: 30.9950, lng: 103.6140, city: '成都' },
  // 杭州
  { name: '西湖', lat: 30.2427, lng: 120.1460, city: '杭州' },
  { name: '灵隐寺', lat: 30.2425, lng: 120.1015, city: '杭州' },
  // 西安
  { name: '兵马俑', lat: 34.3852, lng: 109.2732, city: '西安' },
  { name: '大雁塔', lat: 34.2196, lng: 108.9633, city: '西安' },
  { name: '钟楼', lat: 34.2610, lng: 108.9423, city: '西安' },
  // 重庆
  { name: '洪崖洞', lat: 29.5630, lng: 106.5830, city: '重庆' },
  { name: '磁器口', lat: 29.5810, lng: 106.4510, city: '重庆' },
  // 南京
  { name: '中山陵', lat: 32.0609, lng: 118.8484, city: '南京' },
  { name: '夫子庙', lat: 32.0189, lng: 118.7918, city: '南京' },
  // 武汉
  { name: '黄鹤楼', lat: 30.5470, lng: 114.3025, city: '武汉' },
  { name: '东湖', lat: 30.5583, lng: 114.3892, city: '武汉' },
  // 厦门
  { name: '鼓浪屿', lat: 24.4479, lng: 118.0686, city: '厦门' },
  { name: '厦门大学', lat: 24.4381, lng: 118.0910, city: '厦门' },
  // 长沙
  { name: '橘子洲', lat: 28.1903, lng: 112.9561, city: '长沙' },
  { name: '岳麓山', lat: 28.1840, lng: 112.9350, city: '长沙' },
  // 昆明
  { name: '石林', lat: 24.8230, lng: 103.3250, city: '昆明' },
  // 大理
  { name: '洱海', lat: 25.6100, lng: 100.2500, city: '大理' },
  { name: '崇圣寺三塔', lat: 25.7060, lng: 100.1433, city: '大理' },
  // 苏州
  { name: '拙政园', lat: 31.3260, lng: 120.6296, city: '苏州' },
  { name: '虎丘', lat: 31.3383, lng: 120.5788, city: '苏州' },
  // 三亚
  { name: '天涯海角', lat: 18.2990, lng: 109.3480, city: '三亚' },
  { name: '亚龙湾', lat: 18.2245, lng: 109.6420, city: '三亚' },
  // 哈尔滨
  { name: '冰雪大世界', lat: 45.7778, lng: 126.5110, city: '哈尔滨' },
  { name: '中央大街', lat: 45.7672, lng: 126.6210, city: '哈尔滨' },
  // 拉萨
  { name: '布达拉宫', lat: 29.6573, lng: 91.1172, city: '拉萨' },
  { name: '大昭寺', lat: 29.6534, lng: 91.1315, city: '拉萨' },
  // 青岛
  { name: '栈桥', lat: 36.0612, lng: 120.3160, city: '青岛' },
  // 桂林
  { name: '漓江', lat: 25.2736, lng: 110.2900, city: '桂林' },
  { name: '阳朔', lat: 24.7785, lng: 110.4966, city: '桂林' },
];

export default chinaPOIs;

// POI display thresholds — very close zoom only
export const POI_DISPLAY = {
  pointFar: 600000,   // show when camera < 600km from point
  labelFar: 300000,   // label when camera < 300km
};
