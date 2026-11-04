// Seed data for AgriQNet (Karnataka). Districts/edges are taken from the original
// farmer-pest-alert-system/backend/seed.js; geo-coordinates, aliases and crops were added
// so alerts, weather and free-text locations can be resolved.

export const districts = [
  { id: 'BID', name: 'Bidar', aliases: [], meta: { population: 1703300, area_sq_km: 5448 }, position: { x: 75, y: 10 }, geo: { lat: 17.913, lon: 77.53 }, majorCrops: ['Tur', 'Soybean', 'Sugarcane'] },
  { id: 'KLB', name: 'Kalaburagi', aliases: ['Gulbarga'], meta: { population: 2566326, area_sq_km: 10951 }, position: { x: 65, y: 20 }, geo: { lat: 17.329, lon: 76.834 }, majorCrops: ['Tur', 'Jowar', 'Bengal gram'] },
  { id: 'VJP', name: 'Vijayapura', aliases: ['Bijapur'], meta: { population: 2177331, area_sq_km: 10498 }, position: { x: 45, y: 20 }, geo: { lat: 16.83, lon: 75.71 }, majorCrops: ['Jowar', 'Grapes', 'Tur'] },
  { id: 'YDG', name: 'Yadgir', aliases: ['Yadagiri'], meta: { population: 1174271, area_sq_km: 5273 }, position: { x: 60, y: 30 }, geo: { lat: 16.77, lon: 77.138 }, majorCrops: ['Paddy', 'Cotton', 'Tur'] },
  { id: 'BLG', name: 'Belagavi', aliases: ['Belgaum'], meta: { population: 4779661, area_sq_km: 13415 }, position: { x: 25, y: 25 }, geo: { lat: 15.849, lon: 74.497 }, majorCrops: ['Sugarcane', 'Soybean', 'Maize'] },
  { id: 'BGK', name: 'Bagalkote', aliases: ['Bagalkot'], meta: { population: 1889752, area_sq_km: 6575 }, position: { x: 40, y: 35 }, geo: { lat: 16.181, lon: 75.696 }, majorCrops: ['Sugarcane', 'Maize', 'Grapes'] },
  { id: 'RCR', name: 'Raichur', aliases: [], meta: { population: 1928812, area_sq_km: 8442 }, position: { x: 65, y: 40 }, geo: { lat: 16.204, lon: 77.355 }, majorCrops: ['Paddy', 'Cotton', 'Sunflower'] },
  { id: 'UKD', name: 'Uttara Kannada', aliases: ['Karwar', 'North Kanara', 'Sirsi'], meta: { population: 1437169, area_sq_km: 10291 }, position: { x: 15, y: 50 }, geo: { lat: 14.813, lon: 74.129 }, majorCrops: ['Paddy', 'Arecanut', 'Coconut'] },
  { id: 'UDP', name: 'Udupi', aliases: ['Manipal'], meta: { population: 1177361, area_sq_km: 3880 }, position: { x: 18, y: 65 }, geo: { lat: 13.341, lon: 74.747 }, majorCrops: ['Paddy', 'Coconut', 'Cashew'] },
  { id: 'DKD', name: 'Dakshina Kannada', aliases: ['Mangaluru', 'Mangalore', 'South Kanara'], meta: { population: 2089649, area_sq_km: 4560 }, position: { x: 22, y: 80 }, geo: { lat: 12.914, lon: 74.856 }, majorCrops: ['Arecanut', 'Coconut', 'Paddy'] },
  { id: 'DWD', name: 'Dharwad', aliases: ['Hubballi', 'Hubli'], meta: { population: 1847023, area_sq_km: 4260 }, position: { x: 30, y: 45 }, geo: { lat: 15.458, lon: 75.008 }, majorCrops: ['Cotton', 'Soybean', 'Maize'] },
  { id: 'GDG', name: 'Gadag', aliases: [], meta: { population: 1064570, area_sq_km: 4656 }, position: { x: 42, y: 50 }, geo: { lat: 15.43, lon: 75.63 }, majorCrops: ['Green gram', 'Cotton', 'Onion'] },
  { id: 'KPL', name: 'Koppal', aliases: [], meta: { population: 1389920, area_sq_km: 5570 }, position: { x: 55, y: 50 }, geo: { lat: 15.351, lon: 76.155 }, majorCrops: ['Paddy', 'Maize', 'Sunflower'] },
  { id: 'HVR', name: 'Haveri', aliases: [], meta: { population: 1597668, area_sq_km: 4823 }, position: { x: 35, y: 60 }, geo: { lat: 14.793, lon: 75.404 }, majorCrops: ['Maize', 'Cotton', 'Chilli'] },
  { id: 'VJN', name: 'Vijayanagara', aliases: ['Hosapete', 'Hospet', 'Hampi'], meta: { population: 1353628, area_sq_km: 5567 }, position: { x: 58, y: 60 }, geo: { lat: 15.269, lon: 76.387 }, majorCrops: ['Paddy', 'Maize', 'Sugarcane'] },
  { id: 'BLR', name: 'Ballari', aliases: ['Bellary'], meta: { population: 2452595, area_sq_km: 8450 }, position: { x: 68, y: 65 }, geo: { lat: 15.139, lon: 76.921 }, majorCrops: ['Paddy', 'Cotton', 'Chilli'] },
  { id: 'DVG', name: 'Davanagere', aliases: ['Davangere'], meta: { population: 1945497, area_sq_km: 5924 }, position: { x: 45, y: 70 }, geo: { lat: 14.464, lon: 75.921 }, majorCrops: ['Maize', 'Paddy', 'Arecanut'] },
  { id: 'SMG', name: 'Shivamogga', aliases: ['Shimoga'], meta: { population: 1752753, area_sq_km: 8495 }, position: { x: 30, y: 70 }, geo: { lat: 13.929, lon: 75.568 }, majorCrops: ['Paddy', 'Arecanut', 'Maize'] },
  { id: 'CTR', name: 'Chitradurga', aliases: [], meta: { population: 1659456, area_sq_km: 8440 }, position: { x: 60, y: 75 }, geo: { lat: 14.23, lon: 76.398 }, majorCrops: ['Groundnut', 'Maize', 'Onion'] },
  { id: 'CKM', name: 'Chikkamagaluru', aliases: ['Chikmagalur'], meta: { population: 1137961, area_sq_km: 7201 }, position: { x: 40, y: 80 }, geo: { lat: 13.316, lon: 75.772 }, majorCrops: ['Coffee', 'Paddy', 'Pepper'] },
  { id: 'TMK', name: 'Tumakuru', aliases: ['Tumkur'], meta: { population: 2678980, area_sq_km: 10597 }, position: { x: 65, y: 85 }, geo: { lat: 13.34, lon: 77.101 }, majorCrops: ['Ragi', 'Coconut', 'Groundnut'] },
  { id: 'CKB', name: 'Chikkaballapur', aliases: ['Chikkaballapura', 'Chickballapur'], meta: { population: 1255104, area_sq_km: 4244 }, position: { x: 78, y: 80 }, geo: { lat: 13.435, lon: 77.728 }, majorCrops: ['Grapes', 'Ragi', 'Vegetables'] },
  { id: 'KLR', name: 'Kolar', aliases: [], meta: { population: 1536401, area_sq_km: 3969 }, position: { x: 85, y: 88 }, geo: { lat: 13.137, lon: 78.129 }, majorCrops: ['Tomato', 'Ragi', 'Mango'] },
  { id: 'HSN', name: 'Hassan', aliases: [], meta: { population: 1776421, area_sq_km: 6814 }, position: { x: 45, y: 90 }, geo: { lat: 13.007, lon: 76.096 }, majorCrops: ['Potato', 'Coffee', 'Ragi'] },
  { id: 'BNU', name: 'Bengaluru Urban', aliases: ['Bengaluru', 'Bangalore', 'Bangalore Urban'], meta: { population: 9621551, area_sq_km: 2190 }, position: { x: 75, y: 92 }, geo: { lat: 12.972, lon: 77.594 }, majorCrops: ['Ragi', 'Vegetables', 'Flowers'] },
  { id: 'BNR', name: 'Bengaluru Rural', aliases: ['Bangalore Rural', 'Doddaballapur', 'Devanahalli'], meta: { population: 990923, area_sq_km: 2259 }, position: { x: 70, y: 88 }, geo: { lat: 13.293, lon: 77.538 }, majorCrops: ['Ragi', 'Grapes', 'Maize'] },
  { id: 'RMG', name: 'Ramanagara', aliases: ['Ramanagaram', 'Bengaluru South'], meta: { population: 1082636, area_sq_km: 3556 }, position: { x: 65, y: 95 }, geo: { lat: 12.722, lon: 77.281 }, majorCrops: ['Ragi', 'Mango', 'Sericulture'] },
  { id: 'MND', name: 'Mandya', aliases: [], meta: { population: 1805769, area_sq_km: 4961 }, position: { x: 55, y: 95 }, geo: { lat: 12.522, lon: 76.897 }, majorCrops: ['Sugarcane', 'Paddy', 'Ragi'] },
  { id: 'KDG', name: 'Kodagu', aliases: ['Coorg', 'Madikeri'], meta: { population: 554519, area_sq_km: 4102 }, position: { x: 35, y: 95 }, geo: { lat: 12.421, lon: 75.739 }, majorCrops: ['Coffee', 'Pepper', 'Paddy'] },
  { id: 'MYS', name: 'Mysuru', aliases: ['Mysore'], meta: { population: 3001127, area_sq_km: 6854 }, position: { x: 50, y: 100 }, geo: { lat: 12.296, lon: 76.639 }, majorCrops: ['Paddy', 'Tobacco', 'Ragi'] },
  { id: 'CMR', name: 'Chamarajanagar', aliases: ['Chamarajanagara'], meta: { population: 1020791, area_sq_km: 5101 }, position: { x: 60, y: 105 }, geo: { lat: 11.926, lon: 76.94 }, majorCrops: ['Turmeric', 'Paddy', 'Banana'] },
];

const E = (a, b) => ({ districtAId: a, districtBId: b });
export const edges = [
  E('BGK','BLG'),E('BGK','VJP'),E('BGK','GDG'),E('BGK','KPL'),E('BGK','RCR'),E('BLR','VJN'),E('BLR','KPL'),E('BLR','RCR'),
  E('BLR','CTR'),E('BLG','VJP'),E('BLG','DWD'),E('BLG','GDG'),E('BLG','UKD'),E('BNU','BNR'),E('BNU','RMG'),E('BNU','KLR'),
  E('BNR','CKB'),E('BNR','KLR'),E('BNR','TMK'),E('BNR','RMG'),E('BID','KLB'),E('CMR','MYS'),E('CMR','MND'),E('CMR','RMG'),
  E('CKB','KLR'),E('CKB','TMK'),E('CKM','SMG'),E('CKM','DVG'),E('CKM','TMK'),E('CKM','CTR'),E('CKM','DKD'),E('CKM','HSN'),
  E('CTR','DVG'),E('CTR','TMK'),E('CTR','VJN'),E('CTR','HSN'),E('DKD','UDP'),E('DKD','KDG'),E('DKD','HSN'),E('DVG','SMG'),
  E('DVG','HVR'),E('DVG','VJN'),E('DWD','GDG'),E('DWD','HVR'),E('DWD','UKD'),E('GDG','KPL'),E('GDG','HVR'),E('GDG','VJN'),
  E('KLB','YDG'),E('KLB','VJP'),E('HSN','KDG'),E('HSN','TMK'),E('HSN','MND'),E('HSN','MYS'),E('HVR','SMG'),E('HVR','UKD'),
  E('HVR','VJN'),E('KPL','RCR'),E('KPL','VJN'),E('KDG','MYS'),E('MND','RMG'),E('MND','MYS'),E('MND','TMK'),E('RCR','YDG'),
  E('RCR','VJN'),E('RMG','TMK'),E('SMG','UDP'),E('SMG','UKD'),E('UDP','UKD'),E('VJN','YDG'),E('YDG','VJP'),
];

// ---- Farmers (synthetic, flagged isDemo -> SMS to them is always simulated) ----
const FIRST = ['Ravi','Sunita','Anand','Priya','Mohammed','Lakshmi','Suresh','Manjunath','Kavya','Basavaraj','Shobha','Nagaraj','Geetha','Mallikarjun','Rekha','Prakash','Savitri','Ramesh','Ashwini','Siddappa','Yallamma','Imran','Chandrashekar','Pushpa','Venkatesh','Hanumanthappa','Roopa','Mahesh','Fathima','Girish','Deepa'];
const LAST = ['Kumar','Gowda','Desai','Hegde','Khan','Patil','Naik','Reddy','Shetty','Kulkarni','Hiremath','Biradar','Rao','Angadi','Pujari'];

export const farmers = (() => {
  const out = [];
  let n = 0;
  districts.forEach((d, di) => {
    const count = 2 + (di % 3); // 2–4 farmers per district
    for (let k = 0; k < count; k++) {
      n += 1;
      const name = `${FIRST[(di * 3 + k) % FIRST.length]} ${LAST[(di + k * 5) % LAST.length]}`;
      out.push({ id: `F${n}`, name, phone: `+9190000${String(n).padStart(5, '0')}`, districtId: d.id, source: 'seed', isDemo: true });
    }
  });
  return out;
})();

// ---- Historical alerts (recipients are computed by the alert engine, SMS not sent) ----
const daysAgo = (d) => new Date(Date.now() - d * 86400000);
export const alerts = [
  { districtId: 'RCR', severity: 'ORANGE', pestType: 'brown plant hopper', reportedAt: daysAgo(2), status: 'ACTIVE' },
  { districtId: 'MND', severity: 'RED', pestType: 'yellow rice borer', reportedAt: daysAgo(5), status: 'ACTIVE' },
  { districtId: 'HVR', severity: 'ORANGE', pestType: 'army worm', reportedAt: daysAgo(9), status: 'ACTIVE' },
  { districtId: 'KLR', severity: 'YELLOW', pestType: 'Dacus dorsalis(Hendel)', reportedAt: daysAgo(14), status: 'ACTIVE' },
  { districtId: 'BLG', severity: 'RED', pestType: 'Locustoidea', reportedAt: daysAgo(30), status: 'CANCELLED' },
  { districtId: 'VJP', severity: 'YELLOW', pestType: 'Thrips', reportedAt: daysAgo(40), status: 'CANCELLED' },
  // a farmer report waiting for officer review (shows the approval flow)
  { districtId: 'TMK', severity: 'ORANGE', pestType: 'army worm', reportedAt: daysAgo(1), status: 'PENDING', confidence: 0.42 },
];

// ---- IP102 pest catalogue — exactly the 102 class names of best.pt, in class-id order ----
export const PEST_NAMES = ['rice leaf roller','rice leaf caterpillar','paddy stem maggot','asiatic rice borer','yellow rice borer','rice gall midge','Rice Stemfly','brown plant hopper','white backed plant hopper','small brown plant hopper','rice water weevil','rice leafhopper','grain spreader thrips','rice shell pest','grub','mole cricket','wireworm','white margined moth','black cutworm','large cutworm','yellow cutworm','red spider','corn borer','army worm','aphids','Potosiabre vitarsis','peach borer','english grain aphid','green bug','bird cherry-oataphid','wheat blossom midge','penthaleus major','longlegged spider mite','wheat phloeothrips','wheat sawfly','cerodonta denticornis','beet fly','flea beetle','cabbage army worm','beet army worm','Beet spot flies','meadow moth','beet weevil','sericaorient alismots chulsky','alfalfa weevil','flax budworm','alfalfa plant bug','tarnished plant bug','Locustoidea','lytta polita','legume blister beetle','blister beetle','therioaphis maculata Buckton','odontothrips loti','Thrips','alfalfa seed chalcid','Pieris canidia','Apolygus lucorum','Limacodidae','Viteus vitifoliae','Colomerus vitis','Brevipoalpus lewisi McGregor','oides decempunctata','Polyphagotars onemus latus','Pseudococcus comstocki Kuwana','parathrene regalis','Ampelophaga','Lycorma delicatula','Xylotrechus','Cicadella viridis','Miridae','Trialeurodes vaporariorum','Erythroneura apicalis','Papilio xuthus','Panonchus citri McGregor','Phyllocoptes oleiverus ashmead','Icerya purchasi Maskell','Unaspis yanonensis','Ceroplastes rubens','Chrysomphalus aonidum','Parlatoria zizyphus Lucus','Nipaecoccus vastalor','Aleurocanthus spiniferus','Tetradacus c Bactrocera minax','Dacus dorsalis(Hendel)','Bactrocera tsuneonis','Prodenia litura','Adristyrannus','Phyllocnistis citrella Stainton','Toxoptera citricidus','Toxoptera aurantii','Aphis citricola Vander Goot','Scirtothrips dorsalis Hood','Dasineura sp','Lawana imitata Melichar','Salurnis marginella Guerr','Deporaus marginatus Pascoe','Chlumetia transversa','Mango flat beak leafhopper','Rhytidodera bowrinii white','Sternochetus frigidus','Cicadellidae'];

// IP102 super-classes (Wu et al., CVPR 2019): class-id ranges per host crop.
const GROUPS = [
  { from: 0, to: 13, crop: 'Rice', mgmt: ['Drain standing water for 3–4 days and avoid excess nitrogen.', 'Install light traps / pheromone traps (5 per acre) to monitor adults.', 'Conserve spiders and mirid bugs; release Trichogramma egg parasitoids.', 'Spray only at economic threshold, as advised by the local Raitha Samparka Kendra.'] },
  { from: 14, to: 26, crop: 'Corn / Maize', mgmt: ['Deep summer ploughing to expose soil pests and pupae.', 'Apply sand + lime or neem cake in the whorl for borers and armyworm.', 'Use pheromone traps for fall armyworm (5 per acre).', 'Rotate with legumes; remove and destroy stubble.'] },
  { from: 27, to: 35, crop: 'Wheat', mgmt: ['Timely sowing and balanced fertilisation.', 'Encourage lady-bird beetles and syrphid flies against aphids.', 'Yellow sticky traps for early detection.', 'Seed treatment before sowing.'] },
  { from: 36, to: 43, crop: 'Sugar beet / Vegetables', mgmt: ['Remove weed hosts around the field.', 'Hand-pick egg masses and larvae in early stages.', 'Neem seed kernel extract (5%) spray.', 'Crop rotation with non-host crops.'] },
  { from: 44, to: 56, crop: 'Alfalfa / Pulses', mgmt: ['Early harvest of infested fodder crop.', 'Blue/yellow sticky traps for thrips and bugs.', 'For locust swarms: alert the agriculture department immediately.', 'Avoid broad-spectrum sprays to protect pollinators.'] },
  { from: 57, to: 72, crop: 'Grapes (Vitis)', mgmt: ['Prune and burn infested canes.', 'Bark scraping and swabbing for mealybug and stem borers.', 'Release Cryptolaemus beetles against mealybugs.', 'Use sulphur dust for mites as per label.'] },
  { from: 73, to: 91, crop: 'Citrus', mgmt: ['Collect and destroy fallen infested fruit.', 'Methyl-eugenol traps for fruit flies (10 per hectare).', 'Horticultural oil spray for scales and whitefly.', 'Prune overcrowded branches to improve air flow.'] },
  { from: 92, to: 101, crop: 'Mango', mgmt: ['Monitor flowering panicles for hoppers and midges.', 'Fruit-fly traps from fruit set till harvest.', 'Destroy fallen fruit and stones (stone weevil).', 'Keep orchard floor clean; avoid dense canopy.'] },
];
const HIGH_RISK = new Set(['brown plant hopper', 'yellow rice borer', 'army worm', 'Locustoidea', 'Dacus dorsalis(Hendel)', 'Prodenia litura', 'asiatic rice borer', 'corn borer', 'beet army worm', 'cabbage army worm']);

export const pests = PEST_NAMES.map((name, classId) => {
  const g = GROUPS.find((x) => classId >= x.from && classId <= x.to);
  return {
    classId,
    name,
    crop: g.crop,
    defaultSeverity: HIGH_RISK.has(name) ? 'RED' : 'ORANGE',
    description: `${name} — IP102 class ${classId}, a pest of ${g.crop.toLowerCase()}.`,
    management: g.mgmt,
  };
});

export const demoUser = { name: 'Demo Farmer', phone: '+910000000000', location: 'Bengaluru Urban', districtId: 'BNU', crops: ['ragi', 'tomato'], password: 'demo1234', isDemo: true, role: 'farmer' };
// Second demo farmer in the same district (to show "two farmers report it, so it is sent at once")
export const demoUser2 = { name: 'Lakshmi', phone: '+910000000002', location: 'Bengaluru Urban', districtId: 'BNU', crops: ['paddy', 'ragi'], password: 'demo1234', isDemo: true, role: 'farmer' };
// Agriculture officer: approves farmer pest reports, cancels alerts, tests SMS
export const demoOfficer = { name: 'Agri Officer', phone: '+910000000001', location: 'Bengaluru Urban', districtId: 'BNU', crops: [], password: 'officer123', isDemo: true, role: 'officer' };
