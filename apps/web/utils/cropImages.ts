// Crop photos (bundled, no external image service), looked up by English crop name.
import appleImg from '../images/apple.jpeg';
import bananaImg from '../images/banana.jpeg';
import blackgramImg from '../images/blackgram.jpeg';
import chickpeaImg from '../images/chickpea.jpeg';
import coconutImg from '../images/coconut.jpeg';
import coffeeImg from '../images/coffee.jpeg';
import cottonImg from '../images/cotton.jpeg';
import grapesImg from '../images/grapes.jpg';
import juteImg from '../images/jute.jpeg';
import kidneybeansImg from '../images/kidneybeans.jpeg';
import lentilImg from '../images/lentil.jpeg';
import maizeImg from '../images/maize.jpeg';
import mangoImg from '../images/mango.jpeg';
import mothbeansImg from '../images/mothbeans.jpeg';
import mungbeanImg from '../images/mungbean.jpeg';
import muskmelonImg from '../images/muskmelon.jpeg';
import orangeImg from '../images/orange.jpeg';
import papayaImg from '../images/papaya.jpeg';
import pigeonpeasImg from '../images/pigeonpeas.jpeg';
import pomegranateImg from '../images/pomegranate.jpeg';
import riceImg from '../images/rice.jpeg';
import watermelonImg from '../images/watermelon.jpeg';
import wheatImg from '../images/wheat.jpeg';
import cornImg from '../images/corn.jpeg';
import sugarcaneImg from '../images/sugarcane.jpeg';
import ragiImg from '../images/ragi.jpeg';
import jowarImg from '../images/jowar.jpeg';
import tomatoImg from '../images/tomato.jpeg';
import potatoImg from '../images/potato.jpeg';
import onionImg from '../images/onion.jpeg';
import chilliImg from '../images/chilli.jpeg';
import sunflowerImg from '../images/sunflower.jpeg';
import arecanutImg from '../images/arecanut.jpeg';
import groundnutImg from '../images/groundnut.jpeg';

export const CROP_IMAGES: Record<string, string> = {
  'wheat': wheatImg,
  'corn': cornImg,
  'sugarcane': sugarcaneImg,
  'ragi': ragiImg, 'fingermillet': ragiImg, 'jowar': jowarImg, 'sorghum': jowarImg,
  'tomato': tomatoImg, 'potato': potatoImg, 'onion': onionImg, 'chilli': chilliImg, 'chili': chilliImg, 'sunflower': sunflowerImg, 'arecanut': arecanutImg, 'areca': arecanutImg, 'groundnut': groundnutImg, 'peanut': groundnutImg,
  'maize': maizeImg,
  'apple': appleImg,
  'banana': bananaImg,
  'blackgram': blackgramImg,
  'chickpea': chickpeaImg,
  'coconut': coconutImg,
  'coffee': coffeeImg,
  'cotton': cottonImg,
  'grapes': grapesImg,
  'jute': juteImg,
  'kidneybeans': kidneybeansImg,
  'lentil': lentilImg,
  'mango': mangoImg,
  'mothbeans': mothbeansImg,
  'mungbean': mungbeanImg,
  'muskmelon': muskmelonImg,
  'orange': orangeImg,
  'papaya': papayaImg,
  'pigeonpeas': pigeonpeasImg,
  'pomegranate': pomegranateImg,
  'rice': riceImg,
  'watermelon': watermelonImg,
};

// Neutral local placeholder for unknown crops
export const PLACEHOLDER_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dcfce7"/><stop offset="1" stop-color="#86efac"/></linearGradient></defs><rect width="400" height="240" fill="url(#g)"/><path d="M200 190V110m0 0c0-30 20-50 50-55-2 32-22 52-50 55zm0 18c0-26-18-44-44-48 2 28 20 46 44 48z" fill="none" stroke="#15803d" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>');

const ALIASES: Record<string, string> = { corn: 'maize', paddy: 'rice', tur: 'pigeonpeas', redgram: 'pigeonpeas', greengram: 'mungbean', moong: 'mungbean', urad: 'blackgram', bengalgram: 'chickpea', gram: 'chickpea', fieldbean: 'kidneybeans', avarekai: 'kidneybeans', horsegram: 'mothbeans', cowpea: 'blackgram' };

/** Photo for a crop by its English name ("Finger Millet (Ragi)", "paddy" …); placeholder if unknown. */
export function cropImage(name?: string): string {
  const n = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!n) return PLACEHOLDER_IMG;
  if (ALIASES[n]) return CROP_IMAGES[ALIASES[n]];
  for (const key of Object.keys(CROP_IMAGES)) if (n.includes(key) || key.includes(n)) return CROP_IMAGES[key];
  for (const [a, key] of Object.entries(ALIASES)) if (n.includes(a)) return CROP_IMAGES[key];
  return PLACEHOLDER_IMG;
}
