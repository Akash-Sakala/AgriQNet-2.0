// Picture options used across the app (registration, crop and fertilizer advisors).
// Values stay in English (sent to the AI/server); labels come from the translations.
import { Choice } from '../components/ui/Kit';
import { CloudRain, Drop, Waves, Mountains, HouseLine, Plant, Tractor, Tree, Leaf } from '../components/ui/Icons';
import { Basket } from '@phosphor-icons/react';
import ragiImg from '../images/ragi.jpeg';
import jowarImg from '../images/jowar.jpeg';
import tomatoImg from '../images/tomato.jpeg';
import potatoImg from '../images/potato.jpeg';
import onionImg from '../images/onion.jpeg';
import chilliImg from '../images/chilli.jpeg';
import sunflowerImg from '../images/sunflower.jpeg';
import arecanutImg from '../images/arecanut.jpeg';
import groundnutImg from '../images/groundnut.jpeg';
import riceImg from '../images/rice.jpeg';
import maizeImg from '../images/maize.jpeg';
import sugarcaneImg from '../images/sugarcane.jpeg';
import cottonImg from '../images/cotton.jpeg';
import coconutImg from '../images/coconut.jpeg';
import coffeeImg from '../images/coffee.jpeg';
import bananaImg from '../images/banana.jpeg';
import mangoImg from '../images/mango.jpeg';
import turImg from '../images/pigeonpeas.jpeg';
import chickpeaImg from '../images/chickpea.jpeg';

type T = Record<string, any>;

export const CROPS: { value: string; img?: string; ph?: any; tone?: any }[] = [
  { value: 'ragi', img: ragiImg }, { value: 'paddy', img: riceImg }, { value: 'maize', img: maizeImg },
  { value: 'tur', img: turImg }, { value: 'jowar', img: jowarImg }, { value: 'groundnut', img: groundnutImg },
  { value: 'sugarcane', img: sugarcaneImg }, { value: 'cotton', img: cottonImg }, { value: 'tomato', img: tomatoImg },
  { value: 'onion', img: onionImg }, { value: 'chilli', img: chilliImg }, { value: 'potato', img: potatoImg },
  { value: 'coconut', img: coconutImg }, { value: 'arecanut', img: arecanutImg }, { value: 'coffee', img: coffeeImg },
  { value: 'banana', img: bananaImg }, { value: 'mango', img: mangoImg }, { value: 'bengalgram', img: chickpeaImg },
  { value: 'sunflower', img: sunflowerImg }, { value: 'vegetables', ph: Basket, tone: 'leaf' },
];
export const cropChoices = (t: T): Choice[] => CROPS.map((c) => ({ value: c.value, label: t[`crop_${c.value}`] || c.value, img: c.img, ph: c.ph, tone: c.tone }));
export const cropLabel = (t: T, v: string) => t[`crop_${String(v).toLowerCase().replace(/[^a-z]/g, '')}`] || v;

export const soilChoices = (t: T): Choice[] => [
  { value: 'Red Soil', label: t.soilRed, swatch: '#b4532a', sub: t.soilRedSub },
  { value: 'Black Soil', label: t.soilBlack, swatch: '#2f2a28', sub: t.soilBlackSub },
  { value: 'Alluvial Soil', label: t.soilAlluvial, swatch: '#c9a46b', sub: t.soilAlluvialSub },
  { value: 'Clay Soil', label: t.soilClay, swatch: '#8a5a3c', sub: t.soilClaySub },
  { value: 'Sandy Soil', label: t.soilSandy, swatch: '#e6cf9a', sub: t.soilSandySub },
];

export const waterChoices = (t: T): Choice[] => [
  { value: 'Rainfed', label: t.waterRain, ph: CloudRain, tone: 'sky' },
  { value: 'Borewell', label: t.waterBore, ph: Drop, tone: 'sky' },
  { value: 'Canal Irrigation', label: t.waterCanal, ph: Mountains, tone: 'sky' },
  { value: 'River', label: t.waterRiver, ph: Waves, tone: 'sky' },
  { value: 'Tank / Pond', label: t.waterTank, ph: Drop, tone: 'forest' },
];

export const sizeChoices = (t: T): Choice[] => [
  { value: 'under 2 acres', label: t.sizeSmall, ph: HouseLine, tone: 'soil', sub: t.sizeSmallSub },
  { value: '2 to 5 acres', label: t.sizeMedium, ph: Plant, tone: 'leaf', sub: t.sizeMediumSub },
  { value: 'more than 5 acres', label: t.sizeLarge, ph: Tractor, tone: 'gold', sub: t.sizeLargeSub },
];
