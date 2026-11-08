// js/explore-map-init.js
// Initialize Explore page map
import { initSceneLinkMap } from './maps-core.js';

window.addEventListener('DOMContentLoaded', async () => {
  await initSceneLinkMap({
    containerId: 'googleMapExplore',
    cardsSelector: '.venue-card', // adjust if your cards use a different class
    listContainerSelector: '.venue-list,.explore-list'
  });
});
