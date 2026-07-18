import { createApp } from 'vue';

const target = document.querySelector('#storefront-islands');
if (target) createApp({ template: '<span aria-live="polite"></span>' }).mount(target);
