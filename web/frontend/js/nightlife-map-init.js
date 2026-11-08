// js/nightlife-map-init.js
// Initialize Nightlife page map
import { initSceneLinkMap } from './maps-core.js';

window.addEventListener('DOMContentLoaded', async () => {
  await initSceneLinkMap({
    containerId: 'googleMapNightlife', // expects <div id="googleMapNightlife">
    cardsSelector: '.nightlife-card,.venue-card',
    listContainerSelector: '.nightlife-list,.venue-list'
  });
});
